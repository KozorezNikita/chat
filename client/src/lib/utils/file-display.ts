/**
 * Human-readable file size: 234 → "234 B", 4567 → "4.5 KB", 1234567 → "1.2 MB".
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Чи це image mime-type що ми вміємо inline-рендерити.
 */
export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

/**
 * Чи це audio mime-type — для voice messages у Iter 10.
 */
export function isAudioMime(mime: string): boolean {
  return mime.startsWith("audio/");
}

/**
 * Тривалість у "M:SS" форматі. 90 → "1:30", 5 → "0:05".
 */
export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
