import { parse as parseCookie } from "cookie";
import type { Socket } from "socket.io";

import { verifyAccessToken } from "../utils/tokens.js";
import * as userRepo from "../repositories/user.repo.js";
import { socketLogger } from "./logger.js";

/**
 * ============================================
 * Socket.io handshake auth middleware
 * ============================================
 *
 * Виконується ПЕРЕД встановленням з'єднання — якщо next(error) → connect rejected.
 *
 * Що робить:
 *  1. Парсить cookies з handshake.headers
 *  2. Бере accessToken
 *  3. Verify через jose (signature + expiry)
 *  4. Підтягує юзера з БД (як і requireAuth для REST — щоб видалені юзери не підключались)
 *  5. Кладе userId у socket.data
 *
 * При будь-якій помилці next(Error("UNAUTHORIZED")) → клієнт побачить connect_error.
 *
 * Per-emit re-validation у Iter 3 не робимо — клієнт нічого не emit-ить.
 * Коли в Iter 4 додамо typing:start/stop, обернемо handler-и через withAuth helper.
 */

interface SocketAuthError extends Error {
  data?: { code: string };
}

function authError(code: string, message: string): SocketAuthError {
  const err: SocketAuthError = new Error(message);
  err.data = { code };
  return err;
}

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const cookieHeader = socket.handshake.headers.cookie ?? "";
    const cookies = parseCookie(cookieHeader);
    const accessToken = cookies.accessToken;

    if (!accessToken) {
      socketLogger.debug({ socketId: socket.id }, "Socket auth: no access token");
      return next(authError("NO_ACCESS_TOKEN", "Not authenticated"));
    }

    let payload;
    try {
      payload = await verifyAccessToken(accessToken);
    } catch {
      socketLogger.debug({ socketId: socket.id }, "Socket auth: invalid token");
      return next(authError("INVALID_ACCESS_TOKEN", "Invalid token"));
    }

    const user = await userRepo.findActiveUserById(payload.sub);
    if (!user) {
      socketLogger.debug(
        { socketId: socket.id, userId: payload.sub },
        "Socket auth: user not found",
      );
      return next(authError("USER_NOT_FOUND", "User not found"));
    }

    socket.data.userId = user.id;
    next();
  } catch (err) {
    socketLogger.error({ err, socketId: socket.id }, "Socket auth: unexpected error");
    next(authError("AUTH_ERROR", "Auth error"));
  }
}
