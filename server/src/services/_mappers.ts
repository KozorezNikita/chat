import type { PublicUser, MeUser } from "@chat/shared";

import { getSignedDownloadUrl } from "./upload.service.js";

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
    lastReadMessageId: m.lastReadMessageId,
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
  reactions?: { emoji: string; userId: string }[];
  parentMessage?: {
    id: string;
    content: string;
    deletedAt: Date | null;
    chatId: string;
    author: { name: string };
  } | null;
  // Attachment fields — присутні після Iter 7 migration
  attachmentKey?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  attachmentWidth?: number | null;
  attachmentHeight?: number | null;
  attachmentThumbKey?: string | null;
  // Iter 10: voice messages — тривалість у секундах
  attachmentDuration?: number | null;
}

/**
 * Maps Prisma Message → Message DTO.
 *
 * Якщо deletedAt не null — content повертаємо "" (узгоджено: soft delete
 * без leaking оригінального тексту). Клієнт перевіряє `deletedAt !== null`
 * щоб показати "Це повідомлення видалено".
 *
 * reactions заповнюються реально. replyCount — поки що завжди 0: тредів у
 * UI ще нема, підрахунок реплаїв не реалізовано. Поле лишається в DTO як
 * зарезервоване під майбутню фічу тредів; НЕ покладатись на нього на клієнті,
 * доки не буде додано реальний _count по parentMessageId.
 */
/**
 * reactedByMe рахуємо тут — на основі currentUserId з context-у запиту.
 * Якщо currentUserId не передано — reactedByMe скрізь false (наприклад
 * для не-auth read-only endpoint-ів, яких у нас наразі немає).
 */
function groupReactions(
  reactions: { emoji: string; userId: string }[],
  currentUserId: string | undefined,
): { emoji: string; count: number; userIds: string[]; reactedByMe: boolean }[] {
  const map = new Map<string, Set<string>>();
  for (const r of reactions) {
    let set = map.get(r.emoji);
    if (!set) {
      set = new Set();
      map.set(r.emoji, set);
    }
    set.add(r.userId);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.size,
    userIds: Array.from(userIds),
    reactedByMe: currentUserId ? userIds.has(currentUserId) : false,
  }));
}

const PARENT_PREVIEW_MAX_LENGTH = 100;

function buildParentPreview(
  parent: NonNullable<MessageWithAuthor["parentMessage"]>,
  currentChatId: string,
) {
  // Cross-chat protection — якщо parent з іншого чату, не leakaємо
  if (parent.chatId !== currentChatId) return null;

  const isDeleted = parent.deletedAt !== null;
  let preview = "";
  if (!isDeleted) {
    preview =
      parent.content.length > PARENT_PREVIEW_MAX_LENGTH
        ? `${parent.content.slice(0, PARENT_PREVIEW_MAX_LENGTH)}…`
        : parent.content;
  }
  return {
    id: parent.id,
    authorName: parent.author.name,
    contentPreview: preview,
    isDeleted,
  };
}

async function buildAttachment(
  message: MessageWithAuthor,
): Promise<{
  url: string;
  thumbUrl: string | null;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
} | null> {
  if (!message.attachmentKey) return null;

  const [url, thumbUrl] = await Promise.all([
    getSignedDownloadUrl(message.attachmentKey),
    message.attachmentThumbKey
      ? getSignedDownloadUrl(message.attachmentThumbKey)
      : Promise.resolve(null),
  ]);

  return {
    url,
    thumbUrl,
    name: message.attachmentName ?? "file",
    mime: message.attachmentMime ?? "application/octet-stream",
    size: message.attachmentSize ?? 0,
    width: message.attachmentWidth ?? null,
    height: message.attachmentHeight ?? null,
    duration: message.attachmentDuration ?? null,
  };
}

export async function mapMessageToDto(
  message: MessageWithAuthor,
  currentUserId?: string,
): Promise<Message> {
  const isDeleted = message.deletedAt !== null;
  const parentPreview = message.parentMessage
    ? buildParentPreview(message.parentMessage, message.chatId)
    : null;

  // Attachment не показуємо у deleted повідомленнях (UI показує "Видалено").
  const attachment = isDeleted ? null : await buildAttachment(message);

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
    parent: parentPreview,
    replyCount: 0, // stub — див. коментар вище; підрахунок ще не реалізовано
    reactions: groupReactions(message.reactions ?? [], currentUserId),
    attachment,
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
  };
}
