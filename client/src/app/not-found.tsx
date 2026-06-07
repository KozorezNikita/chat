import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Global 404 — викликається коли немає route match або через notFound().
 * У стилі sunset gradient — consistent з рештою app.
 */
export default function NotFoundPage() {
  return (
    <div className="relative flex h-svh items-center justify-center overflow-hidden p-6">
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

      <div className="max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-card/60 backdrop-blur-sm">
          <FileQuestion className="h-9 w-9 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <h1 className="bg-sunset bg-clip-text text-5xl font-bold tracking-tight text-transparent">
            404
          </h1>
          <h2 className="text-xl font-semibold tracking-tight">Сторінку не знайдено</h2>
          <p className="text-sm text-muted-foreground">
            Можливо, посилання застаріло або сторінка була видалена.
          </p>
        </div>

        <Button asChild variant="sunset">
          <Link href="/chats">На головну</Link>
        </Button>
      </div>
    </div>
  );
}
