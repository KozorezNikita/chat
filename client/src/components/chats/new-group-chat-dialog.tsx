"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { PublicUser } from "@chat/shared";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSearchUsers } from "@/hooks/use-search-users";
import { useCreateGroupChat } from "@/hooks/use-chats";
import { getInitials } from "@/lib/utils/chat-utils";
import { getErrorMessage } from "@/lib/api/errors";

interface NewGroupChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewGroupChatDialog({ open, onOpenChange }: NewGroupChatDialogProps) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  // Map для дедуплікації по userId
  const [members, setMembers] = useState<Map<string, PublicUser>>(new Map());

  const router = useRouter();
  const { data, isFetching } = useSearchUsers(query);
  const createGroup = useCreateGroupChat();

  const searchResults: PublicUser[] = data?.users ?? [];
  const memberArray = Array.from(members.values());
  const canSubmit = name.trim().length > 0 && memberArray.length > 0 && !createGroup.isPending;

  function handleAdd(user: PublicUser) {
    setMembers((prev) => {
      const next = new Map(prev);
      next.set(user.id, user);
      return next;
    });
    setQuery(""); // прибираємо search після додавання
  }

  function handleRemove(userId: string) {
    setMembers((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }

  function reset() {
    setName("");
    setQuery("");
    setMembers(new Map());
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      const { chat } = await createGroup.mutateAsync({
        name: name.trim(),
        memberIds: memberArray.map((u) => u.id),
      });
      reset();
      onOpenChange(false);
      router.push(`/chats/${chat.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Нова група</DialogTitle>
          <DialogDescription>
            Створіть груповий чат з кількома учасниками
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group name */}
          <div className="space-y-2">
            <Label htmlFor="group-name">Назва групи</Label>
            <Input
              id="group-name"
              placeholder="Наприклад: Команда фронтенду"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              disabled={createGroup.isPending}
            />
          </div>

          {/* Selected members */}
          <div className="space-y-2">
            <Label>Учасники {memberArray.length > 0 && `(${memberArray.length})`}</Label>
            {memberArray.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {memberArray.map((u) => (
                  <Badge key={u.id} variant="secondary" className="pl-2 pr-1">
                    <span className="text-xs">{u.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemove(u.id)}
                      disabled={createGroup.isPending}
                      className="rounded-full p-0.5 hover:bg-background/50"
                      aria-label={`Видалити ${u.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Додати учасника (email або @username)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={createGroup.isPending}
                className="pl-9"
              />
            </div>

            {/* Search results */}
            <div className="max-h-[200px] overflow-y-auto">
              {query.trim() && isFetching && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}

              {query.trim() && !isFetching && searchResults.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Користувача не знайдено
                </p>
              )}

              {searchResults
                .filter((u) => !members.has(u.id))
                .map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleAdd(user)}
                    disabled={createGroup.isPending}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50"
                  >
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sunset text-xs font-medium text-primary-foreground">
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
                  </button>
                ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createGroup.isPending}
          >
            Скасувати
          </Button>
          <Button
            variant="sunset"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {createGroup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Створити групу
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
