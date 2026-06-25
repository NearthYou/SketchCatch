import type {
  AuthResponse,
  CurrentUserResponse,
  LoginRequest,
  SignupRequest
} from "@sketchcatch/types";
import { apiFetch } from "./api-client";

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

export function requestCurrentUser(): Promise<CurrentUserResponse> {
  return apiFetch<CurrentUserResponse>("/auth/me", {
    auth: true,
    method: "GET"
  });
}

export async function requestLogout(): Promise<void> {
  await apiFetch<{ ok: true }>("/auth/logout", {
    method: "POST"
  });
}
