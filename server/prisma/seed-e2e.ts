/**
 * ============================================
 * E2E test seed — створює фіксованих тестових юзерів
 * ============================================
 *
 * Запускається ОДИН РАЗ:
 *   npm run seed:e2e
 *
 * Створює (або no-op якщо існують):
 *   alice@e2e.test / Password123!
 *   bob@e2e.test   / Password123!
 *   + DM-чат між ними (alice ↔ bob)
 *
 * Обидва юзери emailVerifiedAt = now → можуть одразу логінитись без email link.
 *
 * Playwright тести у client/tests/e2e використовують ці креди.
 *
 * Безпечно перезапускати — idempotent через upsert + findFirst для chat.
 */

import argon2 from "argon2";

import { prisma } from "../src/db/prisma.js";

const TEST_PASSWORD = "Password123!";

async function main() {
  console.log("🌱 Seeding E2E test users...");

  const hash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });

  const alice = await prisma.user.upsert({
    where: { email: "alice@e2e.test" },
    update: { emailVerified: true },
    create: {
      email: "alice@e2e.test",
      name: "Alice E2E",
      password: hash,
      emailVerified: true,
    },
  });
  console.log(`  ✓ alice@e2e.test (id=${alice.id})`);

  const bob = await prisma.user.upsert({
    where: { email: "bob@e2e.test" },
    update: { emailVerified: true },
    create: {
      email: "bob@e2e.test",
      name: "Bob E2E",
      password: hash,
      emailVerified: true,
    },
  });
  console.log(`  ✓ bob@e2e.test (id=${bob.id})`);

  // directKey — UNIQUE constraint для DIRECT chats. Формат: "userIdA:userIdB"
  // де ID відсортовані лексикографічно. Це робить race-safe upsert.
  const directKey = [alice.id, bob.id].sort().join(":");

  const existingChat = await prisma.chat.findUnique({
    where: { directKey },
  });

  if (!existingChat) {
    const chat = await prisma.chat.create({
      data: {
        type: "DIRECT",
        directKey,
        createdBy: { connect: { id: alice.id } },
        members: {
          create: [
            { userId: alice.id, role: "MEMBER" },
            { userId: bob.id, role: "MEMBER" },
          ],
        },
      },
    });
    console.log(`  ✓ Direct chat created (id=${chat.id})`);
  } else {
    console.log(`  ✓ Direct chat already exists (id=${existingChat.id})`);
  }

  console.log("✅ Done");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
