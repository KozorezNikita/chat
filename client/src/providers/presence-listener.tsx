"use client";

import { useGlobalPresencePolling } from "@/hooks/use-presence";

/**
 * Mount-only компонент — стартує глобальний presence polling.
 * Має бути всередині QueryProvider (TanStack потребує QueryClient у tree).
 */
export function PresenceListener() {
  useGlobalPresencePolling();
  return null;
}
