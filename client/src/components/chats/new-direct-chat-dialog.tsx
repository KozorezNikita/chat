"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PublicUser } from "@chat/shared";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSearchUsers } from "@/hooks/use-search-users";
import { useCreateDirectChat } from "@/hooks/use-chats";
import { getInitials } from "@/lib/utils/chat-utils";
import { getErrorMessage } from "@/lib/api/errors";

interface NewDirectChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewDirectChatDialog({ open, onOpenChange }: NewDirectChatDialogProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { data, isFetching, isError } = useSearchUsers(query);
  const createDirect = useCreateDirectChat();

  const users: PublicUser[] = data?.users ?? [];

  async function handleSelect(userId: string) {
    try {
      const { chat } = await createDirect.mutateAsync({ userId });
      onOpenChange(false);
      setQuery("");
      router.push(`/chats/${chat.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        // Закриваємо → чистимо query
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новий чат</DialogTitle>
          <DialogDescription>Введіть точний email або @username</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="user@example.com або @username"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={createDirect.isPending}
              className="pl-9"
            />
          </div>

          {/* Results */}
          <div className="min-h-[120px] max-h-[300px] overflow-y-auto">
            {!query.trim() && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                Почніть вводити email або @username
              </p>
            )}

            {query.trim() && isFetching && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {query.trim() && !isFetching && isError && (
              <p className="px-2 py-4 text-center text-xs text-destructive">
                Помилка пошуку
              </p>
            )}

            {query.trim() && !isFetching && !isError && users.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                Користувача не знайдено
              </p>
            )}

            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                disabled={createDirect.isPending}
                onClick={() => handleSelect(user.id)}
                className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sunset text-xs font-medium text-primary-foreground">
                    {getInitials(user.name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  {user.username && (
                    <p className="truncate text-xs text-muted-foreground">
                      @{user.username}
                    </p>
                  )}
                </div>
                {createDirect.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
