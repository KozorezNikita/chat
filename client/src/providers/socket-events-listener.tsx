"use client";

import { useSocketEvents } from "@/hooks/use-socket-events";

/**
 * Mount-only компонент — викликає глобальний socket-events hook.
 * Існує бо useSocketEvents — це hook, його треба запускати у клієнт-компоненті,
 * а layout залишається серверним.
 */
export function SocketEventsListener() {
  useSocketEvents();
  return null;
}
