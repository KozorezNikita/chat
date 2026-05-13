import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";

import { app } from "../helpers/app.js";
import {
  createVerifiedUser,
  loginAndGetCookies,
} from "../helpers/factories.js";
import {
  startTestSocketServer,
  connectSocketClient,
  disconnectAll,
} from "../helpers/socket-client.js";
import { getRedis } from "../../src/db/redis.js";
import * as presenceService from "../../src/services/presence.service.js";
import { prisma } from "../../src/db/prisma.js";

/**
 * ============================================
 * Presence tests
 * ============================================
 *
 * Покриваємо:
 *  1. REST GET /api/v1/presence — auth, validation, response shape
 *  2. presenceService.trackConnect/trackDisconnect — Redis state
 *  3. Multi-tab: 2 sockets → 1 disconnect → ще online
 *  4. lastSeenAt update коли усі sockets закрились
 *
 * Skip-аємо весь suite якщо REDIS_URL не задано (CI без Redis).
 */

const redisEnabled = !!process.env.REDIS_URL;

describe.skipIf(!redisEnabled)("Presence", () => {
  let port: number;
  const sockets: Awaited<ReturnType<typeof connectSocketClient>>[] = [];

  beforeAll(async () => {
    const server = await startTestSocketServer();
    port = server.port;
  });

  beforeEach(async () => {
    // Clean Redis between tests — TRUNCATE робить setup.ts вже для Postgres
    const redis = await getRedis();
    if (redis) {
      // Очищаємо лише наші presence keys, не FLUSHDB (дбайливо до інших test workers)
      // У production цьому ніколи не сталось би, лише в test/dev
      const keys: string[] = [];
      // redis@4 has scanIterator
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const key of (redis as any).scanIterator({ MATCH: "online:*" })) {
        keys.push(key);
      }
      if (keys.length > 0) {
        await Promise.all(keys.map((k) => redis.del(k)));
      }
    }
  });

  afterAll(async () => {
    disconnectAll(sockets);
  });

  // ============================================
  // REST endpoint tests
  // ============================================

  describe("GET /api/v1/presence", () => {
    it("returns 401 without auth cookie", async () => {
      const res = await request(app).get("/api/v1/presence").query({ userIds: "cm1" });
      expect(res.status).toBe(401);
    });

    it("returns 422 on missing userIds query", async () => {
      const { user, password } = await createVerifiedUser();
      const cookies = await loginAndGetCookies(app, user.email, password);

      const res = await request(app)
        .get("/api/v1/presence")
        .set("Cookie", cookies);
      expect(res.status).toBe(422);
    });

    it("returns 422 on more than 100 userIds", async () => {
      const { user, password } = await createVerifiedUser();
      const cookies = await loginAndGetCookies(app, user.email, password);

      const tooMany = Array.from({ length: 101 }, (_, i) => `cm${i}`).join(",");
      const res = await request(app)
        .get("/api/v1/presence")
        .query({ userIds: tooMany })
        .set("Cookie", cookies);
      expect(res.status).toBe(422);
    });

    it("returns presence array for valid userIds (offline by default)", async () => {
      const { user: alice, password: pwd } = await createVerifiedUser();
      const { user: bob } = await createVerifiedUser();
      const cookies = await loginAndGetCookies(app, alice.email, pwd);

      const res = await request(app)
        .get("/api/v1/presence")
        .query({ userIds: `${alice.id},${bob.id}` })
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body.presence).toHaveLength(2);
      expect(res.body.presence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: alice.id, online: false }),
          expect.objectContaining({ userId: bob.id, online: false }),
        ]),
      );
    });

    it("Cache-Control: no-store header set", async () => {
      const { user, password } = await createVerifiedUser();
      const cookies = await loginAndGetCookies(app, user.email, password);

      const res = await request(app)
        .get("/api/v1/presence")
        .query({ userIds: user.id })
        .set("Cookie", cookies);

      expect(res.headers["cache-control"]).toContain("no-store");
    });
  });

  // ============================================
  // Service tests — track via Redis
  // ============================================

  describe("presence service via socket connect/disconnect", () => {
    it("user is online after socket connect", async () => {
      const { user, password } = await createVerifiedUser();
      const cookies = await loginAndGetCookies(app, user.email, password);

      const socket = await connectSocketClient(port, cookies);
      sockets.push(socket);

      // Дамо мікросекунду на SADD (sync after connect callback)
      await new Promise((r) => setTimeout(r, 50));

      const [presence] = await presenceService.getPresenceForUsers([user.id]);
      expect(presence?.online).toBe(true);
    });

    it("user is offline after disconnect, lastSeenAt updated", async () => {
      const { user, password } = await createVerifiedUser();
      const cookies = await loginAndGetCookies(app, user.email, password);

      const before = await prisma.user.findUnique({
        where: { id: user.id },
        select: { lastSeenAt: true },
      });

      const socket = await connectSocketClient(port, cookies);
      // Wait for server-side connect handler to complete (joins + SADD)
      await new Promise((r) => setTimeout(r, 100));

      socket.disconnect();

      // Wait for server-side disconnect handler:
      //   TCP-close → 'disconnect' event → SREM → SCARD === 0 → prisma.user.update
      // На повільному CI це може займати 500мс+. Беремо з запасом.
      await new Promise((r) => setTimeout(r, 600));

      const [presence] = await presenceService.getPresenceForUsers([user.id]);
      expect(presence?.online).toBe(false);

      const after = await prisma.user.findUnique({
        where: { id: user.id },
        select: { lastSeenAt: true },
      });
      // lastSeenAt має бути ОНОВЛЕНИЙ — пізніше за `before` (або null → not-null)
      expect(after?.lastSeenAt?.getTime() ?? 0).toBeGreaterThan(
        before?.lastSeenAt?.getTime() ?? 0,
      );
    });

    it("user stays online while at least one socket connected (multi-tab)", async () => {
      const { user, password } = await createVerifiedUser();
      const cookies = await loginAndGetCookies(app, user.email, password);

      const tab1 = await connectSocketClient(port, cookies);
      const tab2 = await connectSocketClient(port, cookies);
      sockets.push(tab1, tab2);

      // Wait for both connect handlers to complete
      await new Promise((r) => setTimeout(r, 200));

      // Закриваємо tab1 — tab2 ще connected
      tab1.disconnect();
      await new Promise((r) => setTimeout(r, 300));

      const [presence] = await presenceService.getPresenceForUsers([user.id]);
      expect(presence?.online).toBe(true);

      // Тепер tab2 → offline
      tab2.disconnect();
      await new Promise((r) => setTimeout(r, 600));

      const [after] = await presenceService.getPresenceForUsers([user.id]);
      expect(after?.online).toBe(false);
    });
  });
});
