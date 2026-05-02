import { AxiosError } from "axios";

/**
 * Маппер error.code → людський український текст для UI.
 *
 * Бекенд повертає { error: { code, message, details? } }. Поле `code` —
 * machine-readable, на нього мапаємо. `message` — англійський fallback.
 *
 * Якщо у майбутньому буде локалізація — це єдине місце що міняти.
 */

const CODE_MESSAGES: Record<string, string> = {
  // Validation
  VALIDATION_FAILED_BODY: "Перевірте введені дані",
  VALIDATION_FAILED_PARAMS: "Невалідні параметри запиту",
  VALIDATION_FAILED_QUERY: "Невалідні параметри запиту",

  // Auth
  INVALID_CREDENTIALS: "Неправильний email або пароль",
  EMAIL_NOT_VERIFIED: "Підтвердьте email — лист надіслано на вашу адресу",
  EMAIL_ALREADY_TAKEN: "Цей email уже зареєстрований",
  NO_ACCESS_TOKEN: "Сесія минула, увійдіть знову",
  INVALID_ACCESS_TOKEN: "Сесія минула, увійдіть знову",
  NO_REFRESH_TOKEN: "Сесія минула, увійдіть знову",
  INVALID_REFRESH_TOKEN: "Сесія минула, увійдіть знову",
  REFRESH_REPLAY: "Виявлено підозрілу активність — увійдіть знову",
  REFRESH_EXPIRED: "Сесія минула, увійдіть знову",
  USER_NOT_FOUND: "Акаунт більше не існує",

  // Tokens
  INVALID_TOKEN: "Посилання недійсне або застаріло",

  // HTTP-level
  TOO_MANY_REQUESTS: "Забагато спроб. Спробуйте через кілька хвилин",
  INTERNAL_ERROR: "Щось пішло не так. Спробуйте пізніше",
  ROUTE_NOT_FOUND: "Сторінку не знайдено",
};

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

/**
 * Витягує юзер-frindly повідомлення з помилки axios або будь-чого.
 *
 * Порядок:
 *   1. AxiosError → response.data.error.code → з мапи
 *   2. AxiosError → response.data.error.message (англійський fallback)
 *   3. Network error / timeout
 *   4. Generic fallback
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const body = err.response?.data as ApiErrorBody | undefined;
    const code = body?.error?.code;

    if (code && CODE_MESSAGES[code]) {
      return CODE_MESSAGES[code];
    }

    if (body?.error?.message) {
      return body.error.message;
    }

    if (err.code === "ECONNABORTED") {
      return "Запит занадто довгий. Перевірте інтернет";
    }

    if (!err.response) {
      return "Не вдалося зв'язатися з сервером";
    }

    return "Щось пішло не так";
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Щось пішло не так";
}

/**
 * Витягує саме error.code (без мапінгу). Корисно якщо UI хоче
 * умовну логіку залежно від конкретної помилки.
 */
export function getErrorCode(err: unknown): string | null {
  if (err instanceof AxiosError) {
    const body = err.response?.data as ApiErrorBody | undefined;
    return body?.error?.code ?? null;
  }
  return null;
}
