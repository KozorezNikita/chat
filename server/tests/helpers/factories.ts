import request from "supertest";
import type { Express } from "express";

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

// ============================================
// Chat factories
// ============================================

interface CreateDirectChatOptions {
  userIdA: string;
  userIdB: string;
}

/**
 * Створює DIRECT-чат між двома юзерами.
 * directKey будуємо тут же (sorted lex order, як у сервісі).
 */
export async function createDirectChat(opts: CreateDirectChatOptions) {
  const directKey = [opts.userIdA, opts.userIdB].sort().join(":");

  return prisma.chat.create({
    data: {
      type: "DIRECT",
      directKey,
      createdById: opts.userIdA,
      members: {
        create: [
          { userId: opts.userIdA, role: "MEMBER" },
          { userId: opts.userIdB, role: "MEMBER" },
        ],
      },
    },
    include: {
      members: { include: { user: true } },
    },
  });
}

interface CreateGroupChatOptions {
  ownerId: string;
  memberIds: string[];
  name?: string;
}

/**
 * Створює GROUP-чат з owner + memberIds.
 */
export async function createGroupChat(opts: CreateGroupChatOptions) {
  return prisma.chat.create({
    data: {
      type: "GROUP",
      name: opts.name ?? "Test group",
      createdById: opts.ownerId,
      members: {
        create: [
          { userId: opts.ownerId, role: "OWNER" },
          ...opts.memberIds.map((userId) => ({
            userId,
            role: "MEMBER" as const,
          })),
        ],
      },
    },
    include: {
      members: { include: { user: true } },
    },
  });
}

// ============================================
// Message factories
// ============================================

interface SendMessageOptions {
  chatId: string;
  authorId: string;
  content?: string;
}

/**
 * Створює Message прямо в БД (без HTTP). Корисно для arrange-фази
 * тестів edit/delete/list — швидше за прокручування sendMessage REST.
 */
export async function createMessage(opts: SendMessageOptions) {
  return prisma.message.create({
    data: {
      chatId: opts.chatId,
      authorId: opts.authorId,
      content: opts.content ?? "Test message",
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });
}

// ============================================
// Auth helpers
// ============================================

/**
 * Login + повернути set-cookie заголовки. Юзер має бути verified.
 */
export async function loginAndGetCookies(
  app: Express,
  email: string,
  password: string,
): Promise<string[]> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(
      `Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  return res.headers["set-cookie"] as unknown as string[];
}

/**
 * Скорочення: створити verified юзера + одразу залогінити.
 * Повертає юзера + cookies.
 */
export async function createUserAndLogin(
  app: Express,
  options: CreateUserOptions = {},
) {
  const { user, password } = await createVerifiedUser(options);
  const cookies = await loginAndGetCookies(app, user.email, password);
  return { user, cookies, password };
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
