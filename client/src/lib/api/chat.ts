import type {
  Chat,
  CreateDirectChatDto,
  CreateGroupChatDto,
  UpdateGroupChatDto,
  AddChatMemberDto,
  MarkAsReadDto,
  PublicUser,
} from "@chat/shared";

import { api } from "./client";

/**
 * Chat endpoints — типізовані обгортки.
 */

export function getChats(): Promise<{ chats: Chat[] }> {
  return api({ method: "GET", url: "/chats" });
}

export function getChat(chatId: string): Promise<{ chat: Chat }> {
  return api({ method: "GET", url: `/chats/${chatId}` });
}

export function createDirectChat(dto: CreateDirectChatDto): Promise<{ chat: Chat }> {
  return api({ method: "POST", url: "/chats/direct", data: dto });
}

export function createGroupChat(dto: CreateGroupChatDto): Promise<{ chat: Chat }> {
  return api({ method: "POST", url: "/chats/group", data: dto });
}

export function updateChat(chatId: string, dto: UpdateGroupChatDto): Promise<{ chat: Chat }> {
  return api({ method: "PATCH", url: `/chats/${chatId}`, data: dto });
}

export function deleteChat(chatId: string): Promise<void> {
  return api({ method: "DELETE", url: `/chats/${chatId}` });
}

export function addMember(chatId: string, dto: AddChatMemberDto): Promise<{ member: PublicUser }> {
  return api({ method: "POST", url: `/chats/${chatId}/members`, data: dto });
}

export function removeMember(chatId: string, userId: string): Promise<void> {
  return api({ method: "DELETE", url: `/chats/${chatId}/members/${userId}` });
}

export function markChatAsRead(chatId: string, dto: MarkAsReadDto): Promise<{ ok: boolean }> {
  return api({ method: "POST", url: `/chats/${chatId}/read`, data: dto });
}
