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
