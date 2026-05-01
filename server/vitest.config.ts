import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {

    /**
     * Перед КОЖНИМ тестовим файлом — truncate всіх таблиць.
     * Це швидше за migrate reset (~5мс vs 1сек).
     */
    setupFiles: ["./tests/setup.ts"],

    /**
     * Vitest сам не читає .env-файли — це робить наш env.ts через
     * dotenv/config. Vitest лише виставляє NODE_ENV=test, далі env.ts
     * сам шукає змінні у process.env (CI підставляє їх через workflow,
     * локально — через dotenv що читає .env).
     *
     * Для локальних тестів треба окремий .env.test → див. README інструкції.
     */
    env: {
      NODE_ENV: "test",
    },

    /**
     * Integration-тести шлють реальні запити в спільну БД. Паралельний run
     * ламає TRUNCATE, бо два тести одночасно прибивають дані одне в одного.
     *
     * `pool: 'forks'` + `singleFork: true` — все послідовно, повільніше але
     * стабільне.
     */
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    /**
     * 15 сек — запас для argon2 (повільний за дизайном) + DB ops на холодному
     * CI runner-і.
     */
    testTimeout: 15_000,
    hookTimeout: 30_000,

    /**
     * Globals: describe/it/expect/vi доступні без import — менше boilerplate.
     */
    globals: true,

    include: ["tests/**/*.test.ts"],
  },
});
