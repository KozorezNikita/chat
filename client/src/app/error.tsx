"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Global error boundary — ловить runtime errors всюди.
 *
 * Має бути client component (Next.js обмеження).
 * Приймає `reset` — викликання перепарентовує subtree і re-render-ить.
 *
 * У dev показуємо error.message для debug. У prod — generic message
 * щоб не leak-нути internal деталі.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log у console — у prod з Sentry/etc можна було б .captureException(error)
    console.error("Unhandled error:", error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="relative flex h-svh items-center justify-center overflow-hidden p-6">
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

      <div className="max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-card/60 backdrop-blur-sm">
          <AlertTriangle className="h-9 w-9 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Щось пішло не так</h1>
          <p className="text-sm text-muted-foreground">
            Ми вже знаємо про проблему. Спробуйте ще раз або поверніться на головну.
          </p>
          {isDev && (
            <pre className="mt-4 max-h-32 overflow-auto rounded border border-border bg-muted/40 p-2 text-left text-xs text-muted-foreground">
              {error.message}
            </pre>
          )}
        </div>

        <div className="flex justify-center gap-2">
          <Button variant="sunset" onClick={reset}>
            <RotateCw className="mr-2 h-4 w-4" />
            Спробувати ще раз
          </Button>
          <Button asChild variant="outline">
            <Link href="/chats">На головну</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
