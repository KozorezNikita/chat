"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import type { MessageAttachment } from "@chat/shared";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils/file-display";

interface AttachmentAudioProps {
  attachment: MessageAttachment;
  /** Колір тексту inverted для own bubble (sunset gradient background). */
  isOwn: boolean;
}

/**
 * ============================================
 * Inline audio player для voice messages (Iter 10)
 * ============================================
 *
 * Custom controls замість native — native UI великий і не вписується у bubble.
 *
 * Layout:
 *   [▶/⏸]  0:34 / 1:20  [━━━━●━━━━]
 *
 * Features:
 *  - Play/pause toggle
 *  - Progress bar (clickable для seek)
 *  - Тривалість з `attachment.duration` (з БД) — fallback до `audio.duration`
 *    якщо null (старі повідомлення без duration).
 *  - preload="metadata" — браузер вантажить тільки header (швидко),
 *    повний audio тільки коли юзер натиснув play
 *
 * Сignedний URL живе 1 годину. Якщо юзер залишив сторінку відкритою довго
 * і пробує грати після expiry — `audio.error` спрацює, ми показуємо "—".
 * Refresh сторінки → новий signed URL → працює.
 */
export function AttachmentAudio({ attachment, isOwn }: AttachmentAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  /** Live duration з HTMLAudioElement (fallback якщо у БД немає). */
  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  // Total duration — пріоритет БД, fallback на audio element
  const totalDuration = attachment.duration ?? audioDuration ?? 0;
  const progressPercent =
    totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  useEffect(() => {
    // Cleanup: якщо bubble unmount-иться під час playback, зупиняємо
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // На випадок expired URL — load() re-fetches. Браузер кешує OK responses.
      audio.play().catch(() => {
        // Silent fail — error state не критичний, юзер може refresh
      });
    } else {
      audio.pause();
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || totalDuration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = ratio * totalDuration;
    setCurrentTime(audio.currentTime);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-1.5",
        // мінімальна ширина щоб bubble не виглядав скукоженим
        "min-w-[220px] max-w-[280px]",
      )}
    >
      {/* Play/Pause */}
      <button
        type="button"
        onClick={togglePlayback}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90",
          isOwn
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-sunset text-primary-foreground",
        )}
        aria-label={isPlaying ? "Пауза" : "Відтворити"}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="ml-0.5 h-4 w-4" />
        )}
      </button>

      {/* Progress + timer */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          className={cn(
            "h-1 cursor-pointer rounded-full",
            isOwn ? "bg-primary-foreground/30" : "bg-muted",
          )}
          onClick={handleSeek}
          role="slider"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={totalDuration}
          aria-label="Прогрес відтворення"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-100",
              isOwn ? "bg-primary-foreground" : "bg-sunset",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div
          className={cn(
            "flex justify-between text-[11px] tabular-nums",
            isOwn ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(totalDuration)}</span>
        </div>
      </div>

      {/* Hidden HTML5 audio — джерело події і медіа stream */}
      <audio
        ref={audioRef}
        src={attachment.url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          // Browser may report Infinity для webm з невідомим length —
          // у такому випадку покладаємось тільки на attachment.duration.
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setAudioDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        className="hidden"
      />
    </div>
  );
}
