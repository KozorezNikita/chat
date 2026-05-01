"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Обгортка над next-themes:
 * - attribute="class" — кладе .dark на <html>
 * - defaultTheme="dark" — Sunset gradient за замовчуванням темний
 * - enableSystem — поважаємо налаштування OS
 * - disableTransitionOnChange — без миготіння при перемиканні
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
