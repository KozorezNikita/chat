"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, X, Play, Pause, Send, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils/file-display";
import { cn } from "@/lib/utils";
import type { RecorderState } from "@/hooks/use-voice-recorder";

interface VoiceRecorderUIProps {
  state: RecorderState;
  duration: number;
  blob: Blob | null;
  isSending: boolean;
  onStop: () => void;
  onCancel: () => void;
  onSend: () => void;
}

/**
 * UI bar що замінює textarea+send коли recording/recorded.
 *
 * Recording state:
 *   [✕]  [● 0:15 pulsing dot]  [■ stop]
 *
 * Recorded state:
 *   [✕]  [▶ 0:34 preview]  [send →]
 *
 * Бар висотою рівний textarea-row (40-44px) щоб layout не стрибав
 * при переключенні recording mode ↔ text mode.
 */
export function VoiceRecorderUI({
  state,
  duration,
  blob,
  isSending,
  onStop,
  onCancel,
  onSend,
}: VoiceRecorderUIProps) {
  // Object URL для preview playback — створюється тільки після stop
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!blob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  // Зупиняємо playback якщо blob міняється або компонент unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {/* Cancel */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onCancel}
        disabled={isSending}
        aria-label="Скасувати"
      >
        <X className="h-4 w-4" />
      </Button>

      {/* Middle: timer + (preview controls if recorded) */}
      <div className="flex h-10 flex-1 items-center gap-3 rounded-md border border-input bg-background px-3">
        {state === "recording" ? (
          <>
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full bg-destructive",
                "animate-pulse",
              )}
              aria-label="Іде запис"
            />
            <span className="text-sm tabular-nums text-foreground">
              {formatDuration(duration)}
            </span>
            <span className="text-xs text-muted-foreground">Іде запис...</span>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={togglePlayback}
              disabled={!previewUrl || isSending}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunset text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              aria-label={isPlaying ? "Пауза" : "Відтворити"}
            >
              {isPlaying ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </button>
            <span className="text-sm tabular-nums text-foreground">
              {formatDuration(duration)}
            </span>
            <span className="text-xs text-muted-foreground">Готово</span>
          </>
        )}

        {/* Hidden audio element для preview playback */}
        {previewUrl && (
          <audio
            ref={audioRef}
            src={previewUrl}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            className="hidden"
          />
        )}
      </div>

      {/* Right action: stop (recording) | send (recorded) */}
      {state === "recording" ? (
        <Button
          type="button"
          variant="sunset"
          size="icon"
          onClick={onStop}
          aria-label="Зупинити запис"
        >
          <Square className="h-4 w-4 fill-current" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="sunset"
          size="icon"
          onClick={onSend}
          disabled={isSending || !blob}
          aria-label="Надіслати"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

/**
 * Окрема кнопка-trigger 🎤 для запуску recording — рендериться у MessageInput
 * поруч з paperclip коли state === "idle".
 */
interface VoiceRecorderTriggerProps {
  onStart: () => void;
  disabled?: boolean;
}

export function VoiceRecorderTrigger({ onStart, disabled }: VoiceRecorderTriggerProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onStart}
      disabled={disabled}
      aria-label="Записати голосове повідомлення"
      title="Голосове повідомлення"
    >
      <Mic className="h-4 w-4" />
    </Button>
  );
}
