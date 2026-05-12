"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

import { useSocket } from "@/providers/socket-provider";
import { useMe } from "@/hooks/use-auth";

/**
 * ============================================
 * TypingProvider — receiver-side state
 * ============================================
 *
 * Слухає `typing:start` / `typing:stop` від сервера і веде Map:
 *   chatId → Set<userId>
 *
 * Експортує hook useTypingUsers(chatId) що повертає масив userId-ів
 * які зараз пишуть у цьому чаті (без поточного юзера).
 *
 * Safety timeout: 5 сек на кожен (chatId, userId). Якщо `typing:stop` не
 * прийшов (мережа впала), запис автоматично прибирається.
 *
 * Чому окремий Provider а не у useSocketEvents:
 *  - useSocketEvents зайнятий cache updates для TanStack Query
 *  - typing — це окремий ephemeral state поза cache
 *  - Чисто розділяються concerns
 */

const TYPING_SAFETY_TTL_MS = 5000;

type TypingMap = Map<string, Set<string>>; // chatId → Set<userId>

interface TypingContextValue {
  getTypingUsers: (chatId: string) => string[];
  /** Реактивний tick — змінюється при кожному додаванні/видаленні. */
  version: number;
}

const TypingContext = createContext<TypingContextValue | null>(null);

export function TypingProvider({ children }: { children: React.ReactNode }) {
  const socket = useSocket();
  const { data: meData } = useMe();
  const currentUserId = meData?.user?.id;

  // Map зберігаємо у ref щоб не trigger-ити re-render при кожному оновленні.
  // Натомість через окремий `version` state форсуємо re-renders.
  const typingMapRef = useRef<TypingMap>(new Map());
  const timeoutMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const removeTyping = useCallback(
    (chatId: string, userId: string) => {
      const set = typingMapRef.current.get(chatId);
      if (!set) return;
      if (!set.has(userId)) return;
      set.delete(userId);
      if (set.size === 0) typingMapRef.current.delete(chatId);

      const timerKey = `${chatId}:${userId}`;
      const timer = timeoutMapRef.current.get(timerKey);
      if (timer) {
        clearTimeout(timer);
        timeoutMapRef.current.delete(timerKey);
      }

      bump();
    },
    [bump],
  );

  useEffect(() => {
    if (!currentUserId) return;

    function handleTypingStart(payload: { chatId: string; userId: string }) {
      // Ігноруємо власні emits
      if (payload.userId === currentUserId) return;

      let set = typingMapRef.current.get(payload.chatId);
      if (!set) {
        set = new Set();
        typingMapRef.current.set(payload.chatId, set);
      }
      const wasAdded = !set.has(payload.userId);
      set.add(payload.userId);

      // Reset / set safety timeout
      const timerKey = `${payload.chatId}:${payload.userId}`;
      const existingTimer = timeoutMapRef.current.get(timerKey);
      if (existingTimer) clearTimeout(existingTimer);

      const newTimer = setTimeout(() => {
        removeTyping(payload.chatId, payload.userId);
      }, TYPING_SAFETY_TTL_MS);

      timeoutMapRef.current.set(timerKey, newTimer);

      if (wasAdded) bump();
    }

    function handleTypingStop(payload: { chatId: string; userId: string }) {
      if (payload.userId === currentUserId) return;
      removeTyping(payload.chatId, payload.userId);
    }

    socket.on("typing:start", handleTypingStart);
    socket.on("typing:stop", handleTypingStop);

    return () => {
      socket.off("typing:start", handleTypingStart);
      socket.off("typing:stop", handleTypingStop);
    };
  }, [socket, currentUserId, bump, removeTyping]);

  // Cleanup всіх timers при unmount provider-а
  useEffect(() => {
    const timeouts = timeoutMapRef.current;
    return () => {
      for (const timer of timeouts.values()) clearTimeout(timer);
      timeouts.clear();
    };
  }, []);

  const getTypingUsers = useCallback(
    (chatId: string): string[] => {
      const set = typingMapRef.current.get(chatId);
      if (!set) return [];
      return Array.from(set);
    },
    // version у dep-array щоб memo invalidating при змінах
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return (
    <TypingContext.Provider value={{ getTypingUsers, version }}>
      {children}
    </TypingContext.Provider>
  );
}

export function useTypingUsers(chatId: string): string[] {
  const ctx = useContext(TypingContext);
  if (!ctx) {
    throw new Error("useTypingUsers must be used within TypingProvider");
  }
  // Доступ до version — щоб React re-render-ив компонент при змінах
  void ctx.version;
  return ctx.getTypingUsers(chatId);
}
