import type { Request, Response } from "express";
import type { GetPresenceQuery } from "@chat/shared";

import * as presenceService from "../services/presence.service.js";
import type { ValidatedRequest } from "../middlewares/validate.js";

/**
 * GET /api/v1/presence?userIds=cm1,cm2,cm3
 *
 * Повертає online status + lastSeenAt для масиву userIds.
 * Клієнт polling-ить раз на 30 сек.
 *
 * Cache-Control: no-store бо presence змінюється і кеш не потрібен.
 */
export async function getPresence(req: Request, res: Response): Promise<void> {
  const { query } = (req as ValidatedRequest<unknown, unknown, GetPresenceQuery>).validated;
  const presence = await presenceService.getPresenceForUsers(query.userIds);

  res.setHeader("Cache-Control", "no-store");
  res.json({ presence });
}
