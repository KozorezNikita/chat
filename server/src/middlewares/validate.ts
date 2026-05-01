import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodType } from "zod";
import { UnprocessableEntityError } from "../utils/HttpError.js";

/**
 * Типізований validate middleware.
 *
 * ============================================
 * Що це і чим краще за Task Manager
 * ============================================
 * У Task Manager схема валідувала req.body/query/params, клала результат
 * у res.locals.body/query/params, а контролер діставав через
 * `getValidatedQuery<MyType>(res)` — runtime-каст без перевірки що схема
 * у роуті була саме MyType. Класичний string-typed антипатерн.
 *
 * Цей варіант:
 *   1. middleware кладе результат у `req.validated.body/params/query`
 *   2. контролер декларує тип через дженерик `ValidatedRequest<B, P, Q>`
 *   3. дженеріки виводяться через `z.infer<typeof schema>` — типи і
 *      схеми мають одне джерело істини
 *
 * Жодних `as`. Жодних `getValidated<T>()` ручних кастів. Тип у контролері
 * приходить безпосередньо зі схеми.
 *
 * ============================================
 * Usage
 * ============================================
 *   const schema = z.object({ q: z.string(), limit: z.coerce.number() });
 *
 *   router.get("/messages",
 *     validate({ query: schema }),
 *     asyncHandler(async (
 *       req: ValidatedRequest<unknown, unknown, z.infer<typeof schema>>,
 *       res
 *     ) => {
 *       const { q, limit } = req.validated.query;  // повністю типобезпечно
 *     })
 *   );
 *
 * Якщо хочеш скоротити boilerplate, можна оголосити:
 *   type Q = z.infer<typeof schema>;
 *   ...as ValidatedRequest<unknown, unknown, Q>
 */

/**
 * Поле `validated` додаємо до Request через module augmentation —
 * ОДНА декларація, ніяких `(req as any).validated`.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      validated: {
        body?: unknown;
        params?: unknown;
        query?: unknown;
      };
    }
  }
}

/**
 * Generic Request з типизованими validated.body/params/query.
 *
 * Чому extends Request з 4 generics-параметрами — Express дозволяє так
 * параметризувати Request<Params, ResBody, ReqBody, Query>; ми робимо
 * сильніше — параметризуємо `validated` напряму, бо саме його читає
 * контролер.
 */
export interface ValidatedRequest<
  ValidatedBody = unknown,
  ValidatedParams = unknown,
  ValidatedQuery = unknown,
> extends Request {
  validated: {
    body: ValidatedBody;
    params: ValidatedParams;
    query: ValidatedQuery;
  };
}

interface ValidationSchemas<B, P, Q> {
  body?: ZodType<B>;
  params?: ZodType<P>;
  query?: ZodType<Q>;
}

/**
 * Валідує body/params/query через Zod-схеми і кладе результат у req.validated.
 *
 * Якщо валідація провалюється — кидає UnprocessableEntityError з details
 * (структурований issues-array від Zod). Клієнт отримує 422 + поле details.
 */
export function validate<B = unknown, P = unknown, Q = unknown>(
  schemas: ValidationSchemas<B, P, Q>,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Ініціалізуємо req.validated один раз (на випадок якщо validate викликається
    // в ланцюжку кілька разів — наприклад, для body окремо і params окремо).
    if (!req.validated) {
      req.validated = {};
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        return next(
          new UnprocessableEntityError(
            "Validation failed",
            "VALIDATION_FAILED_BODY",
            result.error.issues,
          ),
        );
      }
      req.validated.body = result.data;
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        return next(
          new UnprocessableEntityError(
            "Validation failed",
            "VALIDATION_FAILED_PARAMS",
            result.error.issues,
          ),
        );
      }
      req.validated.params = result.data;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        return next(
          new UnprocessableEntityError(
            "Validation failed",
            "VALIDATION_FAILED_QUERY",
            result.error.issues,
          ),
        );
      }
      req.validated.query = result.data;
    }

    next();
  };
}
