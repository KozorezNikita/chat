import request from "supertest";
import { describe, it, expect } from "vitest";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import {
  createUserAndLogin,
  createVerifiedUser,
  createDirectChat,
  createGroupChat,
  loginAndGetCookies,
} from "../helpers/factories.js";

describe("Chat membership operations", () => {
  // ============================================
  // POST /chats/:id/members
  // ============================================
  describe("POST /chats/:id/members", () => {
    it("OWNER adds user to group", async () => {
      const { user: owner, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });
      const { user: carol } = await createVerifiedUser({ email: "carol@test.com" });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });

      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/members`)
        .set("Cookie", cookies)
        .send({ userId: carol.id });

      expect(res.status).toBe(201);
      expect(res.body.member.id).toBe(carol.id);

      // У БД 3 активних members
      const members = await prisma.chatMember.findMany({
        where: { chatId: chat.id, leftAt: null },
      });
      expect(members).toHaveLength(3);
    });

    it("MEMBER cannot add (only OWNER)", async () => {
      const { user: owner } = await createVerifiedUser({ email: "owner@test.com" });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });
      const { user: carol } = await createVerifiedUser({ email: "carol@test.com" });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });

      const bobCookies = await loginAndGetCookies(app, bob.email, bobPassword);

      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/members`)
        .set("Cookie", bobCookies)
        .send({ userId: carol.id });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("NOT_CHAT_OWNER");
    });

    it("returns 409 if user already a member", async () => {
      const { user: owner, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });

      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/members`)
        .set("Cookie", cookies)
        .send({ userId: bob.id });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_MEMBER");
    });

    it("returns 400 for direct chat", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });
      const { user: carol } = await createVerifiedUser({ email: "carol@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/members`)
        .set("Cookie", cookies)
        .send({ userId: carol.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_OPERATION_FOR_DIRECT_CHAT");
    });
  });

  // ============================================
  // DELETE /chats/:id/members/:userId
  // ============================================
  describe("DELETE /chats/:id/members/:userId", () => {
    it("OWNER kicks member", async () => {
      const { user: owner, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });

      const res = await request(app)
        .delete(`/api/v1/chats/${chat.id}/members/${bob.id}`)
        .set("Cookie", cookies);

      expect(res.status).toBe(204);

      // Bob soft-removed (leftAt != null)
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: chat.id, userId: bob.id } },
      });
      expect(member?.leftAt).not.toBeNull();
    });

    it("user can leave themselves (self-leave)", async () => {
      const { user: owner } = await createVerifiedUser({ email: "owner@test.com" });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });
      const bobCookies = await loginAndGetCookies(app, bob.email, bobPassword);

      const res = await request(app)
        .delete(`/api/v1/chats/${chat.id}/members/${bob.id}`)
        .set("Cookie", bobCookies);

      expect(res.status).toBe(204);
    });

    it("MEMBER cannot remove other members", async () => {
      const { user: owner } = await createVerifiedUser({ email: "owner@test.com" });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });
      const { user: carol } = await createVerifiedUser({ email: "carol@test.com" });

      const chat = await createGroupChat({
        ownerId: owner.id,
        memberIds: [bob.id, carol.id],
      });
      const bobCookies = await loginAndGetCookies(app, bob.email, bobPassword);

      const res = await request(app)
        .delete(`/api/v1/chats/${chat.id}/members/${carol.id}`)
        .set("Cookie", bobCookies);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("NOT_CHAT_OWNER");
    });

    it("cannot remove last OWNER", async () => {
      const { user: owner, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });

      const res = await request(app)
        .delete(`/api/v1/chats/${chat.id}/members/${owner.id}`)
        .set("Cookie", cookies);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("LAST_OWNER");
    });

    it("returns 400 for direct chat", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .delete(`/api/v1/chats/${chat.id}/members/${bob.id}`)
        .set("Cookie", cookies);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_OPERATION_FOR_DIRECT_CHAT");
    });
  });
});
