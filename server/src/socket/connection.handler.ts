import type { Server, Socket } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "@chat/shared";

import * as chatRepo from "../repositories/chat.repo.js";
import * as presenceService from "../services/presence.service.js";
import { setupEventHandlers } from "./events.handler.js";
import { socketLogger } from "./logger.js";

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * ============================================
 * Connection handler
 * ============================================
 *
 * Що робимо при connect:
 *  - Join у user-room і у всі chat-rooms юзера
 *  - Track presence (SADD у Redis)
 *  - Реєструємо listeners для client emits (typing)
 *
 * При disconnect:
 *  - Track presence disconnect (SREM, stamp lastSeenAt якщо last socket)
 *  - Socket.io автоматично leave rooms
 */
export function setupConnectionHandler(io: AppServer): void {
  io.on("connection", async (socket: AppSocket) => {
    const userId = socket.data.userId;

    try {
      socket.join(`user:${userId}`);

      const memberships = await chatRepo.findActiveMembershipsByUser(userId);
      for (const m of memberships) {
        socket.join(`chat:${m.chatId}`);
      }

      // Track presence у Redis (graceful no-op якщо Redis недоступний)
      await presenceService.trackConnect(userId, socket.id);

      // Реєструємо listeners на client emits (typing:start/stop)
      setupEventHandlers(socket);

      // Планування disconnect на момент протухання access-токена.
      // Причина: handshake-cookie — знімок на момент connect, він ніколи не
      // оновлюється. Тому не можна ре-валідувати токен per-emit проти нього.
      // Натомість: коли токен, з яким конектились, протухає — розриваємо
      // з'єднання. Клієнтський auto-reconnect зробить новий handshake зі
      // свіжим cookie (який на той момент вже оновлений refresh-чергою).
      const exp = socket.data.tokenExp;
      if (typeof exp === "number") {
        const msUntilExpiry = exp * 1000 - Date.now();
        if (msUntilExpiry <= 0) {
          // Токен уже протух між handshake і цим кодом — рідко, але можливо.
          socket.emit("auth:expired");
          socket.disconnect(true);
          return;
        }
        const timer = setTimeout(() => {
          socketLogger.info({ socketId: socket.id, userId }, "Access token expired — disconnecting");
          // Повідомляємо клієнта ПЕРЕД розривом, щоб він знав причину
          // (proactive refresh), а не тлумачив це як мережевий збій.
          socket.emit("auth:expired");
          socket.disconnect(true);
        }, msUntilExpiry);
        // setTimeout не має тримати процес живим і має чиститись при disconnect.
        timer.unref?.();
        socket.on("disconnect", () => clearTimeout(timer));
      }

      // Periodic presence refresh: поки socket живий — раз на 20 хв оновлюємо
      // TTL ключа online:userId. Без цього ключ (TTL 60 хв) протухав би на
      // довгоживучому з'єднанні, і юзер виглядав би offline попри активний
      // socket. 20 хв дає ~3 рефреші за час TTL — переживає пропущений тік.
      const PRESENCE_REFRESH_MS = 20 * 60 * 1000;
      const presenceTimer = setInterval(() => {
        void presenceService.refreshPresence(userId);
      }, PRESENCE_REFRESH_MS);
      presenceTimer.unref?.();
      socket.on("disconnect", () => clearInterval(presenceTimer));

      socketLogger.info(
        { socketId: socket.id, userId, chatCount: memberships.length },
        "Socket connected",
      );
    } catch (err) {
      socketLogger.error({ err, socketId: socket.id, userId }, "Socket connect setup failed");
      socket.disconnect(true);
      return;
    }

    socket.on("disconnect", async (reason) => {
      await presenceService.trackDisconnect(userId, socket.id);
      socketLogger.info({ socketId: socket.id, userId, reason }, "Socket disconnected");
    });
  });
}
