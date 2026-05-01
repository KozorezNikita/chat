import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";

/**
 * pino-http middleware:
 * - кладе req.log на кожен запит (логер з прив'язаним req.id)
 * - автоматично логує request/response з тривалістю
 * - генерує requestId через crypto.randomUUID
 *
 * У продакшені цей requestId варто прокидати в Socket.io події і Redis-операції,
 * щоб мати наскрізну кореляцію. Для початку — лише HTTP.
 *
 * Для тестового NODE_ENV логування заглушаємо — не засмічуємо вивід Jest.
 */
export const requestLogger = pinoHttp({
  logger,
  // genReqId дає кожному запиту унікальний UUID, доступний як req.id.
  // pino-http додасть його у кожен лог-рядок цього запиту.
  genReqId: (req, res) => {
    const existing = req.headers["x-request-id"];
    const id = typeof existing === "string" && existing.length > 0
      ? existing
      : randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  // У dev — менше шуму на 200-х відповідях.
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    if (res.statusCode >= 300) return "silent";
    return "info";
  },
  // Тестам логи не потрібні.
  ...(process.env.NODE_ENV === "test" && { level: "silent" }),
});
