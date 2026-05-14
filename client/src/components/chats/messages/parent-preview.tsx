"use client";

import type { MessageParentPreview } from "@chat/shared";

import { cn } from "@/lib/utils";

interface ParentPreviewProps {
  parent: MessageParentPreview;
  isOwn: boolean;
  onClick?: () => void;
}

/**
 * Mini-bubble parent-message що показується зверху reply.
 * Sunset accent зліва + author name + content snippet.
 *
 * Click — scroll до оригіналу (handled у 6.3 через onClick prop).
 * Deleted parent — не clickable, italic gray placeholder.
 */
export function ParentPreview({ parent, isOwn, onClick }: ParentPreviewProps) {
  const isClickable = !parent.isDeleted && onClick;

  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={cn(
        "mb-0.5 flex w-full items-stretch gap-2 rounded-md px-2 py-1 text-left",
        // Subtle background, sunset accent left
        "border-l-2 border-primary/60",
        isOwn ? "bg-primary/10" : "bg-muted/60",
        isClickable && "cursor-pointer transition-colors hover:bg-muted",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-primary/90 dark:text-primary">
          {parent.authorName}
        </div>
        <div
          className={cn(
            "truncate text-xs",
            parent.isDeleted ? "italic text-muted-foreground" : "text-foreground/70",
          )}
        >
          {parent.isDeleted ? "Це повідомлення видалено" : parent.contentPreview}
        </div>
      </div>
    </button>
  );
}
