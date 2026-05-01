import { randomBytes, createHash } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import argon2 from "argon2";

import { env } from "../config/env.js";

/**
 * ============================================
 * Token utilities — pure functions без БД
 * ============================================
 *
 * Архітектурне рішення цього проекту (відмінність від Task Manager):
 *
 * 1. Access token — JWT (підпис HS256 через jose)
 *    - короткий (15 хв), stateless verify, не ходить у БД
 *    - payload: тільки sub=userId, нічого більше
 *
 * 2. Refresh token — випадкові 32 байти у base64url
 *    - НЕ JWT, бо authorization робиться через DB lookup (lookup tokenHash)
 *    - підпис не потрібен, метадані не leak-имо
 *    - у БД зберігаємо лише SHA-256 хеш
 *
 * 3. Email tokens (verify, password reset) — теж випадкові 32 байти
 *    - SHA-256 хеш у БД, raw → у листі
 *
 * 4. Password hashing — argon2id (OWASP-рекомендований)
 *    - заміна bcrypt з Task Manager
 *    - дефолти argon2 пакета вже відповідають OWASP
 */

// ============================================
// JWT (access token)
// ============================================

/**
 * jose API працює з Uint8Array, не з рядками — конвертуємо один раз.
 */
const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

/**
 * Кастимий payload що ми кладемо в access token.
 * Тільки sub — нічого більше. Вся персональна інфа дістається з БД.
 */
export interface AccessTokenPayload extends JWTPayload {
  sub: string; // userId
}

export async function signAccessToken(userId: string): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .sign(accessSecret);
}

/**
 * Верифікує access token. Кидає JOSEError-сімейство при будь-якій проблемі
 * (expired, invalid signature, malformed). Auth middleware ловить
 * і повертає 401.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret, {
    algorithms: ["HS256"],
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Invalid token payload: missing sub");
  }

  return payload as AccessTokenPayload;
}

// ============================================
// Refresh token (NOT a JWT)
// ============================================

/**
 * Криптографічно випадковий refresh token.
 * 32 байти ентропії = 256 біт = тотально безпечно проти бротфорсу.
 * base64url щоб був URL/cookie-safe без додаткового escape-у.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 хеш для збереження в БД.
 * Чому SHA-256, а не argon2/bcrypt:
 * - токен уже має 256 біт ентропії, бротфорс безсенсу
 * - швидко (мікросекунди), а refresh-операція має бути швидка
 * - детермінований, тому ми можемо шукати по where: { tokenHash } у Prisma
 *   (з argon2 такий lookup неможливий — кожен hash() з іншою сіллю)
 */
export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ============================================
// Email tokens (verification, password reset)
// ============================================

/**
 * Той самий патерн що з refresh — random + SHA-256 хеш.
 * Сам токен йде у URL у листі: https://app/verify?token=<raw>.
 * У БД зберігаємо лише hash → юзер з access до БД не може видати себе за іншого.
 */
export function generateEmailToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEmailToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ============================================
// Password hashing (argon2id)
// ============================================

/**
 * argon2id — OWASP-рекомендована для нових застосунків.
 * Дефолтні параметри пакета `argon2` вже сильні (memoryCost 64MB,
 * timeCost 3, parallelism 4) — у проді явно не переписуємо.
 *
 * Для NODE_ENV=test використовуємо мінімальні параметри
 * (~1мс vs ~100мс на hash). Це не зменшує безпеку проекту —
 * у проді ті самі дефолти. Це лише прискорює test runner
 * (50 тестів × 100мс = 5сек повільніше).
 */
const isTestEnv = process.env.NODE_ENV === "test";

const TEST_ARGON2_OPTIONS = {
  memoryCost: 1024,   // 1 MB замість 64 MB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return await argon2.hash(plain, isTestEnv ? TEST_ARGON2_OPTIONS : undefined);
}

/**
 * verify — поверне false на невалідний пароль АБО на пошкоджений hash.
 * Не ловимо помилки розбору hash окремо — якщо БД зіпсована, юзер
 * однаково не зможе залогінитись, і це 401 (а не 500).
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
