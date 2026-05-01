import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import nodemailer from "nodemailer";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";

describe("POST /api/v1/auth/register", () => {
  const validBody = {
    name: "Alice",
    email: "alice@example.com",
    password: "Password123",
  };

  it("creates a user with hashed password and sends verification email", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: "Alice",
      username: null,
      avatarUrl: null,
    });
    expect(res.body.user.id).toMatch(/^c[a-z0-9]{20,}$/); // cuid
    // Не leak-имо email у public DTO
    expect(res.body.user.email).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();

    // Юзер у БД
    const dbUser = await prisma.user.findUnique({ where: { email: "alice@example.com" } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.emailVerified).toBe(false);
    expect(dbUser?.password).not.toBe("Password123"); // hashed
    expect(dbUser?.password).toMatch(/^\$argon2id\$/);

    // Verification token у БД
    const token = await prisma.emailToken.findFirst({
      where: { userId: dbUser!.id, type: "EMAIL_VERIFICATION" },
    });
    expect(token).not.toBeNull();
    expect(token?.usedAt).toBeNull();

    // Email був надісланий
    const transporter = vi.mocked(nodemailer.createTransport).mock.results[0]?.value;
    expect(transporter.sendMail).toHaveBeenCalledOnce();
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: expect.stringContaining("email"),
      }),
    );
  });

  it("returns 409 if email already taken", async () => {
    await request(app).post("/api/v1/auth/register").send(validBody).expect(201);

    const res = await request(app).post("/api/v1/auth/register").send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_TAKEN");
  });

  it("returns 422 for invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validBody, email: "not-an-email" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED_BODY");
  });

  it("returns 422 for weak password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validBody, password: "short" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED_BODY");
  });

  it("normalizes email to lowercase", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validBody, email: "Alice@EXAMPLE.com" })
      .expect(201);

    const dbUser = await prisma.user.findUnique({ where: { email: "alice@example.com" } });
    expect(dbUser).not.toBeNull();
  });
});
