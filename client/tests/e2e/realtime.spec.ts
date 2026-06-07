import { test, expect, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

/**
 * Real-time messaging E2E
 *
 * Передумова: alice@e2e.test + bob@e2e.test seeded, між ними є DM-чат.
 */

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE_URL}/auth/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("Password123!");
  await page.locator("#password").press("Enter");

  // Чекаємо що login пройшов — URL з /auth/login змінився.
  // Великий timeout бо backend може бути повільний на argon2 verify.
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
    timeout: 300_000,
  });

  // Cookie встановлений — переходимо до /chats
  await page.goto(`${BASE_URL}/chats`);
  await expect(page.getByRole("heading", { name: "Чати" })).toBeVisible({
    timeout: 15_000,
  });
}

async function openDmWith(page: Page, partnerName: string): Promise<void> {
  await page.getByText(partnerName, { exact: false }).first().click();
  await page.waitForURL(/\/chats\/[a-z0-9]+/, { timeout: 10_000 });
}

test("alice sends, bob receives without reload", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  try {
    // Sequential login — паралельний навантажує backend (argon2 verify x2)
    // плюс кожен login робить кілька DB queries
    await login(alicePage, "alice@e2e.test");
    await login(bobPage, "bob@e2e.test");

    // Sequential open DM теж
    await openDmWith(alicePage, "Bob E2E");
    await openDmWith(bobPage, "Alice E2E");

    // Дамо socket час підключитись
    await alicePage.waitForTimeout(1500);
    await bobPage.waitForTimeout(1500);

    // Alice пише
    const uniqueText = `Hello from Alice ${Date.now()}`;
    const textarea = alicePage.getByPlaceholder(/напишіть повідомлення/i);
    await textarea.fill(uniqueText);
    await textarea.press("Enter");

    // Bob має побачити це без reload
    await expect(bobPage.getByText(uniqueText)).toBeVisible({ timeout: 15_000 });

    // Alice теж бачить
    await expect(alicePage.getByText(uniqueText)).toBeVisible();
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
