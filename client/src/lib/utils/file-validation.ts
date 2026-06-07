/**
 * Constants дубльовані з server/src/services/upload.service.ts —
 * для швидкого rejection без request. Backend все одно перевіряє (security).
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
  // MediaRecorder API виробляє audio/webm (Chrome/Firefox/Edge) або audio/mp4 (Safari).
  // Точний codec у mime (";codecs=opus") видаляє getBlob/File.type — приймаємо обидва варіанти.
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
]);

/**
 * Audio mime прийшов з ";codecs=..." суфіксом — нормалізуємо до базового
 * для перевірки whitelist (backend дозволяє лише базові mimes).
 */
function normalizeMime(mime: string): string {
  return mime.split(";")[0]!.trim();
}

export function validateFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "Файл занадто великий (максимум 20 МБ)" };
  }
  const base = normalizeMime(file.type);
  if (!ALLOWED_MIME_TYPES.has(file.type) && !ALLOWED_MIME_TYPES.has(base)) {
    return { ok: false, error: "Непідтримуваний формат файлу" };
  }
  return { ok: true };
}
