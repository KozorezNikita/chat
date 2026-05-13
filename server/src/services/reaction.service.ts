import type { ToggleReactionDto, ToggleReactionResponse } from "@chat/shared";

import * as reactionRepo from "../repositories/reaction.repo.js";
import * as messageRepo from "../repositories/message.repo.js";
import * as chatRepo from "../repositories/chat.repo.js";
import { broadcastReactionUpdated } from "../socket/broadcast.js";
import { ForbiddenError, NotFoundError, BadRequestError } from "../utils/HttpError.js";

/**
 * ============================================
 * Reaction service
 * ============================================
 *
 * Toggle логіка:
 *  - Якщо реакція тим же emoji від цього юзера є → видаляємо
 *  - Якщо немає → створюємо
 *
 * Permissions:
 *  - Юзер має бути активним member-ом чату
 *  - На видалене повідомлення реагувати не можна
 *
 * Race condition: дві одночасні toggle з різних tabs того ж юзера →
 * перший зробить add, другий побачить existing і remove. Поведінка as expected.
 */

export async function toggleReaction(
  messageId: string,
  userId: string,
  dto: ToggleReactionDto,
): Promise<ToggleReactionResponse> {
  const message = await messageRepo.findMessageById(messageId);
  if (!message) {
    throw new NotFoundError("Message not found", "MESSAGE_NOT_FOUND");
  }

  if (message.deletedAt !== null) {
    throw new BadRequestError("Cannot react to deleted message", "MESSAGE_DELETED");
  }

  const member = await chatRepo.findMembership(message.chatId, userId);
  if (!member || member.leftAt !== null) {
    throw new ForbiddenError("Not a member of this chat", "NOT_A_MEMBER");
  }

  const existing = await reactionRepo.findReaction(messageId, userId, dto.emoji);

  let action: "added" | "removed";
  if (existing) {
    await reactionRepo.deleteReaction(existing.id);
    action = "removed";
  } else {
    await reactionRepo.createReaction({ messageId, userId, emoji: dto.emoji });
    action = "added";
  }

  // Повний список реакцій після зміни — broadcast + response
  const reactions = await reactionRepo.listReactionsForMessage(messageId);

  broadcastReactionUpdated(message.chatId, messageId, reactions);

  return {
    action,
    messageId,
    reactions,
  };
}
