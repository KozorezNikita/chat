import { createServer, type Server as HttpServer } from "node:http";
import { io as ioClient, type Socket } from "socket.io-client";

import { initSocket, _resetIOForTests } from "../../src/socket/index.js";
import { app } from "./app.js";

/**
 * ============================================
 * Socket test helpers
 * ============================================
 *
 * Запускаємо real Socket.io сервер на random порту, конектимось client-ом.
 * Це повний integration test — без моків. Перевіряємо реальний handshake auth,
 * broadcast у rooms, throttle і т.д.
 *
 * Налаштування ОДИН раз на test файл через startTestSocketServer().
 */

interface TestSocketServer {
  httpServer: HttpServer;
  port: number;
  close: () => Promise<void>;
}

let cachedServer: TestSocketServer | null = null;

/**
 * Запускає HTTP+Socket.io сервер на random порту.
 * Реюзаємо instance між test файлами щоб не платити cost startup.
 */
export async function startTestSocketServer(): Promise<TestSocketServer> {
  if (cachedServer) return cachedServer;

  const httpServer = createServer(app);
  await initSocket(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const addr = httpServer.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to get test server address");
  }
  const port = addr.port;

  cachedServer = {
    httpServer,
    port,
    close: async () => {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
      _resetIOForTests();
      cachedServer = null;
    },
  };

  return cachedServer;
}

/**
 * Connect socket-client з cookies (зазвичай з loginAndGetCookies).
 * Чекає `connect` event, повертає готовий socket.
 *
 * Throws якщо connect_error (наприклад auth fail).
 */
export async function connectSocketClient(
  port: number,
  cookies: string[],
  timeout = 3000,
): Promise<Socket> {
  // supertest повертає кукі як масив; з'єднуємо в Cookie header string
  const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");

  const socket = ioClient(`http://localhost:${port}`, {
    transports: ["websocket"],
    extraHeaders: { Cookie: cookieHeader },
    forceNew: true,
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket connect timeout after ${timeout}ms`));
    }, timeout);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return socket;
}

/**
 * Чекає на конкретну подію з timeout. Корисно щоб у тесті
 * перевірити що отримали broadcast.
 *
 * Якщо timeout — повертає null (тест може це інтерпретувати як "не отримано").
 */
export function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeout = 1000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, timeout);

    function handler(payload: T) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

/**
 * Cleanup усіх sockets з масиву (на afterEach).
 */
export function disconnectAll(sockets: Socket[]): void {
  for (const s of sockets) {
    if (s.connected) s.disconnect();
  }
}
