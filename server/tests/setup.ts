import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { beforeAll, afterAll, beforeEach, vi } from "vitest";

// 1. Завантажуємо .env.test ПЕРЕД будь-яким імпортом коду додатку
//    (бо config/env.ts валідує env при імпорті — потім вже пізно).
config({ path: resolve(__dirname, "../.env.test"), override: true });

// 2. Mock nodemailer — щоб тести не намагались підключитись до SMTP.
//    Замість справжнього transporter — фейк зі spy-ом.
vi.mock("nodemailer", () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "test-message-id" });
  return {
    default: {
      createTransport: vi.fn(() => ({ sendMail })),
    },
    createTransport: vi.fn(() => ({ sendMail })),
  };
});

// 3. Запускаємо міграції на тестовій БД ОДИН раз перед усіма тестами.
//    `migrate deploy` ідемпотентний — застосовує те що ще не застосоване.
beforeAll(async () => {
  try {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: "ignore", // не засмічуємо вивід Vitest
    });
  } catch (err) {
    console.error("❌ Failed to apply migrations to test DB.");
    console.error("Did you start docker compose -f docker-compose.test.yml up -d?");
    throw err;
  }
});

// 4. Чистимо БД ПЕРЕД кожним тестом.
//    TRUNCATE...CASCADE прибирає всі рядки + reset auto-increment.
//    Швидше за migrate reset (~10мс vs ~2сек).
beforeEach(async () => {
  // Динамічний імпорт — після того як env вже завантажений
  const { prisma } = await import("../src/db/prisma.js");

  // Список таблиць у порядку залежностей не важливий через CASCADE,
  // але явний список безпечніший — додаємо нові таблиці одним рядком.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Reaction",
      "Message",
      "ChatMember",
      "Chat",
      "EmailToken",
      "RefreshToken",
      "User"
    RESTART IDENTITY CASCADE;
  `);
});

// 5. Disconnect від БД після всіх тестів — щоб Vitest чисто завершився.
afterAll(async () => {
  const { prisma } = await import("../src/db/prisma.js");
  await prisma.$disconnect();
});
