import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

/**
 * ============================================
 * API client з queue-based refresh interceptor
 * ============================================
 *
 * Архітектура:
 * - Cookies (HttpOnly) керує браузер. JS їх НЕ бачить — це by design,
 *   захист від XSS. axios шле автоматично через `withCredentials: true`.
 * - На 401 від access-token: один раз шлемо `/refresh`, ставимо у queue
 *   усі паралельні запити що теж отримали 401, після успіху — повторюємо.
 * - Якщо refresh провалився — reject усі pending, шлемо подію, що дозволяє
 *   QueryClient інвалідувати `useMe` (юзер бачить login-сторінку).
 *
 * ============================================
 * Чому queue, а не "просто refresh"
 * ============================================
 * Сценарій без queue: 5 паралельних запитів повертають 401, кожен запускає
 * свій /refresh. Перший revoke-ne старий токен, інші 4 шлють той самий
 * старий → REPLAY DETECTION на бекенді → revoke ВСЯ family → юзер вилітає.
 *
 * З queue: тільки ОДИН /refresh у час. Решта чекають у pendingQueue.
 * Refresh успішний → flushQueue, всі pending йдуть з новим cookie.
 */

// API URL — у dev порожній (next.config.ts проксі-ує /api → :5000),
// у prod — повний URL до бекенду через env.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
  timeout: 15_000,
});

// ============================================
// Refresh queue state
// ============================================

let isRefreshing = false;
type QueuedRequest = {
  resolve: () => void;
  reject: (err: unknown) => void;
};
const pendingQueue: QueuedRequest[] = [];

function flushQueue(error: unknown | null) {
  for (const { resolve, reject } of pendingQueue) {
    if (error) reject(error);
    else resolve();
  }
  pendingQueue.length = 0;
}

// ============================================
// Auth-failed event — для UI реакції на втрату сесії
// ============================================

/**
 * Коли refresh провалився (наприклад, replay detected на бекенді) —
 * шлемо CustomEvent, на нього підписаний QueryClientProvider у layout.
 * Це інвалідує useMe → UI показує login screen.
 *
 * Альтернатива через прямий import QueryClient — створює circular dep.
 * Custom event — найдекоупленіше рішення.
 */
export const AUTH_FAILED_EVENT = "auth:failed";

function emitAuthFailed() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_FAILED_EVENT));
  }
}

// ============================================
// Response interceptor — головна логіка
// ============================================

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined;

    // Не auth-помилка АБО вже retry-нули — пропускаємо
    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    // Не пробуємо refresh для самого refresh-ендпойнта
    // (інакше при провалі refresh-у — нескінченний цикл)
    if (originalRequest.url?.includes("/auth/refresh")) {
      return Promise.reject(error);
    }

    // Не пробуємо refresh для login/register/me — на login сторінці
    // 401 нормально (юзер вводить пароль), refresh не потрібен.
    const skipRefreshUrls = ["/auth/login", "/auth/register"];
    if (skipRefreshUrls.some((url) => originalRequest.url?.includes(url))) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // Якщо вже йде refresh — стаємо в чергу
    if (isRefreshing) {
      return new Promise<void>((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      })
        .then(() => apiClient(originalRequest))
        .catch((err) => Promise.reject(err));
    }

    // Перший 401 — запускаємо refresh
    isRefreshing = true;
    try {
      await apiClient.post("/auth/refresh");
      flushQueue(null);
      return await apiClient(originalRequest);
    } catch (refreshError) {
      flushQueue(refreshError);
      emitAuthFailed();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ============================================
// Helper для типізованих response.data
// ============================================

/**
 * Розпаковує response.data — невеличке зручне обгортання
 * щоб не писати `.then(r => r.data)` на кожному виклику.
 */
export async function api<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<T>(config);
  return response.data;
}
