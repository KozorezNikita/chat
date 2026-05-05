import { prisma } from "../db/prisma.js";

/**
 * ============================================
 * MessageRepository
 * ============================================
 *
 * CRUD + cursor pagination + повідомлення для chat-аґрегатів.
 *
 * Усі методи що повертають Message — підвантажують author через
 * include. У DTO потрібен PublicUser, тому це базовий шейп.
 */

const FULL_MESSAGE_INCLUDE = {
  author: {
    select: {
      id: true,
      name: true,
      username: true,
      avatarUrl: true,
    },
  },
} as const;

interface CreateMessageInput {
  chatId: string;
  authorId: string;
  content: string;
  parentMessageId?: string | undefined;
}

/**
 * Створює повідомлення + bumps Chat.updatedAt у одній транзакції.
 *
 * Чому транзакція: щоб список чатів коректно сортувався по updatedAt DESC.
 * Без bump-у новий месседж "не піднімає" чат у sidebar.
 */
export async function createMessage(input: CreateMessageInput) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        chatId: input.chatId,
        authorId: input.authorId,
        content: input.content,
        parentMessageId: input.parentMessageId ?? null,
      },
      include: FULL_MESSAGE_INCLUDE,
    });

    await tx.chat.update({
      where: { id: input.chatId },
      data: { updatedAt: new Date() },
    });

    return message;
  });
}

/**
 * Один message за id — для перевірки авторства при edit/delete.
 * Membership-перевірку робить сервіс (бо chatId не в URL).
 */
export async function findMessageById(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: FULL_MESSAGE_INCLUDE,
  });
}

interface UpdateMessageInput {
  content: string;
}

export async function updateMessageContent(messageId: string, input: UpdateMessageInput) {
  return prisma.message.update({
    where: { id: messageId },
    data: {
      content: input.content,
      editedAt: new Date(),
    },
    include: FULL_MESSAGE_INCLUDE,
  });
}

/**
 * Soft delete — content лишається в БД, але DTO повертає "" + isDeleted.
 * Що зберігаємо content (а не стираємо): можливе майбутнє undo, audit logs.
 */
export async function softDeleteMessage(messageId: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
    include: FULL_MESSAGE_INCLUDE,
  });
}

// ============================================
// Cursor pagination
// ============================================

interface ListMessagesOptions {
  chatId: string;
  cursor?: string | undefined;
  limit: number;
}

/**
 * Список повідомлень чату — з найновіших до старіших.
 *
 * Пагінація: запитуємо limit + 1 щоб дізнатись чи є ще старіші.
 * Якщо повернулось limit + 1 — є більше, прибираємо overflow і
 * встановлюємо nextCursor = id останнього КЛІЄНТСЬКОГО запису.
 *
 * cursor === id_попереднього_сторінки → шукаємо старіші за нього (id < cursor).
 * Чому id, а не createdAt: cuid V2 монотонно зростає, можна сортувати по id.
 * Це швидше (один індекс), без ризику колізії на однакових createdAt.
 */
export async function listMessagesPaged(opts: ListMessagesOptions) {
  const where: { chatId: string; id?: { lt: string } } = { chatId: opts.chatId };

  if (opts.cursor) {
    where.id = { lt: opts.cursor };
  }

  const items = await prisma.message.findMany({
    where,
    orderBy: { id: "desc" },
    take: opts.limit + 1,
    include: FULL_MESSAGE_INCLUDE,
  });

  let nextCursor: string | null = null;

  if (items.length > opts.limit) {
    const overflow = items.pop();
    nextCursor = overflow ? items[items.length - 1]!.id : null;
  }

  return { items, nextCursor };
}
