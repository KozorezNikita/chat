import { prisma } from "../db/prisma.js";
import type { ChatType, MemberRole } from "../generated/prisma/client.js";

/**
 * ============================================
 * ChatRepository
 * ============================================
 *
 * Операції з чатами + ChatMember + аґрегати для списку чатів
 * (unread count, last message preview).
 */

// Стандартний include для повного Chat — використовується скрізь
// де клієнту повертаємо ChatDto. Тут визначаємо ОДИН раз для consistency.
const FULL_CHAT_INCLUDE = {
  members: {
    where: { leftAt: null },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  },
} as const;

// ============================================
// READ
// ============================================

/**
 * Список усіх активних чатів юзера. Без unread/lastMessage —
 * це окремі агрегати, мерджаться в сервісі.
 */
export async function findUserChats(userId: string) {
  return prisma.chat.findMany({
    where: {
      members: {
        some: {
          userId,
          leftAt: null,
        },
      },
    },
    include: FULL_CHAT_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Один чат по id з усіма учасниками.
 * Не перевіряє membership — це робить middleware requireChatMembership.
 */
export async function findChatById(chatId: string) {
  return prisma.chat.findUnique({
    where: { id: chatId },
    include: FULL_CHAT_INCLUDE,
  });
}

/**
 * ChatMember для (chatId, userId) — використовується middleware-ом
 * для перевірки членства і ролі.
 */
export async function findMembership(chatId: string, userId: string) {
  return prisma.chatMember.findUnique({
    where: {
      chatId_userId: { chatId, userId },
    },
  });
}

// ============================================
// CREATE
// ============================================

/**
 * Знайти або створити DIRECT-чат між двома юзерами.
 *
 * Race-condition-безпечно через unique constraint на directKey:
 * якщо два юзери одночасно почали чат — обидва запити побачать
 * той самий чат (один створить, інший зловить P2002 і дочитає).
 *
 * Чому upsert а не findFirst+create: одна транзакція, без TOCTOU race.
 */
export async function upsertDirectChat(
  userIdA: string,
  userIdB: string,
  directKey: string,
  creatorUserId: string,
) {
  // Prisma upsert на @unique поле — atomic.
  // У create-частині додаємо обидва ChatMember.
  return prisma.chat.upsert({
    where: { directKey },
    update: {}, // якщо вже існує — нічого не змінюємо
    create: {
      type: "DIRECT" as ChatType,
      directKey,
      createdById: creatorUserId,
      members: {
        create: [
          { userId: userIdA, role: "MEMBER" as MemberRole },
          { userId: userIdB, role: "MEMBER" as MemberRole },
        ],
      },
    },
    include: FULL_CHAT_INCLUDE,
  });
}

interface CreateGroupChatInput {
  name: string;
  ownerId: string;
  memberIds: string[];
}

/**
 * Створення group-чату з owner + members у одній транзакції.
 * memberIds НЕ повинен містити ownerId (контролюється у сервісі).
 */
export async function createGroupChat(input: CreateGroupChatInput) {
  return prisma.chat.create({
    data: {
      type: "GROUP" as ChatType,
      name: input.name,
      createdById: input.ownerId,
      members: {
        create: [
          { userId: input.ownerId, role: "OWNER" as MemberRole },
          ...input.memberIds.map((userId) => ({
            userId,
            role: "MEMBER" as MemberRole,
          })),
        ],
      },
    },
    include: FULL_CHAT_INCLUDE,
  });
}

// ============================================
// UPDATE
// ============================================

interface UpdateGroupInput {
  name?: string | undefined;
  avatarUrl?: string | null | undefined;
}

export async function updateGroupChat(chatId: string, data: UpdateGroupInput) {
  return prisma.chat.update({
    where: { id: chatId },
    data,
    include: FULL_CHAT_INCLUDE,
  });
}

/**
 * Видалення чату (тільки група, тільки owner — перевірка у сервісі).
 * CASCADE на ChatMember/Message/Reaction — Prisma schema це налаштована.
 */
export async function deleteChat(chatId: string) {
  return prisma.chat.delete({
    where: { id: chatId },
  });
}

// ============================================
// MEMBERSHIP
// ============================================

export async function addChatMember(chatId: string, userId: string, role: MemberRole = "MEMBER") {
  return prisma.chatMember.create({
    data: { chatId, userId, role },
  });
}

/**
 * "Soft leave" — позначаємо leftAt замість видалення запису.
 * Це дозволяє зберегти посилання Message → ChatMember (для історії,
 * хоч ми її і не показуємо post-leave).
 *
 * Хочемо leave-нути або видалити — використовуємо ту саму операцію.
 * Сервіс перевіряє чи це OWNER (і не дає видалити останнього OWNER-а).
 */
export async function softRemoveMember(chatId: string, userId: string) {
  return prisma.chatMember.update({
    where: {
      chatId_userId: { chatId, userId },
    },
    data: { leftAt: new Date() },
  });
}

// ============================================
// READ RECEIPT (lastReadMessageId)
// ============================================

/**
 * Оновити lastReadMessageId для (chatId, userId).
 *
 * Anti-rewind: тільки якщо новий messageId більший за поточний.
 * Реалізовано на рівні WHERE — атомарно, без race.
 */
export async function updateLastRead(chatId: string, userId: string, messageId: string) {
  // updateMany бо where з conditional на існуюче поле — Prisma
  // вимагає updateMany а не update.
  return prisma.chatMember.updateMany({
    where: {
      chatId,
      userId,
      OR: [
        { lastReadMessageId: null },
        { lastReadMessageId: { lt: messageId } },
      ],
    },
    data: { lastReadMessageId: messageId },
  });
}

// ============================================
// AGGREGATES — для списку чатів
// ============================================

/**
 * Unread message counts для всіх чатів юзера — один SQL.
 *
 * Логіка: для кожного ChatMember юзера рахуємо повідомлення
 * де:
 *  - id > lastReadMessageId (або lastReadMessageId IS NULL = чат не відкривали)
 *  - не deleted (deletedAt IS NULL)
 *  - не свої (authorId != userId — свої повідомлення не "unread")
 *
 * Повертає Map<chatId, count>.
 *
 * Чому raw SQL: Prisma не вміє таку конструкцію через звичайні API
 * (groupBy + composite where з посиланням на іншу таблицю).
 */
export async function countUnreadByChat(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ chatId: string; unread: bigint }>>`
    SELECT
      cm."chatId" AS "chatId",
      COUNT(m.id) AS unread
    FROM "ChatMember" cm
    LEFT JOIN "Message" m
      ON m."chatId" = cm."chatId"
      AND (cm."lastReadMessageId" IS NULL OR m.id > cm."lastReadMessageId")
      AND m."deletedAt" IS NULL
      AND m."authorId" != cm."userId"
    WHERE cm."userId" = ${userId}
      AND cm."leftAt" IS NULL
    GROUP BY cm."chatId"
  `;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.chatId, Number(row.unread));
  }
  return map;
}

