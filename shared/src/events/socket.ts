/**
 * Типізація Socket.io подій між клієнтом і сервером.
 *
 * ============================================
 * Чому TypeScript types, а НЕ Zod-схеми
 * ============================================
 * REST DTO — Zod (бо HTTP-запит може прийти від будь-кого, треба runtime-валідація).
 * Socket events — TS types (бо Socket.io вимагає інтерфейс для дженериків
 * Server<ClientToServerEvents, ServerToClientEvents>).
 *
 * Виняток: payload-и які містять content від користувача (sendMessage, editMessage,
 * setTyping) ми ВСЕ ОДНО валідуємо через Zod-схеми з message.ts на сервері перед
 * обробкою. Тип тут — для IDE-автодоповнення, валідація — для безпеки.
 *
 * ============================================
 * Naming convention: "domain:action"
 * ============================================
 * Двокрапка читається як "domain:action". Конвенція з Socket.io ecosystem.
 *
 * ============================================
 * Acknowledgments
 * ============================================
 * Деякі client-to-server події мають callback з відповіддю від сервера.
 * Це 2-й аргумент типу: (payload, ack) => void.
 * Використовуємо для send-message (треба знати serverId і createdAt).
 */

import type { Message, SentMessageResponse } from "../dto/message";
import type { UserPresence } from "../dto/user";

// ============================================
// CLIENT → SERVER
// ============================================

export interface ClientToServerEvents {
  /**
   * Приєднатись до room-а чату — після цього юзер отримує real-time
   * повідомлення з цього чату.
   *
   * Сервер на кожне приєднання перевіряє membership в БД.
   */
  "chat:join": (
    payload: { chatId: string },
    ack: (response: AckResponse<void>) => void,
  ) => void;

  /**
   * Покинути room-а чату (юзер закрив вкладку чату, але не відключився).
   * Не плутати з виходом з групи (це REST).
   */
  "chat:leave": (payload: { chatId: string }) => void;

  /**
   * Надіслати повідомлення.
   * Сервер у callback повертає створене повідомлення з clientId
   * для optimistic-UI matching.
   */
  "message:send": (
    payload: {
      chatId: string;
      clientId: string; // UUID, генерує клієнт
      content: string;
      parentMessageId?: string;
    },
    ack: (response: AckResponse<SentMessageResponse>) => void,
  ) => void;

  /**
   * Typing indicator — клієнт шле періодично (раз на 2-3 сек) поки юзер пише.
   * Сервер сам викидає юзера зі стану "typing" через 5 сек тиші.
   *
   * Не зловживаємо — клієнт throttle-ить на своїй стороні.
   */
  "typing:start": (payload: { chatId: string }) => void;

  /**
   * Користувач явно припинив писати (стер усе або пішов з фокусу).
   * Сервер не зобов'язаний чекати таймауту.
   */
  "typing:stop": (payload: { chatId: string }) => void;

  /**
   * Позначити повідомлення як прочитане — це апдейт ChatMember.lastReadMessageId.
   * Клієнт шле коли юзер дочитав до якогось messageId
   * (видно в viewport, або відкрив чат).
   */
  "read:mark": (payload: { chatId: string; messageId: string }) => void;
}

// ============================================
// SERVER → CLIENT
// ============================================

export interface ServerToClientEvents {
  /**
   * Прилетіло нове повідомлення в один з чатів юзера.
   * Якщо юзер не в room-і цього чату (не відкрив його) — все одно отримує,
   * щоб оновити preview в списку чатів і unread counter.
   */
  "message:new": (payload: Message) => void;

  /**
   * Повідомлення відредаговано.
   */
  "message:edit": (payload: Message) => void;

  /**
   * Повідомлення видалено (soft delete).
   * Прилетає весь Message з content === "" і deletedAt !== null.
   */
  "message:delete": (payload: Message) => void;

  /**
   * Якийсь юзер почав/припинив писати у чаті.
   *
   * Чому масив усіх typing-юзерів, а не один:
   * якщо в груповому чаті 3 людини пишуть одночасно — UI має показати
   * "Anna, Boris, and Carol are typing...". Простіше слати весь поточний
   * стан, ніж клієнтам тримати у себе set-и.
   */
  "typing:update": (payload: { chatId: string; userIds: string[] }) => void;

  /**
   * Зміна presence когось із чатів юзера (чи його контактів).
   * Шлемо тільки коли реально змінилось — не на кожен heartbeat.
   */
  "presence:update": (payload: UserPresence) => void;

  /**
   * Хтось у чаті дочитав до messageId.
   * Клієнт оновлює "read by X" індикатори.
   */
  "read:update": (payload: {
    chatId: string;
    userId: string;
    lastReadMessageId: string;
  }) => void;

  /**
   * Реакція на повідомлення додана/прибрана.
   * Шлемо весь оновлений масив reactionGroups, не diff —
   * простіше для клієнта (зробив replace, не merge).
   */
  "reaction:update": (payload: {
    chatId: string;
    messageId: string;
    reactions: Message["reactions"];
  }) => void;

  /**
   * Юзера додали до чату (груповий — додав owner; приватний — хтось почав
   * чат з ним). Клієнт додає чат до списку без релоаду.
   */
  "chat:added": (payload: { chatId: string }) => void;

  /**
   * Юзера видалили з чату (kick з групи) АБО чат видалено.
   * Клієнт прибирає його зі списку.
   */
  "chat:removed": (payload: { chatId: string }) => void;
}

// ============================================
// Type для acknowledgment-ів
// ============================================
// Усі client→server події які мають callback використовують цей формат
// — щоб обробка помилок була єдина.

export type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

// ============================================
// Inter-server (для Redis adapter)
// ============================================
// Поки що порожній — потрібен буде в Ітерації 4 (multi-instance presence
// через Redis pub/sub). Лишаю заготовку щоб типи Socket.io працювали.

export interface InterServerEvents {}

// ============================================
// Socket data (per-connection state, типізовано)
// ============================================
// Те що Socket.io тримає на кожен сокет (auth-info після handshake).

export interface SocketData {
  userId: string;
  // Можна буде додати: deviceId, userAgent тощо у Ітерації 4.
}
