"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Loader2, MessageSquareText, X } from "lucide-react";
import type { Chat, MeUser } from "@chat/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChats } from "@/hooks/use-chats";
import { useSidebar } from "@/providers/sidebar-provider";
import { getChatTitle } from "@/lib/utils/chat-utils";
import { cn } from "@/lib/utils";
import { ChatListItem } from "./chat-list-item";
import { NewChatButton } from "./new-chat-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface ChatsSidebarProps {
  user: MeUser;
}

export function ChatsSidebar({ user }: ChatsSidebarProps) {
  const { data, isLoading, isError } = useChats();
  const [filter, setFilter] = useState("");
  const { isOpen, close } = useSidebar();

  const chats: Chat[] = data?.chats ?? [];

  // Локальний фільтр по назві — не серверний пошук, для UX швидкості.
  const filteredChats = useMemo(() => {
    if (!filter.trim()) return chats;
    const q = filter.toLowerCase();
    return chats.filter((chat) =>
      getChatTitle(chat, user.id).toLowerCase().includes(q),
    );
  }, [chats, filter, user.id]);

  return (
    <>
      {/* Mobile overlay — backdrop click closes drawer */}
      <div
        onClick={close}
        aria-hidden
        className={cn(
          "fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity md:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          // Base
          "flex h-svh shrink-0 flex-col border-r border-border bg-background/95 backdrop-blur-sm",
          // Mobile: drawer behavior
          "fixed inset-y-0 left-0 z-40 w-[85%] max-w-sm transition-transform md:static md:w-80 md:translate-x-0 md:bg-background/60",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Header — sticky */}
        <div className="border-b border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Чати</h2>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button asChild variant="ghost" size="icon" title="Пошук по повідомленнях">
                <Link href="/chats/search" aria-label="Пошук по повідомленнях">
                  <MessageSquareText className="h-4 w-4" />
                </Link>
              </Button>
              <NewChatButton />
              {/* Close button — тільки на mobile */}
              <Button
                variant="ghost"
                size="icon"
                onClick={close}
                className="md:hidden"
                aria-label="Закрити меню"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Пошук чатів..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {isError && (
            <div className="px-3 py-4 text-center text-sm text-destructive">
              Не вдалося завантажити чати
            </div>
          )}

          {!isLoading && !isError && filteredChats.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {filter ? "Нічого не знайдено" : "У вас ще немає чатів"}
            </div>
          )}

          {!isLoading &&
            filteredChats.length > 0 &&
            filteredChats.map((chat) => (
              <ChatListItem key={chat.id} chat={chat} currentUserId={user.id} />
            ))}
        </div>
      </aside>
    </>
  );
}
