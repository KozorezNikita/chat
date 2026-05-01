import request from "supertest";
import { describe, it, expect } from "vitest";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import { createVerifiedUser } from "../helpers/factories.js";

describe("Logout flows", () => {
  /**
   * Helper — login і повернути cookies для подальших запитів.
   */
  async function loginAndGetCookies(email: string, password: string): Promise<string[]> {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return res.headers["set-cookie"] as unknown as string[];
  }

  describe("POST /api/v1/auth/logout", () => {
    it("revokes current family and clears cookies", async () => {
      const { user, password } = await createVerifiedUser({ email: "logout@example.com" });
      const cookies = await loginAndGetCookies("logout@example.com", password);

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Cookies очищені (Max-Age=0 або Expires в минулому)
      const responseCookies = res.headers["set-cookie"] as unknown as string[];
      const accessClear = responseCookies.find((c) => c.startsWith("accessToken="));
      const refreshClear = responseCookies.find((c) => c.startsWith("refreshToken="));
      expect(accessClear).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
      expect(refreshClear).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

      // Refresh токен у БД revoked
      const refreshes = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(refreshes.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it("succeeds even without valid cookies (idempotent)", async () => {
      // Юзер не залогінений, шле logout — нічого не падає, просто 200.
      const res = await request(app).post("/api/v1/auth/logout");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("does NOT affect OTHER families (other devices stay logged in)", async () => {
      const { user, password } = await createVerifiedUser({ email: "multi-device@example.com" });

      // Симулюємо два пристрої — два різні login → дві families.
      const device1Cookies = await loginAndGetCookies("multi-device@example.com", password);
      const device2Cookies = await loginAndGetCookies("multi-device@example.com", password);

      // Logout з пристрою 1
      await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", device1Cookies)
        .expect(200);

      // Refresh з пристрою 2 має досі працювати
      const refreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", device2Cookies);

      expect(refreshRes.status).toBe(200);

      // У БД: одна family revoked, інша має активний токен.
      const allTokens = await prisma.refreshToken.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      });
      const families = new Set(allTokens.map((t) => t.family));
      expect(families.size).toBe(2);

      const activeTokens = allTokens.filter((t) => t.revokedAt === null);
      expect(activeTokens.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("POST /api/v1/auth/logout-all", () => {
    it("revokes ALL families of the user", async () => {
      const { user, password } = await createVerifiedUser({ email: "logoutall@example.com" });

      // Три пристрої
      const device1 = await loginAndGetCookies("logoutall@example.com", password);
      await loginAndGetCookies("logoutall@example.com", password);
      await loginAndGetCookies("logoutall@example.com", password);

      // logout-all потребує access cookie (через requireAuth)
      const res = await request(app)
        .post("/api/v1/auth/logout-all")
        .set("Cookie", device1);

      expect(res.status).toBe(200);

      // Усі сесії юзера revoked
      const refreshes = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(refreshes).toHaveLength(3);
      expect(refreshes.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it("returns 401 without auth cookie", async () => {
      const res = await request(app).post("/api/v1/auth/logout-all");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("NO_ACCESS_TOKEN");
    });
  });
});
