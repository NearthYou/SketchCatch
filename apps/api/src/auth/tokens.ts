import { createHmac, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { requireAuthTokenSecret } from "../config/env.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const PROFILE_UPDATE_TOKEN_TTL_SECONDS = 5 * 60;

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

export async function createProfileUpdateToken(
  userId: string,
  credentialUpdatedAt: string
): Promise<string> {
  return new SignJWT({
    typ: "profile_update",
    credentialUpdatedAt
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT"
    })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${PROFILE_UPDATE_TOKEN_TTL_SECONDS}s`)
    .sign(getAuthTokenSecretKey());
}

export async function verifyProfileUpdateToken(
  token: string
): Promise<{ userId: string; credentialUpdatedAt: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthTokenSecretKey(), {
      algorithms: ["HS256"]
    });

    if (
      typeof payload.sub !== "string" ||
      payload.typ !== "profile_update" ||
      typeof payload.credentialUpdatedAt !== "string"
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      credentialUpdatedAt: payload.credentialUpdatedAt
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
