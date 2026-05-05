import type { Message, MessagePage, SendMessageDto, EditMessageDto, GetMessagesQuery, SentMessageResponse } from "@chat/shared";

import * as messageRepo from "../repositories/message.repo.js";
import * as chatRepo from "../repositories/chat.repo.js";
import { ForbiddenError, NotFoundError, BadRequestError } from "../utils/HttpError.js";
import { mapMessageToDto, type MessageWithAuthor } from "./_mappers.js";

/**
 * ============================================
 * Message service
 * ============================================
 *
 *  - sendMessage — створити повідомлення в чаті
 *  - editMessage — author-only, без time limit
 *  - deleteMessage — author-only, soft delete
 *  - getMessages — cursor-paged історія
 *
 * Усі операції з конкретним повідомленням (edit/delete) роблять
 * membership-check у сервісі, бо chatId не в URL — лише messageId.
 */

// ============================================
// SEND
// ============================================

/**
 * Створення повідомлення. Membership уже перевірений у requireChatMembership
 * middleware-і (роут /chats/:chatId/messages POST).
 *
 * Threading в Iter 6 — поки що parentMessageId не дозволяємо передавати
 * (валідація на рівні DTO — opt'ал, але ми тут явно cap-имо до null).
 *
 * Повертає SentMessageResponse (Message + clientId) — клієнт мапить
 * з optimistic UI на server-message через clientId.
 */
export async function sendMessage(
  chatId: string,
  authorId: string,
  dto: SendMessageDto,
): Promise<SentMessageResponse> {
  const message = await messageRepo.createMessage({
    chatId,
    authorId,
    content: dto.content,
    // Поки threading вимкнено — ігноруємо parentMessageId з вхідного DTO.
    // У Iter 6 — починаємо приймати, з валідацією що parent належить
    // тому самому chatId і не deleted.
    parentMessageId: undefined,
  });

  return {
    ...mapMessageToDto(message as MessageWithAuthor),
    clientId: dto.clientId,
  };
}

// ============================================
// EDIT
// ============================================

/**
 * Edit повідомлення. Тільки author. Видалене редагувати не можна.
 *
 * NB: Тут робимо membership-check всередині — message може належати
 * чату де юзер уже не member (наприклад, він left, але хоче edit-нути
 * свої давні повідомлення). Заборонено: not-member chats off-limits.
 */
export async function editMessage(
  messageId: string,
  userId: string,
  dto: EditMessageDto,
): Promise<Message> {
  const message = await messageRepo.findMessageById(messageId);
  if (!message) {
    throw new NotFoundError("Message not found", "MESSAGE_NOT_FOUND");
  }

  // Membership-check
  const member = await chatRepo.findMembership(message.chatId, userId);
  if (!member || member.leftAt !== null) {
    throw new ForbiddenError("Not a member of this chat", "NOT_A_MEMBER");
  }

  // Тільки author
  if (message.authorId !== userId) {
    throw new ForbiddenError("Cannot edit another user's message", "NOT_MESSAGE_AUTHOR");
  }

  // Видалене не редагуємо
  if (message.deletedAt !== null) {
    throw new BadRequestError("Cannot edit deleted message", "MESSAGE_DELETED");
  }

  const updated = await messageRepo.updateMessageContent(messageId, {
    content: dto.content,
  });

  return mapMessageToDto(updated as MessageWithAuthor);
}

// ============================================
// DELETE
// ============================================

/**
 * Soft delete. Тільки author. Якщо вже deleted — no-op (idempotent).
 */
export async function deleteMessage(messageId: string, userId: string): Promise<Message> {
  const message = await messageRepo.findMessageById(messageId);
  if (!message) {
    throw new NotFoundError("Message not found", "MESSAGE_NOT_FOUND");
  }

  const member = await chatRepo.findMembership(message.chatId, userId);
  if (!member || member.leftAt !== null) {
    throw new ForbiddenError("Not a member of this chat", "NOT_A_MEMBER");
  }

  if (message.authorId !== userId) {
    throw new ForbiddenError("Cannot delete another user's message", "NOT_MESSAGE_AUTHOR");
  }

  // Якщо вже deleted — повертаємо як є (idempotent).
  if (message.deletedAt !== null) {
    return mapMessageToDto(message as MessageWithAuthor);
  }

  const deleted = await messageRepo.softDeleteMessage(messageId);
  return mapMessageToDto(deleted as MessageWithAuthor);
}

// ============================================
// LIST (cursor pagination)
// ============================================

/**
 * Історія повідомлень. Membership уже перевірений middleware-ом.
 *
 * Повертає від нових до старих (id DESC). Клієнт реверсує для
 * рендера у chat-bubbles UI.
 */
export async function getMessages(
  chatId: string,
  query: GetMessagesQuery,
): Promise<MessagePage> {
  const { items, nextCursor } = await messageRepo.listMessagesPaged({
    chatId,
    cursor: query.cursor,
    limit: query.limit,
  });

  return {
    items: items.map((m) => mapMessageToDto(m as MessageWithAuthor)),
    nextCursor,
  };
}
