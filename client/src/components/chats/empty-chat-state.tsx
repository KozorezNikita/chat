"use client";

import { useEffect } from "react";
import { MessageCircle, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/providers/sidebar-provider";

/**
 * Показуємо коли юзер на /chats без вибраного [chatId].
 *
 * Mobile:
 *  - На mount автоматично відкриваємо drawer щоб юзер одразу бачив список
 *  - Hamburger button у верхньому лівому кутку — якщо юзер закрив drawer
 *    і хоче знову відкрити (бо тут нема ChatHeader з власним меню)
 *
 * Desktop:
 *  - Sidebar статично видимий, hamburger прихований (md:hidden)
 */
export function EmptyChatState() {
  const { open } = useSidebar();

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      open();
    }
  }, [open]);

  return (
    <div className="relative flex h-svh flex-1 items-center justify-center">
      {/* Hamburger — тільки на mobile, бо тут немає ChatHeader */}
      <div className="absolute top-3 left-3 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={open}
          aria-label="Відкрити меню"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <div className="max-w-sm space-y-3 px-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card/60 backdrop-blur-sm">
          <MessageCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Виберіть чат</h2>
        <p className="text-sm text-muted-foreground">
          Оберіть чат з лівого боку щоб переглянути повідомлення, або створіть новий через
          кнопку <span className="font-mono text-foreground">+</span>.
        </p>
      </div>
    </div>
  );
}
