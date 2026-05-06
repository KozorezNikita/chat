"use client";

import { useState } from "react";
import { Plus, MessageCircle, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewDirectChatDialog } from "./new-direct-chat-dialog";
import { NewGroupChatDialog } from "./new-group-chat-dialog";

/**
 * Кнопка "+" у sidebar — відкриває dropdown з вибором direct / group,
 * далі — відповідну модалку.
 */
export function NewChatButton() {
  const [directOpen, setDirectOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="New chat">
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDirectOpen(true)}>
            <MessageCircle className="h-4 w-4" />
            <span>Новий чат</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setGroupOpen(true)}>
            <Users className="h-4 w-4" />
            <span>Нова група</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewDirectChatDialog open={directOpen} onOpenChange={setDirectOpen} />
      <NewGroupChatDialog open={groupOpen} onOpenChange={setGroupOpen} />
    </>
  );
}
