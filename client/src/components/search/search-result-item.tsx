"use client";

import { useRouter } from "next/navigation";
import type { SearchMessageResult } from "@chat/shared";

import { cn } from "@/lib/utils";
import { formatMessageTime } from "@/lib/utils/message-utils";

interface SearchResultItemProps {
  result: SearchMessageResult;
}

/**
 * Один результат пошуку у списку.
 *
 * Click → navigate до чату з URL hash #message-{id}. Реалізація
 * scroll-to-message живе у chat-page (Iter 8.3).
 *
 * Headline parsing: backend повертає `[[match]]` маркери. Split regex-ом
 * на чергуючі частини, обгортаємо непарні (тобто матчі) у <mark>.
 */
export function SearchResultItem({ result }: SearchResultItemProps) {
  const router = useRouter();

  function handleClick() {
    router.push(`/chats/${result.chatId}#message-${result.messageId}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full rounded-lg border border-border bg-card/50 px-4 py-3 text-left transition-colors",
        "hover:bg-card hover:border-primary/30",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-foreground">
          {result.chatName}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {formatMessageTime(result.createdAt)}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{result.authorName}</div>
      <div className="mt-1.5 text-sm text-foreground/90 break-words line-clamp-3">
        {renderHighlight(result.headline)}
      </div>
    </button>
  );
}

/**
 * "Hello [[привіт]] world" → ["Hello ", <mark>привіт</mark>, " world"]
 * Регулярка з capture group → split включає матчі у result array на непарних позиціях.
 */
function renderHighlight(text: string): React.ReactNode[] {
  const parts = text.split(/\[\[(.+?)\]\]/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded bg-primary/20 px-0.5 text-foreground"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
