import "dotenv/config";
import { z } from "zod";

/**
 * Валідація env-змінних на старті процесу.
 *
 * Якщо будь-яка обов'язкова змінна відсутня або має невалідний формат —
 * процес падає з зрозумілою помилкою. Краще fail fast при `npm start`,
 * ніж половина фіч ламається у проді через NODE_ENV=undefined.
 *
 * Окремо: усі секрети мають мінімальну довжину 32 — щоб ніхто не
 * виставив "secret123" і не лишив це у проді.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().url(),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET має бути мінімум 32 символи"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET має бути мінімум 32 символи"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  COOKIE_DOMAIN: z.string().optional(),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string(),

  CLIENT_URL: z.string().url(),
});

/**
 * Окрема функція замість прямого parse у module-scope:
 * - тести можуть мокати env через окремий setup-file перед import-ом
 * - помилка валідації виводиться красиво через .format()
 */
function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // Console-ом, не logger-ом — logger ще не існує (env потрібний для його створення).
    // eslint-disable-next-line no-console
    console.error("❌ Невалідні env-змінні:");
    // eslint-disable-next-line no-console
    console.error(z.prettifyError(result.error));
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
