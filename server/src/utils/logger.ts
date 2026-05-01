import pino from "pino";
import { env } from "../config/env.js";

/**
 * Singleton Pino logger.
 *
 * У dev: pretty-print через pino-pretty (читабельніше у консолі).
 * У prod: structured JSON (для парсингу logging-системою — Better Stack, Datadog, ...).
 *
 * Usage:
 *   import { logger } from "./utils/logger.js";
 *   logger.info({ userId }, "User signed in");
 *
 * pino-http (у requestLogger middleware) додає req.log — той самий instance
 * але з прив'язаним requestId. Коли це можливо, логуй через req.log.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    },
  }),
  // Стандартні serializers для err, req, res — щоб помилки і запити логувались
  // структуровано, а не [object Object].
  serializers: pino.stdSerializers,
});
