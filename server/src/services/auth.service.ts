import type { RegisterDto, LoginDto, MeUser, PublicUser } from "@chat/shared";

import { prisma } from "../db/prisma.js";
import * as userRepo from "../repositories/user.repo.js";
import * as refreshRepo from "../repositories/refreshToken.repo.js";
import * as emailRepo from "../repositories/emailToken.repo.js";

import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateEmailToken,
  hashEmailToken,
} from "../utils/tokens.js";
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
} from "../utils/HttpError.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

import { sendVerificationEmail, sendPasswordResetEmail } from "./email.service.js";
import { mapUserToPublic, mapUserToMe } from "./_mappers.js";

import { randomUUID } from "node:crypto";

/**
 * ============================================
 * Auth service — вся бізнес-логіка автентифікації
 * ============================================
 *
 * Public API:
 * - register
 * - login
 * - refreshTokens
 * - verifyEmail
 * - requestPasswordReset
 * - resetPassword
 * - logout (поточна сесія)
 * - logoutAll (всі сесії юзера)
 * - getMe (для /api/v1/auth/me)
 * - resendVerification (для випадку коли юзер втратив лист)
 *
 * Контракт:
 * - повертаємо raw refresh token + access JWT — controller сам кладе у cookies
 * - кидаємо HttpError, errorHandler middleware обробляє
 */

// 30 днів у мілісекундах — час життя refresh у БД
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Email tokens
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;     // 24 години
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;         // 1 година

// Контекст клієнта — userAgent + ip для прив'язки до refresh token
// (для майбутнього UI "your active sessions")
export interface ClientContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ============================================
// REGISTER
// ============================================

/**
 * Створює юзера з emailVerified=false і шле verification email.
 * НЕ логінить (видає cookies) — узгоджено з flow B: юзер має спершу
 * підтвердити email, тільки потім login.
 */
export async function register(input: RegisterDto): Promise<{ user: PublicUser }> {
  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await userRepo.createUser({
      name: input.name,
      email: input.email,
      passwordHash,
    });
  } catch (err) {
    // Prisma P2002 — unique constraint violation. Race-condition або
    // повторний register з одним email.
    if (isPrismaError(err, "P2002")) {
      throw new ConflictError(
        "User with this email already exists",
        "EMAIL_ALREADY_TAKEN",
      );
    }
    throw err;
  }

  // Шлемо verification email одразу. await щоб лист пішов до return-у —
  // тоді якщо щось не так зі SMTP, юзер бачить помилку, а не німу 201.
  // (sendMail сам не throw-ає, але логує. Якщо колись буде throw — flow
  // не зміниться, бо ми вже зберегли юзера і він зможе resend.)
  await issueVerificationEmail(user.id, user.email, user.name);

  return { user: mapUserToPublic(user) };
}

// ============================================
// LOGIN
// ============================================

/**
 * Перевіряє пароль. Якщо емейл не підтверджений — 403 (узгоджено: STRICT).
 * Видає нову family + новий access+refresh.
 */
