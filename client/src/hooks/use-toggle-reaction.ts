"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  Message,
  MessagePage,
  ToggleReactionDto,
  ToggleReactionResponse,
} from "@chat/shared";

import { toggleReaction } from "@/lib/api/reactions";
import { useMe } from "@/hooks/use-auth";
import { groupReactions } from "@/lib/utils/reactions";
import { getErrorMessage } from "@/lib/api/errors";

/**
 * ============================================
 * useToggleReaction — TanStack mutation з optimistic update
 * ============================================
 *
 * Шле POST /messages/:id/reactions. Optimistic — одразу оновлюємо
 * локальний кеш messages, без чекання response.
 *
 * Сервер додатково broadcast-ить reaction:updated всім — наш кеш отримає
 * подію, але вона ідемпотентна (replace reactions повним списком).
 */

type MessagesQueryData = { pages: MessagePage[]; pageParams: unknown[] };

interface MutationContext {
  /** Зберігаємо попередні reactions для rollback при помилці. */
  previousReactions: Message["reactions"];
  /** Сирий список (emoji+userId) ДО optimistic. Потрібен для socket-listener-а
   *  щоб не applied наш delta двічі. Поки не використовуємо — закладено на майбутнє. */
  previousRaw: { emoji: string; userId: string }[];
}

export function useToggleReaction(chatId: string, messageId: string) {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const currentUserId = meData?.user?.id;

  return useMutation<
    ToggleReactionResponse,
    Error,
    ToggleReactionDto,
    MutationContext
  >({
    mutationFn: (dto: ToggleReactionDto) => toggleReaction(messageId, dto),

    onMutate: async (dto): Promise<MutationContext> => {
      if (!currentUserId) {
        return { previousReactions: [], previousRaw: [] };
      }

      // Знаходимо message у кеші, шукаємо emoji у його reactions
      let previousReactions: Message["reactions"] = [];
      let previousRaw: { emoji: string; userId: string }[] = [];

      qc.setQueryData<MessagesQueryData>(["messages", chatId], (old) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) => {
              if (m.id !== messageId) return m;

              previousReactions = m.reactions;
              // Реконструюємо сирий список для optimistic toggle
              const raw: { emoji: string; userId: string }[] = [];
              for (const group of m.reactions) {
                for (const uid of group.userIds) {
                  raw.push({ emoji: group.emoji, userId: uid });
                }
              }
              previousRaw = raw;

              // Toggle: якщо я вже маю реакцію цим emoji — видаляємо мій userId,
              // інакше додаємо
              const hasMyReaction = raw.some(
                (r) => r.emoji === dto.emoji && r.userId === currentUserId,
              );
              const newRaw = hasMyReaction
                ? raw.filter(
                    (r) => !(r.emoji === dto.emoji && r.userId === currentUserId),
                  )
                : [...raw, { emoji: dto.emoji, userId: currentUserId }];

              return {
                ...m,
                reactions: groupReactions(newRaw, currentUserId),
              };
            }),
          })),
        };
      });

      return { previousReactions, previousRaw };
    },

    onError: (err, _dto, context) => {
      // Rollback
      if (context && currentUserId) {
        qc.setQueryData<MessagesQueryData>(["messages", chatId], (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((m) =>
                m.id === messageId ? { ...m, reactions: context.previousReactions } : m,
              ),
            })),
          };
        });
      }
      toast.error(getErrorMessage(err));
    },

    onSuccess: (response) => {
      // Server повернув повний поточний state. Замінюємо локально на цей truth.
      // Це безпечно бо socket reaction:updated прийде з тим же payload (idempotent).
      if (!currentUserId) return;

      qc.setQueryData<MessagesQueryData>(["messages", chatId], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) =>
              m.id === response.messageId
                ? { ...m, reactions: groupReactions(response.reactions, currentUserId) }
                : m,
            ),
          })),
        };
      });
    },
  });
}
