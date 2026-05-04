import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

/**
 * Rate limiters для різних типів роутів.
 *
 * Базова стратегія:
 * - generalLimiter — для всіх API-роутів, дуже м'який ліміт
 * - authLimiter — для login/register/refresh, жорсткий у prod (захист
 *   від brute-force), м'який у dev (бо постійно перетестовуємо форми)
 *
 * У продакшені треба буде додати Redis-store (через rate-limit-redis),
 * інакше при кількох інстансах ліміт легко обійти. Для пет-проекту
 * на одному інстансі — in-memory достатньо.
 *
 * keyGenerator за замовчуванням — IP. У майбутньому можемо зробити
 * "rate limit per userId after auth + per IP before auth".
 */

const isDev = env.NODE_ENV === "development";

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 хвилина
  limit: isDev ? 1000 : 300, // у dev майже без ліміту
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  // Dev: 200 спроб (для зручного тестування форм)
  // Prod: 10 спроб (захист від brute-force)
  limit: isDev ? 200 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // skipSuccessfulRequests: true означає що успішні логіни не "з'їдають" ліміт —
  // інакше юзер з частими логінами на різних пристроях впирається у блок.
  skipSuccessfulRequests: true,
});