export async function login(
  input: LoginDto,
  client: ClientContext,
): Promise<{ user: MeUser; tokens: AuthTokens }> {
  const user = await userRepo.findUserByEmail(input.email);

  // Уніфікована відповідь для "немає юзера" і "неправильний пароль" —
  // не leak-имо чи email зареєстрований.
  if (!user) {
    throw new UnauthorizedError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const passwordValid = await verifyPassword(user.password, input.password);
  if (!passwordValid) {
    throw new UnauthorizedError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (!user.emailVerified) {
    throw new ForbiddenError(
      "Email not verified. Please check your inbox.",
      "EMAIL_NOT_VERIFIED",
    );
  }

  // Нова family для нового login (важливо: НЕ переюзаємо існуючу family
  // якщо юзер залогінився з іншого пристрою — інакше logout одного
  // пристрою revoke-не сесії інших).
  const family = randomUUID();
  const tokens = await issueTokenPair(user.id, family, client);

  return { user: mapUserToMe(user), tokens };
}

// ============================================
// REFRESH (rotation + replay detection)
// ============================================

/**
 * Перевіряє refresh token, ротує його, повертає нову пару + userId.
 *
 * Replay detection:
 * - Знайдено запис АЛЕ revokedAt не null → хтось використовує revoked токен
 * - Це означає що або (а) токен скомпрометовано, (б) клієнт глючить
 * - У будь-якому випадку — revoke ВСЯ family (всі сесії з цього login-у)
 */
export async function refreshTokens(
  rawRefreshToken: string,
  client: ClientContext,
): Promise<AuthTokens & { userId: string }> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await refreshRepo.findRefreshTokenByHash(tokenHash);

  if (!stored) {
    throw new UnauthorizedError("Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  // Replay detection — критичний security event, логуємо окремо.
  if (stored.revokedAt !== null) {
    logger.warn(
      { userId: stored.userId, family: stored.family, ip: client.ipAddress },
      "Refresh token replay detected — revoking entire family",
    );
    await refreshRepo.revokeFamily(stored.family);
    throw new UnauthorizedError("Token reuse detected", "REFRESH_REPLAY");
  }

  // Expired refresh — теж revoke family на всякий випадок (щоб не дати
  // використати інші активні токени тієї ж сесії).
  if (stored.expiresAt < new Date()) {
    await refreshRepo.revokeFamily(stored.family);
    throw new UnauthorizedError("Refresh token expired", "REFRESH_EXPIRED");
  }

  // Атомарна ротація: revoke поточний + створення нового в одній транзакції.
  // Якщо другий крок впаде, перший теж rollback-неться → юзер може
  // повторити refresh з тим самим токеном.
  const newRawRefresh = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRawRefresh);

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    await tx.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        userId: stored.userId,
        family: stored.family,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: client.userAgent ?? null,
        ipAddress: client.ipAddress ?? null,
      },
    });
  });

  const accessToken = await signAccessToken(stored.userId);

  return {
    accessToken,
    refreshToken: newRawRefresh,
    userId: stored.userId,
  };
}

// ============================================
// LOGOUT
// ============================================

/**
 * Logout поточної сесії: revoke всю family поточного refresh token-а.
 *
 * Чому family а не просто поточний токен:
 * - якщо ми revoke лише поточний, а юзер встиг отримати новий через refresh
 *   до logout-у, той новий лишиться активним
 * - revoke family прибирає всі активні refresh-и поточного login-у
 */
export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await refreshRepo.findRefreshTokenByHash(tokenHash);

  // Якщо токен невалідний — це не помилка для logout-у. Юзер хоче вийти,
  // ми не сперечаємось. (Інакше логаут невалідної сесії повертав би 401
  // що дуже дивно UX-wise.)
  if (!stored) return;

  await refreshRepo.revokeFamily(stored.family);
}

/**
 * Logout з усіх пристроїв.
 */
export async function logoutAll(userId: string): Promise<void> {
  await refreshRepo.revokeAllUserTokens(userId);
}

// ============================================
// VERIFY EMAIL
// ============================================

/**
 * Підтверджує email через токен з листа.
 * consumeEmailToken атомарний → race-condition безпечно.
 */
export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = hashEmailToken(rawToken);
  const consumed = await emailRepo.consumeEmailToken(tokenHash, "EMAIL_VERIFICATION");

  if (!consumed) {
    throw new BadRequestError("Invalid or expired token", "INVALID_TOKEN");
  }

  await userRepo.markEmailVerified(consumed.userId);
}

/**
 * Resend verification email — для випадку коли юзер втратив лист.
 * Захищений rate-limiter-ом на controller-рівні, бо інакше можна
 * спамити кому завгодно скільки завгодно листами.
 */
export async function resendVerification(email: string): Promise<void> {
  const user = await userRepo.findUserByEmail(email);

  // НЕ leak-имо існування. Якщо немає — просто мовчки return.
  if (!user) return;
  if (user.emailVerified) return;

  await issueVerificationEmail(user.id, user.email, user.name);
}

// ============================================
// PASSWORD RESET
// ============================================

