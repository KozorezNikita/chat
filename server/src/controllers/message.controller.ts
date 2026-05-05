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
  const page = await messageService.getMessages(req.chatMember.chatId, query);
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
