"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteMessage } from "@/hooks/use-messages";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

interface MessageActionsProps {
  chatId: string;
  messageId: string;
  /** Показуємо actions з лівого боку для чужих, з правого для своїх. */
  side: "left" | "right";
  onStartEdit: () => void;
}

/**
 * Dropdown ⋯ з опціями Edit / Delete.
 *
 * Показуємо тільки для своїх не-видалених повідомлень. Сам компонент
 * не вирішує "чи показувати" — це робить parent (MessageBubble).
 *
 * Edit викликає onStartEdit (parent перемикає у edit mode).
 * Delete показує confirm AlertDialog → useDeleteMessage.
 */
export function MessageActions({ chatId, messageId, side, onStartEdit }: MessageActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMessage = useDeleteMessage(chatId);

  async function handleConfirmDelete() {
    try {
      await deleteMessage.mutateAsync(messageId);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <>
      <div
        className={cn(
          "self-center opacity-0 transition-opacity group-hover:opacity-100",
          side === "right" ? "order-first" : "order-last",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              aria-label="Дії з повідомленням"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={side === "right" ? "end" : "start"}>
            <DropdownMenuItem onSelect={onStartEdit}>
              <Pencil className="h-4 w-4" />
              <span>Редагувати</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setConfirmOpen(true)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              <span>Видалити</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити повідомлення?</AlertDialogTitle>
            <AlertDialogDescription>
              Це повідомлення буде позначене як видалене для всіх учасників. Цю дію не можна скасувати.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMessage.isPending}>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleteMessage.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMessage.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
