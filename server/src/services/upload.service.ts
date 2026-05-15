import { Readable } from "node:stream";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

import { getS3, getBucket } from "../db/s3.js";
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
}): Promise<UploadResult> {
  const s3 = getS3();
  if (!s3) {
    throw new Error("S3 not configured");
  }

  if (!ALLOWED_MIME_TYPES.has(opts.mimeType)) {
    throw new Error(`Unsupported mime type: ${opts.mimeType}`);
  }
  if (opts.buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large: ${opts.buffer.length} bytes`);
  }

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
