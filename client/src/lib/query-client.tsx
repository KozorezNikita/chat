"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AUTH_FAILED_EVENT } from "./api/client";

/**
 * QueryClient provider + listener на auth-failed event.
 *
 * Коли axios interceptor виявляє провал refresh-у — кидає CustomEvent.
 * Тут ми його ловимо і інвалідуємо `me` query — UI миттєво бачить
 * що юзер не залогінений (useMe поверне null), і компоненти що
 * захищають доступ перенаправлять на /auth/login.
 *
 * Чому через event, а не прямий import: axios client живе у
 * lib/api/client.ts (server-safe), QueryClient — це React-only.
 * Event розриває залежність.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 хв до повторного fetch
            retry: (failureCount, error) => {
              // Не retry на 401 — це наш auth-flow, retry зашкодить
              if (
                typeof error === "object" &&
                error !== null &&
                "response" in error &&
                (error as { response?: { status?: number } }).response?.status === 401
              ) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Не retry мутації автоматично — ризикуємо подвоїти запит
            retry: false,
          },
        },
      }),
  );

  useEffect(() => {
    function handleAuthFailed() {
      // Просто стираємо стан юзера. НЕ робимо invalidate — це б запустило
      // новий fetch на /me який знову поверне 401 → знов handleAuthFailed →
      // нескінченний цикл на сторінках де є useMe (наприклад, головна).
      queryClient.setQueryData(["me"], null);
    }

    window.addEventListener(AUTH_FAILED_EVENT, handleAuthFailed);
    return () => {
      window.removeEventListener(AUTH_FAILED_EVENT, handleAuthFailed);
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
