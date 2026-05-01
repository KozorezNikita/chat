import { z } from "zod";

/**
 * Регулярки для username.
 * - 3..20 символів
 * - тільки lowercase latin, цифри, underscore
 * - не може починатись з цифри або _
 *
 * Зберігаємо у БД у нижньому регістрі (нормалізуємо у service-шарі при INSERT/UPDATE).
 */
export const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

export const usernameSchema = z
  .string()
  .regex(USERNAME_REGEX, {
    message:
      "Username має бути 3-20 символів, починатись з латинської літери, містити лише lowercase літери, цифри та _",
  });

/**
 * Публічна репрезентація юзера — те що видно іншим.
 * Без email, password, tokens — це чутливі поля.
 *
 * Використовується:
 * - як поле `author` у MessageDto
 * - як поле `members[]` у ChatDto
 * - як результат пошуку юзерів
 */
export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

/**
 * Розширена репрезентація — те що бачить сам юзер про себе.
 * /me endpoint, налаштування профілю.
 */
export const meUserSchema = publicUserSchema.extend({
  email: z.string().email(),
  emailVerified: z.boolean(),
  createdAt: z.string().datetime(),
});

export type MeUser = z.infer<typeof meUserSchema>;

/**
 * Presence-інформація про юзера (для відображення статусу у UI).
 * online/offline + last seen.
 *
 * Окремо від PublicUser, бо presence змінюється часто і не хочемо
 * перерендерювати весь юзер-об'єкт коли змінюється тільки статус.
 */
export const userPresenceSchema = z.object({
  userId: z.string(),
  status: z.enum(["online", "away", "offline"]),
  lastSeenAt: z.string().datetime(),
});

export type UserPresence = z.infer<typeof userPresenceSchema>;

/**
 * DTO для оновлення власного профілю.
 * Усі поля опційні — PATCH-семантика.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  username: usernameSchema.optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
