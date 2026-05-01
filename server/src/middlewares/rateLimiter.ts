import rateLimit from "express-rate-limit";

/**
 * Rate limiters для різних типів роутів.
 *
 * Базова стратегія:
 * - generalLimiter — для всіх API-роутів, дуже м'який ліміт
 * - authLimiter — для login/register/refresh, жорсткий (захист від brute-force)
 *
 * У продакшені треба буде додати Redis-store (через rate-limit-redis),
 * інакше при кількох інстансах ліміт легко обійти. Для пет-проекту
 * на одному інстансі — in-memory достатньо.
 *
 * keyGenerator за замовчуванням — IP. У майбутньому можемо зробити
 * "rate limit per userId after auth + per IP before auth".
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 хвилина
  limit: 300, // 300 запитів/хв на IP — достатньо для будь-якого реального юзера
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  limit: 10, // 10 спроб/15хв на IP — захист від brute-force
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // skipSuccessfulRequests: true означає що успішні логіни не "з'їдають" ліміт —
  // інакше юзер з частими логінами на різних пристроях впирається у блок.
  skipSuccessfulRequests: true,
});
