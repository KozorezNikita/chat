"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ============================================
 * useVoiceRecorder — MediaRecorder API wrapper
 * ============================================
 *
 * State machine:
 *   idle → recording → recorded
 *        ↘ cancel → idle
 *
 * Browser support:
 *   - Chrome/Firefox/Edge: audio/webm;codecs=opus (native)
 *   - Safari macOS 14.1+ / iOS 14.5+: audio/mp4 fallback
 *
 * Permission:
 *   getUserMedia({audio:true}) запитує дозвіл вперше; результат кеш у браузері.
 *   Deny → error.message містить пояснення.
 *
 * Auto-stop:
 *   При досягненні maxDuration автоматично викликає stop() → blob готовий.
 */

export type RecorderState = "idle" | "recording" | "recorded";

interface UseVoiceRecorderOptions {
  /** Максимальна тривалість у секундах. За замовчуванням 120 (2 хв). */
  maxDuration?: number;
}

interface UseVoiceRecorderResult {
  state: RecorderState;
  /** Поточна тривалість у секундах (оновлюється раз/сек). */
  duration: number;
  /** Готовий Blob після stop(); null до того або після cancel(). */
  blob: Blob | null;
  /** MIME який використовується для запису. Передаємо разом з blob у upload. */
  mimeType: string | null;
  /** Error від getUserMedia або MediaRecorder; null якщо OK. */
  error: Error | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

/**
 * Список MIME у порядку preference. Перевіряємо по черзі — перший supported.
 */
const MIME_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

function pickSupportedMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MIME_PREFERENCES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function useVoiceRecorder(
  options: UseVoiceRecorderOptions = {},
): UseVoiceRecorderResult {
  const maxDuration = options.maxDuration ?? 120;

  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs щоб не depend на closure-stale значеннях у callback-ах
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Підбирає всі активні ресурси: stream tracks, interval, timeout, recorder.
   * Викликається з cancel, stop, unmount.
   */
  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    // recorder.stop() трігерить 'dataavailable' (final chunk) + 'stop' events.
    // У 'stop' handler ми збираємо chunks → Blob → state=recorded.
    recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    cleanup();
    chunksRef.current = [];
    setBlob(null);
    setMimeType(null);
    setDuration(0);
    setState("idle");
    setError(null);
  }, [cleanup]);

  const start = useCallback(async () => {
    if (state === "recording") return;

    setError(null);
    setBlob(null);
    setDuration(0);
    chunksRef.current = [];

    const supportedMime = pickSupportedMime();
    if (!supportedMime) {
      setError(new Error("Ваш браузер не підтримує запис аудіо"));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Дозвольте доступ до мікрофону у налаштуваннях браузера"
          : err instanceof Error
            ? err.message
            : "Не вдалося отримати доступ до мікрофону";
      setError(new Error(message));
      return;
    }

    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType: supportedMime });
    mediaRecorderRef.current = recorder;
    setMimeType(supportedMime);

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    });

    recorder.addEventListener("stop", () => {
      const finalBlob = new Blob(chunksRef.current, { type: supportedMime });
      setBlob(finalBlob);
      setState("recorded");

      // Звільняємо stream одразу після того як зібрали blob — мікрофон
      // більше не потрібен (юзер може ще не натиснув send, але recording завершено).
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
        maxDurationTimeoutRef.current = null;
      }
    });

    recorder.addEventListener("error", (event) => {
      const evt = event as Event & { error?: Error };
      setError(evt.error ?? new Error("Помилка запису"));
      cleanup();
      setState("idle");
    });

    recorder.start();
    setState("recording");

    // Timer оновлює duration раз/сек
    const startedAt = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setDuration(elapsed);
    }, 250); // 250ms — UI smooth але не overkill

    // Auto-stop при досягненні maxDuration
    maxDurationTimeoutRef.current = setTimeout(() => {
      stop();
    }, maxDuration * 1000);
  }, [state, maxDuration, cleanup, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { state, duration, blob, mimeType, error, start, stop, cancel };
}