/**
 * Last message preview для усіх chatId — один SQL через DISTINCT ON.
 *
 * Postgres-specific: DISTINCT ON ("chatId") ORDER BY "chatId", id DESC
 * вибирає НАЙНОВІШЕ повідомлення для кожного chatId за один прохід.
 * Дуже швидко з нашим індексом (chatId, id DESC).
 *
 * Повертає Map<chatId, lastMessage>. Якщо в чаті немає повідомлень —
 * чат не з'являється у map (lastMessage буде null у DTO).
 */
export interface LastMessagePreviewRow {
  id: string;
  chatId: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export async function fetchLastMessagesForChats(
  chatIds: string[],
): Promise<Map<string, LastMessagePreviewRow>> {
  if (chatIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<LastMessagePreviewRow[]>`
    SELECT DISTINCT ON (m."chatId")
      m.id,
      m."chatId",
      m.content,
      m."authorId",
      u.name AS "authorName",
      m."createdAt",
      m."deletedAt"
    FROM "Message" m
    JOIN "User" u ON u.id = m."authorId"
    WHERE m."chatId" = ANY(${chatIds}::text[])
    ORDER BY m."chatId", m.id DESC
  `;

  const map = new Map<string, LastMessagePreviewRow>();
  for (const row of rows) {
    map.set(row.chatId, row);
  }
  return map;
}
