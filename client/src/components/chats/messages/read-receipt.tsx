"use client";

import { Check, CheckCheck } from "lucide-react";

import { useChat } from "@/hooks/use-chats";
import { useMe } from "@/hooks/use-auth";

interface ReadReceiptProps {
  chatId: string;
  messageId: string;
  /** Чи це останнє повідомлення від поточного юзера у чаті. Для group "X/Y" показуємо тільки на останньому. */
  isLastOwn: boolean;
}

/**
 * ============================================
 * Read receipt indicator
 * ============================================
 *
 * DM: ✓✓ (CheckCheck) якщо інший прочитав, інакше ✓ (single Check — "доставлено").
 * Group: "Прочитано X/Y" тільки на останньому власному повідомленні.
 *
 * Логіка:
 *   member.lastReadMessageId >= message.id  →  цей member прочитав
 *
 * cuid сортується лексикографічно (по timestamp), тому string-compare працює як time-compare.
 */
export function ReadReceipt({ chatId, messageId, isLastOwn }: ReadReceiptProps) {
  const { data: chatData } = useChat(chatId);
  const { data: meData } = useMe();

  const chat = chatData?.chat;
  const currentUserId = meData?.user?.id;

  if (!chat || !currentUserId) return null;

  if (chat.type === "DIRECT") {
    // Знаходимо іншого учасника
    const otherMember = chat.members.find((m) => m.userId !== currentUserId);
    if (!otherMember) return null;

    const isRead =
      otherMember.lastReadMessageId !== null &&
      otherMember.lastReadMessageId >= messageId;

    return isRead ? (
      <CheckCheck className="inline h-3 w-3 text-emerald-500" aria-label="прочитано" />
    ) : (
      <Check className="inline h-3 w-3 text-muted-foreground" aria-label="доставлено" />
    );
  }

  // GROUP — показуємо тільки на останньому власному
  if (!isLastOwn) return null;

  const others = chat.members.filter((m) => m.userId !== currentUserId);
  const readCount = others.filter(
    (m) => m.lastReadMessageId !== null && m.lastReadMessageId >= messageId,
  ).length;

  if (readCount === 0) return null;

  return (
    <span className="text-emerald-600 dark:text-emerald-500">
      Прочитано {readCount}/{others.length}
    </span>
  );
}
