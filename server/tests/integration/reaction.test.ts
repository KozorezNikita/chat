import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";

import { app } from "../helpers/app.js";
import {
  createVerifiedUser,
  loginAndGetCookies,
  createDirectChat,
  createMessage,
} from "../helpers/factories.js";
import {
  startTestSocketServer,
  connectSocketClient,
  waitForEvent,
  disconnectAll,
} from "../helpers/socket-client.js";
import { prisma } from "../../src/db/prisma.js";

/**
 * ============================================
 * Reactions tests
 * ============================================
 *
 * Покриваємо:
 *  1. Toggle add → DB запис створено, response { action: "added" }
 *  2. Toggle remove → запис видалено
 *  3. Multiple users → count правильний
 *  4. Whitelist → 422 на емодзі поза 6 дозволеними
 *  5. Non-member → 403
 *  6. Broadcast reaction:updated → інший member отримує
 */

describe("Reactions", () => {
  let port: number;
  const allSockets: Awaited<ReturnType<typeof connectSocketClient>>[] = [];

  beforeAll(async () => {
    const server = await startTestSocketServer();
    port = server.port;
  });

  afterEach(() => {
    disconnectAll(allSockets);
    allSockets.length = 0;
  });

  afterAll(async () => {
    disconnectAll(allSockets);
  });

  it("toggle add creates reaction in DB", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    const msg = await createMessage({ chatId: chat.id, authorId: bob.id });

    const cookies = await loginAndGetCookies(app, alice.email, password);

    const res = await request(app)
      .post(`/api/v1/messages/${msg.id}/reactions`)
      .set("Cookie", cookies)
      .send({ emoji: "👍" });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("added");
    expect(res.body.reactions).toEqual([
      expect.objectContaining({ emoji: "👍", userId: alice.id }),
    ]);

    const dbRow = await prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId: msg.id, userId: alice.id, emoji: "👍" },
      },
    });
    expect(dbRow).not.toBeNull();
  });

  it("toggle on existing reaction removes it", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    const msg = await createMessage({ chatId: chat.id, authorId: bob.id });
    const cookies = await loginAndGetCookies(app, alice.email, password);

    // 1: add
    await request(app)
      .post(`/api/v1/messages/${msg.id}/reactions`)
      .set("Cookie", cookies)
      .send({ emoji: "❤️" });

    // 2: toggle off
    const res = await request(app)
      .post(`/api/v1/messages/${msg.id}/reactions`)
      .set("Cookie", cookies)
      .send({ emoji: "❤️" });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("removed");
    expect(res.body.reactions).toEqual([]);

    const dbRow = await prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId: msg.id, userId: alice.id, emoji: "❤️" },
      },
    });
    expect(dbRow).toBeNull();
  });

  it("multiple users can react with same emoji — count grows", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob, password: bobPwd } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    const msg = await createMessage({ chatId: chat.id, authorId: alice.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);
    const bobCookies = await loginAndGetCookies(app, bob.email, bobPwd);

    await request(app)
      .post(`/api/v1/messages/${msg.id}/reactions`)
      .set("Cookie", aliceCookies)
      .send({ emoji: "🎉" });

    const res = await request(app)
      .post(`/api/v1/messages/${msg.id}/reactions`)
      .set("Cookie", bobCookies)
      .send({ emoji: "🎉" });

    expect(res.body.reactions).toHaveLength(2);
    expect(res.body.reactions.map((r: { userId: string }) => r.userId).sort()).toEqual(
      [alice.id, bob.id].sort(),
    );
  });

  it("rejects emoji outside the whitelist", async () => {
    const { user, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: user.id, userIdB: bob.id });
    const msg = await createMessage({ chatId: chat.id, authorId: bob.id });
    const cookies = await loginAndGetCookies(app, user.email, password);

    const res = await request(app)
      .post(`/api/v1/messages/${msg.id}/reactions`)
      .set("Cookie", cookies)
      .send({ emoji: "🦄" }); // не в whitelist

    expect(res.status).toBe(422);
  });

  it("non-member cannot react to message", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const { user: outsider, password: outsiderPwd } = await createVerifiedUser();
    void alicePwd;

    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    const msg = await createMessage({ chatId: chat.id, authorId: alice.id });
    const outsiderCookies = await loginAndGetCookies(app, outsider.email, outsiderPwd);

    const res = await request(app)
      .post(`/api/v1/messages/${msg.id}/reactions`)
      .set("Cookie", outsiderCookies)
      .send({ emoji: "👍" });

    expect(res.status).toBe(403);
  });

  it("broadcasts reaction:updated to other chat members", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob, password: bobPwd } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    const msg = await createMessage({ chatId: chat.id, authorId: alice.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);
    const bobCookies = await loginAndGetCookies(app, bob.email, bobPwd);

    // Bob connect-иться щоб слухати broadcast
    const bobSocket = await connectSocketClient(port, bobCookies);
    allSockets.push(bobSocket);

    // Дочекатись що server-side connect handler join-нув chat-room
    await new Promise((r) => setTimeout(r, 150));

    const eventPromise = waitForEvent<{
      chatId: string;
      messageId: string;
      reactions: { emoji: string; userId: string }[];
    }>(bobSocket, "reaction:updated", 2000);

    // Alice toggle через REST
    await request(app)
      .post(`/api/v1/messages/${msg.id}/reactions`)
      .set("Cookie", aliceCookies)
      .send({ emoji: "😂" });

    const payload = await eventPromise;
    expect(payload).not.toBeNull();
    expect(payload?.chatId).toBe(chat.id);
    expect(payload?.messageId).toBe(msg.id);
    expect(payload?.reactions).toEqual([
      expect.objectContaining({ emoji: "😂", userId: alice.id }),
    ]);
  });
});
