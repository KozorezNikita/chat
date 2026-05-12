import { getRedis } from "../db/redis.js";
import { prisma } from "../db/prisma.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================
 * Presence service
 * ============================================
 *
 * Online status трекається через Redis Sets:
 *   online:userId → set of socket IDs
 *
 * Connect:    SADD online:userId socketId
 * Disconnect: SREM online:userId socketId
 *               + якщо SCARD === 0 → User.lastSeenAt = NOW()
 *
 * Multi-tab: ref-counting через Set size. Якщо у юзера 3 tabs відкриті,
 * один disconnect не означає offline.
 *
 * Без Redis (REDIS_URL не задано): graceful no-op. Всі юзери будуть
 * показуватись як offline у клієнті — це OK для dev/тестів.
 *
 * Lazy presence (узгоджено в плані): не broadcast-имо presence:update
 * події. Клієнт polling-ить REST /api/v1/presence?userIds кожні 30 сек.
 * Це простіше і "достатньо точно" для людського ока.
 */

const ONLINE_KEY_PREFIX = "online:";
// Не вічно — якщо процес помер без cleanup, Redis сам прибере stale entries.
// 60 хв — достатньо щоб переживати короткі мережеві проблеми.
const ONLINE_TTL_SECONDS = 60 * 60;

function onlineKey(userId: string): string {
  return `${ONLINE_KEY_PREFIX}${userId}`;
}

/**
 * Викликається при successful socket connect у connection.handler.
 * Додає socketId до Set юзера. Якщо це перший socket → юзер вважається online.
 */
export async function trackConnect(userId: string, socketId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  try {
    const key = onlineKey(userId);
    await redis.sAdd(key, socketId);
    await redis.expire(key, ONLINE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, userId, socketId }, "presence trackConnect failed");
  }
}

/**
 * Викликається при socket disconnect. Прибирає socketId з Set.
 * Якщо це був останній socket — оновлює User.lastSeenAt у БД.
 */
export async function trackDisconnect(userId: string, socketId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  try {
    const key = onlineKey(userId);
    await redis.sRem(key, socketId);

    const remainingSockets = await redis.sCard(key);
    if (remainingSockets === 0) {
      // Останній socket закрився — юзер справді offline. Stamp lastSeenAt.
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });
    }
  } catch (err) {
    logger.warn({ err, userId, socketId }, "presence trackDisconnect failed");
  }
}

/**
 * Перевіряє статус для списку юзерів — використовується REST endpoint
 * /api/v1/presence?userIds=[...] для polling з клієнта.
 *
 * Без Redis — повертає всіх як offline.
 */
export interface PresenceInfo {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}

export async function getPresenceForUsers(userIds: string[]): Promise<PresenceInfo[]> {
  if (userIds.length === 0) return [];

  const redis = await getRedis();

  // Стартуємо обидва запити паралельно.
  const [onlineFlags, users] = await Promise.all([
    redis
      ? Promise.all(userIds.map((id) => redis.sCard(onlineKey(id))))
      : Promise.resolve(userIds.map(() => 0)),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, lastSeenAt: true },
    }),
  ]);

  const lastSeenMap = new Map<string, Date | null>(
    users.map((u: { id: string; lastSeenAt: Date | null }) => [u.id, u.lastSeenAt]),
  );

  return userIds.map((userId, idx) => {
    const isOnline = (onlineFlags[idx] ?? 0) > 0;
    const lastSeenAt = lastSeenMap.get(userId) ?? null;
    return {
      userId,
      online: isOnline,
      lastSeenAt: isOnline ? null : lastSeenAt?.toISOString() ?? null,
    };
  });
}
