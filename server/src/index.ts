import { createServer } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./db/prisma.js";
import { disconnectRedis } from "./db/redis.js";
import { initSocket } from "./socket/index.js";

/**
 * Entry point — запуск HTTP-сервера + Socket.io + graceful shutdown.
 *
 * Порівняно з Iter 1-2:
 *  - Замість app.listen() — створюємо http.Server явно
 *  - Attach Socket.io до того ж серверу
 *  - При shutdown — закриваємо обидва
 *
 * Graceful shutdown:
 * - SIGTERM (від Render/Railway при релізі) і SIGINT (Ctrl+C) →
 *   перестаємо приймати нові з'єднання
 * - чекаємо завершення поточних HTTP-запитів і WS-сесій
 * - закриваємо Prisma pool
 * - exit
 *
 * Якщо за 10 секунд не закрилось — force exit.
 */

async function bootstrap() {
  const app = createApp();
  const httpServer = createServer(app);
  const io = await initSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `🚀 Server listening on http://localhost:${env.PORT}`,
    );
  });

  const SHUTDOWN_TIMEOUT_MS = 10_000;

  async function shutdown(signal: string) {
    logger.info({ signal }, "Shutdown signal received, closing gracefully...");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timeout exceeded, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceExit.unref();

    try {
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });

      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });

      await prisma.$disconnect();
      await disconnectRedis();

      logger.info("Shutdown complete");
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      clearTimeout(forceExit);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — shutting down");
    void shutdown("uncaughtException");
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "Failed to bootstrap server");
  process.exit(1);
});
