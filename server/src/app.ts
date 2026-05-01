import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { generalLimiter } from "./middlewares/rateLimiter.js";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";

/**
 * Створює і конфігурує Express app — БЕЗ виклику listen.
 *
 * Чому окремо від index.ts:
 * - Integration-тести через supertest використовують саме app, без listen
 * - При listen у тестах процеси не закриваються чисто
 *
 * index.ts імпортує цю функцію і викликає listen лише у "звичайному" запуску.
 */
export function createApp(): Express {
  const app = express();

  // Security headers — ставимо ПЕРШИМ, до будь-чого іншого.
  // Defaults helmet-а покривають більшість критичного:
  //   - X-Content-Type-Options: nosniff
  //   - X-Frame-Options: SAMEORIGIN
  //   - Strict-Transport-Security (HSTS) — у prod
  //   - Cross-Origin-* policies
  // CSP вимикаємо — у API-only режимі він не потрібен (відповідь — JSON,
  // не HTML), а на фронт-домені CSP буде налаштовуватись у Next.js окремо.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Ставиться другим — щоб усі логи містили req.id, навіть з error handler-ів.
  app.use(requestLogger);

  // Trust proxy — потрібно якщо за reverse-proxy (Railway, Render):
  // інакше req.ip = IP проксі, не реальний клієнт; rate-limiter працює неправильно.
  app.set("trust proxy", 1);

  // CORS: лише з фронт-домену, з credentials для cookies.
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // Rate limit на всі API. Окремий жорсткіший limiter — у auth-роутах
  // (додамо у наступній ітерації).
  app.use("/api", generalLimiter);

  // Версіонована API.
  app.use("/api/v1", healthRouter);
  app.use("/api/v1/auth", authRouter);

  // 404 для усього що не зматчилось.
  app.use(notFoundHandler);

  // Error handler — ОСТАННІМ.
  app.use(errorHandler);

  return app;
}
