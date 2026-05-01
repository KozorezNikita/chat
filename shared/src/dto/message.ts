import { z } from "zod";
import { publicUserSchema } from "./user.js";
import { cursorQuerySchema, cursorPageSchema } from "./pagination.js";

/**
 * Реакція — Zod-схема.
 * Один юзер може поставити різні emoji на одне повідомлення,
 * але не дублювати один emoji (це enforced на БД-рівні).
 */
export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
  userId: z.string(),
  // Денормалізований counter не зберігаємо — рахуємо у API на льоту.
  // Для популярних повідомлень з 1000+ реакцій це може стати проблемою —
  // тоді додамо матеріалізований лічильник. Поки YAGNI.
});

export type Reaction = z.infer<typeof reactionSchema>;

/**
 * Реакції згруповані по emoji — це те, що рендеримо в UI.
 * Замість "list of (userId, emoji)" рендеримо "list of (emoji, count, userIds)".
 *
 * Конструюємо у API-шарі при формуванні відповіді.
 */
export const reactionGroupSchema = z.object({
  emoji: z.string(),
  count: z.number().int().min(1),
  userIds: z.array(z.string()),
  // Чи поточний юзер серед тих хто реагнув цим emoji
  // (для toggle-логіки на фронті — якщо так, клік приберає; якщо ні, додає).
  reactedByMe: z.boolean(),
});

export type ReactionGroup = z.infer<typeof reactionGroupSchema>;

/**
 * Повідомлення — як воно приходить з API.
 *
 * - content === "" коли deletedAt !== null. Фронт показує "Це повідомлення видалено".
 * - editedAt !== null показує "(edited)" в UI.
 * - parentMessageId — для thread reply.
 */
export const messageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  author: publicUserSchema,
  content: z.string(),

  parentMessageId: z.string().nullable(),

  // Кількість replies на це повідомлення (для UI лічильника "5 replies").
  // Сервер заповнює.
  replyCount: z.number().int().min(0),

  reactions: z.array(reactionGroupSchema),

  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type Message = z.infer<typeof messageSchema>;

/**
 * Сторінка повідомлень.
 */
export const messagePageSchema = cursorPageSchema(messageSchema);
export type MessagePage = z.infer<typeof messagePageSchema>;

/**
 * Query для GET /chats/:chatId/messages.
 * cursor + limit з спільної схеми.
 */
export const getMessagesQuerySchema = cursorQuerySchema;
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;

/**
 * Query для GET /chats/:chatId/messages/:messageId/replies (thread view).
 */
export const getRepliesQuerySchema = cursorQuerySchema;
export type GetRepliesQuery = z.infer<typeof getRepliesQuerySchema>;

/**
 * Надсилання повідомлення (REST і Socket.io використовують ту саму схему).
 *
 * clientId — UUID який генерує клієнт перед відправкою.
 * Потрібен для:
 *  - optimistic UI (показати в чаті ДО ack від сервера)
 *  - дедуплікації при reconnect (повідомлення може прилетіти двічі)
 *
 * Сервер у відповіді кладе clientId назад, щоб клієнт зміг матчити.
 */
export const sendMessageSchema = z.object({
  clientId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
  parentMessageId: z.string().min(1).optional(),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

/**
 * Розширений тип для відповіді на send — message + clientId.
 * Дозволяє клієнту замінити "pending" повідомлення на серверне.
 */
export const sentMessageResponseSchema = messageSchema.extend({
  clientId: z.string().uuid(),
});

export type SentMessageResponse = z.infer<typeof sentMessageResponseSchema>;

/**
 * Edit повідомлення.
 */
export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export type EditMessageDto = z.infer<typeof editMessageSchema>;

/**
 * Search query для FTS.
 * chatId опційний — глобальний пошук по всіх чатах юзера, або в межах одного.
 */
export const searchMessagesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  chatId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
