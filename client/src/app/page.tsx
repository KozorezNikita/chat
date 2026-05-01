import { MessageCircle, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Стартова сторінка — welcome screen.
 *
 * У наступних ітераціях:
 *  - Ітерація 1: тут будуть кнопки Sign in / Sign up
 *  - Ітерація 2: redirect авторизованих юзерів на /chats
 *
 * Поки що — просто красивий екран щоб подивитись як палітра живе.
 */
export default function HomePage() {
  return (
    <div className="relative min-h-svh overflow-hidden">
      {/* Декоративний радіальний градієнт на фоні — додає глибини темному фону */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-40 dark:opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 50% at 20% 10%, oklch(0.55 0.22 350 / 0.4), transparent 60%),
            radial-gradient(ellipse 50% 40% at 85% 80%, oklch(0.7 0.16 55 / 0.3), transparent 60%)
          `,
        }}
      />

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/50 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunset">
            <MessageCircle className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">Chat</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Hero */}
      <main className="mx-auto flex max-w-4xl flex-col items-center px-6 py-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span>Iteration 0 · Foundation ready</span>
        </div>

        <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
          Real-time chat,
          <br />
          <span className="bg-sunset bg-clip-text text-transparent">
            built right.
          </span>
        </h1>

        <p className="mb-10 max-w-xl text-balance text-lg text-muted-foreground">
          Threads, reactions, presence, file sharing, full-text search. Все що
          ти очікуєш від сучасного месенджера, з нормальною архітектурою під
          капотом.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" variant="sunset" disabled>
            Get started
          </Button>
          <Button size="lg" variant="outline" disabled>
            Sign in
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          (кнопки disabled — auth з'явиться в Ітерації 1)
        </p>
      </main>

      {/* Feature preview */}
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-card/60 backdrop-blur-sm">
            <CardHeader>
              <Zap className="mb-2 h-5 w-5 text-primary" />
              <CardTitle className="text-base">Real-time</CardTitle>
              <CardDescription>
                Socket.io з reconnect-логікою і дедуплікацією повідомлень.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-card/60 backdrop-blur-sm">
            <CardHeader>
              <Sparkles className="mb-2 h-5 w-5 text-accent" />
              <CardTitle className="text-base">Threads & reactions</CardTitle>
              <CardDescription>
                Slack-style гілки розмов і emoji-реакції з real-time оновленням.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-card/60 backdrop-blur-sm">
            <CardHeader>
              <MessageCircle className="mb-2 h-5 w-5 text-primary" />
              <CardTitle className="text-base">Presence</CardTitle>
              <CardDescription>
                Online/offline через Redis з підтримкою кількох вкладок.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </div>
  );
}
