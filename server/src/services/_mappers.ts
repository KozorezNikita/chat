import type { PublicUser, MeUser } from "@chat/shared";

/**
 * Мапери Prisma-моделей у DTO для API-відповідей.
 *
 * Чому окремий файл, а не у service: сервісні функції фокусуються
 * на бізнес-логіці; конверсія "куди не пропустити чутливі поля" —
 * окрема відповідальність. Плюс ці мапери реюзаються між сервісами
 * (user, chat, message — всі мапатимуть User у різних місцях).
 *
 * Тип параметра — структурний (Pick з Prisma User-fields), щоб мапер
 * приймав і повний User, і select-ваний.
 */

interface PrismaUserPublic {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

export function mapUserToPublic(user: PrismaUserPublic): PublicUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

interface PrismaUserMe extends PrismaUserPublic {
  email: string;
  emailVerified: boolean;
  createdAt: Date;
}

export function mapUserToMe(user: PrismaUserMe): MeUser {
  return {
    ...mapUserToPublic(user),
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

// ============================================
// Chat
// ============================================

import type { Chat, ChatMember as ChatMemberDto, MessagePreview } from "@chat/shared";
import type { LastMessagePreviewRow } from "../repositories/chat.repo.js";

/**
 * Структурний тип Prisma Chat з підвантаженими members.user.
 * Уникаємо прямого посилання на PrismaClient namespace types — зміна
 * Prisma version легко ламає. Замість цього описуємо потрібні поля.
 */
export interface ChatWithMembers {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  avatarUrl: string | null;
  directKey: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    id: string;
    chatId: string;
    userId: string;
    role: "OWNER" | "MEMBER";
    joinedAt: Date;
    leftAt: Date | null;
    lastReadMessageId: string | null;
    user: {
      id: string;
      name: string;
      username: string | null;
      avatarUrl: string | null;
    };
  }>;
}

interface ChatAggregates {
  unreadCount: number;
  lastMessage: LastMessagePreviewRow | undefined;
}

/**
 * Maps Prisma Chat → Chat DTO.
 *
 * Aggregates (unreadCount, lastMessage) обчислюються в сервісі окремими
 * SQL і прокидаються параметром, бо Prisma include їх не повертає
 * (унікальна логіка через WHERE на context-юзера).
 */
export function mapChatToDto(chat: ChatWithMembers, agg: ChatAggregates): Chat {
  return {
    id: chat.id,
    type: chat.type,
    name: chat.name,
    avatarUrl: chat.avatarUrl,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    members: chat.members.map(mapMemberToDto),
    unreadCount: agg.unreadCount,
    lastMessage: agg.lastMessage ? mapLastMessageToPreview(agg.lastMessage) : null,
  };
}

function mapMemberToDto(m: ChatWithMembers["members"][number]): ChatMemberDto {
  return {
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    leftAt: m.leftAt ? m.leftAt.toISOString() : null,
    user: {
      id: m.user.id,
      name: m.user.name,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl,
    },
  };
}

function mapLastMessageToPreview(row: LastMessagePreviewRow): MessagePreview {
  return {
    id: row.id,
    content: row.deletedAt ? "" : row.content,
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
    isDeleted: row.deletedAt !== null,
  };
}

// ============================================
// Message
// ============================================

import type { Message } from "@chat/shared";

/**
 * Структурний тип Prisma Message з підвантаженим author.
 * Як з ChatWithMembers — описуємо потрібні поля явно, без посилання
 * на PrismaClient namespace.
 */
export interface MessageWithAuthor {
  id: string;
  chatId: string;
  authorId: string;
  content: string;
  parentMessageId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  author: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
  };
}

/**
 * Maps Prisma Message → Message DTO.
 *
 * Якщо deletedAt не null — content повертаємо "" (узгоджено: soft delete
 * без leaking оригінального тексту). Клієнт перевіряє `deletedAt !== null`
 * щоб показати "Це повідомлення видалено".
 *
 * reactions і replyCount поки що пусті — заповнимо в Ітераціях 5 і 6.
 */
export function mapMessageToDto(message: MessageWithAuthor): Message {
  const isDeleted = message.deletedAt !== null;

  return {
    id: message.id,
    chatId: message.chatId,
    author: {
      id: message.author.id,
      name: message.author.name,
      username: message.author.username,
      avatarUrl: message.author.avatarUrl,
    },
    content: isDeleted ? "" : message.content,
    parentMessageId: message.parentMessageId,
    replyCount: 0,
    reactions: [],
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
  };
}
