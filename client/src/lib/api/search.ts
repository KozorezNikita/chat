import type { SearchMessagesQuery, SearchMessagesResponse } from "@chat/shared";

import { api } from "./client";

export function searchMessages(
  query: Pick<SearchMessagesQuery, "q"> & { offset?: number; limit?: number },
): Promise<SearchMessagesResponse> {
  return api({
    method: "GET",
    url: "/search/messages",
    params: query,
  });
}
