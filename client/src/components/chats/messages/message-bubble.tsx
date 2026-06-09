"use client";

import type { Message } from "@chat/shared";
import { Reply } from "lucide-react";

import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils/chat-utils";
import { formatMessageTime } from "@/lib/utils/message-utils";
import { isImageMime, isAudioMime } from "@/lib/utils/file-display";
import { useReply } from "@/providers/reply-provider";
import { MessageActions } from "./message-actions";
import { MessageEditForm } from "./message-edit-form";
import { ReactionPicker } from "./reaction-picker";
import { ReactionBar } from "./reaction-bar";
import { ReadReceipt } from "./read-receipt";
import { ParentPreview } from "./parent-preview";
import { AttachmentImage } from "./attachment-image";
import { AttachmentDocument } from "./attachment-document";
import { AttachmentAudio } from "./attachment-audio";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isGrouped: boolean;
  showTime: boolean;
  /** Чи це найостанніше власне повідомлення у чаті — потрібне для group "X/Y" indicator-а. */
  isLastOwn: boolean;
  /** Підсвічувати bubble 2 секунди — після scroll-to-parent клік. */
  isFlashing: boolean;
  /** chatId передаємо для edit/delete mutations. */
  chatId: string;
  /** Якщо true — рендеримо edit form замість bubble content. */
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  /** Викликається при кліку на mini-bubble parent-preview — scroll до parent. */
  onScrollToParent: (parentId: string) => void;
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
  isFlashing,
  chatId,
  isEditing,
  onStartEdit,
  onStopEdit,
  onScrollToParent,
}: MessageBubbleProps) {
  const { setReplyingTo } = useReply();

  const isDeleted = message.deletedAt !== null;
  const isPersisted = CUID_LIKE_REGEX.test(message.id);
  const showActions = isOwn && !isDeleted && isPersisted && !isEditing;
  // Picker доступний для всіх (своїх і чужих), якщо не deleted/edit і повідомлення persisted
  const canReact = !isDeleted && !isEditing && isPersisted;
  // Reply доступний на тих же умовах (для всіх, не лише own)
  const canReply = !isDeleted && !isEditing && isPersisted;

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "group flex gap-2 rounded-md transition-colors",
        isOwn ? "flex-row-reverse" : "flex-row",
        isGrouped ? "mt-0.5" : "mt-3",
        isFlashing && "animate-flash",
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
            {message.parent && (
              <ParentPreview
                parent={message.parent}
                isOwn={isOwn}
                onClick={() => onScrollToParent(message.parent!.id)}
              />
            )}
            {(() => {
              const attachment = message.attachment;
              const hasContent = !isDeleted && message.content.length > 0;
              const isAttachmentImage = attachment && isImageMime(attachment.mime);
              const isAttachmentAudio = attachment && isAudioMime(attachment.mime);

              // CASE 1: image-only без caption — image без bubble background
              if (!isDeleted && attachment && isAttachmentImage && !hasContent) {
                return (
                  <AttachmentImage
                    attachment={attachment}
                    caption={null}
                    className="border border-border"
                  />
                );
              }

              // CASE 2: bubble background + image/doc/audio + caption (якщо є)
              return (
                <div
                  className={cn(
                    "rounded-2xl text-sm break-words whitespace-pre-wrap",
                    // Padding adjustment: image attachment всередині → no padding-top
                    attachment && isAttachmentImage && !isDeleted ? "p-1" : "px-3.5 py-2",
                    isDeleted && "italic text-muted-foreground",
                    !isDeleted && isOwn && "bg-sunset text-primary-foreground",
                    !isDeleted && !isOwn && "bg-card/80 text-foreground border border-border",
                    isOwn && isGrouped && "rounded-tr-md",
                    !isOwn && isGrouped && "rounded-tl-md",
                  )}
                >
                  {isDeleted ? (
                    <span>Це повідомлення видалено</span>
                  ) : (
                    <>
                      {attachment && isAttachmentImage && (
                        <AttachmentImage
                          attachment={attachment}
                          caption={hasContent ? message.content : null}
                          className="mb-1"
                        />
                      )}
                      {attachment && isAttachmentAudio && (
                        <AttachmentAudio attachment={attachment} isOwn={isOwn} />
                      )}
                      {attachment && !isAttachmentImage && !isAttachmentAudio && (
                        <AttachmentDocument
                          attachment={attachment}
                          isOwn={isOwn}
                        />
                      )}
                      {hasContent && (
                        <div className={cn(attachment && "mt-1.5 px-2 pb-1")}>
                          {message.content}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

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

      {/* Actions (hover only) — spacer зберігає місце для власних повідомлень */}
      {isOwn && !isEditing && (
        showActions ? (
          <MessageActions
            chatId={chatId}
            messageId={message.id}
            side="right"
            onStartEdit={onStartEdit}
          />
        ) : (
          <div className="order-first self-center invisible p-1.5" aria-hidden="true">
            <div className="h-4 w-4" />
          </div>
        )
      )}

      {/* Reply button — завжди в DOM, invisible коли недоступний, щоб зберегти layout */}
      <button
        type="button"
        onClick={canReply ? () =>
          setReplyingTo({
            id: message.id,
            authorName: message.author.name,
            contentPreview:
              message.content.length > 100
                ? `${message.content.slice(0, 100)}…`
                : message.content,
            isDeleted: false,
          }) : undefined
        }
        className={cn(
          "self-center rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity",
          canReply
            ? "hover:bg-muted hover:text-foreground group-hover:opacity-100"
            : "invisible pointer-events-none",
          isOwn ? "order-first" : "order-last",
        )}
        aria-label="Відповісти"
        title="Відповісти"
        tabIndex={canReply ? 0 : -1}
      >
        <Reply className="h-4 w-4" />
      </button>
    </div>
  );
}
