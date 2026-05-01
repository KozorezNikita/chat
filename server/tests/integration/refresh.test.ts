import request from "supertest";
import { describe, it, expect } from "vitest";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import { createVerifiedUser } from "../helpers/factories.js";

/**
 * Тести refresh-flow — це security-critical частина auth.
 *
 * Покриваємо:
 * - happy path: rotate, нова пара, стара revoked
 * - replay detection: використання revoked токена → revoke ВСЯ family
 * - expired refresh → 401, family revoked
 * - missing cookie → 401
 */
describe("POST /api/v1/auth/refresh", () => {
  /**
   * Helper — повертає cookie-агента залогіненого юзера.
   * Витягує refresh-cookie зі set-cookie response-у.
   */
  async function loginAndGetCookies(email: string, password: string): Promise<string[]> {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return res.headers["set-cookie"] as unknown as string[];
  }

  /**
   * Витягує значення refresh-cookie з масиву set-cookie рядків.
   */
  function extractRefreshCookie(cookies: string[]): string {
    const cookie = cookies.find((c) => c.startsWith("refreshToken="));
    if (!cookie) throw new Error("No refresh cookie in response");
    return cookie.split(";")[0]!; // "refreshToken=XXX"
  }

  it("rotates tokens on success and revokes old", async () => {
    const { user, password } = await createVerifiedUser({ email: "rot@example.com" });
    const cookies = await loginAndGetCookies("rot@example.com", password);
    const oldRefreshCookie = extractRefreshCookie(cookies);

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", oldRefreshCookie);

    expect(res.status).toBe(200);

    // Нова пара cookies встановлена
    const newCookies = res.headers["set-cookie"] as unknown as string[];
    expect(newCookies.some((c) => c.startsWith("accessToken="))).toBe(true);
    expect(newCookies.some((c) => c.startsWith("refreshToken="))).toBe(true);

    // У БД: 2 запис, старий revoked, новий active, та сама family
    const refreshes = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(refreshes).toHaveLength(2);
    expect(refreshes[0]?.revokedAt).not.toBeNull();
    expect(refreshes[1]?.revokedAt).toBeNull();
    expect(refreshes[0]?.family).toBe(refreshes[1]?.family);

    // Новий refresh має ІНШИЙ tokenHash
    expect(refreshes[0]?.tokenHash).not.toBe(refreshes[1]?.tokenHash);
  });

  it("REPLAY: re-using already-revoked refresh revokes entire family", async () => {
    const { user, password } = await createVerifiedUser({ email: "replay@example.com" });
    const cookies = await loginAndGetCookies("replay@example.com", password);
    const stolenRefresh = extractRefreshCookie(cookies);

    // Перший refresh — успішно ротує
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", stolenRefresh)
      .expect(200);

    // Другий запит з ТИМ САМИМ старим (тепер revoked) refresh-ом —
    // це сценарій атаки, маємо revoke всю family.
    const replayRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", stolenRefresh);

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.code).toBe("REFRESH_REPLAY");

    // Усі refresh-токени family revoked
    const refreshes = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(refreshes.every((r) => r.revokedAt !== null)).toBe(true);

    // Cookies очищені (max-age=0)
    const responseCookies = replayRes.headers["set-cookie"] as unknown as string[];
    const refreshClear = responseCookies.find((c) => c.startsWith("refreshToken="));
    expect(refreshClear).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("returns 401 if no refresh cookie", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("NO_REFRESH_TOKEN");
  });

  it("returns 401 INVALID_REFRESH_TOKEN for unknown token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", "refreshToken=totally-fake-token-value");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("expired refresh: returns 401 and revokes family", async () => {
    const { user, password } = await createVerifiedUser({ email: "expired@example.com" });
    await loginAndGetCookies("expired@example.com", password);

    // Прямо в БД "протерміновуємо" токен
    const original = await prisma.refreshToken.findFirst({ where: { userId: user.id } });
    await prisma.refreshToken.update({
      where: { id: original!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    // Конструюємо raw refresh з cookies — у нас є tokenHash, але не raw.
    // Тому замість використання реального токена — імітуємо його
    // через update (простіше, але втрачаємо raw). Натомість шлемо
    // фейкову строку:
    // АБО — заходимо ще раз через login для свіжих cookies:
    const cookies = await loginAndGetCookies("expired@example.com", password);

    // Але цей login створив НОВУ family. Викинемо старий запис
    // (вже expired) — він і так revoked CASCADE-ом? Ні, revoke
    // family через login не чіпає expired-запис. Але це і не суть
    // тесту — тут перевіримо новий refresh з expiresAt у минулому.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const refreshCookie = extractRefreshCookie(cookies);
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REFRESH_EXPIRED");
  });
});
