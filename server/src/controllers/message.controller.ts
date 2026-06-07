import type { Request, Response } from "express";
import type { SendMessageDto, EditMessageDto, GetMessagesQuery } from "@chat/shared";

import * as messageService from "../services/message.service.js";
import type { ValidatedRequest } from "../middlewares/validate.js";

/**
 * Message controller — тонкі handlers.
 */

// ============================================
// LIST
// ============================================

export async function getMessages(req: Request, res: Response): Promise<void> {
  const { query } = (req as ValidatedRequest<unknown, unknown, GetMessagesQuery>).validated;
  const page = await messageService.getMessages(
    req.chatMember.chatId,
    req.userId,
    query,
  );
  res.json(page);
}

// ============================================
// SEND
// ============================================

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const body = (req as ValidatedRequest<SendMessageDto>).validated.body;
  const message = await messageService.sendMessage(
    req.chatMember.chatId,
    req.userId,
    body,
  );

  req.log.info(
    { chatId: req.chatMember.chatId, messageId: message.id, clientId: body.clientId },
    "Message sent",
  );

  res.status(201).json({ message });
}

// ============================================
// EDIT
// ============================================

export async function editMessage(req: Request, res: Response): Promise<void> {
  const messageId = String(req.params.messageId ?? "");
  const body = (req as ValidatedRequest<EditMessageDto>).validated.body;

  const message = await messageService.editMessage(messageId, req.userId, body);

  req.log.info({ messageId, userId: req.userId }, "Message edited");
  res.json({ message });
}

// ============================================
// DELETE
// ============================================

export async function deleteMessage(req: Request, res: Response): Promise<void> {
  const messageId = String(req.params.messageId ?? "");
  const message = await messageService.deleteMessage(messageId, req.userId);

  req.log.info({ messageId, userId: req.userId }, "Message deleted");
  res.json({ message });
}

// ============================================
// SEND WITH ATTACHMENT (Iter 7)
// ============================================

/**
 * POST /api/v1/chats/:chatId/messages/upload (multipart/form-data)
 *
 * Fields:
 *   file: File (binary, required)
 *   clientId: string (UUID, required)
 *   content: string (optional, "" якщо тільки файл)
 *   parentMessageId: string (optional)
 *   duration: string (optional, integer seconds) — тільки для audio (Iter 10)
 *
 * req.file типується через @types/multer (global Express.Multer.File).
 */
export async function sendMessageWithAttachment(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({
      error: { code: "FILE_REQUIRED", message: "File is required" },
    });
    return;
  }

  // Multipart body: всі поля — string (multer не парсить JSON для multipart)
  const body = req.body as {
    clientId?: string;
    content?: string;
    parentMessageId?: string;
    duration?: string;
  };

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    res.status(400).json({
      error: { code: "INVALID_CLIENT_ID", message: "clientId must be a UUID" },
    });
    return;
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const parentMessageId =
    typeof body.parentMessageId === "string" && body.parentMessageId.length > 0
      ? body.parentMessageId
      : undefined;

  // Duration — тільки для audio. Парсимо як positive integer, max 120s (2 хв).
  // Невалідне duration → ігноруємо (null у БД), а не 400 — backward-compatible.
  let duration: number | undefined;
  if (typeof body.duration === "string" && body.duration.length > 0) {
    const parsed = parseInt(body.duration, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 120) {
      duration = parsed;
    }
  }

  const message = await messageService.sendMessageWithAttachment({
    chatId: req.chatMember.chatId,
    authorId: req.userId,
    clientId,
    content,
    parentMessageId,
    duration,
    file: {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    },
  });

  req.log.info(
    {
      chatId: req.chatMember.chatId,
      messageId: message.id,
      clientId,
      fileName: file.originalname,
      fileSize: file.size,
    },
    "Message with attachment sent",
  );

  res.status(201).json({ message });
}
