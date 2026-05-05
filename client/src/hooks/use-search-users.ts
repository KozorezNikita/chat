"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import * as userApi from "@/lib/api/user";

/**
 * useSearchUsers — debounced search для модалок створення чату.
 *
 * Поки query коротший за 1 символ — не шлемо запит (повертаємо []).
 * Дебаунс 300мс щоб не флудити сервер при швидкому наборі.
 */
export function useSearchUsers(query: string, limit = 10) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  return useQuery({
    queryKey: ["users", "search", debouncedQuery, limit],
    queryFn: () => userApi.searchUsers(debouncedQuery, limit),
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 60 * 1000,
  });
}
