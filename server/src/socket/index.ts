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
 *  - Redis adapter (опційно, тільки якщо встановлено REDIS_URL)
 *
 * Експорт `io` — singleton-style. Інші модулі (chat.service, message.service)
 * імпортують його для broadcast.
 */

let ioInstance: AppServer | null = null;

export async function initSocket(httpServer: HttpServer): Promise<AppServer> {
  if (ioInstance) {
    throw new Error("Socket.io already initialized");
  }

  const io: AppServer = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  // Redis adapter — опційно, для multi-instance scaling.
  // Якщо REDIS_URL встановлено — підключаємо. Інакше in-memory (default).
  // У нас single-instance free tier на Render, але закладаємо щоб коли
  // перейдемо на Hobby plan / 2+ інстансів — нічого не міняти.
  if (env.REDIS_URL) {
    try {
      const { createAdapter } = await import("@socket.io/redis-adapter");
      const { createClient } = await import("redis");

      const pubClient = createClient({ url: env.REDIS_URL });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);

      io.adapter(createAdapter(pubClient, subClient));
      socketLogger.info("Redis adapter attached");
    } catch (err) {
      socketLogger.error({ err }, "Failed to attach Redis adapter, falling back to in-memory");
    }
  }

  io.use(socketAuthMiddleware);
  setupConnectionHandler(io);

  ioInstance = io;
  socketLogger.info({ withRedis: !!env.REDIS_URL }, "Socket.io initialized");
  return io;
}

/**
 * Доступ до io з інших модулів (chat.service, message.service для broadcast).
 *
 * Кидає якщо initSocket ще не викликано — це safety-net.
 */
export function getIO(): AppServer {
  if (!ioInstance) {
    throw new Error("Socket.io not initialized. Call initSocket(httpServer) first.");
  }
  return ioInstance;
}
