import { prisma } from "../db/prisma.js";

/**
 * ============================================
 * Reaction repository
 * ============================================
 *
 * Проста CRUD-обгортка. UNIQUE(messageId, userId, emoji) у schema —
 * друга реакція тим же emoji не створиться (Prisma кине error).
 *
 * Toggle логіка живе у service: find → delete-якщо-існує / create-якщо-ні.
 */

export interface CreateReactionInput {
  messageId: string;
  userId: string;
  emoji: string;
}

export async function findReaction(messageId: string, userId: string, emoji: string) {
  return prisma.reaction.findUnique({
    where: {
      messageId_userId_emoji: { messageId, userId, emoji },
    },
  });
}

export async function createReaction(input: CreateReactionInput) {
  return prisma.reaction.create({
    data: input,
  });
}

export async function deleteReaction(id: string) {
  return prisma.reaction.delete({
    where: { id },
  });
}

/**
 * Усі реакції на message — для broadcast (передаємо повний список emoji+userId
 * клієнту, він локально перерахує групи з reactedByMe для свого юзера).
 */
export async function listReactionsForMessage(messageId: string) {
  return prisma.reaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });
}
