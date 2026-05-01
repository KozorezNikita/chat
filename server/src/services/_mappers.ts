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
