import type { Chat, ChatMember, Message } from "@chat/shared";

import { getIO } from "./index.js";
import { socketLogger } from "./logger.js";

/**
 * ============================================
 * Broadcast helpers
 * ============================================
 *
 * Service-и не імпортують Socket.io напряму. Замість цього викликають
 * helpers звідси — type-safe wrapper над io.to(room).emit(event, payload).
 *
 * Усі функції toler-нуть до помилок: catch + log, не throw.
 * Це навмисно — якщо WS broadcast зламався, REST request усе одно має повернути success
 * (БД у консистентному стані, клієнти можуть catch-up через polling/refresh).
 */

const broadcastLogger = socketLogger.child({ scope: "broadcast" });

function safeBroadcast(operation: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    broadcastLogger.error({ err, operation }, "Broadcast failed");
  }
}

// ============================================
// Messages
// ============================================

export function broadcastNewMessage(
  chatId: string,
  message: Message,
  clientId?: string,
): void {
  safeBroadcast("message:new", () => {
    getIO().to(`chat:${chatId}`).emit("message:new", { chatId, message, clientId });
    broadcastLogger.debug({ chatId, messageId: message.id }, "message:new broadcasted");
  });
}

export function broadcastEditedMessage(chatId: string, message: Message): void {
  safeBroadcast("message:edited", () => {
    getIO().to(`chat:${chatId}`).emit("message:edited", { chatId, message });
    broadcastLogger.debug({ chatId, messageId: message.id }, "message:edited broadcasted");
  });
}

export function broadcastDeletedMessage(chatId: string, message: Message): void {
  safeBroadcast("message:deleted", () => {
    getIO().to(`chat:${chatId}`).emit("message:deleted", { chatId, message });
    broadcastLogger.debug({ chatId, messageId: message.id }, "message:deleted broadcasted");
  });
}

// ============================================
// Chat lifecycle
// ============================================

export function broadcastChatUpdated(chat: Chat): void {
  safeBroadcast("chat:updated", () => {
    getIO().to(`chat:${chat.id}`).emit("chat:updated", { chat });
    broadcastLogger.debug({ chatId: chat.id }, "chat:updated broadcasted");
  });
}

/**
 * Member added у group-чат.
 *
 * Дві дії:
 *  1. Сервер сам join-ить нового юзера у chat-room (всі його активні sockets).
 *     Без цього новий member не отримуватиме майбутні message:new з цього чату.
 *  2. Broadcast 'chat:member-added' усім (existing + новий — він теж отримує
 *     щоб клієнтський хук оновив список useChats).
 */
export function broadcastMemberAdded(chatId: string, newMember: ChatMember): void {
  safeBroadcast("chat:member-added", () => {
    const io = getIO();
    io.in(`user:${newMember.userId}`).socketsJoin(`chat:${chatId}`);
    io.to(`chat:${chatId}`).emit("chat:member-added", { chatId, member: newMember });
    broadcastLogger.debug(
      { chatId, addedUserId: newMember.userId },
      "chat:member-added broadcasted",
    );
  });
}

/**
 * Member removed (kick або self-leave).
 *
 * Послідовність:
 *  1. Спершу broadcast — всі (включно з removedUser) дізнаються
 *  2. Потім socketsLeave — removedUser виходить з chat-room
 *
 * Якщо зробити leave перед broadcast, removedUser не отримає подію.
 */
export function broadcastMemberRemoved(chatId: string, removedUserId: string): void {
  safeBroadcast("chat:member-removed", () => {
    const io = getIO();
    io.to(`chat:${chatId}`).emit("chat:member-removed", { chatId, userId: removedUserId });
    io.in(`user:${removedUserId}`).socketsLeave(`chat:${chatId}`);
    broadcastLogger.debug({ chatId, removedUserId }, "chat:member-removed broadcasted");
  });
}

/**
 * Chat повністю видалено (тільки group, тільки OWNER).
 *
 * Broadcast → socketsLeave для всіх щоб room перестав існувати.
 */
export function broadcastChatDeleted(chatId: string): void {
  safeBroadcast("chat:deleted", () => {
    const io = getIO();
    io.to(`chat:${chatId}`).emit("chat:deleted", { chatId });
    io.in(`chat:${chatId}`).socketsLeave(`chat:${chatId}`);
    broadcastLogger.debug({ chatId }, "chat:deleted broadcasted");
  });
}

/**
 * Direct chat створений — обидва учасники join-ються у новий room.
 * Broadcast 'chat:updated' — обидва клієнти оновлюють sidebar.
 *
 * (chat:added як окрема подія тут не потрібна: chat:updated несе всі дані
 * нового чату; клієнт перевіряє чи це новий і додає до списку.)
 */
export function broadcastDirectChatCreated(chat: Chat): void {
  safeBroadcast("direct-chat-created", () => {
    const io = getIO();
    for (const member of chat.members) {
      io.in(`user:${member.userId}`).socketsJoin(`chat:${chat.id}`);
    }
    io.to(`chat:${chat.id}`).emit("chat:updated", { chat });
    broadcastLogger.debug({ chatId: chat.id }, "direct chat created broadcasted");
  });
}
