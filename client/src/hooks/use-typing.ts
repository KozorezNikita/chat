"use client";

import { useCallback, useEffect, useRef } from "react";

import { useSocket } from "@/providers/socket-provider";

/**
 * ============================================
 * useTyping — клієнтська логіка typing-indicator
 * ============================================
 *
 * Що робить:
 *  - На перший keystroke emit `typing:start`
 *  - Поки юзер набирає — emit повторно раз на 2 сек (keepalive, щоб
 *    server-side state не expir-нувся, якщо ми колись додамо такий)
 *  - Через 3 сек без keystroke — emit `typing:stop`
 *  - На onSend / onClear — миттєвий emit `typing:stop`
 *  - При unmount або зміні chatId — миттєвий stop у попередньому чаті
 *
 * Reasoning:
 *  - 2с keepalive < 3с timeout у server-state — щоб TTL не закінчувався
 *  - 3с stop-timeout — достатньо щоб НЕ blink-ало при пауза-літера-пауза
 *  - Server має додатково throttle (1/sec) як захист від abuse
 */

const KEEPALIVE_INTERVAL_MS = 2000;
const STOP_TIMEOUT_MS = 3000;

export function useTyping(chatId: string) {
  const socket = useSocket();

  // Стейт зберігаємо у refs щоб уникати re-renders при кожному keystroke
  const isTypingRef = useRef(false);
  const keepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Очистити обидва таймери
  const clearTimers = useCallback(() => {
    if (keepaliveTimerRef.current) {
      clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  // Внутрішня функція: emit stop і скидаємо стейт
  const sendStop = useCallback(() => {
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    clearTimers();
    socket.emit("typing:stop", { chatId });
  }, [socket, chatId, clearTimers]);

  // Викликаємо коли юзер набирає у input
  const onKeyPress = useCallback(() => {
    if (!isTypingRef.current) {
      // Перший keystroke — emit start
      isTypingRef.current = true;
      socket.emit("typing:start", { chatId });

      // Keepalive — повторюємо start раз на 2с поки юзер пише
      keepaliveTimerRef.current = setInterval(() => {
        socket.emit("typing:start", { chatId });
      }, KEEPALIVE_INTERVAL_MS);
    }

    // Reset stop-timer на кожен keystroke
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(sendStop, STOP_TIMEOUT_MS);
  }, [socket, chatId, sendStop]);

  // Викликати після успішного send
  const onSend = useCallback(() => {
    sendStop();
  }, [sendStop]);

  // Викликати коли поле очищено вручну
  const onClear = useCallback(() => {
    sendStop();
  }, [sendStop]);

  // Cleanup: коли chatId змінюється або компонент unmount-ується —
  // одразу stop у попередньому чаті
  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        socket.emit("typing:stop", { chatId });
      }
      clearTimers();
      isTypingRef.current = false;
    };
  }, [socket, chatId, clearTimers]);

  return { onKeyPress, onSend, onClear };
}
