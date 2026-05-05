"use client";

import { use } from "react";
import { Loader2 } from "lucide-react";

import { useChat } from "@/hooks/use-chats";
import { useMe } from "@/hooks/use-auth";
import { ChatHeader } from "@/components/chats/chat-header";

interface ChatDetailPageProps {
  params: Promise<{ chatId: string }>;
}

/**
 * /chats/[chatId] — обраний чат.
 *
 * У 2.4: header + placeholder для повідомлень.
 * У 2.6: ChatMessages список + MessageInput.
 */
export default function ChatDetailPage({ params }: ChatDetailPageProps) {
  // Next.js 16: params — це Promise, треба використати React.use()
  const { chatId } = use(params);

  const { data: meData } = useMe();
  const { data, isLoading, isError, error } = useChat(chatId);

  if (isLoading || !meData?.user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Чат недоступний</h2>
          <p className="text-sm text-muted-foreground">
            {status === 403 || status === 404
              ? "У вас немає доступу до цього чату або він не існує."
              : "Не вдалося завантажити чат. Спробуйте ще раз."}
          </p>
        </div>
      </div>
    );
  }

  if (!data?.chat) return null;

  return (
    <>
      <ChatHeader chat={data.chat} user={meData.user} />

      {/* Messages placeholder — у 2.6 буде MessageList + MessageInput */}
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <p>Повідомлення з'являться тут</p>
          <p className="text-xs">(буде реалізовано в наступному кроці 2.6)</p>
        </div>
      </div>
    </>
  );
}
