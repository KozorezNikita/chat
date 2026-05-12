"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PresenceInfo } from "@chat/shared";

import { fetchPresence } from "@/lib/api/presence";
import { useChats } from "@/hooks/use-chats";
import { useMe } from "@/hooks/use-auth";

/**
 * ============================================
 * Presence hooks
 * ============================================
 *
 * Архітектура:
 *  - `useGlobalPresencePolling()` — один глобальний query, збирає всі
 *    userIds з відкритих чатів і polling-ить /api/v1/presence кожні 30 сек.
 *  - `usePresence(userId)` — компоненти-споживачі читають з кешу
 *    і повертають PresenceInfo для конкретного userId.
 *
 * `refetchIntervalInBackground: false` (default) — не polling-имо коли
 * вкладка прихована. Бережемо API quota і батарею.
 */

const POLL_INTERVAL_MS = 30_000;
const STALE_TIME_MS = 25_000;

/**
 * Глобальний polling — викликається ОДИН раз у root layout.
 * Збирає userIds з усіх відкритих чатів (крім поточного юзера).
 */
export function useGlobalPresencePolling() {
  const { data: chatsData } = useChats();
  const { data: meData } = useMe();
  const currentUserId = meData?.user?.id;

  // Дедуплікуємо userIds зі всіх чатів
  const userIds = useMemo(() => {
    if (!chatsData?.chats || !currentUserId) return [];

    const ids = new Set<string>();
    for (const chat of chatsData.chats) {
      for (const member of chat.members) {
        if (member.userId !== currentUserId) {
          ids.add(member.userId);
        }
      }
    }
    return Array.from(ids);
  }, [chatsData?.chats, currentUserId]);

  return useQuery({
    queryKey: ["presence", userIds],
    queryFn: () => fetchPresence(userIds),
    enabled: userIds.length > 0,
    staleTime: STALE_TIME_MS,
    refetchInterval: POLL_INTERVAL_MS,
    // refetchIntervalInBackground: false — default
  });
}

/**
 * Читає presence для одного userId з глобального кешу.
 * Повертає undefined якщо ще не отримали.
 */
export function usePresence(userId: string | undefined): PresenceInfo | undefined {
  const { data } = useGlobalPresencePolling();
  if (!userId || !data) return undefined;
  return data.presence.find((p) => p.userId === userId);
}

/**
 * Для group chats — повертає скільки members зараз online (крім поточного юзера).
 * Передаємо список userIds (members) — функція рахує скільки з них online.
 */
export function useOnlineCount(memberUserIds: string[]): number {
  const { data } = useGlobalPresencePolling();
  if (!data) return 0;
  return data.presence.filter(
    (p) => p.online && memberUserIds.includes(p.userId),
  ).length;
}
