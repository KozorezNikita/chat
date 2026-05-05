"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import type { Chat, MeUser } from "@chat/shared";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChats } from "@/hooks/use-chats";
import { getChatTitle } from "@/lib/utils/chat-utils";
import { ChatListItem } from "./chat-list-item";

interface ChatsSidebarProps {
  user: MeUser;
}

export function ChatsSidebar({ user }: ChatsSidebarProps) {
  const { data, isLoading, isError } = useChats();
  const [filter, setFilter] = useState("");

  const chats: Chat[] = data?.chats ?? [];

  // Локальний фільтр по назві — не серверний пошук, для UX швидкості.
  // Серверний пошук буде у Iter 8 (FTS).
  const filteredChats = useMemo(() => {
    if (!filter.trim()) return chats;
    const q = filter.toLowerCase();
    return chats.filter((chat) =>
      getChatTitle(chat, user.id).toLowerCase().includes(q),
    );
  }, [chats, filter, user.id]);

  return (
    <aside className="flex h-svh w-80 shrink-0 flex-col border-r border-border bg-background/60 backdrop-blur-sm">
      {/* Header — sticky */}
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Чати</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // У 2.5 — модалка "New chat"
              alert("New chat — в наступному кроці");
            }}
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
  );
}
