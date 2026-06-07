"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import type { MeUser } from "@chat/shared";

import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/hooks/use-messages";
import { useUploadMessage } from "@/hooks/use-upload-message";
import { useTyping } from "@/hooks/use-typing";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useReply } from "@/providers/reply-provider";
import { createOptimisticMessage } from "@/lib/utils/message-utils";
import { getErrorMessage } from "@/lib/api/errors";
import { validateFile, ALLOWED_MIME_TYPES } from "@/lib/utils/file-validation";
import { ReplyBanner } from "./reply-banner";
import { AttachmentPreview } from "./attachment-preview";
import { VoiceRecorderUI, VoiceRecorderTrigger } from "./voice-recorder-ui";

interface MessageInputProps {
  chatId: string;
  user: MeUser;
  /** File from drop-zone (overrides internal file-picker state). */
  externalFile?: File | null;
  /** Колбек коли input відпрацював drop-zone file (success або cancel). */
  onExternalFileConsumed?: () => void;
}

/**
 * Текстове поле + кнопки для file upload + voice recording.
 *
 * Modes:
 *  - text-only: textarea → useSendMessage (existing flow)
 *  - with attachment: textarea = caption, send → useUploadMessage
 *  - voice (Iter 10): запис через MediaRecorder, send → useUploadMessage з audio/webm
 *
 * Layout під час voice recording — full-width VoiceRecorderUI заміняє увесь
 * row (textarea + buttons), щоб юзер не плутав controls. Reply banner і
 * attachment preview також ховаються коли запис активний.
 *
 * Keyboard:
 *  - Enter → send (text або з attachment)
 *  - Shift+Enter → newline
 *  - Escape → скасувати reply / прибрати attachment / cancel запис
 */
export function MessageInput({
  chatId,
  user,
  externalFile,
  onExternalFileConsumed,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendMessage = useSendMessage(chatId);
  const upload = useUploadMessage(chatId);
  const typing = useTyping(chatId);
  const voice = useVoiceRecorder({ maxDuration: 120 });
  const { replyingTo, setReplyingTo } = useReply();

  // Показуємо помилки запису як toast
  useEffect(() => {
    if (voice.error) {
      toast.error(voice.error.message);
    }
  }, [voice.error]);

  // Sync external file (з drop-zone) у локальний state
  useEffect(() => {
    if (externalFile) {
      const validation = validateFile(externalFile);
      if (!validation.ok) {
        toast.error(validation.error);
        onExternalFileConsumed?.();
        return;
      }
      setSelectedFile(externalFile);
      onExternalFileConsumed?.();
      textareaRef.current?.focus();
    }
  }, [externalFile, onExternalFileConsumed]);

  // Auto-focus textarea коли юзер вибрав reply target
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  const isPending = sendMessage.isPending || upload.isUploading;
  const isVoiceMode = voice.state !== "idle";

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (selectedFile) {
        setSelectedFile(null);
      } else if (replyingTo) {
        setReplyingTo(null);
      }
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    setSelectedFile(file);
    textareaRef.current?.focus();
  }

  async function handleSendVoice() {
    if (!voice.blob || !voice.mimeType || isPending) return;

    const blob = voice.blob;
    const mime = voice.mimeType;
    const duration = voice.duration;
    const clientId = crypto.randomUUID();
    const parentMessageId = replyingTo?.id;

    // Файл-extension з mime — для UI display ("voice-{timestamp}.webm")
    // Сам mime передається у File constructor → backend бачить правильний.
    // ";codecs=opus" суфікс прибираємо для File.type → backend whitelist приймає.
    const baseType = mime.split(";")[0] ?? mime;
    const ext = baseType.includes("webm") ? "webm" : baseType.includes("mp4") ? "m4a" : "ogg";
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: baseType });

    voice.cancel(); // reset recorder state ще ДО запиту — UI moves back to idle
    setReplyingTo(null);

    try {
      await upload.upload({
        file,
        clientId,
        duration,
        ...(parentMessageId ? { parentMessageId } : {}),
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleSend() {
    if (isPending) return;

    const trimmed = content.trim();
    const clientId = crypto.randomUUID();
    const parentMessageId = replyingTo?.id;

    // Branch: з attachment vs text-only
    if (selectedFile) {
      const file = selectedFile;
      setContent("");
      setSelectedFile(null);
      setReplyingTo(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      typing.onSend();

      try {
        await upload.upload({
          file,
          clientId,
          ...(trimmed ? { content: trimmed } : {}),
          ...(parentMessageId ? { parentMessageId } : {}),
        });
      } catch (err) {
        toast.error(getErrorMessage(err));
        setSelectedFile(file);
        setContent(trimmed);
      }
      return;
    }

    if (!trimmed) return;

    const parentPreview = replyingTo;
    const optimistic = createOptimisticMessage(
      clientId,
      chatId,
      trimmed,
      {
        id: user.id,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
      parentPreview,
    );

    setContent("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setReplyingTo(null);
    typing.onSend();

    try {
      await sendMessage.mutateAsync({
        dto: {
          clientId,
          content: trimmed,
          ...(parentMessageId ? { parentMessageId } : {}),
        },
        optimisticMessage: optimistic,
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setContent(trimmed);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    setContent(newValue);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;

    if (newValue.length > 0) {
      typing.onKeyPress();
    } else {
      typing.onClear();
    }
  }

  const canSend = (content.trim().length > 0 || selectedFile !== null) && !isPending;

  // Voice mode: full-width VoiceRecorderUI замість default row
  if (isVoiceMode) {
    return (
      <div className="border-t border-border bg-background/60 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl">
          <VoiceRecorderUI
            state={voice.state}
            duration={voice.duration}
            blob={voice.blob}
            isSending={upload.isUploading}
            onStop={voice.stop}
            onCancel={voice.cancel}
            onSend={handleSendVoice}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-background/60 backdrop-blur-sm">
      <ReplyBanner />
      {selectedFile && (
        <AttachmentPreview
          file={selectedFile}
          onRemove={() => setSelectedFile(null)}
          progress={upload.isUploading ? upload.progress : null}
        />
      )}
      <div className="p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={Array.from(ALLOWED_MIME_TYPES).join(",")}
            onChange={handleFilePick}
          />
          {/* Paperclip */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || selectedFile !== null}
            aria-label="Прикріпити файл"
            title="Прикріпити файл"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* Voice recorder trigger 🎤 */}
          <VoiceRecorderTrigger
            onStart={voice.start}
            disabled={isPending || selectedFile !== null}
          />

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedFile
                ? "Підпис (опційно)..."
                : replyingTo
                  ? "Напишіть відповідь..."
                  : "Напишіть повідомлення..."
            }
            rows={1}
            disabled={isPending}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            style={{ maxHeight: "200px" }}
          />
          <Button
            variant="sunset"
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Надіслати"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
