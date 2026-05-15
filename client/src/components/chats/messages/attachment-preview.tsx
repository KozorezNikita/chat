"use client";

import { useEffect, useState } from "react";
import { X, FileText, ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface AttachmentPreviewProps {
  file: File;
  onRemove: () => void;
  /** Прогрес upload-у 0-100. Якщо null/undefined — не показуємо progress bar. */
  progress?: number | null;
}

/**
 * Preview вибраного файлу над input. Показує:
 *  - Image: thumbnail (CSS resize до 80x80)
 *  - Document: icon + name + size
 *  - X-кнопка щоб прибрати
 *  - Progress bar при upload (sunset-кольоровий)
 */
export function AttachmentPreview({ file, onRemove, progress }: AttachmentPreviewProps) {
  const isImage = file.type.startsWith("image/");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Створюємо object URL для image preview; revoke при unmount
  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  const sizeKb = (file.size / 1024).toFixed(0);
  const sizeMb = (file.size / 1024 / 1024).toFixed(1);
  const sizeText = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

  return (
    <div className="border-t border-border bg-muted/40 px-4 py-2">
      <div className="flex items-center gap-3 rounded-md border border-border bg-background/80 p-2">
        {/* Thumbnail / icon */}
        {isImage && previewUrl ? (
          <img
            src={previewUrl}
            alt={file.name}
            className="h-12 w-12 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
            {isImage ? (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Filename + size + progress */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
          <div className="text-xs text-muted-foreground">{sizeText}</div>
          {typeof progress === "number" && progress > 0 && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full bg-sunset transition-all duration-200",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* X button */}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Прибрати файл"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
