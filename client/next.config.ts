import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // Папка shared/ лежить вище за client/. Для multi-package monorepo-подібного
  // setup Next.js треба явно вказати root з якого включати файли в trace.
  outputFileTracingRoot: "../",

  // shared/ — це звичайна папка з .ts файлами, які ми резолвимо через
  // path-alias @chat/shared. Next.js має знати що їх треба транспілювати,
  // інакше .ts/.tsx файли поза client/ не пройдуть через SWC.
  transpilePackages: ["@chat/shared"],

  // shared/ компілюється у власну dist/ (npm run build).
  // Turbopack alias на скомпільований JS — Turbopack не вміє резолвити
  // ".js → .ts" mapping у ESM imports (issue #82945).
  // Перед dev/build треба запустити npm run build у shared/.
  turbopack: {
    resolveAlias: {
      "@chat/shared": "../shared/dist/index.js",
    },
  },

  // У dev режимі ми проксюємо API на localhost:5000 щоб не мати проблем
  // з CORS і cookies. У prod це налаштовується через NEXT_PUBLIC_API_URL.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:5000/api/:path*",
      },
    ];
  },
};

export default config;
