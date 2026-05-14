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
 * Reply threading tests
 * ============================================
 *
 * Покриваємо:
 *  1. Send з валідним parentMessageId → response має parent preview
 *  2. Cross-chat parentMessageId → 400 PARENT_NOT_FOUND
 *  3. Reply на deleted parent → 400 PARENT_DELETED
 *  4. Reply на неіснуючий parentMessageId → 400 PARENT_NOT_FOUND
 *  5. Parent preview truncate-ається до 100 символів + …
 *  6. GET messages → reply-message повертає parent у відповіді
 */

describe("Reply threading", () => {
  it("send with valid parentMessageId includes parent preview in response", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    const parentMsg = await createMessage({
      chatId: chat.id,
      authorId: bob.id,
      content: "Original message",
    });

    const cookies = await loginAndGetCookies(app, alice.email, password);

    const res = await request(app)
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set("Cookie", cookies)
      .send({
        clientId: crypto.randomUUID(),
        content: "My reply",
        parentMessageId: parentMsg.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.message.parentMessageId).toBe(parentMsg.id);
    expect(res.body.message.parent).toEqual(
      expect.objectContaining({
        id: parentMsg.id,
        authorName: bob.name,
        contentPreview: "Original message",
        isDeleted: false,
      }),
    );
  });

  it("rejects parentMessageId from a different chat", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const { user: charlie } = await createVerifiedUser();

    const chatAB = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    const chatAC = await createDirectChat({ userIdA: alice.id, userIdB: charlie.id });

    // Message у chat A-B
    const msgInOtherChat = await createMessage({ chatId: chatAB.id, authorId: bob.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);

    // Alice намагається reply у chat A-C на parent з chat A-B
    const res = await request(app)
      .post(`/api/v1/chats/${chatAC.id}/messages`)
      .set("Cookie", aliceCookies)
      .send({
        clientId: crypto.randomUUID(),
        content: "Spoofed reply",
        parentMessageId: msgInOtherChat.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PARENT_NOT_FOUND");
  });

  it("rejects reply to deleted parent", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });
    const parentMsg = await createMessage({ chatId: chat.id, authorId: bob.id });

    // Soft-delete parent напряму через Prisma — простіше за REST flow
    await prisma.message.update({
      where: { id: parentMsg.id },
      data: { deletedAt: new Date() },
    });

    const cookies = await loginAndGetCookies(app, alice.email, password);
    const res = await request(app)
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set("Cookie", cookies)
      .send({
        clientId: crypto.randomUUID(),
        content: "Reply to deleted",
        parentMessageId: parentMsg.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PARENT_DELETED");
  });

  it("rejects non-existent parentMessageId", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const cookies = await loginAndGetCookies(app, alice.email, password);
    const res = await request(app)
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set("Cookie", cookies)
      .send({
        clientId: crypto.randomUUID(),
        content: "Reply to nothing",
        parentMessageId: "cmnonexistent000000000000",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PARENT_NOT_FOUND");
  });

  it("truncates parent contentPreview at 100 chars with ellipsis", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const longContent = "x".repeat(150); // 150 символів
    const parentMsg = await createMessage({
      chatId: chat.id,
      authorId: bob.id,
      content: longContent,
    });

    const cookies = await loginAndGetCookies(app, alice.email, password);
    const res = await request(app)
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set("Cookie", cookies)
      .send({
        clientId: crypto.randomUUID(),
        content: "Reply",
        parentMessageId: parentMsg.id,
      });

    expect(res.status).toBe(201);
    // 100 символів + "…"
    expect(res.body.message.parent.contentPreview).toBe(`${"x".repeat(100)}…`);
    expect(res.body.message.parent.contentPreview.length).toBe(101);
  });

  it("GET messages returns parent preview for replies", async () => {
    const { user: alice, password } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const parentMsg = await createMessage({
      chatId: chat.id,
      authorId: bob.id,
      content: "Parent content",
    });
    const replyMsg = await createMessage({
      chatId: chat.id,
      authorId: alice.id,
      content: "Reply content",
      parentMessageId: parentMsg.id,
    });
    // Регулярне повідомлення без reply
    const standaloneMsg = await createMessage({
      chatId: chat.id,
      authorId: alice.id,
      content: "Standalone",
    });

    const cookies = await loginAndGetCookies(app, alice.email, password);
    const res = await request(app)
      .get(`/api/v1/chats/${chat.id}/messages`)
      .set("Cookie", cookies);

    expect(res.status).toBe(200);

    const replyItem = res.body.items.find((m: { id: string }) => m.id === replyMsg.id);
    expect(replyItem).toBeDefined();
    expect(replyItem.parent).toEqual(
      expect.objectContaining({
        id: parentMsg.id,
        authorName: bob.name,
        contentPreview: "Parent content",
        isDeleted: false,
      }),
    );

    const standaloneItem = res.body.items.find(
      (m: { id: string }) => m.id === standaloneMsg.id,
    );
    expect(standaloneItem.parent).toBeNull();
  });
});
