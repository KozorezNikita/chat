import { z } from "zod";

/**
 * Toggle reaction — клієнт шле один emoji, сервер сам визначає
 * додавати чи прибирати (бо unique constraint на (messageId, userId, emoji)).
 *
 * Це елегантніше за окремі add/remove endpoints — менше API surface.
 */
export const toggleReactionSchema = z.object({
  emoji: z
    .string()
    .min(1)
    .max(16)
    // Валідація що це справді emoji-символ — окремою функцією на сервері
    // через emoji-regex package, щоб не тягнути 50КБ regex-у в shared/.
    // Тут лише довжина.
});

export type ToggleReactionDto = z.infer<typeof toggleReactionSchema>;
