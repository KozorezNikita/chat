import { z } from "zod";

/**
 * ============================================
 * Presence DTO
 * ============================================
 *
 * Опитування online-статусу для списку юзерів. Клієнт polling-ить раз
 * на 30 сек список юзерів з відкритих чатів.
 *
 * Чому не WebSocket broadcast: presence — це "достатньо точне" поле,
 * не critical-realtime. Polling спрощує архітектуру (нема потреби трекати
 * "хто має інтерес у Userid X").
 */

/**
 * Query params: comma-separated user IDs.
 * Транспортуємо як рядок з Zod transform → масив.
 */
export const getPresenceQuerySchema = z.object({
  userIds: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1)).min(1).max(100, "Maximum 100 user IDs per request")),
});

export type GetPresenceQuery = z.infer<typeof getPresenceQuerySchema>;

export const presenceInfoSchema = z.object({
  userId: z.string(),
  online: z.boolean(),
  /** ISO timestamp коли юзер останній раз був online. null якщо зараз online. */
  lastSeenAt: z.string().datetime().nullable(),
});

export type PresenceInfo = z.infer<typeof presenceInfoSchema>;

export const getPresenceResponseSchema = z.object({
  presence: z.array(presenceInfoSchema),
});

export type GetPresenceResponse = z.infer<typeof getPresenceResponseSchema>;
