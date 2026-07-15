import { Readable } from "node:stream";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

import { getS3, getBucket } from "../db/s3.js";
import { HttpError } from "../utils/HttpError.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================
 * Upload service
 * ============================================
 *
 * Завантажує файл у S3-сумісне сховище (MinIO/R2), генерує thumbnail для
 * images, повертає метадані для збереження у БД.
 *
 * Storage scheme:
 *   messages/{messageId}/{slug}     — оригінал
 *   messages/{messageId}/thumb.webp — thumbnail (тільки для images)
 *
 * Чому slug замість original filename: оригінал може містити юнікод, спецсимволи,
 * пробіли — все що ламає URL і безпеку. Slug — простий лоwercase ASCII.
 */

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Documents
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  // Office
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Audio (Iter 10) — voice messages.
  // webm/opus — Chrome/Firefox/Edge default; mp4 — Safari fallback.
  // mpeg/ogg додаємо для completeness, але клієнт зазвичай шле webm або mp4.
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
]);

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const THUMBNAIL_MAX_DIMENSION = 400;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Перевірка реального типу файлу за сигнатурою (magic bytes), а не за
 * заявленим клієнтом Content-Type. Без цього можна залити, скажімо, HTML
 * під виглядом image/jpeg (пункт 5 рев'ю).
 *
 * Політика:
 *  - file-type РОЗПІЗНАВ тип і він суперечить заявленому → відхиляємо (415).
 *  - file-type НЕ розпізнав (повернув undefined) → пропускаємо на довірі
 *    whitelist. Це навмисно: text/plain та деякі формати не мають сигнатури,
 *    і жорстке блокування відсікало б легітимні файли.
 *
 * docx/xlsx/zip — усі zip-контейнери, тож file-type бачить їх як
 * application/zip. Тому для заявлених office/zip-типів приймаємо будь-який
 * detected із zip-сімейства.
 */
const ZIP_FAMILY_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
]);

async function assertContentMatchesSignature(buffer: Buffer, claimedMime: string): Promise<void> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) return; // не змогли визначити — довіряємо whitelist

  const claimBase = claimedMime.split(";")[0]?.trim() ?? claimedMime;

  // Office-документи та zip детектяться як application/zip — приймаємо сімейство.
  if (ZIP_FAMILY_MIMES.has(claimBase) && detected.mime === "application/zip") {
    return;
  }

  if (detected.mime !== claimBase) {
    logger.warn(
      { claimedMime: claimBase, detectedMime: detected.mime },
      "Upload rejected: content signature does not match declared type",
    );
    throw new HttpError(
      415,
      "CONTENT_TYPE_MISMATCH",
      "File content does not match its declared type",
    );
  }
}

/**
 * Slugify filename для S3 key.
 * Зберігає extension, прибирає всі небезпечні символи.
 *
 * "Звіт Q3 2024.pdf" → "zvit-q3-2024.pdf"
 */
export function slugifyFilename(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  const name = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const ext = lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : "";

  // Транслітерація укр→латиниця (спрощено — основні літери)
  const ukrainian = "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя";
  const latin = ["a","b","v","h","g","d","e","ye","zh","z","y","i","yi","y","k","l","m","n","o","p","r","s","t","u","f","kh","ts","ch","sh","shch","","yu","ya"];
  const translit = name.toLowerCase().split("").map((c) => {
    const idx = ukrainian.indexOf(c);
    return idx >= 0 ? latin[idx] : c;
  }).join("");

  const slug = translit
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return ext ? `${slug || "file"}.${ext}` : (slug || "file");
}

export interface UploadResult {
  attachmentKey: string;
  attachmentName: string;
  attachmentMime: string;
  attachmentSize: number;
  attachmentWidth: number | null;
  attachmentHeight: number | null;
  attachmentThumbKey: string | null;
  attachmentDuration: number | null;
}

/**
 * Завантажує файл (оригінал + опційно thumbnail) у S3.
 * Повертає метадані для збереження у Message.
 *
 * Викликається ДО створення message-у — щоб якщо upload впав, не залишилось
 * orphan-records у БД. Якщо message-creation падає — у S3 залишається orphan
 * файл (обмежено acceptable; можна додати GC у Iter 11).
 */
