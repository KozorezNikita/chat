import request from "supertest";

import { prisma } from "./db.js";
import { app } from "./app.js";
import { hashPassword } from "../../src/utils/tokens.js";

/**
 * ============================================
 * Factories — швидкі helpers для arrange-фази тестів
 * ============================================
 *
 * Замість inline `prisma.user.create({...})` у кожному тесті,
 * використовуємо `await createVerifiedUser({email: "x@y.z"})`.
 *
 * Sensible defaults:
 * - emailVerified: true (бо більшість тестів про логіку ПІСЛЯ верифікації)
 * - password: "Password123" (відповідає нашій regex з shared/dto/auth.ts)
 *
 * Override через partial overrides — перевизначай тільки те що тест перевіряє.
 */

interface CreateUserOptions {
  email?: string;
  name?: string;
  password?: string;
  emailVerified?: boolean;
  username?: string | null;
}

const DEFAULT_PASSWORD = "Password123";

/**
 * Створює юзера з тільки що захешованим password.
 * Повертає юзера + raw password (зручно для login-тестів).
 */
export async function createUser(options: CreateUserOptions = {}) {
  const password = options.password ?? DEFAULT_PASSWORD;
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name: options.name ?? "Test User",
      email:
        options.email ??
        `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: passwordHash,
      emailVerified: options.emailVerified ?? false,
      username: options.username ?? null,
    },
  });

  return { user, password };
}

/**
 * Та сама фабрика, але emailVerified=true за дефолтом —
 * найчастіший випадок (90% тестів).
 */
export async function createVerifiedUser(options: CreateUserOptions = {}) {
  return createUser({ ...options, emailVerified: true });
}

/**
 * Створює verified юзера + логінить через REST →
 * повертає supertest agent з cookies.
 *
 * Чому через REST а не вручну issueTokenPair:
 * - перевіряємо весь flow, включно з виставленням cookies
 * - не дублюємо token-логіку у тестах
 *
 * supertest.agent зберігає cookies між запитами автоматично.
 */
export async function createAuthenticatedAgent(options: CreateUserOptions = {}) {
  const { user, password } = await createVerifiedUser(options);

  const agent = request.agent(app);
  const res = await agent
    .post("/api/v1/auth/login")
    .send({ email: user.email, password });

  if (res.status !== 200) {
    throw new Error(
      `createAuthenticatedAgent: login failed with ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }

  return { agent, user, password };
}
