import type { Request, Response, NextFunction } from "express";

import { verifyAccessToken } from "../utils/tokens.js";
import { findActiveUserById } from "../repositories/user.repo.js";
import { UnauthorizedError } from "../utils/HttpError.js";

/**
 * ============================================
 * Auth middleware
 * ============================================
 *
 * Алгоритм:
 *   1. Читаємо accessToken з HttpOnly cookie (не з Authorization header —
 *      ми не підтримуємо bearer tokens, бо JWT у JS-доступному місці =
 *      XSS-вектор)
 *   2. verifyAccessToken → дістаємо userId
 *   3. findActiveUserById → перевіряємо що юзер досі існує в БД
 *      (на КОЖЕН авторизований запит, узгоджено в плані 1.3)
 *   4. Кладемо userId у req.userId через module augmentation
 *
 * Чому DB lookup на кожному запиті:
 * - У нас немає access-token blacklist у Redis (узгоджено в 1.0)
 * - Якщо юзер видалений / заблокований / змінив пароль — поточний access
 *   досі валідний за підписом, але юзер має бути миттєво відключений
 * - Витрата: 1 SQL ~0.5мс з warm cache. Прийнятно.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** ID авторизованого юзера. Заповнює requireAuth middleware. */
      userId: string;
    }
  }
}

/**
 * Гарантує що запит від авторизованого юзера. Інакше 401.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const accessToken = req.cookies?.accessToken;

    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new UnauthorizedError("Authentication required", "NO_ACCESS_TOKEN");
    }

    let payload;
    try {
      payload = await verifyAccessToken(accessToken);
    } catch {
      // jose кидає різні помилки (expired, invalid sig, malformed) — для
      // клієнта це все одне: токен не валідний, треба refresh.
      throw new UnauthorizedError("Invalid or expired access token", "INVALID_ACCESS_TOKEN");
    }

    // Перевіряємо що юзер досі існує (видалений? заблокований? — 401).
    const user = await findActiveUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedError("User no longer exists", "USER_NOT_FOUND");
    }

    req.userId = payload.sub;
    next();
  } catch (err) {
    next(err);
  }
}
