import { createClient, type RedisClientType } from "redis";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================
 * Redis client (lazy singleton)
 * ============================================
 *
 * Підключається при першому виклику getRedis(). Якщо REDIS_URL не задано —
 * повертає null. Сервіси які залежать від Redis (typing, presence) повинні
 * перевіряти null і робити graceful no-op.
 *
 * Це важливо для двох сценаріїв:
 *  - dev без Redis у docker-compose
 *  - тести де ми не хочемо залежати від зовнішніх систем
 *
 * Той самий REDIS_URL що Socket.io adapter використовує — окремий
 * client щоб бізнес-логіка не залежала від adapter internals.
 */

let client: RedisClientType | null = null;
let connectPromise: Promise<void> | null = null;

/**
 * Повертає connected Redis client або null якщо REDIS_URL не задано.
 *
 * Async бо connect асинхронний. Перший виклик ініціює з'єднання,
 * наступні просто повертають той самий client.
 */
export async function getRedis(): Promise<RedisClientType | null> {
  if (!env.REDIS_URL) return null;

  if (client) return client;

  if (!connectPromise) {
    const newClient: RedisClientType = createClient({ url: env.REDIS_URL });

    newClient.on("error", (err) => {
      logger.error({ err }, "Redis client error");
    });

    connectPromise = newClient.connect().then(() => {
      client = newClient;
      logger.info("Redis client connected");
    });
  }

  await connectPromise;
  return client;
}

/**
 * Graceful close на shutdown. Викликається з server/index.ts при SIGTERM.
 */
export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    connectPromise = null;
  }
}
