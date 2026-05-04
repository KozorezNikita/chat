import type { Request, Response } from "express";
import type { SearchUsersQuery } from "@chat/shared";

import * as userRepo from "../repositories/user.repo.js";
import type { ValidatedRequest } from "../middlewares/validate.js";
import { mapUserToPublic } from "../services/_mappers.js";

/**
 * GET /api/v1/users/search?q=...&limit=10
 *
 * Пошук юзерів за точним email або @username (узгоджено в плані 2.1).
 * Виключає self з результатів.
 */
export async function searchUsers(req: Request, res: Response): Promise<void> {
  const { q, limit } = (req as ValidatedRequest<unknown, unknown, SearchUsersQuery>).validated.query;

  const users = await userRepo.searchUsers(q, req.userId, limit);
  res.json({ users: users.map(mapUserToPublic) });
}
