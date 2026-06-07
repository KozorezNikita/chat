"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Обгортка над next-themes:
 * - attribute="class" — кладе .dark на <html>
 * - defaultTheme="system" — поважаємо налаштування OS на першому візиті,
 *   юзер може override через ThemeToggle, вибір збережеться у localStorage
 * - enableSystem — дозволяє "system" як один з варіантів
 * - disableTransitionOnChange — без миготіння при перемиканні
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
