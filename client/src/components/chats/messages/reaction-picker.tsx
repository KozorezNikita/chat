"use client";

import { ALLOWED_REACTION_EMOJI } from "@chat/shared";

import { useToggleReaction } from "@/hooks/use-toggle-reaction";
import { cn } from "@/lib/utils";

interface ReactionPickerProps {
  chatId: string;
  messageId: string;
  /** isOwn визначає сторону позиціонування picker-а. */
  isOwn: boolean;
  /** Кastom className для wrapper-а — щоб батько міг керувати visibility. */
  className?: string;
}

/**
 * ============================================
 * ReactionPicker — 6-emoji bar для toggle
 * ============================================
 *
 * Позиціонування absolute — батьківський bubble container має `relative`.
 * Для own messages picker зліва від bubble (бо bubble справа),
 * для чужих — справа від bubble (бо bubble зліва).
 *
 * Visibility керує батько через CSS (`opacity-0 group-hover:opacity-100`).
 */
export function ReactionPicker({ chatId, messageId, isOwn, className }: ReactionPickerProps) {
  const toggle = useToggleReaction(chatId, messageId);

  return (
    <div
      className={cn(
        // Wrapper з невидимим bottom padding — він з'єднує picker з bubble
        // щоб курсор не "провалився" у gap між ними і не втратив hover.
        "absolute -top-10 pb-3 z-10",
        isOwn ? "right-0" : "left-0",
        className,
      )}
      role="toolbar"
      aria-label="Реакції"
    >
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-popover/95 px-1 py-1 shadow-md backdrop-blur-sm">
        {ALLOWED_REACTION_EMOJI.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle.mutate({ emoji });
            }}
            className="rounded-full px-1.5 py-0.5 text-base leading-none transition-transform hover:scale-125"
            aria-label={`Реагнути ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
