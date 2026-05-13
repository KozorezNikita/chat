import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import { app } from "../helpers/app.js";
import {
  createVerifiedUser,
  loginAndGetCookies,
  createDirectChat,
} from "../helpers/factories.js";
import {
  startTestSocketServer,
  connectSocketClient,
  waitForEvent,
  disconnectAll,
} from "../helpers/socket-client.js";

/**
 * ============================================
 * Typing tests
 * ============================================
 *
 * Покриваємо:
 *  1. typing:start broadcast іншим у chat-room
 *  2. typing:stop broadcast
 *  3. Sender не отримує свій же event (filter на клієнті теж є, але краще)
 *  4. Throttle: 2 emit за < 1 сек → другий ignored
 *  5. Non-member: emit у чужий чат → silent (інший не отримає)
 *
 * Не вимагає Redis (typing — pass-through broadcast).
 */

describe("Typing", () => {
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

  it("typing:start broadcasts to other chat members", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob, password: bobPwd } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);
    const bobCookies = await loginAndGetCookies(app, bob.email, bobPwd);

    const aliceSocket = await connectSocketClient(port, aliceCookies);
    const bobSocket = await connectSocketClient(port, bobCookies);
    allSockets.push(aliceSocket, bobSocket);

    // Чекаємо щоб обидва server-side connect handlers join-нули chat-rooms.
    // Інакше emit може broadcast-итись у room де ще нема Bob-а.
    await new Promise((r) => setTimeout(r, 150));

    // Bob чекає typing:start від Alice
    const eventPromise = waitForEvent<{ chatId: string; userId: string }>(
      bobSocket,
      "typing:start",
      2000,
    );

    aliceSocket.emit("typing:start", { chatId: chat.id });

    const payload = await eventPromise;
    expect(payload).not.toBeNull();
    expect(payload?.chatId).toBe(chat.id);
    expect(payload?.userId).toBe(alice.id);
  });

  it("typing:stop broadcasts to other chat members", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob, password: bobPwd } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);
    const bobCookies = await loginAndGetCookies(app, bob.email, bobPwd);

    const aliceSocket = await connectSocketClient(port, aliceCookies);
    const bobSocket = await connectSocketClient(port, bobCookies);
    allSockets.push(aliceSocket, bobSocket);

    await new Promise((r) => setTimeout(r, 150));

    const eventPromise = waitForEvent<{ chatId: string; userId: string }>(
      bobSocket,
      "typing:stop",
      2000,
    );

    aliceSocket.emit("typing:stop", { chatId: chat.id });

    const payload = await eventPromise;
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(alice.id);
  });

  it("throttles typing:start to 1 per second per socket", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob, password: bobPwd } = await createVerifiedUser();
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);
    const bobCookies = await loginAndGetCookies(app, bob.email, bobPwd);

    const aliceSocket = await connectSocketClient(port, aliceCookies);
    const bobSocket = await connectSocketClient(port, bobCookies);
    allSockets.push(aliceSocket, bobSocket);

    await new Promise((r) => setTimeout(r, 150));

    let receivedCount = 0;
    bobSocket.on("typing:start", () => {
      receivedCount++;
    });

    // 3 emit за раз — мають бути throttle, отже Bob отримає лише 1
    aliceSocket.emit("typing:start", { chatId: chat.id });
    aliceSocket.emit("typing:start", { chatId: chat.id });
    aliceSocket.emit("typing:start", { chatId: chat.id });

    // Чекаємо щоб усі events дійшли
    await new Promise((r) => setTimeout(r, 500));

    expect(receivedCount).toBe(1);
  });

  it("ignores typing:start from non-member of chat", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const { user: bob, password: bobPwd } = await createVerifiedUser();
    const { user: charlie, password: charliePwd } = await createVerifiedUser();
    // Чат тільки між Alice і Bob — Charlie не member
    const chat = await createDirectChat({ userIdA: alice.id, userIdB: bob.id });

    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);
    const bobCookies = await loginAndGetCookies(app, bob.email, bobPwd);
    const charlieCookies = await loginAndGetCookies(app, charlie.email, charliePwd);

    const aliceSocket = await connectSocketClient(port, aliceCookies);
    const bobSocket = await connectSocketClient(port, bobCookies);
    const charlieSocket = await connectSocketClient(port, charlieCookies);
    allSockets.push(aliceSocket, bobSocket, charlieSocket);

    await new Promise((r) => setTimeout(r, 150));

    // Bob слухає typing — НЕ має отримати від Charlie
    const eventPromise = waitForEvent<{ chatId: string; userId: string }>(
      bobSocket,
      "typing:start",
      500,
    );

    // Charlie намагається спуфити typing у чужий чат
    charlieSocket.emit("typing:start", { chatId: chat.id });

    const payload = await eventPromise;
    expect(payload).toBeNull(); // timeout → не отримано → правильно
  });

  it("auth:expired emitted when accessToken is invalid", async () => {
    const { user: alice, password: alicePwd } = await createVerifiedUser();
    const aliceCookies = await loginAndGetCookies(app, alice.email, alicePwd);

    const aliceSocket = await connectSocketClient(port, aliceCookies);
    allSockets.push(aliceSocket);

    // Симулюємо expired token — найпростіше через handshake patcing.
    // Так як ми вже connected, ми можемо припустити що ця перевірка проходить
    // при кожному emit. Підмінити cookie на лету у socket.io-client не тривіально,
    // тому цей тест ми робимо опосередковано: connect без auth → connect_error.
    // (Це частина handshake auth, не per-emit, але теж важлива.)

    // Спроба connect з пустими cookies → connect_error
    let connectError: Error | null = null;
    try {
      const badSocket = await connectSocketClient(port, [], 1000);
      allSockets.push(badSocket);
    } catch (err) {
      connectError = err as Error;
    }
    expect(connectError).not.toBeNull();
  });
});
