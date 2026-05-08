"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MeUser } from "@chat/shared";

import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/hooks/use-messages";
import { createOptimisticMessage } from "@/lib/utils/message-utils";
import { getErrorMessage } from "@/lib/api/errors";

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
 *
 * Optimistic UI: одразу додаємо повідомлення у кеш через useSendMessage.
 * Помилка → toast + rollback (хук сам це робить через onError).
 */
export function MessageInput({ chatId, user }: MessageInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendMessage(chatId);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sendMessage.isPending) return;

    const clientId = crypto.randomUUID();
    const optimistic = createOptimisticMessage(clientId, chatId, trimmed, {
      id: user.id,
      name: user.name,
      username: user.username,
      avatarUrl: user.avatarUrl,
    });

    setContent("");
    // Reset textarea висоту після очищення
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await sendMessage.mutateAsync({
        dto: { clientId, content: trimmed },
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
    setContent(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }

  return (
    <div className="border-t border-border bg-background/60 p-3 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Напишіть повідомлення..."
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
  );
}
