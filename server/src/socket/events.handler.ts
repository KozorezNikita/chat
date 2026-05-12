import { parse as parseCookie } from "cookie";

import { verifyAccessToken } from "../utils/tokens.js";
import * as typingService from "../services/typing.service.js";
import type { AppSocket } from "./connection.handler.js";
import { socketLogger } from "./logger.js";

/**
 * ============================================
 * Client → Server event handlers
 * ============================================
 *
 * Per-emit auth (узгоджено в Iter 3 — варіант Б): кожен handler через
 * withAuth wrapper перевіряє accessToken з handshake cookies.
 *
 * Якщо токен expired → emit "auth:expired" клієнту, не виконуємо handler.
 * Клієнт ловить це → намагається REST refresh → reconnect socket.
 */

const TYPING_THROTTLE_MS = 1000;

interface SocketWithTypingState extends AppSocket {
  data: AppSocket["data"] & { lastTypingAt?: number };
}

async function isAuthValid(socket: AppSocket): Promise<boolean> {
  try {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
    const accessToken = cookies.accessToken;
    if (!accessToken) return false;
    await verifyAccessToken(accessToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Реєструє listeners на client emits для одного socket.
 * Викликається з connection.handler-а при кожному connect.
 */
export function setupEventHandlers(socket: AppSocket): void {
  socket.on("typing:start", async (payload) => {
    if (!(await isAuthValid(socket))) {
      socket.emit("auth:expired");
      return;
    }

    // Throttle: max 1 emit/sec per socket
    const now = Date.now();
    const typedSocket = socket as SocketWithTypingState;
    const lastAt = typedSocket.data.lastTypingAt ?? 0;
    if (now - lastAt < TYPING_THROTTLE_MS) return;
    typedSocket.data.lastTypingAt = now;

    // Тип-guard: chatId має бути string
    if (typeof payload?.chatId !== "string" || !payload.chatId) {
      socketLogger.warn({ socketId: socket.id, payload }, "Invalid typing:start payload");
      return;
    }

    await typingService.broadcastTypingStart(socket.data.userId, payload.chatId);
  });

  socket.on("typing:stop", async (payload) => {
    if (!(await isAuthValid(socket))) {
      socket.emit("auth:expired");
      return;
    }

    if (typeof payload?.chatId !== "string" || !payload.chatId) return;

    await typingService.broadcastTypingStop(socket.data.userId, payload.chatId);
  });
}
