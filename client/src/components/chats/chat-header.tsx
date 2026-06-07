"use client";

import { Users, Menu } from "lucide-react";
import type { Chat, MeUser } from "@chat/shared";

import { Button } from "@/components/ui/button";
import {
  getChatTitle,
  getChatAvatarUrl,
  getInitials,
} from "@/lib/utils/chat-utils";
import { usePresence, useOnlineCount } from "@/hooks/use-presence";
import { useSidebar } from "@/providers/sidebar-provider";
import { OnlineDot } from "@/components/chats/sidebar/online-dot";
import { LastSeen } from "@/components/ui/last-seen";

interface ChatHeaderProps {
  chat: Chat;
  user: MeUser;
}

export function ChatHeader({ chat, user }: ChatHeaderProps) {
  const title = getChatTitle(chat, user.id);
  const avatarUrl = getChatAvatarUrl(chat, user.id);
  const isGroup = chat.type === "GROUP";

  // Для DM — інший учасник, для group — список member userIds крім поточного
  const otherUserId = !isGroup
    ? chat.members.find((m) => m.userId !== user.id)?.userId
    : undefined;

  const groupMemberIds = isGroup
    ? chat.members.filter((m) => m.userId !== user.id).map((m) => m.userId)
    : [];

  // Викликаємо обидва хуки — React rule of hooks (не можна conditional).
  // Один з них поверне undefined / 0 — це OK.
  const directPresence = usePresence(otherUserId);
  const onlineCount = useOnlineCount(groupMemberIds);

  // Subtitle логіка
  let subtitle: React.ReactNode = null;
  if (isGroup) {
    const totalMembers = chat.members.length;
    const memberWord = totalMembers === 1 ? "учасник" : totalMembers < 5 ? "учасники" : "учасників";
    subtitle = (
      <>
        {totalMembers} {memberWord}
        {onlineCount > 0 && <> · {onlineCount} онлайн</>}
      </>
    );
  } else if (otherUserId) {
    subtitle = directPresence?.online ? (
      <span className="text-emerald-600 dark:text-emerald-400">онлайн</span>
    ) : (
      <LastSeen lastSeenAt={directPresence?.lastSeenAt ?? null} />
    );
  }

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-background/60 px-3 py-3 backdrop-blur-sm md:px-6">
      {/* Hamburger — only on mobile */}
      <MenuButton />

      <div className="relative shrink-0">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={title} className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sunset text-sm font-medium text-primary-foreground">
            {isGroup ? <Users className="h-4 w-4" /> : getInitials(title)}
          </div>
        )}
        {otherUserId && <OnlineDot userId={otherUserId} size="md" />}
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

/**
 * Hamburger button — відкриває sidebar drawer на mobile. Hidden on md+.
 * Окремий компонент щоб `useSidebar()` не змушував всю header rerender-итись.
 */
function MenuButton() {
  const { open } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={open}
      className="md:hidden"
      aria-label="Відкрити меню"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
