import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import nodemailer from "nodemailer";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import { createVerifiedUser } from "../helpers/factories.js";
import { generateEmailToken, hashEmailToken, verifyPassword } from "../../src/utils/tokens.js";

describe("Password reset flow", () => {
  describe("POST /api/v1/auth/request-password-reset", () => {
    it("creates token and sends email for existing user", async () => {
      const { user } = await createVerifiedUser({ email: "reset@example.com" });

      const res = await request(app)
        .post("/api/v1/auth/request-password-reset")
        .send({ email: "reset@example.com" });

      expect(res.status).toBe(200);

      const tokens = await prisma.emailToken.findMany({
        where: { userId: user.id, type: "PASSWORD_RESET" },
      });
      expect(tokens).toHaveLength(1);

      const transporter = vi.mocked(nodemailer.createTransport).mock.results[0]?.value;
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "reset@example.com" }),
      );
    });

    it("returns 200 even for unknown email (no enumeration)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/request-password-reset")
        .send({ email: "nobody@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("invalidates previous reset tokens (only one active at a time)", async () => {
      const { user } = await createVerifiedUser({ email: "multi@example.com" });

      await request(app)
        .post("/api/v1/auth/request-password-reset")
        .send({ email: "multi@example.com" })
        .expect(200);

      await request(app)
        .post("/api/v1/auth/request-password-reset")
        .send({ email: "multi@example.com" })
        .expect(200);

      const tokens = await prisma.emailToken.findMany({
        where: { userId: user.id, type: "PASSWORD_RESET" },
      });
      // Старий має бути deleted, тільки 1 активний
      expect(tokens).toHaveLength(1);
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    async function createPendingReset(email: string) {
      const { user } = await createVerifiedUser({ email });
      const rawToken = generateEmailToken();
      await prisma.emailToken.create({
        data: {
          tokenHash: hashEmailToken(rawToken),
          type: "PASSWORD_RESET",
          userId: user.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      return { user, rawToken };
    }

    it("changes password and revokes ALL user sessions", async () => {
      const { user, rawToken } = await createPendingReset("change@example.com");

      // Створюємо кілька активних сесій (login з різних "пристроїв")
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "change@example.com", password: "Password123" });
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "change@example.com", password: "Password123" });

      const beforeReset = await prisma.refreshToken.findMany({
        where: { userId: user.id, revokedAt: null },
      });
      expect(beforeReset.length).toBeGreaterThanOrEqual(2);

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: rawToken, password: "NewSecurePass456" });

      expect(res.status).toBe(200);

      // Новий пароль працює
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(await verifyPassword(dbUser!.password, "NewSecurePass456")).toBe(true);
      expect(await verifyPassword(dbUser!.password, "Password123")).toBe(false);

      // Усі сесії revoked
      const afterReset = await prisma.refreshToken.findMany({
        where: { userId: user.id, revokedAt: null },
      });
      expect(afterReset).toHaveLength(0);
    });

    it("returns 400 for invalid token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "fake", password: "NewPassword123" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });

    it("returns 422 for weak new password", async () => {
      const { rawToken } = await createPendingReset("weak@example.com");

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: rawToken, password: "weak" });

      expect(res.status).toBe(422);
    });
  });
});
