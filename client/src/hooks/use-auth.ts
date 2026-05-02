"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import type {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from "@chat/shared";

import * as authApi from "@/lib/api/auth";

/**
 * ============================================
 * Auth hooks — TanStack Query обгортки
 * ============================================
 *
 * Ключ ["me"] — наш єдиний "хто я" стан. Усі мутації що міняють auth-стан
 * (login, logout, register-with-auto-login) — invalidate цей ключ.
 *
 * useMe() — основний hook. Поверне:
 *   - { data: { user }, isLoading: true }   — fetching
 *   - { data: { user: MeUser }, ... }       — залогінений
 *   - { data: null, error: AxiosError }     — 401, не залогінений
 *
 * Компоненти просто перевіряють `data?.user` для conditional rendering.
 */

const ME_KEY = ["me"] as const;

/**
 * Поточний юзер. Запит на /auth/me. 401 = не залогінений (це не помилка
 * з точки зору UX, тому через onError у layout не показуємо toast).
 */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: authApi.getMe,
    // Не retry на 401 (вже у global config, але дублюю для ясності
    // — useMe найчастіше повертає 401 у нормальному flow, не warn-имо)
    retry: (failureCount, error) => {
      if (error instanceof AxiosError && error.response?.status === 401) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/**
 * Login mutation. На успіх — перерахунок useMe.
 * Component викликає `mutate(dto)` і слухає `isPending` / `error`.
 */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: LoginDto) => authApi.login(dto),
    onSuccess: (data) => {
      // Pre-populate useMe з даних відповіді — миттєвий UI без зайвого запиту
      queryClient.setQueryData(ME_KEY, { user: data.user });
    },
  });
}

/**
 * Register mutation. Не auto-логінить (узгоджено: B-flow).
 * Component після успіху redirect-ить на /auth/check-email.
 */
export function useRegister() {
  return useMutation({
    mutationFn: (dto: RegisterDto) => authApi.register(dto),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (dto: VerifyEmailDto) => authApi.verifyEmail(dto),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (dto: RequestPasswordResetDto) => authApi.resendVerification(dto),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (dto: RequestPasswordResetDto) => authApi.requestPasswordReset(dto),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (dto: ResetPasswordDto) => authApi.resetPassword(dto),
  });
}

/**
 * Logout — на успіх стираємо useMe, фронт-компоненти бачать null і
 * перенаправляють на /. Не використовуємо invalidate бо ми ТОЧНО знаємо
 * що юзер вилогінений — навіщо зайвий запит на /me що поверне 401.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
      // Чистимо ВСІ кеши з юзер-даними. Поки що тільки useMe,
      // але коли з'являться chats/messages — теж зникнуть.
      queryClient.clear();
    },
  });
}

export function useLogoutAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logoutAll,
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.clear();
    },
  });
}
