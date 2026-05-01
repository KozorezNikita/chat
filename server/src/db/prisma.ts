import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Singleton Prisma client (Prisma 7).
 *
 * ============================================
 * Чому adapter обов'язковий
 * ============================================
 * У Prisma 7 викинули Rust-engine — клієнт працює через JavaScript
 * driver adapter. Для PostgreSQL це @prisma/adapter-pg над node-pg.
 *
 * new PrismaClient() без adapter кидає
 * "Using engine type 'client' requires either 'adapter' or 'accelerateUrl'".
 * Це навмисна зміна Prisma 7, не баг.
 *
 * ============================================
 * Чому singleton
 * ============================================
 * PrismaClient тримає connection pool. Створення кількох instance-ів =
 * кілька pool-ів = exhaust connections до БД дуже швидко.
 *
 * У dev hot-reload через `tsx watch` модуль перезавантажується при
 * змінах. Без globalThis-кешу ми б створювали новий client кожні
 * 2 секунди — пул швидко вичерпується. Тому кешуємо у globalThis
 * для dev. У prod це не потрібно (модуль вантажиться один раз).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" },
          ]
        : [{ emit: "event", level: "error" }],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV === "development") {
  globalForPrisma.prisma = prisma;
}

// Прокидаємо Prisma-логи в Pino — щоб усі логи були в одному форматі.
prisma.$on("warn" as never, (e: unknown) => logger.warn({ event: e }, "Prisma warn"));
prisma.$on("error" as never, (e: unknown) => logger.error({ event: e }, "Prisma error"));

if (env.NODE_ENV === "development") {
  // Slow queries — поріг 100мс. Корисно у dev щоб ловити N+1 і відсутні індекси.
  prisma.$on("query" as never, (e: unknown) => {
    const event = e as { query: string; duration: number };
    if (event.duration > 100) {
      logger.warn({ query: event.query, duration: event.duration }, "Slow query");
    }
  });
}
