"use client";

import { Users } from "lucide-react";
import type { Chat, MeUser } from "@chat/shared";

import {
  getChatTitle,
  getChatAvatarUrl,
  getInitials,
} from "@/lib/utils/chat-utils";

interface ChatHeaderProps {
  chat: Chat;
  user: MeUser;
}

export function ChatHeader({ chat, user }: ChatHeaderProps) {
  const title = getChatTitle(chat, user.id);
  const avatarUrl = getChatAvatarUrl(chat, user.id);
  const isGroup = chat.type === "GROUP";

  // Для групи — підпис з кількістю учасників та іменами (перші 3)
  const subtitle = isGroup
    ? `${chat.members.length} учасник${chat.members.length === 1 ? "" : chat.members.length < 5 ? "и" : "ів"} · ${chat.members
        .slice(0, 3)
        .map((m) => m.user.name.split(" ")[0])
        .join(", ")}${chat.members.length > 3 ? "..." : ""}`
    : null;

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-background/60 px-6 py-3 backdrop-blur-sm">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={title} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sunset text-sm font-medium text-primary-foreground">
          {isGroup ? <Users className="h-4 w-4" /> : getInitials(title)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
