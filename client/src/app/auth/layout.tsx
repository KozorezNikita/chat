import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Layout для всіх auth-сторінок (/auth/login, /auth/register, ...).
 *
 * Centered card до 480px шириною. Той самий декоративний радіальний
 * градієнт як на стартовій — для візуальної consistency.
 *
 * Logo вгорі — клік повертає на /.
 * Theme toggle у правому верхньому куті.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-hidden">
      {/* Декоративний радіальний фон — той самий що на / */}
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
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunset">
            <MessageCircle className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">Chat</span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Content */}
      <main className="flex min-h-[calc(100svh-65px)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-[480px]">{children}</div>
      </main>
    </div>
  );
}
