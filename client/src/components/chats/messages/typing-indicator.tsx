"use client";

import { useTypingUsers } from "@/providers/typing-provider";
import { useChat } from "@/hooks/use-chats";

interface TypingIndicatorProps {
  chatId: string;
}

/**
 * "Олена пише…" над MessageInput.
 *
 * Текст залежить від типу чату і кількості:
 *  - DM: "набирає…" (анонімно — і так ясно хто)
 *  - Group 1 user: "Олена пише…"
 *  - Group 2 users: "Олена та Богдан пишуть…"
 *  - Group 3+ users: "3 людей пишуть…"
 *
 * Висота фіксована (h-5) щоб не "стрибало" коли з'являється/зникає.
 * Opacity transition для плавності.
 */
export function TypingIndicator({ chatId }: TypingIndicatorProps) {
  const typingUserIds = useTypingUsers(chatId);
  const { data: chatData } = useChat(chatId);

  const chat = chatData?.chat;
  const isVisible = typingUserIds.length > 0;

  // Резолвимо userId → name через members з чату
  const text = (() => {
    if (!isVisible || !chat) return "";

    if (chat.type === "DIRECT") {
      return "набирає…";
    }

    // Group — lookup імен
    const names = typingUserIds
      .map((uid) => chat.members.find((m) => m.userId === uid)?.user.name)
      .filter((n): n is string => Boolean(n));

    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} пише…`;
    if (names.length === 2) return `${names[0]} та ${names[1]} пишуть…`;
    return `${names.length} людей пишуть…`;
  })();

  return (
    <div
      className="h-5 px-4 text-xs text-muted-foreground transition-opacity duration-200"
      style={{ opacity: isVisible ? 1 : 0 }}
      aria-live="polite"
      aria-atomic="true"
    >
      {isVisible && (
        <span className="inline-flex items-center gap-1">
          <span>{text}</span>
          <span className="inline-flex gap-0.5">
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:0ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:200ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:400ms]" />
          </span>
        </span>
      )}
    </div>
  );
}
