import { Loader2 } from "lucide-react";

/**
 * Global Suspense fallback — спрацьовує під час навігації.
 *
 * Простий centered spinner у sunset-кольорі. Skeleton-state для конкретних сторінок
 * (chat list, messages) робиться окремо у відповідних компонентах.
 */
export default function Loading() {
  return (
    <div className="flex h-svh items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
