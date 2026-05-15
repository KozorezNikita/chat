import { describe, it, expect } from "vitest";
import request from "supertest";

import { app } from "../helpers/app.js";
import {
  createVerifiedUser,
  loginAndGetCookies,
  createDirectChat,
  createMessage,
} from "../helpers/factories.js";
import { prisma } from "../../src/db/prisma.js";

/**
 * ============================================
 * FTS search tests
 * ============================================
 *
 * GET /api/v1/search/messages?q=...
 *
 * Покриваємо:
 *  1. Basic match → result з headline + [[match]] markers
 *  2. Cross-chat privacy → не повертає messages з чатів де юзер не member
 *  3. Ranking → результати в порядку relevance
 *  4. No match → results=[], total=0
 *  5. Pagination → limit + offset + hasMore
 *  6. Deleted message не у результаті
 */

describe("FTS search", () => {
  it("returns matched messages with headline markers", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const msg = await createMessage({
      chatId: chat.id,
      authorId: bob.id,
      content: "Hello Alice, nice to meet you",
    });

    const cookies = await loginAndGetCookies(app, alice.email, password);

    const res = await request(app)
      .get("/api/v1/search/messages")
      .query({ q: "hello" })
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const found = res.body.results.find(
      (r: { messageId: string }) => r.messageId === msg.id,
    );
    expect(found).toBeDefined();
    expect(found.headline).toContain("[[Hello]]");
    expect(found.chatName).toBe(bob.name); // DM partner name
    expect(found.authorName).toBe(bob.name);
  });

  it("does not return messages from chats where user is not a member", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const { user: charlie } = await createVerifiedUser();

    // Chat без alice
    const otherChat = await createDirectChat({ userIdA: bob.id, userIdB: charlie.id });
    const secretMsg = await createMessage({
      chatId: otherChat.id,
      authorId: bob.id,
      content: "Secret password is hunter2",
    });

    const aliceCookies = await loginAndGetCookies(app, alice.email, password);
    const res = await request(app)
      .get("/api/v1/search/messages")
      .query({ q: "hunter2" })
      .set("Cookie", aliceCookies);

    expect(res.status).toBe(200);
    const found = res.body.results.find(
      (r: { messageId: string }) => r.messageId === secretMsg.id,
    );
    expect(found).toBeUndefined();
  });

  it("ranks more relevant matches higher", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    // Two messages, one з більше повторень word "search"
    const denseMatch = await createMessage({
      chatId: chat.id,
      authorId: bob.id,
      content: "search search search algorithms",
    });
    const sparseMatch = await createMessage({
      chatId: chat.id,
      authorId: bob.id,
      content: "today I did a quick search",
    });

    const cookies = await loginAndGetCookies(app, alice.email, password);
    const res = await request(app)
      .get("/api/v1/search/messages")
      .query({ q: "search" })
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    const ids = res.body.results.map((r: { messageId: string }) => r.messageId);
    // denseMatch має бути вище у списку
    const denseIdx = ids.indexOf(denseMatch.id);
    const sparseIdx = ids.indexOf(sparseMatch.id);
    expect(denseIdx).toBeGreaterThanOrEqual(0);
    expect(sparseIdx).toBeGreaterThanOrEqual(0);
    expect(denseIdx).toBeLessThan(sparseIdx);
  });

  it("returns empty results when no match", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    await createMessage({ chatId: chat.id, authorId: bob.id, content: "hi there" });

    const cookies = await loginAndGetCookies(app, alice.email, password);
    const res = await request(app)
      .get("/api/v1/search/messages")
      .query({ q: "nonexistentword" })
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.hasMore).toBe(false);
  });

  it("paginates results with limit + offset + hasMore", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    // 3 повідомлення з тим самим словом
    await createMessage({ chatId: chat.id, authorId: bob.id, content: "apple one" });
    await createMessage({ chatId: chat.id, authorId: bob.id, content: "apple two" });
    await createMessage({ chatId: chat.id, authorId: bob.id, content: "apple three" });

    const cookies = await loginAndGetCookies(app, alice.email, password);

    const page1 = await request(app)
      .get("/api/v1/search/messages")
      .query({ q: "apple", limit: 2, offset: 0 })
      .set("Cookie", cookies);

    expect(page1.status).toBe(200);
    expect(page1.body.results).toHaveLength(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app)
      .get("/api/v1/search/messages")
      .query({ q: "apple", limit: 2, offset: 2 })
      .set("Cookie", cookies);

    expect(page2.body.results).toHaveLength(1);
    expect(page2.body.hasMore).toBe(false);
  });

  it("excludes deleted messages from search", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const liveMsg = await createMessage({
      chatId: chat.id,
      authorId: bob.id,
      content: "banana fresh",
    });
    const deletedMsg = await createMessage({
      chatId: chat.id,
      authorId: bob.id,
      content: "banana hidden",
    });
    await prisma.message.update({
      where: { id: deletedMsg.id },
      data: { deletedAt: new Date() },
    });

    const cookies = await loginAndGetCookies(app, alice.email, password);
    const res = await request(app)
      .get("/api/v1/search/messages")
      .query({ q: "banana" })
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    const ids = res.body.results.map((r: { messageId: string }) => r.messageId);
    expect(ids).toContain(liveMsg.id);
    expect(ids).not.toContain(deletedMsg.id);
  });
});
