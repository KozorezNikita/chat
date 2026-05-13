import { z } from "zod";

/**
 * ============================================
 * Reaction DTO
 * ============================================
 *
 * Whitelist 6 emoji — як у Facebook Messenger / Slack default set.
 * Чому фіксовані а не будь-який emoji: простіший UI (один toolbar),
 * менше зловживань, легше підрахунок lichilnik-а.
 *
 * Якщо у Iter 11 захочемо custom emoji — додамо emoji-picker і змінимо
 * валідацію на regex.
 */

export const ALLOWED_REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉"] as const;
export type ReactionEmoji = (typeof ALLOWED_REACTION_EMOJI)[number];

/**
 * Toggle reaction — клієнт шле один emoji, сервер сам визначає
 * додавати чи прибирати (бо UNIQUE на (messageId, userId, emoji)).
 *
 * Це елегантніше за окремі add/remove endpoints — менше API surface.
 */
export const toggleReactionSchema = z.object({
  emoji: z.enum(ALLOWED_REACTION_EMOJI),
});

export type ToggleReactionDto = z.infer<typeof toggleReactionSchema>;

/**
 * Response після toggle — повідомляємо клієнту що сталось і повний поточний
 * стан reactions для message-у. Клієнт оновить кеш.
 */
export const toggleReactionResponseSchema = z.object({
  action: z.enum(["added", "removed"]),
  messageId: z.string(),
  /** Усі reactions після toggle — клієнт ререндерить групи з reactedByMe. */
  reactions: z.array(
    z.object({
      emoji: z.string(),
      userId: z.string(),
    }),
  ),
});

export type ToggleReactionResponse = z.infer<typeof toggleReactionResponseSchema>;
