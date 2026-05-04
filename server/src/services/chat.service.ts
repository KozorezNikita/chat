import type {
  Chat,
  CreateDirectChatDto,
  CreateGroupChatDto,
  UpdateGroupChatDto,
  PublicUser,
} from "@chat/shared";

import * as chatRepo from "../repositories/chat.repo.js";
import * as userRepo from "../repositories/user.repo.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "../utils/HttpError.js";
import { mapChatToDto, type ChatWithMembers } from "./_mappers.js";

/**
 * ============================================
 * Chat service
 * ============================================
 *
 * Бізнес-логіка чатів:
 *  - getChats — список чатів юзера + аґрегати (unread, lastMessage)
 *  - getChat — один чат
 *  - createDirectChat — пара upsert по directKey
 *  - createGroupChat — group + members
 *  - updateGroup — тільки OWNER
 *  - deleteGroup — тільки OWNER
 *  - addMember — тільки OWNER
 *  - removeMember — OWNER (kick) або self (leave)
 *  - markAsRead — оновити lastReadMessageId
 */

// ============================================
// READ
// ============================================

/**
 * Список чатів юзера з агрегатами.
 *
 * Скільки SQL: 1 (chats) + 1 (unread counts) + 1 (last messages) = 3.
 * Для 50 чатів — той самий 3 запити. Без N+1.
 */
export async function getUserChats(userId: string): Promise<Chat[]> {
  const chats = await chatRepo.findUserChats(userId);
  if (chats.length === 0) return [];

  const chatIds = chats.map((c) => c.id);
  const [unreadMap, lastMessagesMap] = await Promise.all([
    chatRepo.countUnreadByChat(userId),
    chatRepo.fetchLastMessagesForChats(chatIds),
  ]);

  return chats.map((chat) =>
    mapChatToDto(chat as ChatWithMembers, {
      unreadCount: unreadMap.get(chat.id) ?? 0,
      lastMessage: lastMessagesMap.get(chat.id),
    }),
  );
}

/**
 * Один чат за id. НЕ перевіряє membership — це робить middleware.
 */
export async function getChat(chatId: string, userId: string): Promise<Chat> {
  const chat = await chatRepo.findChatById(chatId);
  if (!chat) throw new NotFoundError("Chat not found", "CHAT_NOT_FOUND");

  // Аґрегати тільки для цього чату — простіше через ті самі repo-функції
  const [unreadMap, lastMessagesMap] = await Promise.all([
    chatRepo.countUnreadByChat(userId),
    chatRepo.fetchLastMessagesForChats([chatId]),
  ]);

  return mapChatToDto(chat as ChatWithMembers, {
    unreadCount: unreadMap.get(chatId) ?? 0,
    lastMessage: lastMessagesMap.get(chatId),
  });
}

// ============================================
// CREATE — direct
// ============================================

/**
 * Знайти або створити DIRECT-чат між поточним юзером і target.
 *
 * Self-chat заборонений (target === self).
 * Target має існувати.
 */
export async function createDirectChat(
  currentUserId: string,
  dto: CreateDirectChatDto,
): Promise<Chat> {
  if (dto.userId === currentUserId) {
    throw new BadRequestError("Cannot create chat with yourself", "CANNOT_CHAT_WITH_SELF");
  }

  const target = await userRepo.findActiveUserById(dto.userId);
  if (!target) {
    throw new NotFoundError("User not found", "USER_NOT_FOUND");
  }

  const directKey = buildDirectKey(currentUserId, dto.userId);
  const chat = await chatRepo.upsertDirectChat(
    currentUserId,
    dto.userId,
    directKey,
    currentUserId,
  );

  return mapChatToDto(chat as ChatWithMembers, {
    unreadCount: 0,
    lastMessage: undefined,
  });
}

/**
 * Лексикографічно сортуємо ID — щоб (A,B) і (B,A) дали той самий ключ.
 * Винесено в helper щоб ніде не помилитися з порядком.
 */
function buildDirectKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

// ============================================
// CREATE — group
// ============================================

/**
 * Створення group-чату.
 *
 * Owner = currentUser. Інші members — з dto. Дублікати в memberIds
 * прибираємо (Set), сам owner не може бути в memberIds (фільтруємо).
 *
 * Перевіряємо що всі memberIds існують в БД — інакше можна створити
 * чат з phantom-members.
 */
export async function createGroupChat(
  currentUserId: string,
  dto: CreateGroupChatDto,
): Promise<Chat> {
  // Унікалізуємо + прибираємо self
  const memberIds = Array.from(new Set(dto.memberIds)).filter(
    (id) => id !== currentUserId,
  );

  if (memberIds.length === 0) {
    throw new BadRequestError(
      "Group chat must have at least one other member",
      "EMPTY_MEMBER_LIST",
    );
  }

  // Перевіряємо що всі memberIds існують
  const existing = await userRepo.findUsersByIds(memberIds);
  if (existing.length !== memberIds.length) {
    throw new BadRequestError("Some members not found", "MEMBERS_NOT_FOUND");
  }

  const chat = await chatRepo.createGroupChat({
    name: dto.name,
    ownerId: currentUserId,
    memberIds,
  });

  return mapChatToDto(chat as ChatWithMembers, {
    unreadCount: 0,
    lastMessage: undefined,
  });
}

// ============================================
// UPDATE / DELETE
// ============================================

/**
 * Оновлення group-чату. Тільки OWNER. DIRECT не можна оновлювати.
 */
