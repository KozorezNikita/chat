import request from "supertest";
import { describe, it, expect } from "vitest";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import { createVerifiedUser } from "../helpers/factories.js";

describe("GET /api/v1/auth/me", () => {
  /**
   * Helper — login і повернути cookies.
   */
  async function loginAndGetCookies(email: string, password: string): Promise<string[]> {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return res.headers["set-cookie"] as unknown as string[];
  }

  it("returns current user when authenticated", async () => {
    const { user, password } = await createVerifiedUser({
      email: "me@example.com",
      name: "Me User",
    });
    const cookies = await loginAndGetCookies("me@example.com", password);

    const res = await request(app).get("/api/v1/auth/me").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      name: "Me User",
      email: "me@example.com",
      emailVerified: true,
      username: null,
      avatarUrl: null,
    });
    // createdAt — ISO рядок (узгоджено з MeUser DTO)
    expect(typeof res.body.user.createdAt).toBe("string");
    expect(new Date(res.body.user.createdAt).toString()).not.toBe("Invalid Date");

    // Чутливі поля НЕ leak-нуті
    expect(res.body.user.password).toBeUndefined();
  });

  it("returns 401 without cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("NO_ACCESS_TOKEN");
  });

  it("returns 401 with invalid access token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", "accessToken=tampered.token.value");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("returns 401 if user was deleted (DB check on every request)", async () => {
    const { user, password } = await createVerifiedUser({ email: "deleted@example.com" });
    const cookies = await loginAndGetCookies("deleted@example.com", password);

    // Видаляємо юзера з БД
    await prisma.user.delete({ where: { id: user.id } });

    // Access token досі валідний за підписом, але юзера немає →
    // requireAuth має повернути 401, бо ми робимо DB-lookup.
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", cookies);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});
