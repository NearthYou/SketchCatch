import { createHmac, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { requireAuthTokenSecret } from "../config/env.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

export async function createAccessToken(userId: string): Promise<string> {
  return new SignJWT({ typ: "access" })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT"
    })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getAuthTokenSecretKey());
}

export async function verifyAccessToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthTokenSecretKey(), {
      algorithms: ["HS256"]
    });

    if (typeof payload.sub !== "string" || payload.typ !== "access") {
      return null;
    }

    return {
      userId: payload.sub
    };
  } catch {
    return null;
  }
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHmac("sha256", requireAuthTokenSecret()).update(token).digest("base64url");
}

export function getRefreshTokenExpiresAt(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  return expiresAt;
}

function getAuthTokenSecretKey(): Uint8Array {
  return new TextEncoder().encode(requireAuthTokenSecret());
}
