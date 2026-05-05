import type { Chat, ChatMember } from "@chat/shared";

/**
 * Допоміжні функції для відображення чатів у UI.
 */

/**
 * Назва чату:
 *  - GROUP: chat.name (або "Group" якщо чомусь null)
 *  - DIRECT: ім'я іншого учасника (єдиний хто не == currentUserId)
 */
export function getChatTitle(chat: Chat, currentUserId: string): string {
  if (chat.type === "GROUP") {
    return chat.name ?? "Група";
  }
  const other = getOtherDirectMember(chat, currentUserId);
  return other?.user.name ?? "Direct chat";
}

/**
 * Avatar URL чату:
 *  - GROUP: chat.avatarUrl (наразі завжди null, додамо в Iter 7)
 *  - DIRECT: avatar іншого учасника
 */
export function getChatAvatarUrl(chat: Chat, currentUserId: string): string | null {
  if (chat.type === "GROUP") {
    return chat.avatarUrl;
  }
  const other = getOtherDirectMember(chat, currentUserId);
  return other?.user.avatarUrl ?? null;
}

/**
 * Перші літери для placeholder-аватара (коли URL немає).
 *  - "Олена Петрова" → "ОП"
 *  - "Bob" → "B"
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Інший учасник DM-чату. Helper щоб не дублювати .find в кількох місцях.
 */
function getOtherDirectMember(chat: Chat, currentUserId: string): ChatMember | undefined {
  return chat.members.find((m) => m.userId !== currentUserId && m.leftAt === null);
}

/**
 * Текст preview останнього повідомлення для sidebar.
 *  - isDeleted → "Повідомлення видалено"
 *  - GROUP → "Author: content"
 *  - DIRECT → "content"
 *  - empty chat → ""
 */
export function getLastMessagePreview(chat: Chat, currentUserId: string): string {
  if (!chat.lastMessage) return "";

  const { content, isDeleted, authorId, authorName } = chat.lastMessage;

  if (isDeleted) return "Повідомлення видалено";

  // У DM не показуємо ім'я автора (їх лише двоє)
  if (chat.type === "DIRECT") return content;

  // У GROUP показуємо "ти:" для своїх, ім'я для інших
  const prefix = authorId === currentUserId ? "Ви" : authorName.split(" ")[0];
  return `${prefix}: ${content}`;
}

/**
 * Форматує час останнього повідомлення для sidebar.
 *  - сьогодні → "14:23"
 *  - вчора → "вчора"
 *  - тиждень → "пн", "вт", ...
 *  - старіше → "12.04"
 */
export function formatLastMessageTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return "вчора";

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return date.toLocaleDateString("uk-UA", { weekday: "short" });
  }

  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}
