import { S3Client } from "@aws-sdk/client-s3";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================
 * S3 client (lazy singleton)
 * ============================================
 *
 * Працює з MinIO (dev) і Cloudflare R2 (prod) — обидва S3-сумісні.
 * Один код, різниця тільки в env vars (endpoint, region, credentials).
 *
 * Якщо S3 env vars не задано (тестовий dev сценарій) — повертає null.
 * Upload service перевіряє null і повертає 503.
 *
 * forcePathStyle: true — критично для MinIO (URL: endpoint/bucket/key).
 * R2 теж сумісний з path-style.
 */

let client: S3Client | null = null;

function isS3Configured(): boolean {
  return Boolean(
    env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY,
  );
}

export function getS3(): S3Client | null {
  if (!isS3Configured()) return null;
  if (client) return client;

  // exactOptionalPropertyTypes: явне undefined у endpoint ламає тип.
  // Якщо isS3Configured() true — env.S3_ENDPOINT гарантовано рядок.
  client = new S3Client({
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY!,
      secretAccessKey: env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  });

  logger.info({ endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET }, "S3 client initialized");
  return client;
}

export function getBucket(): string {
  if (!env.S3_BUCKET) {
    throw new Error("S3_BUCKET not configured");
  }
  return env.S3_BUCKET;
}
