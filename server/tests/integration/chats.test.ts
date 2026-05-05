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
} from "../helpers/factories.js";

describe("Chat CRUD", () => {
  // ============================================
  // GET /api/v1/chats
  // ============================================
  describe("GET /chats", () => {
    it("returns empty list for new user", async () => {
      const { cookies } = await createUserAndLogin(app);

      const res = await request(app).get("/api/v1/chats").set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ chats: [] });
    });

    it("returns chats user is member of", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app, {
        email: "alice@test.com",
      });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });
      const { user: carol } = await createVerifiedUser({ email: "carol@test.com" });

      await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      await createGroupChat({
        ownerId: alice.id,
        memberIds: [bob.id, carol.id],
        name: "Test group",
      });
      // Чат без alice — не повинен з'явитись
      await createDirectChat({ userIdA: bob.id, userIdB: carol.id });

      const res = await request(app).get("/api/v1/chats").set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(2);
    });

    it("includes lastMessage when chat has messages", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app, {
        email: "alice@test.com",
      });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
      await createMessage({ chatId: chat.id, authorId: bob.id, content: "Hi Alice" });

      const res = await request(app).get("/api/v1/chats").set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body.chats[0].lastMessage).toMatchObject({
        content: "Hi Alice",
        authorId: bob.id,
        isDeleted: false,
      });
    });

    it("counts unread messages from others", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app, {
        email: "alice@test.com",
      });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      // 3 повідомлення від bob — мають бути unread для alice
      await createMessage({ chatId: chat.id, authorId: bob.id });
      await createMessage({ chatId: chat.id, authorId: bob.id });
      await createMessage({ chatId: chat.id, authorId: bob.id });
      // 1 повідомлення від alice — НЕ має бути unread для alice (своє)
      await createMessage({ chatId: chat.id, authorId: alice.id });

      const res = await request(app).get("/api/v1/chats").set("Cookie", cookies);

      expect(res.body.chats[0].unreadCount).toBe(3);
    });
  });

  // ============================================
  // GET /api/v1/chats/:id
  // ============================================
  describe("GET /chats/:id", () => {
    it("returns chat with members", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app, {
        email: "alice@test.com",
        name: "Alice",
      });
      const { user: bob } = await createVerifiedUser({
        email: "bob@test.com",
        name: "Bob",
      });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .get(`/api/v1/chats/${chat.id}`)
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body.chat.id).toBe(chat.id);
      expect(res.body.chat.members).toHaveLength(2);
      expect(res.body.chat.members.map((m: { user: { name: string } }) => m.user.name).sort())
        .toEqual(["Alice", "Bob"]);
    });

    it("returns 403 for non-member", async () => {
      const { user: alice } = await createVerifiedUser({ email: "alice@test.com" });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });
      const { cookies: outsiderCookies } = await createUserAndLogin(app, {
        email: "outsider@test.com",
      });

      const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

      const res = await request(app)
        .get(`/api/v1/chats/${chat.id}`)
        .set("Cookie", outsiderCookies);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("NOT_A_MEMBER");
    });

    it("returns 403 for non-existent chat (no leak that chat doesn't exist)", async () => {
      const { cookies } = await createUserAndLogin(app);

      const res = await request(app)
        .get("/api/v1/chats/cm00000000000000000000000")
        .set("Cookie", cookies);

      // Privacy: 403 а не 404, щоб не leak existence
      expect(res.status).toBe(403);
    });
  });

  // ============================================
  // POST /api/v1/chats/direct
  // ============================================
  describe("POST /chats/direct", () => {
    it("creates new direct chat", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app, {
        email: "alice@test.com",
      });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const res = await request(app)
        .post("/api/v1/chats/direct")
        .set("Cookie", cookies)
        .send({ userId: bob.id });

      expect(res.status).toBe(201);
      expect(res.body.chat.type).toBe("DIRECT");
      expect(res.body.chat.members).toHaveLength(2);

      // У БД є ChatMember з обома юзерами
      const memberIds = await prisma.chatMember
        .findMany({ where: { chatId: res.body.chat.id }, select: { userId: true } })
        .then((rows) => rows.map((r: { userId: string }) => r.userId).sort());
      expect(memberIds).toEqual([alice.id, bob.id].sort());
    });

    it("returns existing chat on second call (upsert by directKey)", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app, {
        email: "alice@test.com",
      });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const first = await request(app)
        .post("/api/v1/chats/direct")
        .set("Cookie", cookies)
        .send({ userId: bob.id });

      const second = await request(app)
        .post("/api/v1/chats/direct")
        .set("Cookie", cookies)
        .send({ userId: bob.id });

      expect(first.body.chat.id).toBe(second.body.chat.id);
      // У БД лише один Chat
      const count = await prisma.chat.count({ where: { type: "DIRECT" } });
      expect(count).toBe(1);
    });

    it("works in either direction (A->B == B->A)", async () => {
      const { user: alice, cookies: aliceCookies } = await createUserAndLogin(app, {
        email: "alice@test.com",
        password: "Password123",
      });
      const { user: bob, password: bobPassword } = await createVerifiedUser({
        email: "bob@test.com",
      });

      // alice створює чат з bob
      const fromAlice = await request(app)
        .post("/api/v1/chats/direct")
        .set("Cookie", aliceCookies)
        .send({ userId: bob.id });

      // bob логіниться і створює чат з alice
      const bobLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: bob.email, password: bobPassword });
      const bobCookies = bobLogin.headers["set-cookie"] as unknown as string[];

      const fromBob = await request(app)
        .post("/api/v1/chats/direct")
        .set("Cookie", bobCookies)
        .send({ userId: alice.id });

      expect(fromAlice.body.chat.id).toBe(fromBob.body.chat.id);
    });

    it("rejects self-chat", async () => {
      const { user, cookies } = await createUserAndLogin(app);

      const res = await request(app)
        .post("/api/v1/chats/direct")
        .set("Cookie", cookies)
        .send({ userId: user.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("CANNOT_CHAT_WITH_SELF");
    });

    it("returns 404 for unknown user", async () => {
      const { cookies } = await createUserAndLogin(app);

      const res = await request(app)
        .post("/api/v1/chats/direct")
        .set("Cookie", cookies)
        .send({ userId: "cm00000000000000000000000" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("USER_NOT_FOUND");
    });
  });

  // ============================================
  // POST /api/v1/chats/group
  // ============================================
  describe("POST /chats/group", () => {
    it("creates group with owner + members", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app, {
        email: "alice@test.com",
      });
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });
      const { user: carol } = await createVerifiedUser({ email: "carol@test.com" });

      const res = await request(app)
        .post("/api/v1/chats/group")
        .set("Cookie", cookies)
        .send({ name: "Team chat", memberIds: [bob.id, carol.id] });

      expect(res.status).toBe(201);
      expect(res.body.chat.type).toBe("GROUP");
      expect(res.body.chat.name).toBe("Team chat");
      expect(res.body.chat.members).toHaveLength(3);

      const owner = res.body.chat.members.find(
        (m: { role: string }) => m.role === "OWNER",
      );
      expect(owner.user.id).toBe(alice.id);
    });

    it("deduplicates memberIds", async () => {
      const { cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const res = await request(app)
        .post("/api/v1/chats/group")
        .set("Cookie", cookies)
        .send({ name: "Test", memberIds: [bob.id, bob.id, bob.id] });

      expect(res.status).toBe(201);
      // owner + bob = 2, не 4
      expect(res.body.chat.members).toHaveLength(2);
    });

    it("strips self from memberIds", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const res = await request(app)
        .post("/api/v1/chats/group")
        .set("Cookie", cookies)
        .send({ name: "Test", memberIds: [alice.id, bob.id] });

      expect(res.status).toBe(201);
      // alice один раз як OWNER, bob як MEMBER — 2 records, не 3
      expect(res.body.chat.members).toHaveLength(2);
    });

    it("returns 400 for empty member list (after self-strip)", async () => {
      const { user: alice, cookies } = await createUserAndLogin(app);

      const res = await request(app)
        .post("/api/v1/chats/group")
        .set("Cookie", cookies)
        .send({ name: "Lonely group", memberIds: [alice.id] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("EMPTY_MEMBER_LIST");
    });

    it("returns 400 if any memberId doesn't exist", async () => {
      const { cookies } = await createUserAndLogin(app);
      const { user: bob } = await createVerifiedUser({ email: "bob@test.com" });

      const res = await request(app)
        .post("/api/v1/chats/group")
        .set("Cookie", cookies)
        .send({
          name: "Test",
          memberIds: [bob.id, "cm99999999999999999999999"],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("MEMBERS_NOT_FOUND");
    });
  });
});
