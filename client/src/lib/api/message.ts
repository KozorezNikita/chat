import type {
  Message,
  MessagePage,
  SendMessageDto,
  EditMessageDto,
  SentMessageResponse,
} from "@chat/shared";

import { api } from "./client";

/**
 * Message API.
 *
 * GET /chats/:chatId/messages — cursor-paged історія
 * POST /chats/:chatId/messages — send (повертає SentMessageResponse + clientId)
 * PATCH /messages/:id — edit
 * DELETE /messages/:id — soft delete
 */

export function getMessages(
  chatId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<MessagePage> {
  return api({
    method: "GET",
    url: `/chats/${chatId}/messages`,
    params: { cursor: options.cursor, limit: options.limit ?? 50 },
  });
}

export function sendMessage(
  chatId: string,
  dto: SendMessageDto,
): Promise<{ message: SentMessageResponse }> {
  return api({
    method: "POST",
    url: `/chats/${chatId}/messages`,
    data: dto,
  });
}

export function editMessage(
  messageId: string,
  dto: EditMessageDto,
): Promise<{ message: Message }> {
  return api({
    method: "PATCH",
    url: `/messages/${messageId}`,
    data: dto,
  });
}

export function deleteMessage(messageId: string): Promise<{ message: Message }> {
  return api({
    method: "DELETE",
    url: `/messages/${messageId}`,
  });
}
