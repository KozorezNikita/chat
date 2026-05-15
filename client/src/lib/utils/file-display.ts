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
