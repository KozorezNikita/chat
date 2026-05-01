import request from "supertest";
import { describe, it, expect } from "vitest";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import { createUser } from "../helpers/factories.js";
import { generateEmailToken, hashEmailToken } from "../../src/utils/tokens.js";

describe("POST /api/v1/auth/verify-email", () => {
  /**
   * Створює юзера + valid email-verification токен, повертає raw token.
   */
  async function createPendingVerification(email: string) {
    const { user } = await createUser({ email, emailVerified: false });
    const rawToken = generateEmailToken();
    await prisma.emailToken.create({
      data: {
        tokenHash: hashEmailToken(rawToken),
        type: "EMAIL_VERIFICATION",
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { user, rawToken };
  }

  it("verifies user with valid token", async () => {
    const { user, rawToken } = await createPendingVerification("verify@example.com");

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.emailVerified).toBe(true);

    // Token marked as used
    const token = await prisma.emailToken.findFirst({ where: { userId: user.id } });
    expect(token?.usedAt).not.toBeNull();
  });

  it("returns 400 for unknown token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: "fake-token-that-does-not-exist" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("returns 400 if token already used (idempotency check)", async () => {
    const { rawToken } = await createPendingVerification("doubleuse@example.com");

    await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken })
      .expect(200);

    const second = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("INVALID_TOKEN");
  });

  it("returns 400 for expired token", async () => {
    const { user } = await createUser({ email: "expired-verify@example.com" });
    const rawToken = generateEmailToken();
    await prisma.emailToken.create({
      data: {
        tokenHash: hashEmailToken(rawToken),
        type: "EMAIL_VERIFICATION",
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000), // past
      },
    });

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });
});
