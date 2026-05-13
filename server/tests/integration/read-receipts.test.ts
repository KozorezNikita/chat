import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";

import { app } from "../helpers/app.js";
import {
  createVerifiedUser,
  loginAndGetCookies,
  createGroupChat,
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
 * Read receipts tests
 * ============================================
 *
 * Покриваємо:
 *  1. POST /chats/:id/read → broadcast read:updated
 *  2. Старіший messageId → no broadcast (idempotent UPDATE)
 *  3. Member chat-у отримує broadcast, не-member ні
 */

describe("Read receipts", () => {
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

  it("broadcasts read:updated when markAsRead succeeds", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob, password: bobPwd } = await createVerifiedUser();
    const chat = await createGroupChat({
      ownerId: alice.id,
      name: "Test Group",
      memberIds: [bob.id],
    });
    const msg = await createMessage({ chatId: chat.id, authorId: alice.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);
    const bobCookies = await loginAndGetCookies(app, bob.email, bobPwd);

    // Alice connect-иться щоб слухати read-broadcast від Bob
    const aliceSocket = await connectSocketClient(port, aliceCookies);
    allSockets.push(aliceSocket);

    await new Promise((r) => setTimeout(r, 150));

    const eventPromise = waitForEvent<{
      chatId: string;
      userId: string;
      lastReadMessageId: string;
    }>(aliceSocket, "read:updated", 2000);

    await request(app)
      .post(`/api/v1/chats/${chat.id}/read`)
      .set("Cookie", bobCookies)
      .send({ messageId: msg.id });

    const payload = await eventPromise;
    expect(payload).not.toBeNull();
    expect(payload?.chatId).toBe(chat.id);
    expect(payload?.userId).toBe(bob.id);
    expect(payload?.lastReadMessageId).toBe(msg.id);

    // Verify DB був оновлений
    const member = await prisma.chatMember.findFirst({
      where: { chatId: chat.id, userId: bob.id },
    });
    expect(member?.lastReadMessageId).toBe(msg.id);
  });

  it("no broadcast when messageId older than current lastReadMessageId", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob, password: bobPwd } = await createVerifiedUser();
    const chat = await createGroupChat({
      ownerId: alice.id,
      name: "Test Group",
      memberIds: [bob.id],
    });
    const msg1 = await createMessage({ chatId: chat.id, authorId: alice.id });
    // Невелика пауза щоб другий cuid був строго пізнішим
    await new Promise((r) => setTimeout(r, 50));
    const msg2 = await createMessage({ chatId: chat.id, authorId: alice.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);
    const bobCookies = await loginAndGetCookies(app, bob.email, bobPwd);

    // Спершу Bob прочитав до msg2
    await request(app)
      .post(`/api/v1/chats/${chat.id}/read`)
      .set("Cookie", bobCookies)
      .send({ messageId: msg2.id });

    // Alice connect — слухає
    const aliceSocket = await connectSocketClient(port, aliceCookies);
    allSockets.push(aliceSocket);
    await new Promise((r) => setTimeout(r, 150));

    let received = false;
    aliceSocket.on("read:updated", () => {
      received = true;
    });

    // Bob "прочитав" msg1 (старіший) — UPDATE 0 rows, broadcast не має йти
    await request(app)
      .post(`/api/v1/chats/${chat.id}/read`)
      .set("Cookie", bobCookies)
      .send({ messageId: msg1.id });

    await new Promise((r) => setTimeout(r, 300));
    expect(received).toBe(false);
  });

  it("non-member cannot mark chat as read (403)", async () => {
    const { user: alice } = await createVerifiedUser();
    const { user: bob } = await createVerifiedUser();
    const { user: outsider, password: outsiderPwd } = await createVerifiedUser();
    const chat = await createGroupChat({
      ownerId: alice.id,
      name: "Test Group",
      memberIds: [bob.id],
    });
    const msg = await createMessage({ chatId: chat.id, authorId: alice.id });
    const outsiderCookies = await loginAndGetCookies(app, outsider.email, outsiderPwd);

    const res = await request(app)
      .post(`/api/v1/chats/${chat.id}/read`)
      .set("Cookie", outsiderCookies)
      .send({ messageId: msg.id });

    expect(res.status).toBe(403);
  });
});
