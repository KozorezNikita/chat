"use client";

import type { Message } from "@chat/shared";

import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils/chat-utils";
import { formatMessageTime } from "@/lib/utils/message-utils";
import { MessageActions } from "./message-actions";
import { MessageEditForm } from "./message-edit-form";
import { ReactionPicker } from "./reaction-picker";
import { ReactionBar } from "./reaction-bar";
import { ReadReceipt } from "./read-receipt";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isGrouped: boolean;
  showTime: boolean;
  /** Чи це найостанніше власне повідомлення у чаті — потрібне для group "X/Y" indicator-а. */
  isLastOwn: boolean;
  /** chatId передаємо для edit/delete mutations. */
  chatId: string;
  /** Якщо true — рендеримо edit form замість bubble content. */
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}

/**
 * Один пухир повідомлення.
 *
 * Стани:
 *  - normal: bubble + actions при hover (для своїх не-видалених)
 *  - editing: replaces bubble на MessageEditForm
 *  - deleted: italic placeholder, без actions
 *
 * Optimistic message: id має формат UUID, не cuid. Не показуємо actions
 * до того як сервер відповість і id не зміниться на cuid (інакше
 * клік на Edit/Delete впаде з MESSAGE_NOT_FOUND).
 */

const CUID_LIKE_REGEX = /^c[a-z0-9]{20,}$/;

export function MessageBubble({
  message,
  isOwn,
  isGrouped,
  showTime,
  isLastOwn,
  chatId,
  isEditing,
  onStartEdit,
  onStopEdit,
}: MessageBubbleProps) {
  const isDeleted = message.deletedAt !== null;
  const isPersisted = CUID_LIKE_REGEX.test(message.id);
  const showActions = isOwn && !isDeleted && isPersisted && !isEditing;
  // Picker доступний для всіх (своїх і чужих), якщо не deleted/edit і повідомлення persisted
  const canReact = !isDeleted && !isEditing && isPersisted;

  return (
    <div
      className={cn(
        "group flex gap-2",
        isOwn ? "flex-row-reverse" : "flex-row",
        isGrouped ? "mt-0.5" : "mt-3",
      )}
    >
      {/* Avatar slot */}
      <div className="w-8 shrink-0">
        {!isOwn && !isGrouped && (
          <>
            {message.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.author.avatarUrl}
                alt={message.author.name}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                {getInitials(message.author.name)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bubble + content area */}
      <div
        className={cn(
          "flex max-w-[70%] flex-col",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {/* Author name */}
        {!isOwn && !isGrouped && (
          <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
            {message.author.name}
          </span>
        )}

        {isEditing ? (
          <MessageEditForm
            chatId={chatId}
            messageId={message.id}
            initialContent={message.content}
            isOwn={isOwn}
            onCancel={onStopEdit}
            onSaved={onStopEdit}
          />
        ) : (
          <div className="relative">
            <div
              className={cn(
                "rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
                isDeleted && "italic text-muted-foreground",
                !isDeleted && isOwn && "bg-sunset text-primary-foreground",
                !isDeleted && !isOwn && "bg-card/80 text-foreground border border-border",
                isOwn && isGrouped && "rounded-tr-md",
                !isOwn && isGrouped && "rounded-tl-md",
              )}
            >
              {isDeleted ? <span>Це повідомлення видалено</span> : message.content}
            </div>

            {canReact && (
              <ReactionPicker
                chatId={chatId}
                messageId={message.id}
                isOwn={isOwn}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            )}
          </div>
        )}

        {/* Reaction bar — під bubble, завжди видимий якщо є реакції */}
        {!isEditing && message.reactions.length > 0 && (
          <ReactionBar
            chatId={chatId}
            messageId={message.id}
            reactions={message.reactions}
            isOwn={isOwn}
          />
        )}

        {/* Time + edited badge + read receipt */}
        {showTime && !isEditing && (
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 px-1 text-[10px] text-muted-foreground",
              isOwn ? "self-end" : "self-start",
            )}
          >
            <span>{formatMessageTime(message.createdAt)}</span>
            {message.editedAt && !isDeleted && <span>(відредаговано)</span>}
            {isOwn && !isDeleted && (
              <ReadReceipt
                chatId={chatId}
                messageId={message.id}
                isLastOwn={isLastOwn}
              />
            )}
          </span>
        )}
      </div>

      {/* Actions (hover only) */}
      {showActions && (
        <MessageActions
          chatId={chatId}
          messageId={message.id}
          side={isOwn ? "right" : "left"}
          onStartEdit={onStartEdit}
        />
      )}
    </div>
  );
}
