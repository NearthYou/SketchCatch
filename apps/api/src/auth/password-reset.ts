import { randomBytes } from "node:crypto";
import { getRuntimeEnv } from "../config/env.js";

export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

export function createPasswordResetToken(): string {
  return randomBytes(48).toString("base64url");
}

export function getPasswordResetTokenExpiresAt(now = new Date()): Date {
  const expiresAt = new Date(now);
  expiresAt.setMinutes(expiresAt.getMinutes() + PASSWORD_RESET_TOKEN_TTL_MINUTES);

  return expiresAt;
}

export function shouldExposePasswordResetDebugToken(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function buildPasswordResetDebugUrl(resetToken: string): string {
  const env = getRuntimeEnv();
  const baseUrl =
    env.oauthRedirectBaseUrl?.trim() || env.sketchcatchPublicBaseUrl?.trim() || "http://localhost:3000";

  return `${baseUrl.replace(/\/+$/, "")}/password-reset/confirm?token=${encodeURIComponent(
    resetToken
  )}`;
}
