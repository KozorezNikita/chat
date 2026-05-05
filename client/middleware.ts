import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js middleware — пасивний захист майбутніх захищених роутів.
 *
 * ============================================
 * Що це робить
 * ============================================
 * Перед рендером сторінки перевіряє наявність cookie `accessToken`.
 * - Є cookie → пропускаємо (фактичну валідацію зробить API на запиті)
 * - Немає → redirect на /auth/login
 *
 * ============================================
 * Що це НЕ робить
 * ============================================
 * - Не валідує токен (немає секрету на edge без runtime risk-у)
 * - Не перевіряє чи юзер існує в БД
 * - Не захищає API endpoints (це робить server-side requireAuth middleware)
 *
 * Це лише UX-оптимізація: щоб юзер не моргав на захищеній сторінці
 * перш ніж його перекине useMe → AUTH_FAILED_EVENT → redirect.
 *
 * ============================================
 * Зворотній випадок — login/register для залогіненого юзера
 * ============================================
 * Якщо юзер залогінений (є accessToken) і відкриває /auth/login —
 * редіректимо на /. Це теж UX (немає сенсу показувати login form
 * залогіненому).
 */

const PUBLIC_AUTH_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify",
  "/auth/check-email",
];

const PROTECTED_ROUTES: string[] = [
  "/chats",
  // У наступних ітераціях:
  // "/settings",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasAccessToken = req.cookies.has("accessToken");

  // Залогінений юзер на public auth-route → redirect на головну
  if (hasAccessToken && PUBLIC_AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Незалогінений юзер на захищеному роуті → redirect на login
  if (!hasAccessToken && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    // Зберігаємо куди він хотів — щоб після login повернутись.
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Matcher: на які URL запускається middleware.
 *
 * Виключаємо:
 * - api/* — це бекенд proxy
 * - _next/* — Next internal
 * - статичні файли
 * - favicon, robots.txt
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\\..*).*)",
  ],
};
