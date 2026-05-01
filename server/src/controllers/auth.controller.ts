import type { Request, Response } from "express";
import type {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from "@chat/shared";

import * as authService from "../services/auth.service.js";
import type { ClientContext } from "../services/auth.service.js";
import type { ValidatedRequest } from "../middlewares/validate.js";
import { env } from "../config/env.js";
import { UnauthorizedError, BadRequestError } from "../utils/HttpError.js";

/**
 * ============================================
 * Auth controller — тонкі HTTP-handlers
 * ============================================
 *
 * Принцип: жодної бізнес-логіки. Кожен handler це:
 *   1. Дістань validated input (req.validated.body / req.userId)
 *   2. Виклич service
 *   3. Запиши tokens у cookies (де треба)
 *   4. Поверни JSON
 *
 * Жодних try/catch — Express 5 + errorHandler ловить async-помилки.
 */

// ============================================
// Cookie helpers
// ============================================

const ACCESS_COOKIE_NAME = "accessToken";
const REFRESH_COOKIE_NAME = "refreshToken";

// 15 хв і 30 днів — узгоджено з env JWT_ACCESS_EXPIRES_IN і REFRESH_TTL_MS.
// Cookie maxAge у мілісекундах.
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Опції для обох auth cookies. Узгоджено в плані ітерації:
 * - httpOnly: завжди (захист від XSS)
 * - secure: тільки prod (бо у dev HTTP)
 * - sameSite: lax у обох (баланс безпеки і UX)
 * - path: "/" (cookies доступні усім роутам, включно з фронт-сторінками)
 */
function getCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: maxAgeMs,
    path: "/",
    ...(env.COOKIE_DOMAIN && { domain: env.COOKIE_DOMAIN }),
  };
}

function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
  res.cookie(
    ACCESS_COOKIE_NAME,
    tokens.accessToken,
    getCookieOptions(ACCESS_COOKIE_MAX_AGE_MS),
  );
  res.cookie(
    REFRESH_COOKIE_NAME,
    tokens.refreshToken,
    getCookieOptions(REFRESH_COOKIE_MAX_AGE_MS),
  );
}

function clearAuthCookies(res: Response) {
  // path і domain мають збігатись з тими що при set, інакше браузер
  // не визнає cookie тією самою і не очистить.
  const opts = getCookieOptions(0);
  res.clearCookie(ACCESS_COOKIE_NAME, opts);
  res.clearCookie(REFRESH_COOKIE_NAME, opts);
}

/**
 * Дістає клієнт-метадані з запиту — для прив'язки до refresh token.
 * (Корисно для майбутньої "Active Sessions" сторінки в Settings.)
 */
function getClientContext(req: Request): ClientContext {
  return {
    userAgent: req.get("user-agent") ?? undefined,
    // req.ip враховує "trust proxy" з app.ts — повертає реальний IP, не проксі.
    ipAddress: req.ip ?? undefined,
  };
}

// ============================================
// Handlers
// ============================================

/**
 * POST /api/v1/auth/register
 * Створює юзера, шле verification email. НЕ логінить (узгоджено B-flow).
 */
export async function register(req: Request, res: Response): Promise<void> {
  const body = (req as ValidatedRequest<RegisterDto>).validated.body;
  const result = await authService.register(body);

  req.log.info({ userId: result.user.id, email: body.email }, "User registered");

  res.status(201).json({
    user: result.user,
    message: "Registration successful. Please check your email to verify your account.",
  });
}

/**
 * POST /api/v1/auth/login
 * Перевіряє пароль + emailVerified, видає cookies.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const body = (req as ValidatedRequest<LoginDto>).validated.body;
  const { user, tokens } = await authService.login(body, getClientContext(req));

  setAuthCookies(res, tokens);

  req.log.info({ userId: user.id }, "User logged in");

  res.json({ user });
}

/**
 * POST /api/v1/auth/refresh
 * Ротує токени. Read refresh з cookie, ставить нову пару у cookies.
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  const rawRefresh = req.cookies?.refreshToken;

  if (typeof rawRefresh !== "string" || rawRefresh.length === 0) {
    throw new UnauthorizedError("No refresh token", "NO_REFRESH_TOKEN");
  }

  try {
    const { accessToken, refreshToken, userId } = await authService.refreshTokens(
      rawRefresh,
      getClientContext(req),
    );

    setAuthCookies(res, { accessToken, refreshToken });

    req.log.debug({ userId }, "Tokens refreshed");

    res.json({ ok: true });
  } catch (err) {
    // Будь-яка помилка refresh → знести cookies, щоб браузер не зациклився
    // у спробах refresh з невалідним токеном. Клієнт це обробить як "logout".
    clearAuthCookies(res);
    throw err;
  }
}

/**
 * POST /api/v1/auth/logout
 * Revoke family поточного refresh token + clear cookies.
 * Не вимагає auth — у юзера може бути протухший access, він все одно хоче вийти.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const rawRefresh = req.cookies?.refreshToken;

  if (typeof rawRefresh === "string" && rawRefresh.length > 0) {
    await authService.logout(rawRefresh);
  }

  clearAuthCookies(res);
  res.json({ ok: true });
}

/**
 * POST /api/v1/auth/logout-all
 * Revoke ВСІ сесії юзера (всі families). Потребує auth (нам потрібен userId).
 */
export async function logoutAll(req: Request, res: Response): Promise<void> {
  await authService.logoutAll(req.userId);
  clearAuthCookies(res);

  req.log.info({ userId: req.userId }, "User logged out from all devices");

  res.json({ ok: true });
}

/**
 * POST /api/v1/auth/verify-email
 * Body: { token }
 */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = (req as ValidatedRequest<VerifyEmailDto>).validated.body;
  await authService.verifyEmail(token);

  res.json({ ok: true, message: "Email verified successfully. You can now log in." });
}

/**
 * POST /api/v1/auth/resend-verification
 * Body: { email }
 * Завжди 200 — не leak-имо існування юзера.
 */
export async function resendVerification(req: Request, res: Response): Promise<void> {
  const { email } = (req as ValidatedRequest<RequestPasswordResetDto>).validated.body;
  await authService.resendVerification(email);

  res.json({
    ok: true,
    message: "If an unverified account exists, a new verification email has been sent.",
  });
}

/**
 * POST /api/v1/auth/request-password-reset
 * Body: { email }
 * Завжди 200 — не leak-имо існування.
 */
export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const { email } = (req as ValidatedRequest<RequestPasswordResetDto>).validated.body;
  await authService.requestPasswordReset(email);

  res.json({
    ok: true,
    message: "If an account with this email exists, a password reset link has been sent.",
  });
}

/**
 * POST /api/v1/auth/reset-password
 * Body: { token, password }
 * Після успіху — revoke всі сесії юзера (це робить service).
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = (req as ValidatedRequest<ResetPasswordDto>).validated.body;
  await authService.resetPassword(token, password);

  // Очищаємо cookies на цьому запиті — якщо юзер скинув пароль зі старого
  // браузера, його поточна сесія в цьому браузері вже інвалідована.
  clearAuthCookies(res);

  res.json({ ok: true, message: "Password reset successfully. Please log in with your new password." });
}

/**
 * GET /api/v1/auth/me
 * Повертає поточного юзера (з emailVerified, createdAt тощо).
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  const me = await authService.getMe(req.userId);
  res.json({ user: me });
}

// Захист від unused import (BadRequestError використається у наступних ітераціях)
void BadRequestError;
