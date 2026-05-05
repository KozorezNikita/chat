"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import type { Chat } from "@chat/shared";

import { cn } from "@/lib/utils";
import {
  getChatTitle,
  getChatAvatarUrl,
  getInitials,
  getLastMessagePreview,
  formatLastMessageTime,
} from "@/lib/utils/chat-utils";

interface ChatListItemProps {
  chat: Chat;
  currentUserId: string;
}

export function ChatListItem({ chat, currentUserId }: ChatListItemProps) {
  const pathname = usePathname();
  const isActive = pathname === `/chats/${chat.id}`;

  const title = getChatTitle(chat, currentUserId);
  const avatarUrl = getChatAvatarUrl(chat, currentUserId);
  const preview = getLastMessagePreview(chat, currentUserId);
  const time = chat.lastMessage ? formatLastMessageTime(chat.lastMessage.createdAt) : null;
  const isGroup = chat.type === "GROUP";

  return (
    <Link
      href={`/chats/${chat.id}`}
      className={cn(
        "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
        "hover:bg-accent/50",
        isActive && "bg-accent/70 hover:bg-accent/70",
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={title}
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium text-primary-foreground",
              "bg-sunset",
            )}
          >
            {isGroup ? <Users className="h-5 w-5" /> : getInitials(title)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {time && (
            <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-xs text-muted-foreground",
              chat.lastMessage?.isDeleted && "italic",
            )}
          >
            {preview || (
              <span className="italic text-muted-foreground/70">Чат створено</span>
            )}
          </p>
          {chat.unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-sunset px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
