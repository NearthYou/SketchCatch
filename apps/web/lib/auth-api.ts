import type {
  AuthResponse,
  CurrentUserResponse,
  LoginRequest,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  SignupAvailabilityRequest,
  SignupAvailabilityResponse,
  SignupRequest
} from "@sketchcatch/types";
import { apiFetch, hasRefreshSessionCookieHint, refreshAuthSession } from "./api-client";

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

export function requestSignupAvailability(
  payload: SignupAvailabilityRequest
): Promise<SignupAvailabilityResponse> {
  return apiFetch<SignupAvailabilityResponse>("/auth/signup/availability", {
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
export const hasRefreshSessionHint = hasRefreshSessionCookieHint;

export async function requestLogout(): Promise<void> {
  await apiFetch<{ ok: true }>("/auth/logout", {
    method: "POST"
  });
}
