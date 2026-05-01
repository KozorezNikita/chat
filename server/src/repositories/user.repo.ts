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
