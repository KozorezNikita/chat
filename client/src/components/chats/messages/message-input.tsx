"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MeUser } from "@chat/shared";

import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/hooks/use-messages";
import { useTyping } from "@/hooks/use-typing";
import { useReply } from "@/providers/reply-provider";
import { createOptimisticMessage } from "@/lib/utils/message-utils";
import { getErrorMessage } from "@/lib/api/errors";
import { ReplyBanner } from "./reply-banner";

interface MessageInputProps {
  chatId: string;
  user: MeUser;
}

/**
 * Текстове поле + кнопка надсилання.
 *
 * Keyboard:
 *  - Enter → send
 *  - Shift+Enter → newline
 *  - Escape → скасувати reply (якщо активний)
 *
 * Optimistic UI: одразу додаємо повідомлення у кеш через useSendMessage.
 * Помилка → toast + rollback (хук сам це робить через onError).
 */
export function MessageInput({ chatId, user }: MessageInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendMessage(chatId);
  const typing = useTyping(chatId);
  const { replyingTo, setReplyingTo } = useReply();

  // Auto-focus textarea коли юзер вибрав reply target
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
    }
  }

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sendMessage.isPending) return;

    const clientId = crypto.randomUUID();
    const parentMessageId = replyingTo?.id;
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
    // Reset textarea висоту після очищення
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Скидаємо reply state одразу — UX-краще ніж після response
    setReplyingTo(null);

    // Юзер натиснув send — точно перестав набирати
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
      // Rollback вже відбувся в onError, повертаємо текст у поле
      setContent(trimmed);
    }
  }

  // Auto-resize textarea при наборі
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    setContent(newValue);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;

    // Typing logic
    if (newValue.length > 0) {
      typing.onKeyPress();
    } else {
      // Поле повністю очищено (наприклад Backspace до кінця) — миттєвий stop
      typing.onClear();
    }
  }

  return (
    <div className="border-t border-border bg-background/60 backdrop-blur-sm">
      <ReplyBanner />
      <div className="p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={replyingTo ? "Напишіть відповідь..." : "Напишіть повідомлення..."}
            rows={1}
            disabled={sendMessage.isPending}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            style={{ maxHeight: "200px" }}
          />
          <Button
            variant="sunset"
            size="icon"
            onClick={handleSend}
            disabled={!content.trim() || sendMessage.isPending}
            aria-label="Надіслати"
          >
            {sendMessage.isPending ? (
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
