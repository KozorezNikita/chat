import { prisma } from "../db/prisma.js";
import type { EmailTokenType } from "../generated/prisma/client.js";

/**
 * ============================================
 * EmailTokenRepository
 * ============================================
 *
 * Один enum EmailTokenType (EMAIL_VERIFICATION / PASSWORD_RESET) розрізняє
 * призначення. Логіка lookup-у і revoke однакова — тому одна модель і один repo.
 *
 * Pattern для одноразових токенів:
 * 1. createEmailToken — пишемо hash, повертаємо raw для листа
 * 2. consumeEmailToken — атомарно знаходимо + позначаємо used (одним UPDATE)
 *
 * Чому атомарно: race-condition. Юзер двічі клікнув на лист → два запити
 * прилетіли паралельно → обидва побачили usedAt=null → обидва обробились.
 * Атомарний update з фільтром по usedAt:null гарантує що другий клік
 * нічого не зробить.
 */

interface CreateEmailTokenInput {
  tokenHash: string;
  type: EmailTokenType;
  userId: string;
  expiresAt: Date;
}

export async function createEmailToken(input: CreateEmailTokenInput) {
  return prisma.emailToken.create({
    data: input,
  });
}

/**
 * Атомарно "споживає" токен — позначає usedAt.
 *
 * Повертає null якщо токен:
 * - не існує
 * - вже use-нутий (usedAt не null)
 * - expired (expiresAt < now)
 *
 * Сервіс реагує на null як "Invalid or expired token" 400.
 *
 * Фільтр у where + Prisma updateMany з count перевіркою:
 * якщо count=0 — токен невалідний; якщо 1 — успіх.
 *
 * Чому НЕ через update + try/catch на P2025: бо у нас фільтр не лише
 * по unique-полю (tokenHash), а ще й по usedAt/expiresAt — для такого
 * Prisma вимагає updateMany.
 */
export async function consumeEmailToken(
  tokenHash: string,
  expectedType: EmailTokenType,
): Promise<{ userId: string } | null> {
  const result = await prisma.emailToken.updateMany({
    where: {
      tokenHash,
      type: expectedType,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });

  if (result.count === 0) {
    return null;
  }

  // Тепер коли точно знаємо що оновили — дістаємо userId.
  // Це 2-й запит, але він тільки на success-path (рідкісний), і це
  // безпечніше ніж тримати окрему транзакцію.
  const token = await prisma.emailToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });

  return token;
}

/**
 * Видалити всі попередні токени певного типу для юзера.
 * Викликаємо при створенні нового — щоб у юзера був тільки один
 * валідний reset-link / verify-link одночасно.
 *
 * Inactivates конкуруючі токени — якщо юзер двічі натиснув
 * "Resend verification email", старий лист стає неактуальним.
 */
export async function deleteUserEmailTokens(userId: string, type: EmailTokenType) {
  return prisma.emailToken.deleteMany({
    where: { userId, type },
  });
}

/**
 * Cleanup для cron — видаляємо expired/used токени старше 7 днів.
 * Не життєво важливо, але БД росте без цього.
 */
export async function deleteOldEmailTokens(olderThan: Date) {
  return prisma.emailToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: olderThan } },
        { usedAt: { lt: olderThan } },
      ],
    },
  });
}
