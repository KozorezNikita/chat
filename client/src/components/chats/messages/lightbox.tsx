"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface LightboxProps {
  url: string;
  alt: string;
  caption?: string | null;
  onClose: () => void;
}

/**
 * ============================================
 * Lightbox — fullscreen image viewer
 * ============================================
 *
 * Простий overlay на весь viewport:
 *  - Click backdrop → close
 *  - Click image → не закриває (щоб юзер міг "потримати" фото)
 *  - Escape → close
 *  - X button у верхньому правому кутку
 *
 * Caption (опційно) — внизу під image на чорному фоні з transparency.
 */
export function Lightbox({ url, alt, caption, onClose }: LightboxProps) {
  // Escape closes
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    // Заборона scroll body поки lightbox відкритий
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Перегляд зображення"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        aria-label="Закрити"
      >
        <X className="h-5 w-5" />
      </button>

      <img
        src={url}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {caption && (
        <div
          className="mt-4 max-w-[90vw] rounded-md bg-black/40 px-4 py-2 text-sm text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
