import type {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  PublicUser,
  MeUser,
} from "@chat/shared";

import { api } from "./client";

/**
 * Auth endpoints — типізовані обгортки над apiClient.
 *
 * Усі повертають саме `data`, не `AxiosResponse`. Помилки —
 * `AxiosError` з response.data.error.code/.message.
 */

// ============================================
// Public endpoints
// ============================================

export interface RegisterResponse {
  user: PublicUser;
  message: string;
}

export function register(dto: RegisterDto): Promise<RegisterResponse> {
  return api({ method: "POST", url: "/auth/register", data: dto });
}

export interface LoginResponse {
  user: MeUser;
}

export function login(dto: LoginDto): Promise<LoginResponse> {
  return api({ method: "POST", url: "/auth/login", data: dto });
}

export function verifyEmail(dto: VerifyEmailDto): Promise<{ ok: boolean; message: string }> {
  return api({ method: "POST", url: "/auth/verify-email", data: dto });
}

export function resendVerification(dto: RequestPasswordResetDto): Promise<{ ok: boolean; message: string }> {
  return api({ method: "POST", url: "/auth/resend-verification", data: dto });
}

export function requestPasswordReset(dto: RequestPasswordResetDto): Promise<{ ok: boolean; message: string }> {
  return api({ method: "POST", url: "/auth/request-password-reset", data: dto });
}

export function resetPassword(dto: ResetPasswordDto): Promise<{ ok: boolean; message: string }> {
  return api({ method: "POST", url: "/auth/reset-password", data: dto });
}

// ============================================
// Auth-required endpoints
// ============================================

export interface MeResponse {
  user: MeUser;
}

export function getMe(): Promise<MeResponse> {
  return api({ method: "GET", url: "/auth/me" });
}

export function logout(): Promise<{ ok: boolean }> {
  return api({ method: "POST", url: "/auth/logout" });
}

export function logoutAll(): Promise<{ ok: boolean }> {
  return api({ method: "POST", url: "/auth/logout-all" });
}
