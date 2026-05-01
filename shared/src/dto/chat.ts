import { z } from "zod";
import { publicUserSchema } from "./user.js";

export const chatTypeSchema = z.enum(["DIRECT", "GROUP"]);
export type ChatType = z.infer<typeof chatTypeSchema>;

export const memberRoleSchema = z.enum(["OWNER", "MEMBER"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

/**
 * Учасник чату — юзер + його роль/membership-метадані.
 */
export const chatMemberSchema = z.object({
  user: publicUserSchema,
  role: memberRoleSchema,
  joinedAt: z.string().datetime(),
});

export type ChatMember = z.infer<typeof chatMemberSchema>;

/**
 * Чат — як він приходить у списку чатів і у відповіді на /chats/:id.
 *
 * lastMessage — це denormalized last-message-preview для списку чатів.
 * Без нього довелось би при відкритті списку робити N+1 запит на
 * "останнє повідомлення кожного чату". Це окремий тип, мінімальний.
 *
 * unreadCount — на майбутнє (Ітерація 5). Поки сервер може повертати 0.
 */
export const chatLastMessagePreviewSchema = z.object({
  id: z.string(),
  content: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  createdAt: z.string().datetime(),
  isDeleted: z.boolean(),
});

export type ChatLastMessagePreview = z.infer<typeof chatLastMessagePreviewSchema>;

export const chatSchema = z.object({
  id: z.string(),
  type: chatTypeSchema,

  // Для DIRECT — null. Для GROUP — назва.
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),

  members: z.array(chatMemberSchema),

  lastMessage: chatLastMessagePreviewSchema.nullable(),
  unreadCount: z.number().int().min(0),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Chat = z.infer<typeof chatSchema>;

/**
 * Створення приватного чату — за userId співрозмовника.
 * Сервер сам формує directKey і робить upsert.
 */
export const createDirectChatSchema = z.object({
  userId: z.string().min(1),
});

export type CreateDirectChatDto = z.infer<typeof createDirectChatSchema>;

/**
 * Створення групового чату.
 * Initial members — окрім самого creator (його сервер додає сам як OWNER).
 */
export const createGroupChatSchema = z.object({
  name: z.string().trim().min(1).max(100),
  memberIds: z.array(z.string().min(1)).min(1).max(50),
});

export type CreateGroupChatDto = z.infer<typeof createGroupChatSchema>;

/**
 * Оновлення групового чату (тільки OWNER може).
 */
export const updateGroupChatSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type UpdateGroupChatDto = z.infer<typeof updateGroupChatSchema>;

/**
 * Додавання учасника до групи (тільки OWNER).
 */
export const addChatMemberSchema = z.object({
  userId: z.string().min(1),
});

export type AddChatMemberDto = z.infer<typeof addChatMemberSchema>;
