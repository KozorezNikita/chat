import { prisma } from "../db/prisma.js";

/**
 * ============================================
 * UserRepository — auth-related операції з User
 * ============================================
 *
 * Правила repo-шару (узгоджено в Ітерації 0):
 * 1. Сервіси не імпортують prisma напряму — лише через repos
 * 2. Один SQL там де достатньо одного
 * 3. Доменні назви методів — не findFirst/updateMany, а findActiveX/markY
 *
 * Цей repo зараз містить лише auth-методи (register/login потребують).
 * Профільні методи (updateProfile, search) додамо в окремих ітераціях.
 */

interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

/**
 * Створює юзера з emailVerified=false.
 * Унікальний conflict на email обробляє сервіс через try/catch на P2002 →
 * тут просто кидаємо Prisma-помилку нагору.
 */
export async function createUser(input: CreateUserInput) {
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: input.passwordHash,
      emailVerified: false,
    },
  });
}

/**
 * Login flow: знайти юзера за email + повернути password hash для verify.
 * Email кладемо у lower-case ще на рівні Zod-схеми (.toLowerCase()),
 * але і тут .toLowerCase для безпеки якщо хтось викличе repo напряму.
 */
export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

/**
 * Для auth-middleware (перевірка що юзер з access-token досі існує
 * і не заблокований). Повертаємо мінімум — без password hash.
 */
export async function findActiveUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      emailVerified: true,
      avatarUrl: true,
    },
  });
}

/**
 * Підтвердження email — атомарна операція в одному UPDATE.
 * Якщо юзер вже verified — це no-op (поле просто перезаписується тим самим).
 */
export async function markEmailVerified(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  });
}

/**
 * Зміна password — окрема операція бо інвалідує всі сесії
 * (це робить сервіс, репо лише пише hash).
 */
export async function updatePasswordHash(userId: string, passwordHash: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { password: passwordHash },
  });
}

/**
 * Пошук багатьох юзерів за списком id — для перевірки що всі member-и
 * group chat існують при створенні.
 *
 * Повертає тільки існуючих юзерів. Сервіс порівнює довжину з input,
 * якщо коротша — кидає 400.
 */
export async function findUsersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      username: true,
      avatarUrl: true,
    },
  });
}

/**
 * Пошук юзерів для створення direct-чату.
 *
 * Стратегія (узгоджено в плані 2.1):
 *  - Точний match по email → 1 результат
 *  - Точний match по @username → 1 результат
 *  - Жодних ILIKE по name (privacy: щоб не можна було перебирати юзерів
 *    за частковим іменем)
 *
 * Виключаємо self з результатів (excludeUserId).
 *
 * Якщо query схожий на email (містить @ і має домен) — шукаємо за email,
 * інакше за username.
 */
const EMAIL_LIKE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function searchUsers(query: string, excludeUserId: string, limit: number) {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return [];

  const isEmail = EMAIL_LIKE_REGEX.test(trimmed);
  const usernameQuery = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  const where = isEmail
    ? { email: trimmed }
    : { username: usernameQuery };

  return prisma.user.findMany({
    where: {
      AND: [
        where,
        { id: { not: excludeUserId } },
      ],
    },
    select: {
      id: true,
      name: true,
      username: true,
      avatarUrl: true,
    },
    take: limit,
  });
}
