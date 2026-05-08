"use client";

import { use } from "react";
import { Loader2 } from "lucide-react";

import { useChat } from "@/hooks/use-chats";
import { useMe } from "@/hooks/use-auth";
import { ChatHeader } from "@/components/chats/chat-header";
import { MessageList } from "@/components/chats/messages/message-list";
import { MessageInput } from "@/components/chats/messages/message-input";

interface ChatDetailPageProps {
  params: Promise<{ chatId: string }>;
}

/**
 * /chats/[chatId] — обраний чат.
 *
 * Header → MessageList → MessageInput.
 * MessageList використовує useInfiniteQuery, MessageInput — useSendMessage
 * з optimistic UI.
 */
export default function ChatDetailPage({ params }: ChatDetailPageProps) {
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
      <MessageList chatId={chatId} currentUserId={meData.user.id} />
      <MessageInput chatId={chatId} user={meData.user} />
    </>
  );
}
