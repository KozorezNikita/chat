/**
 * Базова ієрархія HTTP-помилок.
 *
 * Чому з кодами:
 * - status — це HTTP-семантика (404, 409, ...)
 * - code — це machine-readable рядок ("NOT_FOUND", "USER_ALREADY_EXISTS")
 *   для умовної логіки на клієнті
 * - message — людський текст для відображення у UI
 *
 * Клієнт у toast чи error UI використовує message, у логіці —
 * перевіряє code. Це дозволяє міняти message без поломки клієнта.
 *
 * Не expose-имо stack трейс або деталі помилок назовні —
 * це робить errorHandler middleware.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Зберігаємо stack для логів — але ніколи не показуємо клієнту.
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request", code = "BAD_REQUEST", details?: unknown) {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
    super(401, code, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden", code = "FORBIDDEN") {
    super(403, code, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found", code = "NOT_FOUND") {
    super(404, code, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict", code = "CONFLICT") {
    super(409, code, message);
  }
}

export class UnprocessableEntityError extends HttpError {
  constructor(message = "Unprocessable entity", code = "UNPROCESSABLE_ENTITY", details?: unknown) {
    super(422, code, message, details);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = "Too many requests", code = "TOO_MANY_REQUESTS") {
    super(429, code, message);
  }
}

export class InternalServerError extends HttpError {
  constructor(message = "Internal server error", code = "INTERNAL_ERROR") {
    super(500, code, message);
  }
}
