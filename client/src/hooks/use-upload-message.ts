"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SentMessageResponse } from "@chat/shared";

import { uploadMessageWithFile } from "@/lib/api/message";

/**
 * ============================================
 * useUploadMessage — TanStack mutation для file upload
 * ============================================
 *
 * Чому не optimistic: бо файл фізично треба завантажити (секунди),
 * показати progress, і при rollback не лишити "пустий" message у кеші.
 *
 * Замість optimistic: повертаємо `progress` state — UI показує bar.
 * Після success → invalidate ['messages', chatId] — новий message підвантажиться.
 *
 * Alternative: handle через socket message:new broadcast — він приходить
 * автоматично (з clientId для дедуплікації). Тому InvalidateQueries навіть
 * не обов'язково — socket уже додасть message у кеш. Але invalidate
 * безпечніше якщо WS пропускає frame.
 */

interface UploadInput {
  file: File;
  clientId: string;
  content?: string;
  parentMessageId?: string;
  /** Тривалість audio у секундах (Iter 10). Опційно — тільки для voice messages. */
  duration?: number;
}

export function useUploadMessage(chatId: string) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);

  const mutation = useMutation<{ message: SentMessageResponse }, Error, UploadInput>({
    mutationFn: (input) => {
      setProgress(0);
      return uploadMessageWithFile(chatId, input, setProgress);
    },
    onSuccess: () => {
      setProgress(100);
      // Socket message:new зазвичай приходить швидше за HTTP response, але
      // invalidate як страховка — раптом socket пропустив event.
      qc.invalidateQueries({ queryKey: ["messages", chatId] });
    },
    onSettled: () => {
      // Reset progress після завершення (success або error)
      setTimeout(() => setProgress(0), 500);
    },
  });

  return {
    upload: mutation.mutateAsync,
    isUploading: mutation.isPending,
    progress,
    error: mutation.error,
  };
}
