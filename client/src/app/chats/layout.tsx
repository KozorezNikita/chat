"use client";

import { Loader2 } from "lucide-react";

import { useMe } from "@/hooks/use-auth";
import { ChatsSidebar } from "@/components/chats/chats-sidebar";

/**
 * Layout для всіх /chats сторінок.
 *
 * Auth-guard:
 *  - Middleware пасивно redirect-ить незалогіненого, але якщо щось
 *    збоїло (наприклад, accessToken cookie експайрнувся між requests) —
 *    useMe поверне null і ми покажемо loading skeleton.
 *  - Не робимо тут router.push, бо middleware це робить швидше.
 *
 * Layout: sidebar (320px) зліва, дитячі сторінки справа.
 * Background — той самий sunset radial як на стартовій.
 */
export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // useMe data === null означає що юзер не залогінений (axios interceptor
  // вже спрацював). Middleware має redirect-ити, але як safety net показуємо
  // повідомлення.
  if (!data?.user) {
    return (
      <div className="flex h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Перенаправлення на login...</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-svh overflow-hidden">
      {/* Декоративний фон */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-30 dark:opacity-50"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 50% at 20% 10%, oklch(0.55 0.22 350 / 0.4), transparent 60%),
            radial-gradient(ellipse 50% 40% at 85% 80%, oklch(0.7 0.16 55 / 0.3), transparent 60%)
          `,
        }}
      />

      <ChatsSidebar user={data.user} />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
