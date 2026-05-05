import request from "supertest";
import { describe, it, expect } from "vitest";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import {
  createUserAndLogin,
  createVerifiedUser,
  createDirectChat,
  createGroupChat,
  createMessage,
  loginAndGetCookies,
} from "../helpers/factories.js";

describe("Chat permissions", () => {
  // ============================================
  // PATCH /chats/:id (only OWNER)
  // ============================================
  describe("PATCH /chats/:id", () => {
    it("OWNER can update group", async () => {
      const { user: owner, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createGroupChat({
        ownerId: owner.id,
        memberIds: [bob.id],
        name: "Old name",
      });

      const res = await request(app)
        .patch(`/api/v1/chats/${chat.id}`)
        .set("Cookie", cookies)
        .send({ name: "New name" });

      expect(res.status).toBe(200);
      expect(res.body.chat.name).toBe("New name");
    });

    it("MEMBER cannot update", async () => {
      const { user: owner } = await createVerifiedUser({ email: "owner@test.com" });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });
      const bobCookies = await loginAndGetCookies(app, bob.email, bobPassword);

      const res = await request(app)
        .patch(`/api/v1/chats/${chat.id}`)
        .set("Cookie", bobCookies)
        .send({ name: "Hacked" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("NOT_CHAT_OWNER");
    });

    it("cannot update direct chat", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .patch(`/api/v1/chats/${chat.id}`)
        .set("Cookie", cookies)
        .send({ name: "Renamed" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_OPERATION_FOR_DIRECT_CHAT");
    });
  });

  // ============================================
  // DELETE /chats/:id
  // ============================================
  describe("DELETE /chats/:id", () => {
    it("OWNER deletes group + cascades members/messages", async () => {
      const { user: owner, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });
      await createMessage({ chatId: chat.id, authorId: owner.id });

      const res = await request(app)
        .delete(`/api/v1/chats/${chat.id}`)
        .set("Cookie", cookies);

      expect(res.status).toBe(204);

      // CASCADE: і чат, і members, і messages пропали
      expect(await prisma.chat.findUnique({ where: { id: chat.id } })).toBeNull();
      expect(await prisma.chatMember.count({ where: { chatId: chat.id } })).toBe(0);
      expect(await prisma.message.count({ where: { chatId: chat.id } })).toBe(0);
    });

    it("MEMBER cannot delete", async () => {
      const { user: owner } = await createVerifiedUser({ email: "owner@test.com" });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });
      const bobCookies = await loginAndGetCookies(app, bob.email, bobPassword);

      const res = await request(app)
        .delete(`/api/v1/chats/${chat.id}`)
        .set("Cookie", bobCookies);

      expect(res.status).toBe(403);
    });

    it("cannot delete direct chat", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .delete(`/api/v1/chats/${chat.id}`)
        .set("Cookie", cookies);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_OPERATION_FOR_DIRECT_CHAT");
    });
  });

  // ============================================
  // POST /chats/:id/read
  // ============================================
  describe("POST /chats/:id/read (mark as read)", () => {
    it("any member can mark chat as read", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const message = await createMessage({ chatId: chat.id, authorId: bob.id });

      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/read`)
        .set("Cookie", cookies)
        .send({ messageId: message.id });

      expect(res.status).toBe(200);

      // У БД lastReadMessageId оновився
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: chat.id, userId: alice.id } },
      });
      expect(member?.lastReadMessageId).toBe(message.id);
    });

    it("anti-rewind: older messageId does not overwrite newer", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const m1 = await createMessage({ chatId: chat.id, authorId: bob.id });
      const m2 = await createMessage({ chatId: chat.id, authorId: bob.id });

      // Спочатку читаємо до m2
      await request(app)
        .post(`/api/v1/chats/${chat.id}/read`)
        .set("Cookie", cookies)
        .send({ messageId: m2.id })
        .expect(200);

      // Потім спроба "відмотати" до m1 — не повинна оновити
      await request(app)
        .post(`/api/v1/chats/${chat.id}/read`)
        .set("Cookie", cookies)
        .send({ messageId: m1.id })
        .expect(200); // endpoint не падає, просто no-op

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: chat.id, userId: alice.id } },
      });
      // lastReadMessageId лишається m2.id, не "відмотаний" до m1
      expect(member?.lastReadMessageId).toBe(m2.id);
    });
  });

  // ============================================
  // requireChatMembership middleware
  // ============================================
  describe("requireChatMembership middleware", () => {
    it("returns 404 for left member (chat hidden after leave)", async () => {
      const { user: owner } = await createVerifiedUser({ email: "owner@test.com" });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });

      const chat = await createGroupChat({ ownerId: owner.id, memberIds: [bob.id] });
      const bobCookies = await loginAndGetCookies(app, bob.email, bobPassword);

      // Bob leaves
      await request(app)
        .delete(`/api/v1/chats/${chat.id}/members/${bob.id}`)
        .set("Cookie", bobCookies)
        .expect(204);

      // Тепер Bob пробує відкрити чат
      const res = await request(app)
        .get(`/api/v1/chats/${chat.id}`)
        .set("Cookie", bobCookies);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("CHAT_NOT_FOUND");
    });
  });
});
