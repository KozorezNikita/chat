import { MessageCircle } from "lucide-react";

/**
 * Показуємо коли юзер на /chats без вибраного [chatId].
 */
export function EmptyChatState() {
  return (
    <div className="flex h-svh flex-1 items-center justify-center">
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
