import type { Request, Response } from "express";
import type { SearchMessagesQuery } from "@chat/shared";

import * as searchService from "../services/search.service.js";
import type { ValidatedRequest } from "../middlewares/validate.js";

/**
 * GET /api/v1/search/messages?q=...&offset=0&limit=20
 *
 * Response: { results, total, hasMore }
 *
 * Auth required (як для решти /api/v1).
 */
export async function searchMessages(req: Request, res: Response): Promise<void> {
  const { query } = (req as ValidatedRequest<unknown, unknown, SearchMessagesQuery>).validated;
  const response = await searchService.searchMessages(req.userId, query);
  res.json(response);
}
