"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import type { Chat, ChatMember, Message, MessagePage } from "@chat/shared";

import { useSocket } from "@/providers/socket-provider";
import { useMe } from "@/hooks/use-auth";
import { groupReactions } from "@/lib/utils/reactions";
import { apiClient } from "@/lib/api/client";

/**
 * ============================================
 * useSocketEvents — глобальний слухач server-to-client подій
 * ============================================
 *
 * Викликається ОДИН РАЗ у root-layout після логіну.
 * Підписується на всі server events і оновлює TanStack Query cache.
 *
 * Дедуплікація для message:new — перевіряємо чи message.id уже у кеші
 * (через REST onSuccess або попередній broadcast).
 *
 * Reconnect handling — при `connect` event інвалідуємо ['chats'] +
 * активний ['messages', chatId] щоб catch-up missed events.
 */

type MessagesQueryData = { pages: MessagePage[]; pageParams: unknown[] };

export function useSocketEvents() {
  const socket = useSocket();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const { data: meData } = useMe();
  const currentUserId = meData?.user?.id;

  useEffect(() => {
    if (!currentUserId) return;

    // ============================================
    // Connection lifecycle
    // ============================================

    function handleConnect() {
      // Catch-up після (re)connect
      qc.invalidateQueries({ queryKey: ["chats"] });
      // Якщо юзер на якомусь чаті — refetch і його messages
      const chatIdMatch = pathname.match(/^\/chats\/([^/]+)/);
      if (chatIdMatch) {
        qc.invalidateQueries({ queryKey: ["messages", chatIdMatch[1]] });
      }
    }

    function handleConnectError(err: Error) {
      // eslint-disable-next-line no-console
      console.warn("[socket] connect_error:", err.message);
    }

    // ============================================
    // Message events
    // ============================================

    function handleMessageNew(payload: {
      chatId: string;
      message: Message;
      clientId?: string;
    }) {
      const { chatId, message, clientId } = payload;

      const existing = qc.getQueryData<MessagesQueryData>(["messages", chatId]);

      // 1. Якщо повідомлення з тим самим server id уже є — skip.
      //    Це покриває випадок коли REST onSuccess уже встиг його замінити.
      const hasServerId = existing?.pages.some((page) =>
        page.items.some((m) => m.id === message.id),
      );
      if (hasServerId) return;

      // 2. Якщо є clientId і у кеші є optimistic message з id === clientId —
      //    REPLACE optimistic на server message (без дубля).
      //    Це відбувається коли socket event приходить раніше за REST onSuccess.
      if (clientId) {
        const hasOptimistic = existing?.pages.some((page) =>
          page.items.some((m) => m.id === clientId),
        );
        if (hasOptimistic) {
          qc.setQueryData<MessagesQueryData>(["messages", chatId], (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((m) => (m.id === clientId ? message : m)),
              })),
            };
          });
          qc.invalidateQueries({ queryKey: ["chats"] });
          return;
        }
      }

      // 3. Звичайний випадок: чужий message → додаємо у першу page
      qc.setQueryData<MessagesQueryData>(["messages", chatId], (old) => {
        if (!old || !old.pages[0]) {
          return {
            pages: [{ items: [message], nextCursor: null }],
            pageParams: [undefined],
          };
        }
        const [first, ...rest] = old.pages;
        return {
          ...old,
          pages: [{ ...first!, items: [message, ...first!.items] }, ...rest],
        };
      });

      qc.invalidateQueries({ queryKey: ["chats"] });
    }

    function handleMessageEdited(payload: { chatId: string; message: Message }) {
      const { chatId, message } = payload;
      qc.setQueryData<MessagesQueryData>(["messages", chatId], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) => (m.id === message.id ? message : m)),
          })),
        };
      });
      qc.invalidateQueries({ queryKey: ["chats"] });
    }

    function handleMessageDeleted(payload: { chatId: string; message: Message }) {
      const { chatId, message } = payload;
      qc.setQueryData<MessagesQueryData>(["messages", chatId], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) => (m.id === message.id ? message : m)),
          })),
        };
      });
      qc.invalidateQueries({ queryKey: ["chats"] });
    }

    function handleReactionUpdated(payload: {
      chatId: string;
      messageId: string;
      reactions: { emoji: string; userId: string }[];
    }) {
      const { chatId, messageId, reactions } = payload;
      qc.setQueryData<MessagesQueryData>(["messages", chatId], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) =>
              m.id === messageId
                ? { ...m, reactions: groupReactions(reactions, currentUserId!) }
                : m,
            ),
          })),
        };
      });
    }

    function handleReadUpdated(payload: {
      chatId: string;
      userId: string;
      lastReadMessageId: string;
    }) {
      const { chatId, userId, lastReadMessageId } = payload;
      // Власні events ігноруємо — markAsRead REST onSuccess уже оновив локально
      if (userId === currentUserId) return;

      // Оновлюємо chat.members[userId].lastReadMessageId у кеші ['chats', chatId]
      qc.setQueryData<{ chat: Chat }>(["chats", chatId], (old) => {
        if (!old) return old;
        return {
          chat: {
            ...old.chat,
            members: old.chat.members.map((m) =>
              m.userId === userId ? { ...m, lastReadMessageId } : m,
            ),
          },
        };
      });
    }

    // ============================================
    // Chat lifecycle
    // ============================================

    function handleChatUpdated(payload: { chat: Chat }) {
      qc.setQueryData(["chats", payload.chat.id], { chat: payload.chat });
      qc.invalidateQueries({ queryKey: ["chats"] });
    }

    function handleMemberAdded(payload: { chatId: string; member: ChatMember }) {
      // Хто додався: я чи хтось інший?
      // Якщо я — просто refresh ['chats'] щоб новий чат з'явився у sidebar.
      // Якщо інший — invalidate single chat data (members оновились).
      qc.invalidateQueries({ queryKey: ["chats", payload.chatId] });
      qc.invalidateQueries({ queryKey: ["chats"] });
    }

    function handleMemberRemoved(payload: { chatId: string; userId: string }) {
      const isSelf = payload.userId === currentUserId;
      if (isSelf) {
        // Мене kick-нули або я left — прибираємо чат з кешу
        qc.removeQueries({ queryKey: ["chats", payload.chatId] });
        qc.removeQueries({ queryKey: ["messages", payload.chatId] });
        qc.invalidateQueries({ queryKey: ["chats"] });

        // Якщо я зараз на цьому чаті — redirect на /chats
        if (pathname === `/chats/${payload.chatId}`) {
          router.push("/chats");
        }
      } else {
        qc.invalidateQueries({ queryKey: ["chats", payload.chatId] });
        qc.invalidateQueries({ queryKey: ["chats"] });
      }
    }

    function handleChatDeleted(payload: { chatId: string }) {
      qc.removeQueries({ queryKey: ["chats", payload.chatId] });
      qc.removeQueries({ queryKey: ["messages", payload.chatId] });
      qc.invalidateQueries({ queryKey: ["chats"] });

      if (pathname === `/chats/${payload.chatId}`) {
        router.push("/chats");
      }
    }

    // ============================================
    // Auth expired (Iter 4+, поки сервер не емiтить)
    // ============================================

    function handleAuthExpired() {
      // Сервер розірвав з'єднання, бо access-токен, з яким конектились,
      // протух. Це НЕ означає, що сесія мертва — refresh-токен, найпевніше,
      // ще живий. Тому не викидаємо на логін, а оновлюємо cookie напряму:
      //  - успіх → socket auto-reconnect піде вже зі свіжим cookie;
      //  - провал (мертвий refresh) → apiClient сам емітить AUTH_FAILED_EVENT
      //    у своєму catch, тож логаут станеться автоматично.
      void apiClient.post("/auth/refresh").catch(() => {
        // Навмисно порожньо: обробку провалу робить інтерцептор у client.ts.
      });
    }

    // ============================================
    // Subscribe
    // ============================================

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("message:new", handleMessageNew);
    socket.on("message:edited", handleMessageEdited);
    socket.on("message:deleted", handleMessageDeleted);
    socket.on("reaction:updated", handleReactionUpdated);
    socket.on("read:updated", handleReadUpdated);
    socket.on("chat:updated", handleChatUpdated);
    socket.on("chat:member-added", handleMemberAdded);
    socket.on("chat:member-removed", handleMemberRemoved);
    socket.on("chat:deleted", handleChatDeleted);
    socket.on("auth:expired", handleAuthExpired);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("message:new", handleMessageNew);
      socket.off("message:edited", handleMessageEdited);
      socket.off("message:deleted", handleMessageDeleted);
      socket.off("reaction:updated", handleReactionUpdated);
      socket.off("read:updated", handleReadUpdated);
      socket.off("chat:updated", handleChatUpdated);
      socket.off("chat:member-added", handleMemberAdded);
      socket.off("chat:member-removed", handleMemberRemoved);
      socket.off("chat:deleted", handleChatDeleted);
      socket.off("auth:expired", handleAuthExpired);
    };
  }, [socket, qc, currentUserId, pathname, router]);
}
