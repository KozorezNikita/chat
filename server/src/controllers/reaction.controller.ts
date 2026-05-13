import type { Request, Response } from "express";
import type { ToggleReactionDto } from "@chat/shared";

import * as reactionService from "../services/reaction.service.js";
import type { ValidatedRequest } from "../middlewares/validate.js";

/**
 * POST /api/v1/messages/:messageId/reactions
 *
 * Body: { emoji: "👍" }
 * Toggle: якщо реакція є — видаляє, якщо нема — створює.
 *
 * Response: { action, messageId, reactions } — клієнт може оновити кеш одразу.
 * Паралельно сервер broadcast-ить reaction:updated всім member-ам.
 */
export async function toggleReaction(req: Request, res: Response): Promise<void> {
  const { body } = (req as ValidatedRequest<ToggleReactionDto>).validated;
  const { messageId } = req.params as { messageId: string };

  const result = await reactionService.toggleReaction(messageId, req.userId, body);
  res.json(result);
}
