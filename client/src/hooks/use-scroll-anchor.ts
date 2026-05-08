"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useScrollAnchor — інкапсулює всю scroll-логіку MessageList.
 *
 * Що робить:
 *  - тримає refs на scroll контейнер, top-anchor (для load more) і bottom-anchor (для autoscroll)
 *  - відстежує isNearBottom через scroll listener (debounced)
 *  - експортує scrollToBottom() для imperative скролу
 *  - реєструє IntersectionObserver на top-anchor для onLoadMore callback
 *
 * Чому окремий hook: MessageList сам по собі довгий (рендер месиджів,
 * groups, indicators), не хочеться додавати ще 50 рядків scroll-логіки.
 */

interface UseScrollAnchorOptions {
  /** Викликається коли top-anchor стає visible (юзер скрол до верху). */
  onLoadMore: () => void;
  /** Чи активний load more (false коли немає nextCursor / йде fetch). */
  loadMoreEnabled: boolean;
  /** Дистанція від bottom щоб вважати "near bottom". Default 200px. */
  bottomThreshold?: number;
}

const DEFAULT_BOTTOM_THRESHOLD = 200;

export function useScrollAnchor({
  onLoadMore,
  loadMoreEnabled,
  bottomThreshold = DEFAULT_BOTTOM_THRESHOLD,
}: UseScrollAnchorOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topAnchorRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

  const [isNearBottom, setIsNearBottom] = useState(true);

  // Scroll listener — debounced через rAF
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let frame = 0;
    function handleScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!container) return;
        const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
        setIsNearBottom(distance < bottomThreshold);
      });
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [bottomThreshold]);

  // IntersectionObserver на top-anchor для load more
  useEffect(() => {
    const top = topAnchorRef.current;
    const root = scrollRef.current;
    if (!top || !root || !loadMoreEnabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      {
        root,
        rootMargin: "100px 0px 0px 0px", // тригерим за 100px до top
        threshold: 0,
      },
    );

    observer.observe(top);
    return () => observer.disconnect();
  }, [onLoadMore, loadMoreEnabled]);

  /**
   * Imperative scroll до bottom anchor.
   * behavior "auto" — миттєво (для першого open чату)
   * behavior "smooth" — плавно (для нових повідомлень коли юзер біля bottom)
   */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomAnchorRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  return {
    scrollRef,
    topAnchorRef,
    bottomAnchorRef,
    isNearBottom,
    scrollToBottom,
  };
}
