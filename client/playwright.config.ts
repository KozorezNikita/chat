import { defineConfig, devices } from "@playwright/test";

/**
 * Минімальний config. Тести проти вже запущеного dev (npm run dev у server + client).
 *
 *   npm run test:e2e              — headless
 *   npm run test:e2e:headed       — visible browser
 *   npm run test:e2e:ui           — UI mode для debug
 *
 * Великі timeouts через Next.js dev mode — перший compile сторінки може займати 30-60s.
 * У CI з production build (npm run build && npm run start) такі затримки не потрібні.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,           // 5 хв на тест (realtime робить 2 logins послідовно)
  expect: { timeout: 20_000 },

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,  // Next.js dev cold compile може 30-60s
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  reporter: [["list"]],
});
