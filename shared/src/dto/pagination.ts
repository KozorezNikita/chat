import { z } from "zod";

/**
 * Cursor-based pagination — узагальнена схема.
 *
 * Клієнт шле:    ?cursor=<id>&limit=50
 * Сервер повертає: { items: [...], nextCursor: string | null }
 *
 * Cursor — це id останнього отриманого item-а (cuid).
 * nextCursor === null означає що сторінок більше немає.
 *
 * Чому cursor а не offset: при offset-pagination якщо в чат прилітає
 * нове повідомлення між двома page-fetch'ами, юзер бачить дублі або
 * пропуски. Cursor стабільний — він прив'язаний до конкретного id.
 */

/**
 * Схема query-параметрів для запитів з cursor-пагінацією.
 * Використовуємо як основу для GET /messages, GET /threads тощо.
 *
 * z.coerce.number бо query-string завжди приходить рядками.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;

/**
 * Фабрика для типізованих відповідей з cursor-пагінацією.
 * Використання у DTO:
 *
 *   export const messageListSchema = cursorPageSchema(messageSchema);
 *   export type MessageList = z.infer<typeof messageListSchema>;
 */
export function cursorPageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
