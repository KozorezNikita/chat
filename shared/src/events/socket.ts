/**
 * ============================================
 * Socket.io типи — REST+Broadcast архітектура
 * ============================================
 *
 * Ми використовуємо REST для всіх write-операцій (send, edit, delete, create chat).
 * Socket.io — тільки для broadcast подій від сервера до клієнтів.
 *
 * Чому така архітектура (а не "все через Socket"):
 *  - REST уже валідовано, протестовано, має чітку error-handling
 *  - Socket для broadcast — "fan out" події, які не потребують ack
 *  - Менше state-у на клієнті: optimistic UI + REST → завжди узгоджений
 *  - Send-операція атомарна на бекенді: INSERT → broadcast у тому ж handler-і
 *
 * Подія йде так:
 *   1. Alice's client → POST /chats/123/messages (REST)
 *   2. Server → INSERT message → io.to('chat:123').emit('message:new', ...)
 *   3. Bob's client отримує 'message:new' → оновлює локальний кеш
 *
 * Дедуплікація на стороні Alice:
 *   - Alice уже додала optimistic message (з clientId) у свій кеш через REST onSuccess
 *   - 'message:new' для неї приходить теж — клієнт ігнорує бо message.author.id === currentUserId
 *
 * ============================================
 * Iter 3: тільки message + chat події
 * ============================================
 *
 * typing:start/stop — НЕ ТУТ. Вони з'являться у Iter 4 (Presence).
 * presence:update    — НЕ ТУТ. Iter 4.
 * read:update        — НЕ ТУТ. Iter 5.
 * reaction:update    — НЕ ТУТ. Iter 5.
 *
 * Iter 3 — мінімум подій щоб real-time messaging працював.
 */

import type { Chat, ChatMember } from "../dto/chat.js";
import type { Message } from "../dto/message.js";

// ============================================
// CLIENT → SERVER
// ============================================
// У Iter 3 порожньо. У Iter 4 додаємо typing.

export interface ClientToServerEvents {
  /**
   * Юзер набирає у чаті. Шлеться раз на 2 сек поки він пише.
   * Server валідує membership + per-emit auth, broadcast у room.
   * Throttle: max 1 emit per second per socket.
   */
  "typing:start": (payload: { chatId: string }) => void;

  /**
   * Юзер припинив набирати (натиснув Enter, очистив поле, або 3+ сек тиші).
   * Server broadcast у room.
   */
  "typing:stop": (payload: { chatId: string }) => void;
}

// ============================================
// SERVER → CLIENT
// ============================================

export interface ServerToClientEvents {
  /**
   * Нове повідомлення в чаті де юзер є member-ом.
   * Broadcast у room `chat:${chatId}` — отримують усі сокети участників.
   *
   * clientId — UUID який клієнт згенерував перед send. Передається тут щоб
   * автор міг знайти і замінити свою optimistic message у кеші. Інші учасники
   * це поле ігнорують.
   *
   * Дедуплікація на стороні автора: client.useSocketEvents шукає
   * у кеші повідомлення з id === clientId, замінює на серверний message.
   */
  "message:new": (payload: {
    chatId: string;
    message: Message;
    clientId?: string;
  }) => void;

  /**
   * Повідомлення відредаговано (PATCH /messages/:id).
   * Broadcast у `chat:${chatId}`.
   */
  "message:edited": (payload: { chatId: string; message: Message }) => void;

  /**
   * Soft delete (DELETE /messages/:id). content="" і deletedAt у DTO.
   */
  "message:deleted": (payload: { chatId: string; message: Message }) => void;

  /**
   * Зміна метаданих чату — name, avatar (PATCH /chats/:id).
   * Broadcast у `chat:${chatId}`.
   */
  "chat:updated": (payload: { chat: Chat }) => void;

  /**
   * Юзера додано до групового чату.
   * Broadcast у `chat:${chatId}` для існуючих + у `user:${newUserId}` персонально
   * (щоб новий юзер дізнався що його додали і join-нувся в room).
   */
  "chat:member-added": (payload: { chatId: string; member: ChatMember }) => void;

  /**
   * Юзер видалений з чату (kick або self-leave).
   * Broadcast у `chat:${chatId}` + `user:${userId}` персонально для виходу з room.
   */
  "chat:member-removed": (payload: { chatId: string; userId: string }) => void;

  /**
   * Чат повністю видалено (DELETE /chats/:id, тільки group).
   * Broadcast у `chat:${chatId}` — всі клієнти знають що чат зник.
   */
  "chat:deleted": (payload: { chatId: string }) => void;

  /**
   * Access token expired у поточному socket-сесії.
   * Клієнт має спробувати refresh + reconnect.
   *
   * Шлемо ТІЛЬКИ цьому socket-у (не broadcast) — інші sockets юзера можуть
   * мати свіжі cookies після refresh з іншого таб-у.
   */
  "auth:expired": () => void;

  /**
   * Юзер X почав набирати у чаті Y. Broadcast у `chat:${chatId}` крім автора.
   * Отримувач показує "X пише…" UI з 5-сек timeout (на випадок якщо typing:stop
   * не прийде, наприклад мережа впала).
   */
  "typing:start": (payload: { chatId: string; userId: string }) => void;

  /**
   * Юзер X перестав набирати у чаті Y. Broadcast у `chat:${chatId}` крім автора.
   * Отримувач прибирає indicator одразу.
   */
  "typing:stop": (payload: { chatId: string; userId: string }) => void;

  /**
   * Reaction додано / видалено на message-і. Broadcast усім member-ам у `chat:${chatId}`.
   *
   * Передаємо повний список reactions після зміни (емодзі + userId-и) —
   * клієнт локально перерахує групи з `reactedByMe` для свого юзера.
   *
   * Чому повний список, а не дельта: простіше серверу не вести state;
   * payload малий (~6 emoji × 5 users у середньому).
   */
  "reaction:updated": (payload: {
    chatId: string;
    messageId: string;
    reactions: { emoji: string; userId: string }[];
  }) => void;

  /**
   * Юзер X прочитав повідомлення до messageId Y у чаті Z.
   * Broadcast усім member-ам — кожен клієнт оновлює свій локальний кеш
   * `chat.members[].lastReadMessageId`.
   *
   * UI використовує це для:
   *  - DM: показати ✓ біля власних повідомлень коли інший прочитав
   *  - Group: показати "Прочитано (3/5)" під власним останнім повідомленням
   */
  "read:updated": (payload: {
    chatId: string;
    userId: string;
    lastReadMessageId: string;
  }) => void;
}

// ============================================
// Inter-server events (для Redis adapter у Iter 4)
// ============================================

export interface InterServerEvents {
  // Reserved for Redis adapter pub/sub в multi-instance setup
}

// ============================================
// Socket data (per-connection state)
// ============================================

export interface SocketData {
  userId: string;
  /**
   * Unix time (сек) протухання access-токена, знятий на handshake.
   * Сервер планує disconnect на цей момент — reconnect принесе свіжий cookie.
   */
  tokenExp?: number;
}
