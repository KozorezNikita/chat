import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Класична shadcn-обгортка: clsx для умовних класів + tailwind-merge для
 * розв'язання конфліктів утиліт ("p-2 p-4" → "p-4").
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
