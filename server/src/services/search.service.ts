import type { SearchMessagesQuery, SearchMessagesResponse } from "@chat/shared";

import * as searchRepo from "../repositories/search.repo.js";

/**
 * Search service — мапить raw rows у DTO.
 *
 * Для DIRECT чатів resolve `chatName` як ім'я іншого учасника (бо c.name null).
 */
export async function searchMessages(
  userId: string,
  query: SearchMessagesQuery,
): Promise<SearchMessagesResponse> {
  const { rows, total } = await searchRepo.searchMessages({
    userId,
    query: query.q,
    offset: query.offset,
    limit: query.limit,
  });

  // Для DM чатів нам треба resolve partner name
  const directChatIds = rows
    .filter((r) => r.chatType === "DIRECT")
    .map((r) => r.chatId);

  const partnerNames = await searchRepo.fetchDirectChatPartners({
    chatIds: directChatIds,
    currentUserId: userId,
  });

  const results = rows.map((row) => {
    const chatName =
      row.chatType === "DIRECT"
        ? (partnerNames.get(row.chatId) ?? "Невідомий чат")
        : (row.chatName ?? "Чат без назви");

    return {
      messageId: row.messageId,
      chatId: row.chatId,
      chatName,
      authorName: row.authorName,
      headline: row.headline,
      createdAt: row.createdAt.toISOString(),
    };
  });

  return {
    results,
    total,
    hasMore: query.offset + rows.length < total,
  };
}
