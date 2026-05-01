import { z } from "zod";

/**
 * Регулярка для пароля: мінімум 8 символів, хоча б одна літера і одна цифра.
 * Спеціально не вимагаємо великих літер чи символів — UX гірший, безпека
 * не критично краща. Краще довжина.
 */
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export const passwordSchema = z
  .string()
  .regex(PASSWORD_REGEX, {
    message: "Пароль має бути 8-128 символів, містити хоча б одну літеру і одну цифру",
  });

/**
 * Реєстрація.
 * Username опційний — юзер встановлює пізніше у Settings.
 */
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
});

export type RegisterDto = z.infer<typeof registerSchema>;

/**
 * Логін.
 */
export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1), // на login не валідуємо силу — юзер міг зареєструватись зі старим паролем
});

export type LoginDto = z.infer<typeof loginSchema>;

/**
 * Підтвердження email — токен з листа.
 */
export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

/**
 * Запит на скидання пароля.
 */
export const requestPasswordResetSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export type RequestPasswordResetDto = z.infer<typeof requestPasswordResetSchema>;

/**
 * Виконання скидання пароля — токен + новий пароль.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
