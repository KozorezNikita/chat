import type { Message } from "@chat/shared";

/**
 * Допоміжні функції для відображення повідомлень.
 */

/**
 * Чи поточне повідомлення продовжує "групу" попереднього автора?
 *
 * Критерії:
 *  - Той самий author
 *  - Різниця у часі менше 5 хвилин
 *  - Жодне з них не deleted (видалені завжди стоять окремо для ясності)
 *
 * При група=true ховаємо avatar і ім'я у поточному, скорочуємо vertical gap.
 */
const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

export function shouldGroupMessages(
  current: Message,
  previous: Message | null,
): boolean {
  if (!previous) return false;
  if (current.author.id !== previous.author.id) return false;
  if (current.deletedAt !== null || previous.deletedAt !== null) return false;

  const currentTime = new Date(current.createdAt).getTime();
  const previousTime = new Date(previous.createdAt).getTime();
  return Math.abs(currentTime - previousTime) < GROUP_THRESHOLD_MS;
}

/**
 * Час повідомлення для відображення під пухирем — лаконічний:
 *  - сьогодні → "14:23"
 *  - вчора → "вчора 14:23"
 *  - тиждень → "пн 14:23"
 *  - старіше → "12.04.2025 14:23"
 */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return `вчора ${time}`;

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    const weekday = date.toLocaleDateString("uk-UA", { weekday: "short" });
    return `${weekday} ${time}`;
  }

  const fullDate = date.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${fullDate} ${time}`;
}

/**
 * Створює optimistic Message для відображення до отримання відповіді сервера.
 * id дорівнює clientId — щоб onSuccess зміг знайти і замінити.
 */
export function createOptimisticMessage(
  clientId: string,
  chatId: string,
  content: string,
  author: { id: string; name: string; username: string | null; avatarUrl: string | null },
): Message {
  return {
    id: clientId, // тимчасово використовуємо clientId як id
    chatId,
    author,
    content,
    parentMessageId: null,
    replyCount: 0,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
}
