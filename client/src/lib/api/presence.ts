import type { GetPresenceResponse } from "@chat/shared";

import { apiClient } from "./client";

/**
 * GET /api/v1/presence?userIds=cm1,cm2,cm3
 *
 * Не використовуємо для більше ніж 100 userIds (server обмежить 400).
 * Дедуплікація userIds робиться у hook-у.
 */
export async function fetchPresence(userIds: string[]): Promise<GetPresenceResponse> {
  if (userIds.length === 0) return { presence: [] };

  const { data } = await apiClient.get<GetPresenceResponse>("/presence", {
    params: { userIds: userIds.join(",") },
  });
  return data;
}
