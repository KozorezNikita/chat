import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Обгортка для async-handler'ів — щоб помилки зловлювались Express-ом.
 *
 * Express 5 вміє обробляти async-помилки сам (на відміну від 4),
 * тому формально цей wrapper не обов'язковий. Але він залишається
 * корисним як explicit-marker що handler async, плюс гарантує що
 * нічого не зламається якщо хтось (помилково) кине Promise з
 * non-async помилкою (наприклад, повернувши Promise.reject).
 *
 * Usage:
 *   router.get("/users/:id", asyncHandler(async (req, res) => {
 *     const user = await getUser(req.params.id);
 *     res.json(user);
 *   }));
 */
export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response,
>(
  fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res as Res, next)).catch(next);
  };
}
