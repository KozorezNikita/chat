"use client";

import { useState } from "react";
import type { MessageAttachment } from "@chat/shared";

import { cn } from "@/lib/utils";
import { Lightbox } from "./lightbox";

interface AttachmentImageProps {
  attachment: MessageAttachment;
  /** Caption з message.content — показуємо у lightbox під фото. */
  caption?: string | null;
  className?: string;
}

const MAX_DISPLAY_WIDTH = 320;
const MAX_DISPLAY_HEIGHT = 320;

/**
 * Inline image у bubble. thumbUrl якщо є, інакше повний url.
 * Click → відкриває lightbox з full-resolution image.
 *
 * Aspect ratio reservation через placeholder div — щоб layout не стрибав
 * при load. Якщо width/height не задані (старі messages) — скейлимо
 * через max-width/height без reservation.
 */
export function AttachmentImage({ attachment, caption, className }: AttachmentImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Розрахунок display dimensions з aspect ratio (якщо є)
  let displayWidth: number | undefined;
  let displayHeight: number | undefined;
  if (attachment.width && attachment.height) {
    const ratio = attachment.width / attachment.height;
    if (ratio >= 1) {
      displayWidth = Math.min(attachment.width, MAX_DISPLAY_WIDTH);
      displayHeight = displayWidth / ratio;
    } else {
      displayHeight = Math.min(attachment.height, MAX_DISPLAY_HEIGHT);
      displayWidth = displayHeight * ratio;
    }
  }

  const previewUrl = attachment.thumbUrl ?? attachment.url;

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className={cn(
          "block overflow-hidden rounded-lg transition-opacity hover:opacity-90",
          className,
        )}
        style={
          displayWidth && displayHeight
            ? { width: `${displayWidth}px`, height: `${displayHeight}px` }
            : undefined
        }
        aria-label={`Переглянути ${attachment.name}`}
      >
        <img
          src={previewUrl}
          alt={attachment.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </button>

      {lightboxOpen && (
        <Lightbox
          url={attachment.url}
          alt={attachment.name}
          caption={caption}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
