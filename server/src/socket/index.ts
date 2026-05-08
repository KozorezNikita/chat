import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";

import { env } from "../config/env.js";
import { socketAuthMiddleware } from "./auth.middleware.js";
import { setupConnectionHandler, type AppServer } from "./connection.handler.js";
import { socketLogger } from "./logger.js";

/**
 * ============================================
 * Socket.io server initialization
 * ============================================
 *
 * Створює і повертає io instance, attached до існуючого http.Server-у.
 * Налаштовує:
 *  - CORS (той самий origin що для REST)
 *  - cookies through credentials: true
 *  - auth middleware (handshake)
 *  - connection handler (rooms join)
 *
 * Експорт `io` — singleton-style. Інші модулі (наприклад chat.service)
 * імпортуватимуть його для broadcast у Iter 3.2.
 */

let ioInstance: AppServer | null = null;

export function initSocket(httpServer: HttpServer): AppServer {
  if (ioInstance) {
    throw new Error("Socket.io already initialized");
  }

  const io: AppServer = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
    // Iter 3 — не використовуємо Redis adapter, лише в production deploy (3.5)
    // де у нас один інстанс. У Iter 4 додамо Redis для multi-instance.
  });

  io.use(socketAuthMiddleware);
  setupConnectionHandler(io);

  ioInstance = io;
  socketLogger.info("Socket.io initialized");
  return io;
}

/**
 * Доступ до io з інших модулів (chat.service, message.service для broadcast).
 *
 * Кидає якщо initSocket ще не викликано — це safety-net на випадок
 * неправильного порядку завантаження.
 */
export function getIO(): AppServer {
  if (!ioInstance) {
    throw new Error("Socket.io not initialized. Call initSocket(httpServer) first.");
  }
  return ioInstance;
}
