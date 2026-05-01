import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./db/prisma.js";

/**
 * Entry point — запуск HTTP-сервера + graceful shutdown.
 *
 * Graceful shutdown:
 * - SIGTERM (від Docker/Railway/Render при релізі) і SIGINT (Ctrl+C) →
 *   перестаємо приймати нові з'єднання
 * - чекаємо завершення поточних запитів
 * - закриваємо Prisma pool
 * - exit
 *
 * Якщо за 10 секунд не закрилось — force exit (іноді висить hanging-сокет).
 */

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `🚀 Server listening on http://localhost:${env.PORT}`,
  );
});

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received, closing gracefully...");

  // Setup hard-kill таймаут — якщо за 10 сек не закрились, force exit
  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timeout exceeded, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  forceExit.unref(); // не тримати event loop

  try {
    // 1. Перестаємо приймати нові з'єднання, чекаємо доки активні завершаться
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // 2. Закриваємо Prisma — це також закриває connection pool
    await prisma.$disconnect();

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

// Логуємо unhandled errors — щоб не зникали в порожнечу.
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  void shutdown("uncaughtException");
});
