"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDirectChatDto,
  CreateGroupChatDto,
  UpdateGroupChatDto,
  AddChatMemberDto,
  MarkAsReadDto,
} from "@chat/shared";

import * as chatApi from "@/lib/api/chat";

/**
 * ============================================
 * Chat hooks — TanStack Query
 * ============================================
 *
 * Patterns:
 *  - List: ['chats']
 *  - Single: ['chats', chatId]
 *  - Mutations інвалідують ['chats'] + точковий ['chats', id]
 */

const CHATS_KEY = ["chats"] as const;

export function useChats() {
  return useQuery({
    queryKey: CHATS_KEY,
    queryFn: chatApi.getChats,
    staleTime: 30 * 1000, // 30 сек — у Iter 3 додамо invalidate з Socket.io
  });
}

export function useChat(chatId: string | undefined) {
  return useQuery({
    queryKey: ["chats", chatId],
    queryFn: () => chatApi.getChat(chatId!),
    enabled: !!chatId,
    staleTime: 30 * 1000,
  });
}

export function useCreateDirectChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateDirectChatDto) => chatApi.createDirectChat(dto),
    onSuccess: ({ chat }) => {
      qc.invalidateQueries({ queryKey: CHATS_KEY });
      qc.setQueryData(["chats", chat.id], { chat });
    },
  });
}

export function useCreateGroupChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateGroupChatDto) => chatApi.createGroupChat(dto),
    onSuccess: ({ chat }) => {
      qc.invalidateQueries({ queryKey: CHATS_KEY });
      qc.setQueryData(["chats", chat.id], { chat });
    },
  });
}

export function useUpdateChat(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateGroupChatDto) => chatApi.updateChat(chatId, dto),
    onSuccess: ({ chat }) => {
      qc.setQueryData(["chats", chatId], { chat });
      qc.invalidateQueries({ queryKey: CHATS_KEY });
    },
  });
}

export function useDeleteChat(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chatApi.deleteChat(chatId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["chats", chatId] });
      qc.invalidateQueries({ queryKey: CHATS_KEY });
    },
  });
}

export function useAddMember(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: AddChatMemberDto) => chatApi.addMember(chatId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chats", chatId] });
    },
  });
}

export function useRemoveMember(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatApi.removeMember(chatId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chats", chatId] });
      qc.invalidateQueries({ queryKey: CHATS_KEY });
    },
  });
}

export function useMarkAsRead(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: MarkAsReadDto) => chatApi.markChatAsRead(chatId, dto),
    onSuccess: () => {
      // Лише список: оновлюємо unreadCount для поточного чату.
      qc.invalidateQueries({ queryKey: CHATS_KEY });
    },
  });
}
