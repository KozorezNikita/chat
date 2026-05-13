"use client";

import type { ReactionEmoji, ReactionGroup } from "@chat/shared";

import { useToggleReaction } from "@/hooks/use-toggle-reaction";
import { cn } from "@/lib/utils";

interface ReactionBarProps {
  chatId: string;
  messageId: string;
  reactions: ReactionGroup[];
  isOwn: boolean;
}

/**
 * ============================================
 * ReactionBar — список реакцій під message
 * ============================================
 *
 * Кнопка-pill для кожної емодзі: `[👍 3]`. Якщо поточний юзер реагнув —
 * пасе акцентний border (sunset gradient у нашій палітрі).
 * Клік → toggle тієї ж емодзі.
 *
 * Якщо реакцій нема — нічого не рендериться.
 */
export function ReactionBar({ chatId, messageId, reactions, isOwn }: ReactionBarProps) {
  const toggle = useToggleReaction(chatId, messageId);

  if (reactions.length === 0) return null;

  return (
    <div
      className={cn(
        "mt-1 flex flex-wrap gap-1",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {reactions.map((group) => (
        <button
          key={group.emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle.mutate({ emoji: group.emoji as ReactionEmoji });
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border bg-background/80 px-2 py-0.5 text-xs transition-colors",
            group.reactedByMe
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
          aria-label={`${group.emoji} ${group.count}, ${group.reactedByMe ? "натисніть щоб прибрати" : "натисніть щоб додати"}`}
        >
          <span className="text-sm leading-none">{group.emoji}</span>
          <span className="font-medium">{group.count}</span>
        </button>
      ))}
    </div>
  );
}
