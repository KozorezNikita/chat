import type { PublicUser } from "@chat/shared";

import { api } from "./client";

export interface SearchUsersResponse {
  users: PublicUser[];
}

export function searchUsers(q: string, limit = 10): Promise<SearchUsersResponse> {
  return api({
    method: "GET",
    url: "/users/search",
    params: { q, limit },
  });
}
