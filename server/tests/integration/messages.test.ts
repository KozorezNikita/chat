import request from "supertest";
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";

import { app } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import {
  createUserAndLogin,
  createVerifiedUser,
  createDirectChat,
  createMessage,
} from "../helpers/factories.js";

describe("Messages", () => {
  // ============================================
  // GET /chats/:id/messages
  // ============================================
  describe("GET /chats/:chatId/messages", () => {
    it("returns empty list for new chat", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .get(`/api/v1/chats/${chat.id}/messages`)
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it("returns messages newest-first", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const m1 = await createMessage({ chatId: chat.id, authorId: bob.id, content: "first" });
      const m2 = await createMessage({ chatId: chat.id, authorId: alice.id, content: "second" });
      const m3 = await createMessage({ chatId: chat.id, authorId: bob.id, content: "third" });

      const res = await request(app)
        .get(`/api/v1/chats/${chat.id}/messages`)
        .set("Cookie", cookies);

      expect(res.body.items).toHaveLength(3);
      // Найновіше перше
      expect(res.body.items[0].id).toBe(m3.id);
      expect(res.body.items[1].id).toBe(m2.id);
      expect(res.body.items[2].id).toBe(m1.id);
      expect(res.body.nextCursor).toBeNull();
    });

    it("paginates with cursor", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      // 5 повідомлень
      const messages: Array<{ id: string }> = [];
      for (let i = 0; i < 5; i++) {
        messages.push(
          await createMessage({
            chatId: chat.id,
            authorId: bob.id,
            content: `msg ${i}`,
          }),
        );
      }

      // Перші 2 (найновіші)
      const page1 = await request(app)
        .get(`/api/v1/chats/${chat.id}/messages?limit=2`)
        .set("Cookie", cookies);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.items[0].id).toBe(messages[4]!.id); // newest
      expect(page1.body.items[1].id).toBe(messages[3]!.id);
      expect(page1.body.nextCursor).toBe(messages[3]!.id); // cursor для наступної

      // Наступна сторінка зі cursor-ом
      const page2 = await request(app)
        .get(`/api/v1/chats/${chat.id}/messages?limit=2&cursor=${page1.body.nextCursor}`)
        .set("Cookie", cookies);

      expect(page2.body.items).toHaveLength(2);
      expect(page2.body.items[0].id).toBe(messages[2]!.id);
      expect(page2.body.items[1].id).toBe(messages[1]!.id);
      expect(page2.body.nextCursor).toBe(messages[1]!.id);

      // Остання сторінка — лише 1 повідомлення
      const page3 = await request(app)
        .get(`/api/v1/chats/${chat.id}/messages?limit=2&cursor=${page2.body.nextCursor}`)
        .set("Cookie", cookies);

      expect(page3.body.items).toHaveLength(1);
      expect(page3.body.items[0].id).toBe(messages[0]!.id);
      expect(page3.body.nextCursor).toBeNull();
    });

    it("returns 403 for non-member", async () => {
      const { user: alice } = await createVerifiedUser({ email: "alice@test.com" });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });
      const { cookies: outsiderCookies } = await createUserAndLogin(app, {
        email: "outsider@test.com",
      });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .get(`/api/v1/chats/${chat.id}/messages`)
        .set("Cookie", outsiderCookies);

      expect(res.status).toBe(403);
    });
  });

  // ============================================
  // POST /chats/:id/messages
  // ============================================
  describe("POST /chats/:chatId/messages", () => {
    it("creates message + bumps Chat.updatedAt", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const oldUpdatedAt = chat.updatedAt;

      // Дрібний слип щоб updatedAt точно відрізнявся (на швидкому Postgres
      // різниця може бути 0 мс)
      await new Promise((r) => setTimeout(r, 10));

      const clientId = randomUUID();
      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/messages`)
        .set("Cookie", cookies)
        .send({ clientId, content: "Hello!" });

      expect(res.status).toBe(201);
      expect(res.body.message.content).toBe("Hello!");
      expect(res.body.message.author.id).toBe(alice.id);
      expect(res.body.message.clientId).toBe(clientId);

      // Chat.updatedAt збільшився
      const updatedChat = await prisma.chat.findUnique({ where: { id: chat.id } });
      expect(updatedChat!.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
    });

    it("rejects empty content", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/messages`)
        .set("Cookie", cookies)
        .send({ clientId: randomUUID(), content: "" });

      expect(res.status).toBe(422);
    });

    it("rejects missing clientId", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/messages`)
        .set("Cookie", cookies)
        .send({ content: "Hello" });

      expect(res.status).toBe(422);
    });

    it("returns 403 for non-member", async () => {
      const { user: alice } = await createVerifiedUser({ email: "alice@test.com" });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });
      const { cookies: outsiderCookies } = await createUserAndLogin(app, {
        email: "outsider@test.com",
      });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .post(`/api/v1/chats/${chat.id}/messages`)
        .set("Cookie", outsiderCookies)
        .send({ clientId: randomUUID(), content: "intrusion" });

      expect(res.status).toBe(403);
    });
  });

  // ============================================
  // PATCH /messages/:id
  // ============================================
  describe("PATCH /messages/:id", () => {
    it("author edits own message + sets editedAt", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const message = await createMessage({
        chatId: chat.id,
        authorId: alice.id,
        content: "original",
      });

      const res = await request(app)
        .patch(`/api/v1/messages/${message.id}`)
        .set("Cookie", cookies)
        .send({ content: "edited" });

      expect(res.status).toBe(200);
      expect(res.body.message.content).toBe("edited");
      expect(res.body.message.editedAt).not.toBeNull();
    });

    it("returns 403 when not author", async () => {
      const { user: alice } = await createVerifiedUser({ email: "alice@test.com" });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const aliceMsg = await createMessage({
        chatId: chat.id,
        authorId: alice.id,
        content: "alice's",
      });

      // bob пробує редагувати
      const bobLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: bob.email, password: bobPassword });
      const bobCookies = bobLogin.headers["set-cookie"] as unknown as string[];

      const res = await request(app)
        .patch(`/api/v1/messages/${aliceMsg.id}`)
        .set("Cookie", bobCookies)
        .send({ content: "hacked" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("NOT_MESSAGE_AUTHOR");
    });

    it("cannot edit deleted message", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const message = await createMessage({ chatId: chat.id, authorId: alice.id });

      // Спершу видаляємо
      await request(app)
        .delete(`/api/v1/messages/${message.id}`)
        .set("Cookie", cookies)
        .expect(200);

      // Потім спроба edit
      const res = await request(app)
        .patch(`/api/v1/messages/${message.id}`)
        .set("Cookie", cookies)
        .send({ content: "trying to revive" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("MESSAGE_DELETED");
    });

    it("returns 404 for non-existent message", async () => {
      const { cookies } = await createUserAndLogin(app);

      const res = await request(app)
        .patch("/api/v1/messages/cm00000000000000000000000")
        .set("Cookie", cookies)
        .send({ content: "ghost" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("MESSAGE_NOT_FOUND");
    });
  });

  // ============================================
  // DELETE /messages/:id
  // ============================================
  describe("DELETE /messages/:id", () => {
    it("soft-deletes: deletedAt set, content empty in DTO", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const message = await createMessage({
        chatId: chat.id,
        authorId: alice.id,
        content: "secret",
      });

      const res = await request(app)
        .delete(`/api/v1/messages/${message.id}`)
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body.message.deletedAt).not.toBeNull();
      expect(res.body.message.content).toBe(""); // прихований у DTO

      // Але в БД content залишився (soft delete)
      const dbMessage = await prisma.message.findUnique({ where: { id: message.id } });
      expect(dbMessage?.content).toBe("secret");
      expect(dbMessage?.deletedAt).not.toBeNull();
    });

    it("not author cannot delete", async () => {
      const { user: alice } = await createVerifiedUser({ email: "alice@test.com" });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const aliceMsg = await createMessage({ chatId: chat.id, authorId: alice.id });

      const bobLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: bob.email, password: bobPassword });
      const bobCookies = bobLogin.headers["set-cookie"] as unknown as string[];

      const res = await request(app)
        .delete(`/api/v1/messages/${aliceMsg.id}`)
        .set("Cookie", bobCookies);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("NOT_MESSAGE_AUTHOR");
    });

    it("idempotent: second delete returns same state", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      const message = await createMessage({ chatId: chat.id, authorId: alice.id });

      const first = await request(app)
        .delete(`/api/v1/messages/${message.id}`)
        .set("Cookie", cookies);

      const second = await request(app)
        .delete(`/api/v1/messages/${message.id}`)
        .set("Cookie", cookies);

      expect(second.status).toBe(200);
      expect(second.body.message.deletedAt).toBe(first.body.message.deletedAt);
    });
  });
});
