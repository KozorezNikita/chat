import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import { HttpError, InternalServerError, NotFoundError } from "../utils/HttpError.js";
import { env } from "../config/env.js";

/**
 * Глобальний error handler.
 *
 * Логіка:
 * 1. Якщо це HttpError — повертаємо клієнту { code, message, details? }.
 * 2. Інакше — 500 з generic-повідомленням, повний stack у логи.
 *    Не leak-имо internal помилки клієнту.
 *
 * У dev режимі повертаємо stack у відповіді — допомагає при debug-у.
 * У prod ніколи.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // next потрібен у сигнатурі — Express розпізнає error handler за 4 аргументами.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  // Логуємо ВСІ помилки — навіть HttpError, бо інакше валідаційні помилки
  // легко пропустити при debugging-у. У prod це warn, не error.
  const log = req.log ?? console;

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      log.error({ err }, "HTTP error (5xx)");
    } else {
      log.warn({ err: { code: err.code, status: err.status, message: err.message } }, "HTTP error");
    }

    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
  }

  // Невідома помилка — 500.
  log.error({ err }, "Unhandled error");

  const internal = new InternalServerError();
  return res.status(internal.status).json({
    error: {
      code: internal.code,
      message: internal.message,
      ...(env.NODE_ENV === "development" && err instanceof Error && {
        details: { stack: err.stack, originalMessage: err.message },
      }),
    },
  });
};

/**
 * 404 handler — для роутів які не зматчилися.
 * Кидає NotFoundError, errorHandler ловить.
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`, "ROUTE_NOT_FOUND"));
};
