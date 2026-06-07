import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

/**
 * Auth flow E2E
 *
 * Передумова: seed-скрипт створив alice@e2e.test з паролем Password123!
 *
 * Тест: login → перевірити що ми на /chats (через "/" redirect, або одразу).
 *
 * Після login form router.push("/"); root page має кнопку "Перейти до чатів".
 * У тесті ми просто goto("/chats") бо cookie вже встановлений.
 */
test.describe("Auth flow", () => {
  test("user can log in and reach /chats", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);

    await page.locator("#email").fill("alice@e2e.test");
    await page.locator("#password").fill("Password123!");

    // Submit через Enter — надійніше ніж click на button що може стати disabled
    await page.locator("#password").press("Enter");

    // Чекаємо що login пройшов: або URL змінився, або mutation завершилась
    // router.push("/") у login-form після successful submit
    await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
      timeout: 15_000,
    });

    // Cookie вже встановлений — переходимо до /chats напряму
    await page.goto(`${BASE_URL}/chats`);

    // Sidebar "Чати" має бути видимий
    await expect(page.getByRole("heading", { name: "Чати" })).toBeVisible();
  });

  test("invalid credentials keep us on login page", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);

    await page.locator("#email").fill("alice@e2e.test");
    await page.locator("#password").fill("WrongPassword!");
    await page.locator("#password").press("Enter");

    // Чекаємо що API відповів (toast з'явиться)
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/auth/login");
  });
});
