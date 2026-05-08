"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useEditMessage } from "@/hooks/use-messages";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

interface MessageEditFormProps {
  chatId: string;
  messageId: string;
  initialContent: string;
  isOwn: boolean;
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * Inline edit form всередині bubble.
 *
 * Keyboard:
 *  - Enter → save
 *  - Shift+Enter → newline
 *  - Esc → cancel
 *
 * Auto-focus на mount, cursor у кінці.
 * Кнопки Save/Cancel знизу form.
 */
export function MessageEditForm({
  chatId,
  messageId,
  initialContent,
  isOwn,
  onCancel,
  onSaved,
}: MessageEditFormProps) {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editMessage = useEditMessage(chatId);

  // Auto-focus + cursor at end + auto-resize on mount
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  async function handleSave() {
    const trimmed = content.trim();
    if (!trimmed || editMessage.isPending) return;
    if (trimmed === initialContent.trim()) {
      // Нічого не змінилось — просто закриваємо edit mode
      onCancel();
      return;
    }

    try {
      await editMessage.mutateAsync({ messageId, dto: { content: trimmed } });
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
      // Не закриваємо edit mode — даємо юзеру можливість виправити
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl border p-2",
        isOwn ? "border-primary/40 bg-card/60" : "border-border bg-card/60",
        "backdrop-blur-sm",
      )}
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={editMessage.isPending}
        rows={1}
        className="resize-none bg-transparent px-1.5 text-sm focus:outline-none disabled:opacity-50"
        style={{ maxHeight: "200px" }}
      />
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={editMessage.isPending}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Скасувати"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!content.trim() || editMessage.isPending}
          className={cn(
            "rounded-full p-1.5 text-muted-foreground transition-colors",
            "hover:bg-primary/10 hover:text-primary",
            "disabled:opacity-50",
          )}
          aria-label="Зберегти"
        >
          {editMessage.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <p className="px-1.5 text-[10px] text-muted-foreground">
        Enter = зберегти · Shift+Enter = новий рядок · Esc = скасувати
      </p>
    </div>
  );
}