/**
 * Запит на скидання пароля. ЗАВЖДИ повертаємо успіх (узгоджено: B-варіант,
 * "Якщо email існує — лист надіслано"). Запобігає user enumeration.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await userRepo.findUserByEmail(email);
  if (!user) return;

  // Видаляємо старі токени — щоб тільки один валідний reset-link був активний.
  await emailRepo.deleteUserEmailTokens(user.id, "PASSWORD_RESET");

  const rawToken = generateEmailToken();
  const tokenHash = hashEmailToken(rawToken);

  await emailRepo.createEmailToken({
    tokenHash,
    type: "PASSWORD_RESET",
    userId: user.id,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  await sendPasswordResetEmail(user.email, user.name, rawToken);
}

/**
 * Виконує скидання пароля.
 * Після успіху — revoke всі активні сесії юзера (бо хтось міг отримати
 * доступ і скинути пароль; всі його активні токени мають бути недійсні).
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashEmailToken(rawToken);
  const consumed = await emailRepo.consumeEmailToken(tokenHash, "PASSWORD_RESET");

  if (!consumed) {
    throw new BadRequestError("Invalid or expired token", "INVALID_TOKEN");
  }

  const passwordHash = await hashPassword(newPassword);

  // Атомарно: міняємо пароль + revoke всі сесії.
  // Якщо одне впало — друге теж rollback.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: consumed.userId },
      data: { password: passwordHash },
    });
    await tx.refreshToken.updateMany({
      where: { userId: consumed.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  logger.info({ userId: consumed.userId }, "Password reset completed");
}

// ============================================
// /me
// ============================================

/**
 * Повертає поточного юзера.
 * Викликається з `/api/v1/auth/me` (auth-middleware гарантує що userId є).
 */
export async function getMe(userId: string): Promise<MeUser> {
  const user = await userRepo.findActiveUserById(userId);
  if (!user) {
    // Юзера видалили поки в нього був валідний access token — рідко але
    // буває. Сесію треба зарубати.
    throw new UnauthorizedError("User no longer exists", "USER_NOT_FOUND");
  }
  // findActiveUserById повертає select без createdAt — додаємо що треба.
  const full = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      emailVerified: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
  if (!full) throw new UnauthorizedError("User no longer exists", "USER_NOT_FOUND");
  return mapUserToMe(full);
}

// ============================================
// HELPERS
// ============================================

/**
 * Видає пару access + refresh для існуючого юзера в існуючій family.
 */
async function issueTokenPair(
  userId: string,
  family: string,
  client: ClientContext,
): Promise<AuthTokens> {
  const rawRefresh = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefresh);

  await refreshRepo.createRefreshToken({
    tokenHash,
    userId,
    family,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: client.userAgent ?? undefined,
    ipAddress: client.ipAddress ?? undefined,
  });

  const accessToken = await signAccessToken(userId);

  return { accessToken, refreshToken: rawRefresh };
}

/**
 * Створює email verification token + шле лист.
 * Спільний код для register і resendVerification.
 */
async function issueVerificationEmail(userId: string, email: string, name: string): Promise<void> {
  // Видаляємо попередні verification-токени цього юзера — лист має бути один.
  await emailRepo.deleteUserEmailTokens(userId, "EMAIL_VERIFICATION");

  const rawToken = generateEmailToken();
  const tokenHash = hashEmailToken(rawToken);

  await emailRepo.createEmailToken({
    tokenHash,
    type: "EMAIL_VERIFICATION",
    userId,
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });

  await sendVerificationEmail(email, name, rawToken);
}

/**
 * Перевірка Prisma-помилки за кодом без `instanceof PrismaClientKnownRequestError`
 * (бо у Prisma 7 це import-плутанина між generated/runtime).
 */
function isPrismaError(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === code
  );
}

// Експорт env для тестів які хочуть знати TTL
export const _testInternals = {
  REFRESH_TTL_MS,
  VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
};

// `env` — щоб TS знав що ми його імпортуємо (без використання), помилка noUnusedLocals.
// Прибираємо коли додамо щось залежне від env у самому сервісі.
void env;
