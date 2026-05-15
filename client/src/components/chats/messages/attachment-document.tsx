"use client";

import { Download, FileText, FileArchive, FileSpreadsheet, File as FileIcon } from "lucide-react";
import type { MessageAttachment } from "@chat/shared";

import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/utils/file-display";

interface AttachmentDocumentProps {
  attachment: MessageAttachment;
  /** Колір тексту inverted для own bubble (sunset gradient). */
  isOwn: boolean;
}

/**
 * Document card у bubble. Icon обирається по mime.
 * "Завантажити" кнопка — anchor з download attr → браузер save dialog.
 */
export function AttachmentDocument({ attachment, isOwn }: AttachmentDocumentProps) {
  const Icon = getIconForMime(attachment.mime);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2",
        isOwn
          ? "border-primary-foreground/20 bg-primary-foreground/10"
          : "border-border bg-background/60",
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded",
          isOwn ? "bg-primary-foreground/20" : "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5",
            isOwn ? "text-primary-foreground" : "text-muted-foreground",
          )}
        />
      </div>

      {/* Name + size */}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm font-medium",
            isOwn ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {attachment.name}
        </div>
        <div
          className={cn(
            "text-xs",
            isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {formatFileSize(attachment.size)}
        </div>
      </div>

      {/* Download button */}
      <a
        href={attachment.url}
        download={attachment.name}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "shrink-0 rounded p-1.5 transition-colors",
          isOwn
            ? "text-primary-foreground hover:bg-primary-foreground/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        aria-label={`Завантажити ${attachment.name}`}
        title="Завантажити"
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}

function getIconForMime(mime: string) {
  if (mime === "application/pdf") return FileText;
  if (mime === "application/zip" || mime === "application/x-zip-compressed") return FileArchive;
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return FileSpreadsheet;
  if (mime === "application/vnd.ms-excel") return FileSpreadsheet;
  if (mime === "application/msword") return FileText;
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return FileText;
  if (mime === "text/plain") return FileText;
  return FileIcon;
}
