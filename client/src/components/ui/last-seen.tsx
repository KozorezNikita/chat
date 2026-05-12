"use client";

/**
 * Форматує "був(-ла) X тому" українською.
 *
 * Кейси:
 *  - < 1 хв тому → "щойно"
 *  - < 1 год тому → "X хв тому"
 *  - < 24 год тому → "X год тому"
 *  - < 7 днів тому → "X днів тому"
 *  - > 7 днів → "12 травня"
 *
 * Без зовнішніх залежностей (date-fns). Якщо локалізація стане складнішою
 * (множинні форми, gender), додамо бібліотеку у майбутній ітерації.
 */

const MONTHS_UA = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "щойно";
  if (diffMin < 60) return `${diffMin} хв тому`;
  if (diffHour < 24) return `${diffHour} год тому`;
  if (diffDay < 7) return `${diffDay} ${pluralizeDays(diffDay)} тому`;

  return `${date.getDate()} ${MONTHS_UA[date.getMonth()]}`;
}

function pluralizeDays(n: number): string {
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "днів";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дні";
  return "днів";
}

interface LastSeenProps {
  /** ISO timestamp коли юзер востаннє був online. Null = ніколи не онлайнив. */
  lastSeenAt: string | null;
  className?: string;
}

export function LastSeen({ lastSeenAt, className }: LastSeenProps) {
  if (!lastSeenAt) return <span className={className}>не в мережі</span>;
  return <span className={className}>був(-ла) {formatTimeAgo(lastSeenAt)}</span>;
}
