"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Loader2, Search as SearchIcon, X, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSearchMessages } from "@/hooks/use-search";
import { useSidebar } from "@/providers/sidebar-provider";
import { SearchResultItem } from "@/components/search/search-result-item";

/**
 * Search page — глобальний пошук по повідомленнях.
 *
 * URL state: `?q=...` зберігається на reload, share-link works.
 * Debounce 400ms живе у useSearchMessages.
 */
function SearchPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const [query, setQuery] = useState(initialQ);

  // Sync query → URL без full navigation (replace, not push)
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query) {
        next.set("q", query);
      } else {
        next.delete("q");
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 400);
    return () => clearTimeout(handle);
  }, [query, router, pathname, params]);

  const { open: openSidebar } = useSidebar();
  const { data, isFetching, error } = useSearchMessages(query);

  return (
    <div className="flex h-full flex-col">
      {/* Header з input */}
      <div className="border-b border-border bg-background/60 px-3 py-3 backdrop-blur-sm md:px-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {/* Hamburger — тільки на mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={openSidebar}
            className="shrink-0 md:hidden"
            aria-label="Відкрити меню"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="relative flex-1">
            <SearchIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук по повідомленнях..."
              autoFocus
              className="w-full rounded-md border border-input bg-background py-2 pr-10 pl-9 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Очистити"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl">
          {query.trim().length < 2 ? (
            <EmptyHint />
          ) : isFetching && !data ? (
            <Loading />
          ) : error ? (
            <ErrorState />
          ) : data && data.results.length === 0 ? (
            <NoResults query={query} />
          ) : data ? (
            <ResultsList
              results={data.results}
              total={data.total}
              isFetching={isFetching}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="mt-16 text-center text-sm text-muted-foreground">
      <SearchIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
      <p>Введіть текст для пошуку</p>
      <p className="mt-1 text-xs">Мінімум 2 символи</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="mt-16 flex justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorState() {
  return (
    <div className="mt-16 text-center text-sm text-destructive">
      Не вдалося виконати пошук
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="mt-16 text-center text-sm text-muted-foreground">
      <p>Нічого не знайдено для «{query}»</p>
      <p className="mt-1 text-xs">Спробуйте інший запит</p>
    </div>
  );
}

function ResultsList({
  results,
  total,
  isFetching,
}: {
  results: ReturnType<typeof useSearchMessages>["data"] extends infer T
    ? T extends { results: infer R }
      ? R
      : never
    : never;
  total: number;
  isFetching: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Знайдено: {total} {total === 1 ? "результат" : "результатів"}
        </span>
        {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      {results.map((r) => (
        <SearchResultItem key={r.messageId} result={r} />
      ))}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchPageInner />
    </Suspense>
  );
}
