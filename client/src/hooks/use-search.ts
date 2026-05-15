"use client";

import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { searchMessages } from "@/lib/api/search";

/**
 * ============================================
 * useSearchMessages — debounced FTS query
 * ============================================
 *
 * Debounce 400мс — типовий sweet spot для search-as-you-type:
 * не флудимо backend кожним keystroke, але юзер бачить результати
 * як тільки зупинився на 0.4 сек.
 *
 * Чому 400мс а не 300 (як у useSearchUsers):
 *  - users search швидкий (ILIKE по name) — 300мс ОК
 *  - messages FTS дорожчий (GIN scan + ts_headline) — даємо більше часу
 *
 * Якщо query коротший за 2 символи — НЕ робимо запит (повертаємо null).
 * Узгоджено з backend min(2) валідацією.
 *
 * keepPreviousData — щоб при typing старі результати не мерехтіли:
 * показуємо попередні до приходу нових.
 */
export function useSearchMessages(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(handle);
  }, [query]);

  const trimmed = debouncedQuery.trim();
  const enabled = trimmed.length >= 2;

  return useQuery({
    queryKey: ["search", "messages", trimmed],
    queryFn: () => searchMessages({ q: trimmed }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000, // 30 сек — search results нечасто змінюються
  });
}