export async function uploadFileToS3(opts: {
  messageId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  /**
   * Тривалість у секундах для audio attachments (Iter 10).
   * Клієнт обчислює через MediaRecorder і передає у multipart.
   * null/undefined для image/document.
   */
  duration?: number | null;
}): Promise<UploadResult> {
  const s3 = getS3();
  if (!s3) {
    throw new Error("S3 not configured");
  }

  if (!ALLOWED_MIME_TYPES.has(opts.mimeType)) {
    // Defensive: Multer fileFilter зазвичай відсіює це раніше. Але якщо
    // сервіс викликано в обхід роуту — віддаємо той самий 415, не 500.
    throw new HttpError(415, "UNSUPPORTED_FILE_TYPE", `Unsupported mime type: ${opts.mimeType}`);
  }
  if (opts.buffer.length > MAX_FILE_SIZE_BYTES) {
    const mb = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));
    throw new HttpError(413, "FILE_TOO_LARGE", `File exceeds the ${mb} MB limit`);
  }

  // Звіряємо реальну сигнатуру з заявленим типом (захист від підміни Content-Type).
  await assertContentMatchesSignature(opts.buffer, opts.mimeType);

  const bucket = getBucket();
  const slug = slugifyFilename(opts.originalName);
  const key = `messages/${opts.messageId}/${slug}`;

  // Upload оригіналу
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: opts.buffer,
      ContentType: opts.mimeType,
      ContentLength: opts.buffer.length,
    }),
  );

  let width: number | null = null;
  let height: number | null = null;
  let thumbKey: string | null = null;

  // Image — створюємо thumbnail + читаємо dimensions
  if (IMAGE_MIME_TYPES.has(opts.mimeType)) {
    try {
      const image = sharp(opts.buffer);
      const metadata = await image.metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;

      const thumbBuffer = await image
        .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();

      thumbKey = `messages/${opts.messageId}/thumb.webp`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: thumbKey,
          Body: thumbBuffer,
          ContentType: "image/webp",
          ContentLength: thumbBuffer.length,
        }),
      );
    } catch (err) {
      // Якщо sharp падає (corrupted image) — продовжуємо без thumb.
      // Original ще доступний, UX deteriorates але не блокується.
      logger.warn({ err, messageId: opts.messageId }, "Failed to generate thumbnail");
    }
  }

  return {
    attachmentKey: key,
    attachmentName: opts.originalName,
    attachmentMime: opts.mimeType,
    attachmentSize: opts.buffer.length,
    attachmentWidth: width,
    attachmentHeight: height,
    attachmentThumbKey: thumbKey,
    attachmentDuration: opts.duration ?? null,
  };
}

/**
 * Генерує signed URL з 1-годинним TTL для скачування файлу.
 * Викликається при serialize Message у DTO — кожен GET messages
 * отримує свіжий signed URL.
 */
export async function getSignedDownloadUrl(key: string): Promise<string> {
  const s3 = getS3();
  if (!s3) throw new Error("S3 not configured");

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

/**
 * Видалити файл і thumbnail (для cleanup при delete message-у).
 * Не throw — best-effort.
 */
export async function deleteAttachmentFiles(opts: {
  attachmentKey: string | null;
  attachmentThumbKey: string | null;
}): Promise<void> {
  const s3 = getS3();
  if (!s3) return;

  const bucket = getBucket();
  const tasks: Promise<unknown>[] = [];

  if (opts.attachmentKey) {
    tasks.push(
      s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: opts.attachmentKey })),
    );
  }
  if (opts.attachmentThumbKey) {
    tasks.push(
      s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: opts.attachmentThumbKey })),
    );
  }

  try {
    await Promise.all(tasks);
  } catch (err) {
    logger.warn({ err }, "Failed to delete attachment files");
  }
}

/**
 * Readable не використовується наразі, але імпорт лишаємо для майбутніх
 * streaming use-cases (наприклад chunked upload у Iter 11+).
 */
export { Readable };
