"use client";

import { createContext, useCallback, useContext, useState } from "react";

import type { MessageParentPreview } from "@chat/shared";

/**
 * ============================================
 * ReplyProvider — ephemeral state для replyingTo
 * ============================================
 *
 * Контекст на рівні chat-page (не глобальний) — при зміні чату скидається.
 * Тримає preview parent message-у який зараз вибраний як reply target.
 *
 * Чому Context а не Zustand/TanStack:
 *  - state ephemeral, не сервер-стан
 *  - один scope (chat-page), не глобальний
 *  - простота — нема зайвих залежностей
 */

interface ReplyContextValue {
  replyingTo: MessageParentPreview | null;
  setReplyingTo: (target: MessageParentPreview | null) => void;
}

const ReplyContext = createContext<ReplyContextValue | null>(null);

export function ReplyProvider({ children }: { children: React.ReactNode }) {
  const [replyingTo, setReplyingToState] = useState<MessageParentPreview | null>(null);

  const setReplyingTo = useCallback((target: MessageParentPreview | null) => {
    setReplyingToState(target);
  }, []);

  return (
    <ReplyContext.Provider value={{ replyingTo, setReplyingTo }}>
      {children}
    </ReplyContext.Provider>
  );
}

export function useReply(): ReplyContextValue {
  const ctx = useContext(ReplyContext);
  if (!ctx) {
    throw new Error("useReply must be used within ReplyProvider");
  }
  return ctx;
}
