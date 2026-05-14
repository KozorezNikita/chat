"use client";

import { X, Reply as ReplyIcon } from "lucide-react";

import { useReply } from "@/providers/reply-provider";

/**
 * Banner над MessageInput коли юзер вибрав message для reply.
 * Sunset accent зліва, author name + content preview, x-кнопка для скасування.
 */
export function ReplyBanner() {
  const { replyingTo, setReplyingTo } = useReply();

  if (!replyingTo) return null;

  return (
    <div className="border-t border-border bg-muted/40 px-4 py-2">
      <div className="flex items-start gap-2 rounded-md border-l-4 border-primary/70 bg-background/60 px-3 py-1.5">
        <ReplyIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">
            Відповідаєте {replyingTo.authorName}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {replyingTo.isDeleted
              ? "Це повідомлення видалено"
              : replyingTo.contentPreview}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReplyingTo(null)}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Скасувати reply"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
