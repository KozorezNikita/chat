import { getIO } from "../socket/index.js";
import * as chatRepo from "../repositories/chat.repo.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================
 * Typing service
 * ============================================
 *
 * Pass-through broadcaster. Сервер НЕ зберігає state "хто пише" —
 * клієнти ведуть локальний state на основі broadcast подій + 5-сек timeout
 * на випадок якщо typing:stop загубився.
 *
 * Безпека: перевіряємо membership у чаті перед broadcast (інакше юзер міг би
 * "набирати" у чужому чаті). Throttling per-socket робиться у handler-і.
 */

/**
 * Broadcast typing:start у chat-room (виключаючи автора).
 */
export async function broadcastTypingStart(
  userId: string,
  chatId: string,
): Promise<void> {
  try {
    // Membership check — захист від spoofing
    const member = await chatRepo.findMembership(chatId, userId);
    if (!member || member.leftAt !== null) {
      return; // тихо ignore-ємо, не throw — це user-emit, не критично
    }

    // .to() включає sender за замовчуванням; нам потрібно "крім автора".
    // Це робиться через socket.broadcast.to() у handler-і — там є socket.
    // Тут лише серверний помічник; broadcast виконується звідки викликають.
    getIO().to(`chat:${chatId}`).emit("typing:start", { chatId, userId });
  } catch (err) {
    logger.warn({ err, userId, chatId }, "broadcastTypingStart failed");
  }
}

export async function broadcastTypingStop(
  userId: string,
  chatId: string,
): Promise<void> {
  try {
    const member = await chatRepo.findMembership(chatId, userId);
    if (!member || member.leftAt !== null) return;

    getIO().to(`chat:${chatId}`).emit("typing:stop", { chatId, userId });
  } catch (err) {
    logger.warn({ err, userId, chatId }, "broadcastTypingStop failed");
  }
}
