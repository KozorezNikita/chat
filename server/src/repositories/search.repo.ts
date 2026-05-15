import { prisma } from "../db/prisma.js";

/**
 * ============================================
 * Search repository — raw SQL для Postgres FTS
 * ============================================
 *
 * Prisma не має ORM-доступу до tsvector / @@ / ts_rank / ts_headline,
 * тому використовуємо $queryRaw. Параметри binding через tagged template literals —
 * захищено від SQL injection (як prepared statements).
 *
 * Privacy: INNER JOIN з ChatMember + WHERE leftAt IS NULL — користувач бачить
 * тільки messages з чатів де він активний member.
 */

export interface SearchRawRow {
  messageId: string;
  chatId: string;
  chatType: "DIRECT" | "GROUP";
  chatName: string | null;
  authorId: string;
  authorName: string;
  headline: string;
  createdAt: Date;
  rank: number;
}

/**
 * Пошук повідомлень + total count для пагінації.
 *
 * Чому окремий COUNT(*) запит а не window function: щоб мати точне total
 * (window function рахує тільки у поточному page). Дороге, але search-flow
 * не часті — 1-2 query/sec у пет-проекті.
 */
export async function searchMessages(opts: {
  userId: string;
  query: string;
  offset: number;
  limit: number;
}): Promise<{ rows: SearchRawRow[]; total: number }> {
  const { userId, query, offset, limit } = opts;

  const rows = await prisma.$queryRaw<SearchRawRow[]>`
    SELECT
      m.id as "messageId",
      m."chatId" as "chatId",
      c.type::text as "chatType",
      c.name as "chatName",
      u.id as "authorId",
      u.name as "authorName",
      ts_headline(
        'simple',
        m.content,
        websearch_to_tsquery('simple', ${query}),
        'StartSel=[[, StopSel=]], MaxWords=20, MinWords=5, MaxFragments=1'
      ) as headline,
      m."createdAt" as "createdAt",
      ts_rank(m."searchVector", websearch_to_tsquery('simple', ${query})) as rank
    FROM "Message" m
    INNER JOIN "User" u ON u.id = m."authorId"
    INNER JOIN "Chat" c ON c.id = m."chatId"
    INNER JOIN "ChatMember" cm
      ON cm."chatId" = c.id
      AND cm."userId" = ${userId}
      AND cm."leftAt" IS NULL
    WHERE m."deletedAt" IS NULL
      AND m."searchVector" @@ websearch_to_tsquery('simple', ${query})
    ORDER BY rank DESC, m."createdAt" DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count
    FROM "Message" m
    INNER JOIN "ChatMember" cm
      ON cm."chatId" = m."chatId"
      AND cm."userId" = ${userId}
      AND cm."leftAt" IS NULL
    WHERE m."deletedAt" IS NULL
      AND m."searchVector" @@ websearch_to_tsquery('simple', ${query})
  `;

  // BigInt → Number — total не може бути > 2^53 для search results
  const total = Number(countResult[0]?.count ?? 0n);

  return { rows, total };
}

/**
 * Допоміжне: для DIRECT чатів нам потрібен партнер як "chat name"
 * (бо `chat.name` null для DM). Окремий запит замість inline JOIN
 * для простоти SQL вище.
 */
export async function fetchDirectChatPartners(opts: {
  chatIds: string[];
  currentUserId: string;
}): Promise<Map<string, string>> {
  if (opts.chatIds.length === 0) return new Map();

  const partners = await prisma.chatMember.findMany({
    where: {
      chatId: { in: opts.chatIds },
      userId: { not: opts.currentUserId },
      leftAt: null,
    },
    select: {
      chatId: true,
      user: { select: { name: true } },
    },
  });

  return new Map(partners.map((p) => [p.chatId, p.user.name]));
}
