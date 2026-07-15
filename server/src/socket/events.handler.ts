import * as typingService from "../services/typing.service.js";
import type { AppSocket } from "./connection.handler.js";
import { socketLogger } from "./logger.js";

/**
 * ============================================
 * Client → Server event handlers
 * ============================================
 *
 * Auth: НЕ ре-валідуємо per-emit. Раніше тут була перевірка проти
 * handshake-cookie — але це знімок на момент connect, він не оновлюється,
 * тож на живому з'єднанні токен у знімку "протухав" і typing замовкав
 * назавжди навіть для валідної сесії. Тепер термін життя з'єднання
 * обмежується server-side disconnect-ом на exp токена (див.
 * connection.handler). Поки socket живий — auth дійсний за побудовою.
 */

const TYPING_THROTTLE_MS = 1000;

interface SocketWithTypingState extends AppSocket {
  data: AppSocket["data"] & { lastTypingAt?: number };
}

/**
 * Реєструє listeners на client emits для одного socket.
 * Викликається з connection.handler-а при кожному connect.
 */
export function setupEventHandlers(socket: AppSocket): void {
  socket.on("typing:start", async (payload) => {
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
    if (typeof payload?.chatId !== "string" || !payload.chatId) return;

    await typingService.broadcastTypingStop(socket.data.userId, payload.chatId);
  });
}
