"use client";

import { usePresence } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";

interface OnlineDotProps {
  userId: string;
  /** Розмір — за замовчуванням 10px (sidebar). Можна передати "lg" для аватарів у header. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Зелена крапочка показує що юзер online. Поки offline — нічого не рендериться.
 *
 * Позиціонування: absolute, передбачає що батько `position: relative`
 * (зазвичай аватар-обгортка).
 *
 * Border 2px — щоб виділялась на будь-якому background-кольорі аватара.
 */
export function OnlineDot({ userId, size = "sm", className }: OnlineDotProps) {
  const presence = usePresence(userId);

  if (!presence?.online) return null;

  const sizeClasses = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <span
      className={cn(
        "absolute bottom-0 right-0 rounded-full bg-emerald-500 ring-2 ring-background",
        sizeClasses,
        className,
      )}
      aria-label="онлайн"
    />
  );
}
