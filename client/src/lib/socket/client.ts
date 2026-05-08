import { io, type Socket } from "socket.io-client";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@chat/shared";

/**
 * ============================================
 * Socket.io client instance
 * ============================================
 *
 * Singleton. Створюється при імпорті, але autoConnect=false —
 * фактичне з'єднання керує SocketProvider після того як юзер залогінений.
 *
 * withCredentials: true — браузер шле cookies з handshake.
 * Сервер парсить accessToken і автентифікує сокет.
 */

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:5000";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: AppSocket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
  // Default reconnection: true, exponential backoff. Залишаємо as-is.
  // При intentional disconnect (наш logout) Socket.io не reconnects сам.
});
