import type { ReactionGroup } from "@chat/shared";

/**
 * ============================================
 * Reaction grouping (client-side)
 * ============================================
 *
 * Сервер шле сирі pairs `{ emoji, userId }`. Цей util групує їх у
 * масив ReactionGroup з count + reactedByMe для UI.
 *
 * Така ж функція є на бекенді у _mappers.ts — навмисне дублювання.
 * Альтернатива — винести у shared/, але це додаткова залежність runtime
 * (а саме перетворення легке).
 */

export function groupReactions(
  rawReactions: { emoji: string; userId: string }[],
  currentUserId: string,
): ReactionGroup[] {
  const map = new Map<string, Set<string>>();
  for (const r of rawReactions) {
    let set = map.get(r.emoji);
    if (!set) {
      set = new Set();
      map.set(r.emoji, set);
    }
    set.add(r.userId);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.size,
    userIds: Array.from(userIds),
    reactedByMe: userIds.has(currentUserId),
  }));
}
