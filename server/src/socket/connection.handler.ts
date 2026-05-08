import type { Server, Socket } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "@chat/shared";

import * as chatRepo from "../repositories/chat.repo.js";
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
 * Викликається коли socket пройшов handshake auth (auth middleware вже спрацював,
 * socket.data.userId встановлений).
 *
 * Що робимо:
 *  - Join у персональний room user:${userId}
 *  - Завантажуємо активні memberships юзера → join у chat:${chatId} для кожного
 *  - Слухаємо disconnect для логування
 *
 * Чому join при connect:
 *  - При broadcast `io.to('chat:abc').emit(...)` Socket.io знайде всіх юзерів
 *    у цьому room без перевірки membership на кожен emit
 *  - Безпека: ми додаємо в room тільки тих хто реально member у БД
 *  - Add member runtime — через окремий event 'chat:member-added' (Iter 3.2)
 */
export function setupConnectionHandler(io: AppServer): void {
  io.on("connection", async (socket: AppSocket) => {
    const userId = socket.data.userId;

    try {
      // Persona-room для user-targeted events (auth:expired, chat:member-added для нових)
      socket.join(`user:${userId}`);

      // Усі активні чати
      const memberships = await chatRepo.findActiveMembershipsByUser(userId);
      for (const m of memberships) {
        socket.join(`chat:${m.chatId}`);
      }

      socketLogger.info(
        {
          socketId: socket.id,
          userId,
          chatCount: memberships.length,
        },
        "Socket connected",
      );
    } catch (err) {
      socketLogger.error({ err, socketId: socket.id, userId }, "Socket connect setup failed");
      socket.disconnect(true);
      return;
    }

    socket.on("disconnect", (reason) => {
      socketLogger.info(
        { socketId: socket.id, userId, reason },
        "Socket disconnected",
      );
    });
  });
}
