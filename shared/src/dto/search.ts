import { z } from "zod";

/**
 * ============================================
 * Search DTO
 * ============================================
 *
 * Простий пошук по content повідомлень. Backend використовує Postgres FTS
 * (tsvector + GIN index + websearch_to_tsquery).
 *
 * Privacy: тільки messages з чатів де юзер активний member.
 */

export const searchMessagesQuerySchema = z.object({
  /** Текст пошуку. Min 2 символи щоб не сканувати на пустоту. */
  q: z.string().trim().min(2).max(200),
  /** Pagination. */
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;

/**
 * Один результат пошуку. Headline — text snippet з маркерами `[[match]]`.
 * Клієнт парсить split-ом і обгортає у <mark>.
 *
 * Без headline (наприклад якщо ts_headline empty) — fallback до content (truncated).
 */
export const searchMessageResultSchema = z.object({
  messageId: z.string(),
  chatId: z.string(),
  /** Назва чату для контексту (DM partner name або group name). */
  chatName: z.string(),
  authorName: z.string(),
  /** Snippet з `[[...]]` маркерами для матчів. */
  headline: z.string(),
  createdAt: z.string().datetime(),
});

export type SearchMessageResult = z.infer<typeof searchMessageResultSchema>;

export const searchMessagesResponseSchema = z.object({
  results: z.array(searchMessageResultSchema),
  total: z.number().int().min(0),
  hasMore: z.boolean(),
});

export type SearchMessagesResponse = z.infer<typeof searchMessagesResponseSchema>;
