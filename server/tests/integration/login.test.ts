import request from "supertest";
import { describe, it, expect } from "vitest";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import { createUser, createVerifiedUser } from "../helpers/factories.js";

describe("POST /api/v1/auth/login", () => {
  it("returns user + sets cookies on success", async () => {
    const { user, password } = await createVerifiedUser({ email: "bob@example.com" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "bob@example.com", password });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.email).toBe("bob@example.com");
    expect(res.body.user.emailVerified).toBe(true);

    // Cookies
    const cookies = res.headers["set-cookie"];
    expect(Array.isArray(cookies)).toBe(true);
    const cookieStr = (cookies as unknown as string[]).join("\n");
    expect(cookieStr).toContain("accessToken=");
    expect(cookieStr).toContain("refreshToken=");
    expect(cookieStr).toContain("HttpOnly");

    // Refresh у БД
    const refreshes = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]?.revokedAt).toBeNull();
  });

  it("returns 401 with INVALID_CREDENTIALS for wrong password", async () => {
    await createVerifiedUser({ email: "carol@example.com" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "carol@example.com", password: "WrongPassword99" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns same 401 for unknown email (no user enumeration)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "Password123" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 403 EMAIL_NOT_VERIFIED for unverified user", async () => {
    const { password } = await createUser({
      email: "unverified@example.com",
      emailVerified: false,
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "unverified@example.com", password });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("creates a NEW family for each login (multiple devices)", async () => {
    const { user, password } = await createVerifiedUser({ email: "dave@example.com" });

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "dave@example.com", password })
      .expect(200);

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "dave@example.com", password })
      .expect(200);

    const refreshes = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(refreshes).toHaveLength(2);
    expect(refreshes[0]?.family).not.toBe(refreshes[1]?.family);
  });
});
