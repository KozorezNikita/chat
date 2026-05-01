import { prisma } from "../db/prisma.js";

/**
 * ============================================
 * RefreshTokenRepository
 * ============================================
 *
 * Refresh token rotation з replay detection:
 * - Login → нова family + перший refresh
 * - Refresh → revoke поточний, видати новий у тій самій family
 * - Replay revoked refresh → revoke ВСЯ family (security incident)
 * - Logout → revoke всі неревокнуті у family
 * - Logout-all → revoke всі families юзера
 *
 * У БД зберігаємо лише SHA-256 hash сирого токена (поле tokenHash).
 * Сирий токен ніколи не торкається БД.
 */

interface CreateRefreshTokenInput {
  tokenHash: string;
  userId: string;
  family: string;
  expiresAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export async function createRefreshToken(input: CreateRefreshTokenInput) {
  return prisma.refreshToken.create({
    data: {
      tokenHash: input.tokenHash,
      userId: input.userId,
      family: input.family,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

/**
 * Lookup для refresh-операції.
 * Повертає всю запис включно з userId, family, revokedAt — сервіс
 * перевіряє що revokedAt === null і що не expired.
 *
 * НЕ фільтруємо тут по revokedAt/expiresAt бо нам потрібно ВІДРІЗНИТИ
 * "немає такого токена взагалі" від "є але вже revoked" (другий випадок —
 * це replay, треба revoke family).
 */
export async function findRefreshTokenByHash(tokenHash: string) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
  });
}

/**
 * Revoke одного токена. Викликаємо в межах rotate-операції.
 *
 * Чому через update а не updateMany: ми вже маємо унікальний tokenHash,
 * лук-ап буде через unique-індекс — швидше і атомарно.
 */
export async function revokeRefreshTokenByHash(tokenHash: string) {
  return prisma.refreshToken.update({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke ВСЯ family — викликається у двох випадках:
 * 1. Logout (поточний refresh known через cookie → знаємо family)
 * 2. Replay detected (хтось використав revoked токен → компрометація)
 *
 * updateMany бо родина це багато токенів (поточний + усі попередні);
 * unique індекс лише на tokenHash, тут треба filter по family.
 *
 * Фільтруємо `revokedAt: null` щоб не оновлювати вже revoked записи —
 * це безсенсово і збільшує updatedAt.
 */
export async function revokeFamily(family: string) {
  return prisma.refreshToken.updateMany({
    where: {
      family,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke ВСІ families юзера — для "Logout from all devices".
 * Знову ж — лише неревокнуті, щоб не множити записи.
 */
export async function revokeAllUserTokens(userId: string) {
  return prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

/**
 * Видалення expired refresh tokens — для cleanup-job-а.
 * (Не використовується в auth-flow, але корисно тримати тут поряд
 * з рештою операцій. Можна викликати з cron або prisma-script.)
 */
export async function deleteExpiredRefreshTokens() {
  return prisma.refreshToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
}