export async function updateGroupChat(
  chatId: string,
  currentUserId: string,
  dto: UpdateGroupChatDto,
): Promise<Chat> {
  const chat = await chatRepo.findChatById(chatId);
  if (!chat) throw new NotFoundError("Chat not found", "CHAT_NOT_FOUND");

  if (chat.type === "DIRECT") {
    throw new BadRequestError(
      "Cannot update direct chat",
      "INVALID_OPERATION_FOR_DIRECT_CHAT",
    );
  }

  const member = chat.members.find(
    (m: { userId: string; role: string; leftAt: Date | null }) =>
      m.userId === currentUserId && m.leftAt === null,
  );
  if (!member || member.role !== "OWNER") {
    throw new ForbiddenError("Only owner can update chat", "NOT_CHAT_OWNER");
  }

  const updated = await chatRepo.updateGroupChat(chatId, dto);
  return mapChatToDto(updated as ChatWithMembers, {
    unreadCount: 0,
    lastMessage: undefined,
  });
}

/**
 * Видалення group-чату. Тільки OWNER.
 * CASCADE на members/messages/reactions налаштована у Prisma schema.
 */
export async function deleteGroupChat(chatId: string, currentUserId: string): Promise<void> {
  const chat = await chatRepo.findChatById(chatId);
  if (!chat) throw new NotFoundError("Chat not found", "CHAT_NOT_FOUND");

  if (chat.type === "DIRECT") {
    throw new BadRequestError(
      "Cannot delete direct chat",
      "INVALID_OPERATION_FOR_DIRECT_CHAT",
    );
  }

  const member = chat.members.find(
    (m: { userId: string; role: string; leftAt: Date | null }) =>
      m.userId === currentUserId && m.leftAt === null,
  );
  if (!member || member.role !== "OWNER") {
    throw new ForbiddenError("Only owner can delete chat", "NOT_CHAT_OWNER");
  }

  await chatRepo.deleteChat(chatId);
}

// ============================================
// MEMBERSHIP
// ============================================

/**
 * Додати юзера до групи. Тільки OWNER.
 */
export async function addMember(
  chatId: string,
  currentUserId: string,
  newMemberId: string,
): Promise<PublicUser> {
  const chat = await chatRepo.findChatById(chatId);
  if (!chat) throw new NotFoundError("Chat not found", "CHAT_NOT_FOUND");

  if (chat.type === "DIRECT") {
    throw new BadRequestError(
      "Cannot add members to direct chat",
      "INVALID_OPERATION_FOR_DIRECT_CHAT",
    );
  }

  const requester = chat.members.find(
    (m: { userId: string; role: string; leftAt: Date | null }) =>
      m.userId === currentUserId && m.leftAt === null,
  );
  if (!requester || requester.role !== "OWNER") {
    throw new ForbiddenError("Only owner can add members", "NOT_CHAT_OWNER");
  }

  // Юзер уже є членом і не left?
  const existingActive = chat.members.find(
    (m: { userId: string; leftAt: Date | null }) =>
      m.userId === newMemberId && m.leftAt === null,
  );
  if (existingActive) {
    throw new ConflictError("User is already a member", "ALREADY_MEMBER");
  }

  const newUser = await userRepo.findActiveUserById(newMemberId);
  if (!newUser) {
    throw new NotFoundError("User not found", "USER_NOT_FOUND");
  }

  await chatRepo.addChatMember(chatId, newMemberId, "MEMBER");

  return {
    id: newUser.id,
    name: newUser.name,
    username: newUser.username,
    avatarUrl: newUser.avatarUrl,
  };
}

/**
 * Видалити юзера з групи. OWNER (kick) або self (leave).
 *
 * Захист: не дати last OWNER-у leave/бути видаленим (інакше група
 * залишиться без власника, наступне update/delete ламатиметься).
 */
export async function removeMember(
  chatId: string,
  currentUserId: string,
  targetUserId: string,
): Promise<void> {
  const chat = await chatRepo.findChatById(chatId);
  if (!chat) throw new NotFoundError("Chat not found", "CHAT_NOT_FOUND");

  if (chat.type === "DIRECT") {
    throw new BadRequestError(
      "Cannot remove members from direct chat",
      "INVALID_OPERATION_FOR_DIRECT_CHAT",
    );
  }

  const requester = chat.members.find(
    (m: { userId: string; role: string; leftAt: Date | null }) =>
      m.userId === currentUserId && m.leftAt === null,
  );
  if (!requester) {
    throw new ForbiddenError("You are not a member of this chat", "NOT_A_MEMBER");
  }

  const isSelf = currentUserId === targetUserId;
  if (!isSelf && requester.role !== "OWNER") {
    throw new ForbiddenError("Only owner can remove other members", "NOT_CHAT_OWNER");
  }

  const target = chat.members.find(
    (m: { userId: string; leftAt: Date | null }) =>
      m.userId === targetUserId && m.leftAt === null,
  );
  if (!target) {
    throw new NotFoundError("Member not found", "MEMBER_NOT_FOUND");
  }

  // Захист last OWNER
  if (target.role === "OWNER") {
    const otherOwners = chat.members.filter(
      (m: { userId: string; role: string; leftAt: Date | null }) =>
        m.role === "OWNER" && m.leftAt === null && m.userId !== targetUserId,
    );
    if (otherOwners.length === 0) {
      throw new BadRequestError(
        "Cannot remove the last owner. Transfer ownership or delete chat.",
        "LAST_OWNER",
      );
    }
  }

  await chatRepo.softRemoveMember(chatId, targetUserId);
}

// ============================================
// READ MARKER
// ============================================

export async function markChatAsRead(
  chatId: string,
  userId: string,
  messageId: string,
): Promise<void> {
  await chatRepo.updateLastRead(chatId, userId, messageId);
}
