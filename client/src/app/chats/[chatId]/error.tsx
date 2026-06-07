"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary для chat-сторінки [chatId]. Ловить помилки тільки тут —
 * sidebar лишається видимим (бо помилка не runtime для всього layout).
 *
 * Use cases: 404 chat-у, 403 forbidden, network error, etc.
 */
export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Chat error:", error);
  }, [error]);

  return (
    <div className="flex h-svh flex-1 items-center justify-center p-6">
      <div className="max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card/60 backdrop-blur-sm">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Не вдалося завантажити чат
          </h2>
          <p className="text-sm text-muted-foreground">
            Можливо, чат був видалений або у вас немає доступу.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="sunset" size="sm" onClick={reset}>
            <RotateCw className="mr-1.5 h-3.5 w-3.5" />
            Спробувати ще раз
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/chats">До списку</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
