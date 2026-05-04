import type { Request, Response } from "express";
import type {
  CreateDirectChatDto,
  CreateGroupChatDto,
  UpdateGroupChatDto,
  MarkAsReadDto,
} from "@chat/shared";

import * as chatService from "../services/chat.service.js";
import type { ValidatedRequest } from "../middlewares/validate.js";

/**
 * Chat controller — тонкі handlers, як в auth.
 *
 * Жодних try/catch — Express 5 + errorHandler ловить async помилки.
 */

// ============================================
// READ
// ============================================

export async function getChats(req: Request, res: Response): Promise<void> {
  const chats = await chatService.getUserChats(req.userId);
  res.json({ chats });
}

export async function getChat(req: Request, res: Response): Promise<void> {
  // Membership уже перевірений у requireChatMembership middleware
  const chat = await chatService.getChat(req.chatMember.chatId, req.userId);
  res.json({ chat });
}

// ============================================
// CREATE
// ============================================

export async function createDirectChat(req: Request, res: Response): Promise<void> {
  const body = (req as ValidatedRequest<CreateDirectChatDto>).validated.body;
  const chat = await chatService.createDirectChat(req.userId, body);

  req.log.info({ chatId: chat.id, withUserId: body.userId }, "Direct chat created/found");

  res.status(201).json({ chat });
}

export async function createGroupChat(req: Request, res: Response): Promise<void> {
  const body = (req as ValidatedRequest<CreateGroupChatDto>).validated.body;
  const chat = await chatService.createGroupChat(req.userId, body);

  req.log.info(
    { chatId: chat.id, name: body.name, memberCount: body.memberIds.length },
    "Group chat created",
  );

  res.status(201).json({ chat });
}

// ============================================
// UPDATE / DELETE
// ============================================

export async function updateChat(req: Request, res: Response): Promise<void> {
  const body = (req as ValidatedRequest<UpdateGroupChatDto>).validated.body;
  const chat = await chatService.updateGroupChat(
    req.chatMember.chatId,
    req.userId,
    body,
  );

  req.log.info({ chatId: chat.id }, "Chat updated");
  res.json({ chat });
}

export async function deleteChat(req: Request, res: Response): Promise<void> {
  await chatService.deleteGroupChat(req.chatMember.chatId, req.userId);

  req.log.info({ chatId: req.chatMember.chatId }, "Chat deleted");
  res.status(204).send();
}

// ============================================
// MEMBERSHIP
// ============================================

interface AddMemberBody {
  userId: string;
}

export async function addMember(req: Request, res: Response): Promise<void> {
  const body = (req as ValidatedRequest<AddMemberBody>).validated.body;
  const newMember = await chatService.addMember(
    req.chatMember.chatId,
    req.userId,
    body.userId,
  );

  req.log.info(
    { chatId: req.chatMember.chatId, addedUserId: body.userId },
    "Member added",
  );

  res.status(201).json({ member: newMember });
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  const targetUserId = String(req.params.userId ?? "");
  if (!targetUserId) {
    res.status(400).json({ error: { code: "USER_ID_MISSING", message: "User ID required" } });
    return;
  }

  await chatService.removeMember(req.chatMember.chatId, req.userId, targetUserId);

  req.log.info(
    {
      chatId: req.chatMember.chatId,
      targetUserId,
      isSelfLeave: targetUserId === req.userId,
    },
    "Member removed/left",
  );

  res.status(204).send();
}

// ============================================
// READ MARKER
// ============================================

export async function markAsRead(req: Request, res: Response): Promise<void> {
  const body = (req as ValidatedRequest<MarkAsReadDto>).validated.body;
  await chatService.markChatAsRead(req.chatMember.chatId, req.userId, body.messageId);

  res.json({ ok: true });
}
