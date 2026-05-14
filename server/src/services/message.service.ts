import type { Message, MessagePage, SendMessageDto, EditMessageDto, GetMessagesQuery, SentMessageResponse } from "@chat/shared";

import * as messageRepo from "../repositories/message.repo.js";
import * as chatRepo from "../repositories/chat.repo.js";
import {
  broadcastNewMessage,
  broadcastEditedMessage,
  broadcastDeletedMessage,
} from "../socket/broadcast.js";
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
  // Reply threading: якщо клієнт передав parentMessageId, валідуємо що
  // parent існує, у тому ж чаті і не видалений. Це захист від спуфінгу
  // (cross-chat reply) і UX (reply на видалене не має сенсу).
  if (dto.parentMessageId) {
    const parent = await messageRepo.findMessageById(dto.parentMessageId);
    if (!parent || parent.chatId !== chatId) {
      throw new BadRequestError("Parent message not found in this chat", "PARENT_NOT_FOUND");
    }
    if (parent.deletedAt !== null) {
      throw new BadRequestError("Cannot reply to deleted message", "PARENT_DELETED");
    }
  }

  const message = await messageRepo.createMessage({
    chatId,
    authorId,
    content: dto.content,
    parentMessageId: dto.parentMessageId,
  });

  const messageDto = mapMessageToDto(message as MessageWithAuthor, authorId);

  // Broadcast усім members chat-room. Передаємо clientId — автор замінить
  // свою optimistic message у кеші на серверний (без дублів).
  broadcastNewMessage(chatId, messageDto, dto.clientId);

  return {
    ...messageDto,
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

  const messageDto = mapMessageToDto(updated as MessageWithAuthor, userId);
  broadcastEditedMessage(message.chatId, messageDto);

  return messageDto;
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

  // Якщо вже deleted — повертаємо як є (idempotent), broadcast не повторюємо.
  if (message.deletedAt !== null) {
    return mapMessageToDto(message as MessageWithAuthor, userId);
  }

  const deleted = await messageRepo.softDeleteMessage(messageId);
  const messageDto = mapMessageToDto(deleted as MessageWithAuthor, userId);
  broadcastDeletedMessage(message.chatId, messageDto);

  return messageDto;
}

// ============================================
// LIST (cursor pagination)
// ============================================

/**
 * Історія повідомлень. Membership уже перевірений middleware-ом.
 *
 * Повертає від нових до старих (id DESC). Клієнт реверсує для
 * рендера у chat-bubbles UI.
 *
 * currentUserId потрібен для обчислення `reactedByMe` у кожному message-у.
 */
export async function getMessages(
  chatId: string,
  currentUserId: string,
  query: GetMessagesQuery,
): Promise<MessagePage> {
  const { items, nextCursor } = await messageRepo.listMessagesPaged({
    chatId,
    cursor: query.cursor,
    limit: query.limit,
  });

  return {
    items: items.map((m) => mapMessageToDto(m as MessageWithAuthor, currentUserId)),
    nextCursor,
  };
}
