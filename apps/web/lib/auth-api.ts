import type {
  AuthResponse,
  CurrentUserResponse,
  LoginRequest,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  SignupRequest
} from "@sketchcatch/types";
import { apiFetch, refreshAuthSession } from "./api-client";

export function requestLogin(payload: LoginRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    body: payload,
    method: "POST"
  });
}

export function requestSignup(payload: SignupRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/signup", {
    body: payload,
    method: "POST"
  });
}

export function requestPasswordReset(
  payload: PasswordResetRequest
): Promise<PasswordResetRequestResponse> {
  return apiFetch<PasswordResetRequestResponse>("/auth/password-reset/request", {
    body: payload,
    method: "POST"
  });
}

export function confirmPasswordReset(
  payload: PasswordResetConfirmRequest
): Promise<PasswordResetConfirmResponse> {
  return apiFetch<PasswordResetConfirmResponse>("/auth/password-reset/confirm", {
    body: payload,
    method: "POST"
  });
}

export function requestCurrentUser(): Promise<CurrentUserResponse> {
  return apiFetch<CurrentUserResponse>("/auth/me", {
    auth: true,
    method: "GET"
  });
}

export const requestRefreshSession = refreshAuthSession;

export async function requestLogout(): Promise<void> {
  await apiFetch<{ ok: true }>("/auth/logout", {
    method: "POST"
  });
}
