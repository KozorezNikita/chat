import { describe, it, expect } from "vitest";

import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateEmailToken,
  hashEmailToken,
  hashPassword,
  verifyPassword,
} from "../../src/utils/tokens.js";

/**
 * Unit-тести для tokens.ts — pure functions без БД.
 *
 * Тут перевіряємо security-properties:
 * - детермінованість хешів (для lookup-у у БД)
 * - унікальність випадкових токенів
 * - argon2 verify працює з реальним hash
 * - JWT verify приймає валідний і відхиляє невалідний
 */

describe("tokens", () => {
  describe("JWT access token", () => {
    it("signs and verifies token roundtrip", async () => {
      const userId = "user_abc123";
      const token = await signAccessToken(userId);

      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // header.payload.signature

      const payload = await verifyAccessToken(token);
      expect(payload.sub).toBe(userId);
    });

    it("throws on tampered token", async () => {
      const token = await signAccessToken("user_x");
      const tampered = token.slice(0, -5) + "XXXXX";

      await expect(verifyAccessToken(tampered)).rejects.toThrow();
    });

    it("throws on completely invalid token", async () => {
      await expect(verifyAccessToken("not.a.jwt")).rejects.toThrow();
    });

    it("payload contains only sub (no leaked PII)", async () => {
      const token = await signAccessToken("user_y");
      const payload = await verifyAccessToken(token);

      expect(payload.sub).toBe("user_y");
      // Жодних email, name, username, etc.
      expect(payload).not.toHaveProperty("email");
      expect(payload).not.toHaveProperty("name");
      expect(payload).not.toHaveProperty("password");
    });
  });

  describe("Refresh token", () => {
    it("generates URL-safe base64 string of expected length", () => {
      const token = generateRefreshToken();
      // 32 bytes → 43 base64url chars (без padding)
      expect(token).toHaveLength(43);
      // base64url alphabet: A-Z, a-z, 0-9, -, _
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("two consecutive calls produce different tokens", () => {
      const a = generateRefreshToken();
      const b = generateRefreshToken();
      expect(a).not.toBe(b);
    });

    it("hash is deterministic (for DB lookup)", () => {
      const token = generateRefreshToken();
      expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    });

    it("different tokens produce different hashes", () => {
      const a = generateRefreshToken();
      const b = generateRefreshToken();
      expect(hashRefreshToken(a)).not.toBe(hashRefreshToken(b));
    });

    it("hash is hex-encoded SHA-256 (64 chars)", () => {
      const token = generateRefreshToken();
      const hash = hashRefreshToken(token);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe("Email token", () => {
    it("generates token with same properties as refresh token", () => {
      const token = generateEmailToken();
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("hash is deterministic", () => {
      const token = generateEmailToken();
      expect(hashEmailToken(token)).toBe(hashEmailToken(token));
    });
  });

  describe("Password (argon2)", () => {
    it("verifies correct password", async () => {
      const hash = await hashPassword("Password123");
      expect(await verifyPassword(hash, "Password123")).toBe(true);
    });

    it("rejects wrong password", async () => {
      const hash = await hashPassword("Password123");
      expect(await verifyPassword(hash, "WrongPassword")).toBe(false);
    });

    it("hash format is argon2id PHC string", async () => {
      const hash = await hashPassword("Password123");
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it("two hashes of same password differ (random salt)", async () => {
      const a = await hashPassword("Password123");
      const b = await hashPassword("Password123");
      expect(a).not.toBe(b);
      // але обидва verify правильно
      expect(await verifyPassword(a, "Password123")).toBe(true);
      expect(await verifyPassword(b, "Password123")).toBe(true);
    });

    it("verify returns false (not throws) on malformed hash", async () => {
      expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    });
  });
});
