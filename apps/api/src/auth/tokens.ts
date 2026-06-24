import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireAuthTokenSecret } from "../config/env.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

type AccessTokenPayload = {
  sub: string;
  typ: "access";
  iat: number;
  exp: number;
};

export function createAccessToken(userId: string): string {
  const issuedAt = nowInSeconds();
  const payload: AccessTokenPayload = {
    sub: userId,
    typ: "access",
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS
  };
  const payloadPart = encodeJson(payload);
  const signature = sign(payloadPart);

  return `${payloadPart}.${signature}`;
}

export function verifyAccessToken(token: string): { userId: string } | null {
  const [payloadPart, signature, extra] = token.split(".");

  if (!payloadPart || !signature || extra !== undefined) {
    return null;
  }

  if (!secureEqual(signature, sign(payloadPart))) {
    return null;
  }

  const payload = decodeAccessTokenPayload(payloadPart);

  if (!payload || payload.typ !== "access" || payload.exp < nowInSeconds()) {
    return null;
  }

  return {
    userId: payload.sub
  };
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

function encodeJson(value: AccessTokenPayload): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeAccessTokenPayload(payloadPart: string): AccessTokenPayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Partial<
      AccessTokenPayload
    >;

    if (
      typeof decoded.sub !== "string" ||
      decoded.typ !== "access" ||
      typeof decoded.iat !== "number" ||
      typeof decoded.exp !== "number"
    ) {
      return null;
    }

    return decoded as AccessTokenPayload;
  } catch {
    return null;
  }
}

function sign(payloadPart: string): string {
  return createHmac("sha256", requireAuthTokenSecret()).update(payloadPart).digest("base64url");
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
