"use client";

import { use, useState } from "react";
import { Loader2 } from "lucide-react";

import { useChat } from "@/hooks/use-chats";
import { useMe } from "@/hooks/use-auth";
import { ChatHeader } from "@/components/chats/chat-header";
import { MessageList } from "@/components/chats/messages/message-list";
import { MessageInput } from "@/components/chats/messages/message-input";
import { TypingIndicator } from "@/components/chats/messages/typing-indicator";
import { DropZone } from "@/components/chats/messages/drop-zone";
import { ReplyProvider } from "@/providers/reply-provider";

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
  const [droppedFile, setDroppedFile] = useState<File | null>(null);

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
    <ReplyProvider>
      <ChatHeader chat={data.chat} user={meData.user} />
      <DropZone onFileDropped={setDroppedFile}>
        <MessageList chatId={chatId} currentUserId={meData.user.id} />
        <TypingIndicator chatId={chatId} />
        <MessageInput
          chatId={chatId}
          user={meData.user}
          externalFile={droppedFile}
          onExternalFileConsumed={() => setDroppedFile(null)}
        />
      </DropZone>
    </ReplyProvider>
  );
}
