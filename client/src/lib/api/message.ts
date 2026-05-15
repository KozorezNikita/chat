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

/**
 * POST /chats/:chatId/messages/upload (multipart/form-data)
 *
 * Окремий endpoint для file uploads. Backend приймає `file` + JSON-fields як
 * form-data. Browser сам ставить Content-Type з boundary — НЕ перевизначаємо.
 *
 * onProgress — для прогрес-бару під час upload.
 */
export function uploadMessageWithFile(
  chatId: string,
  input: {
    file: File;
    clientId: string;
    content?: string;
    parentMessageId?: string;
  },
  onProgress?: (percent: number) => void,
): Promise<{ message: SentMessageResponse }> {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("clientId", input.clientId);
  if (input.content) formData.append("content", input.content);
  if (input.parentMessageId) formData.append("parentMessageId", input.parentMessageId);

  return api({
    method: "POST",
    url: `/chats/${chatId}/messages/upload`,
    data: formData,
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    },
  });
}
