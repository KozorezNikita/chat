"use client";

import { useMemo, useEffect, useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import type { Message } from "@chat/shared";

import { useMessages } from "@/hooks/use-messages";
import { useMarkAsRead } from "@/hooks/use-chats";
import { useScrollAnchor } from "@/hooks/use-scroll-anchor";
import { shouldGroupMessages } from "@/lib/utils/message-utils";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./message-bubble";

interface MessageListProps {
  chatId: string;
  currentUserId: string;
}

/**
 * Скрол-контейнер з повідомленнями.
 *
 * Фічі:
 *  - useInfiniteQuery: 50 найновіших → scroll up → старіші
 *  - autoscroll до bottom при відкритті чату
 *  - autoscroll при новому повідомленні якщо юзер біля bottom
 *  - "↓ N нових" badge якщо юзер прокручений вгору і прийшло нове
 *  - mark-as-read коли видно найновіше
 *
 * Optimistic message має id===clientId (UUID), не cuid. Перевіряємо
 * формат перед mark-as-read щоб не звертатись до неіснуючого id на бекенді.
 */
const CUID_LIKE_REGEX = /^c[a-z0-9]{20,}$/;

export function MessageList({ chatId, currentUserId }: MessageListProps) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMessages(chatId);

  const markAsRead = useMarkAsRead(chatId);
  const lastMarkedRef = useRef<string | null>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);

  /**
   * Scroll-to-parent — клік на mini-bubble parent-preview.
   * Шукає DOM-вузол по id="message-{parentId}", scroll-ить + flash 2 сек.
   * Якщо parent не у DOM (не paginated назад) — toast.
   */
  function handleScrollToParent(parentId: string) {
    const el = document.getElementById(`message-${parentId}`);
    if (!el) {
      // toast імпортуємо лише коли потрібно — динамічний import щоб не тягнути зайве
      import("sonner").then(({ toast }) => {
        toast("Повідомлення не у поточному перегляді", {
          description: "Прокрутіть вгору щоб завантажити старіші повідомлення",
        });
      });
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashMessageId(parentId);
    setTimeout(() => setFlashMessageId(null), 2000);
  }
  const previousMessagesLengthRef = useRef(0);
  const previousLastIdRef = useRef<string | null>(null);

  const { scrollRef, topAnchorRef, bottomAnchorRef, isNearBottom, scrollToBottom } =
    useScrollAnchor({
      onLoadMore: () => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      loadMoreEnabled: !!hasNextPage,
    });

  const messages: Message[] = useMemo(() => {
    if (!data) return [];
    const allItems = data.pages.flatMap((p) => p.items);
    return [...allItems].reverse();
  }, [data]);

  // Autoscroll при ВІДКРИТТІ чату — миттєвий
  const initialScrolledRef = useRef(false);
  useEffect(() => {
    if (!initialScrolledRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottom("auto");
        initialScrolledRef.current = true;
      });
    }
  }, [messages.length, scrollToBottom]);

  // Reset state коли змінюється chatId
  useEffect(() => {
    initialScrolledRef.current = false;
    lastMarkedRef.current = null;
    previousMessagesLengthRef.current = 0;
    previousLastIdRef.current = null;
    setUnreadCount(0);
    setEditingId(null);
  }, [chatId]);

  // Реакція на нові повідомлення
  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1]!;
    const prevLength = previousMessagesLengthRef.current;
    const prevLastId = previousLastIdRef.current;

    const isNewMessage =
      messages.length > prevLength && lastMessage.id !== prevLastId && prevLastId !== null;

    if (isNewMessage) {
      const isOwn = lastMessage.author.id === currentUserId;

      if (isOwn || isNearBottom) {
        scrollToBottom("smooth");
      } else {
        setUnreadCount((prev) => prev + 1);
      }
    }

    previousMessagesLengthRef.current = messages.length;
    previousLastIdRef.current = lastMessage.id;
  }, [messages, currentUserId, isNearBottom, scrollToBottom]);

  // Mark as read коли юзер біля bottom
  useEffect(() => {
    if (!isNearBottom || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1]!;
    if (!CUID_LIKE_REGEX.test(lastMessage.id)) return;
    if (lastMarkedRef.current === lastMessage.id) return;

    lastMarkedRef.current = lastMessage.id;
    markAsRead.mutate({ messageId: lastMessage.id });
    setUnreadCount(0);
  }, [isNearBottom, messages, markAsRead]);

  // Scroll до повідомлення з URL hash (#message-xyz) — для navigation із search-сторінки
  // або deep-links. Спрацьовує один раз коли messages завантажились.
  const hashScrolledRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#message-")) return;
    if (hashScrolledRef.current === hash) return;

    const messageId = hash.slice("#message-".length);
    hashScrolledRef.current = hash;

    // Чекаємо tick щоб DOM встиг ren render messages
    setTimeout(() => {
      handleScrollToParent(messageId);
      // Очищаємо hash щоб refresh не повторив scroll
      const url = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", url);
    }, 100);
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-destructive">
        Не вдалося завантажити повідомлення
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <p>У цьому чаті ще немає повідомлень</p>
          <p className="mt-1 text-xs">Напишіть перше повідомлення нижче</p>
        </div>
      </div>
    );
  }

  function handleBadgeClick() {
    scrollToBottom("smooth");
    setUnreadCount(0);
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div ref={topAnchorRef} className="h-1" />

          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!hasNextPage && messages.length > 0 && (
            <div className="py-2 text-center text-xs text-muted-foreground/70">
              — початок чату —
            </div>
          )}

          {(() => {
            // Знаходимо індекс останнього власного повідомлення (не deleted).
            // Раз обчислюємо для всього циклу.
            let lastOwnIdx = -1;
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i]!.author.id === currentUserId && messages[i]!.deletedAt === null) {
                lastOwnIdx = i;
                break;
              }
            }
            return messages.map((message, idx) => {
              const previous = idx > 0 ? messages[idx - 1]! : null;
              const next = idx < messages.length - 1 ? messages[idx + 1] : null;

              const isGrouped = shouldGroupMessages(message, previous);
              const showTime = !next || !shouldGroupMessages(next, message);
              const isLastOwn = idx === lastOwnIdx;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.author.id === currentUserId}
                  isGrouped={isGrouped}
                  showTime={showTime}
                  isLastOwn={isLastOwn}
                  isFlashing={flashMessageId === message.id}
                  chatId={chatId}
                  isEditing={editingId === message.id}
                  onStartEdit={() => setEditingId(message.id)}
                  onStopEdit={() => setEditingId(null)}
                  onScrollToParent={handleScrollToParent}
                />
              );
            });
          })()}

          <div ref={bottomAnchorRef} className="h-1" />
        </div>
      </div>

      {unreadCount > 0 && (
        <button
          type="button"
          onClick={handleBadgeClick}
          className={cn(
            "absolute bottom-4 left-1/2 z-10 -translate-x-1/2",
            "flex items-center gap-2 rounded-full bg-sunset px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg",
            "transition-transform hover:scale-105",
          )}
        >
          <ArrowDown className="h-4 w-4" />
          {unreadCount} {unreadCount === 1 ? "нове повідомлення" : "нових повідомлень"}
        </button>
      )}
    </div>
  );
}
