"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Message,
  MessagePage,
  SendMessageDto,
  EditMessageDto,
} from "@chat/shared";

import * as messageApi from "@/lib/api/message";

/**
 * ============================================
 * Message hooks
 * ============================================
 *
 * useMessages — useInfiniteQuery з cursor pagination.
 *   data.pages: Array<MessagePage>, кожна — найновіше першим.
 *   Перший fetch — без cursor (найновіші 50).
 *   fetchNextPage → завантажити старіші.
 *
 * useSendMessage — optimistic update через clientId.
 * useEditMessage / useDeleteMessage — оновлюють відповідне message у кеші.
 */

const messagesKey = (chatId: string) => ["messages", chatId] as const;

export function useMessages(chatId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["messages", chatId],
    queryFn: ({ pageParam }) =>
      messageApi.getMessages(chatId!, { cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!chatId,
    staleTime: 30 * 1000,
  });
}

/**
 * Send message з optimistic UI.
 *
 * Optimistic flow:
 *  1. Перед запитом — додаємо {clientId, pending: true} у першу page кешу
 *  2. Сервер відповів — заміняємо optimistic на серверний за clientId
 *  3. Помилка — позначаємо `failed: true` на тому ж clientId
 *
 * Note: optimistic Message має authorId currentUserId, але PublicUser
 * (name, avatar) ми НЕ знаємо одразу. Передаємо у dto + контекстом.
 */
interface OptimisticContext {
  optimisticId: string;
  previousData: unknown;
}

export function useSendMessage(chatId: string) {
  const qc = useQueryClient();

  return useMutation<
    Awaited<ReturnType<typeof messageApi.sendMessage>>,
    Error,
    { dto: SendMessageDto; optimisticMessage: Message },
    OptimisticContext
  >({
    mutationFn: ({ dto }) => messageApi.sendMessage(chatId, dto),
    onMutate: async ({ optimisticMessage }) => {
      await qc.cancelQueries({ queryKey: messagesKey(chatId) });

      const previousData = qc.getQueryData(messagesKey(chatId));

      // Додаємо optimistic у першу (найновішу) page
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(
        messagesKey(chatId),
        (old) => {
          if (!old || !old.pages[0]) {
            return {
              pages: [{ items: [optimisticMessage], nextCursor: null }],
              pageParams: [undefined],
            };
          }
          const [first, ...rest] = old.pages;
          return {
            ...old,
            pages: [
              { ...first!, items: [optimisticMessage, ...first!.items] },
              ...rest,
            ],
          };
        },
      );

      return { optimisticId: optimisticMessage.id, previousData };
    },
    onSuccess: (data, _vars, ctx) => {
      // Заміняємо optimistic на серверний
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(
        messagesKey(chatId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((m) =>
                m.id === ctx?.optimisticId ? (data.message as Message) : m,
              ),
            })),
          };
        },
      );

      // Інвалідуємо список чатів — щоб lastMessage оновився у sidebar
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
    onError: (_err, _vars, ctx) => {
      // Roll back до previousData
      if (ctx?.previousData) {
        qc.setQueryData(messagesKey(chatId), ctx.previousData);
      }
    },
  });
}

export function useEditMessage(chatId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, dto }: { messageId: string; dto: EditMessageDto }) =>
      messageApi.editMessage(messageId, dto),
    onSuccess: ({ message }) => {
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(
        messagesKey(chatId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((m) => (m.id === message.id ? message : m)),
            })),
          };
        },
      );
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useDeleteMessage(chatId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => messageApi.deleteMessage(messageId),
    onSuccess: ({ message }) => {
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(
        messagesKey(chatId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((m) => (m.id === message.id ? message : m)),
            })),
          };
        },
      );
      qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
