import type { ToggleReactionDto, ToggleReactionResponse } from "@chat/shared";

import { apiClient } from "./client";

/**
 * POST /api/v1/messages/:messageId/reactions
 *
 * Toggle: якщо реакція тим же emoji від цього юзера є — видаляється.
 * Якщо немає — створюється.
 */
export async function toggleReaction(
  messageId: string,
  dto: ToggleReactionDto,
): Promise<ToggleReactionResponse> {
  const { data } = await apiClient.post<ToggleReactionResponse>(
    `/messages/${messageId}/reactions`,
    dto,
  );
  return data;
}
