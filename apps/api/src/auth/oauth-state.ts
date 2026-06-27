import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { OAuthProvider } from "@sketchcatch/types";
import { requireAuthTokenSecret } from "../config/env.js";

const OAUTH_STATE_COOKIE_NAME = "sketchcatch_oauth_state";
const OAUTH_STATE_COOKIE_PATH = "/api/auth/oauth";
const OAUTH_STATE_COOKIE_MAX_AGE_SECONDS = 5 * 60;

export type OAuthStateCookie = {
  provider: OAuthProvider;
  state: string;
};

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function setOAuthStateCookie(reply: FastifyReply, value: OAuthStateCookie): void {
  appendSetCookieHeader(
    reply,
    serializeOAuthCookie(OAUTH_STATE_COOKIE_NAME, signOAuthStateCookieValue(value), {
      httpOnly: true,
      maxAge: OAUTH_STATE_COOKIE_MAX_AGE_SECONDS,
      path: OAUTH_STATE_COOKIE_PATH
    })
  );
}

export function readOAuthStateCookie(request: FastifyRequest): OAuthStateCookie | null {
  const rawValue = getCookie(request, OAUTH_STATE_COOKIE_NAME);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = verifyOAuthStateCookieValue(rawValue);

    if (!isOAuthProvider(parsedValue.provider) || typeof parsedValue.state !== "string") {
      return null;
    }

    return {
      provider: parsedValue.provider,
      state: parsedValue.state
    };
  } catch {
    return null;
  }
}

export function clearOAuthStateCookie(reply: FastifyReply): void {
  appendSetCookieHeader(
    reply,
    serializeOAuthCookie(OAUTH_STATE_COOKIE_NAME, "", {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: OAUTH_STATE_COOKIE_PATH
    })
  );
}

function getCookie(request: FastifyRequest, cookieName: string): string | null {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;

  for (const cookie of cookies.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName === cookieName) {
      const rawValue = rawValueParts.join("=");

      try {
        return rawValue ? decodeURIComponent(rawValue) : null;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function signOAuthStateCookieValue(value: OAuthStateCookie): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", requireAuthTokenSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function verifyOAuthStateCookieValue(rawValue: string): Partial<OAuthStateCookie> {
  const [payload, signature] = rawValue.split(".");

  if (!payload || !signature || !isValidOAuthStateSignature(payload, signature)) {
    return {};
  }

  return JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  ) as Partial<OAuthStateCookie>;
}

function isValidOAuthStateSignature(payload: string, signature: string): boolean {
  const expectedSignature = createHmac("sha256", requireAuthTokenSecret())
    .update(payload)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function appendSetCookieHeader(reply: FastifyReply, cookie: string): void {
  const existingHeader = reply.getHeader("set-cookie");

  if (!existingHeader) {
    reply.header("set-cookie", cookie);
    return;
  }

  const existingCookies = Array.isArray(existingHeader)
    ? existingHeader.map(String)
    : [String(existingHeader)];

  reply.header("set-cookie", [...existingCookies, cookie]);
}

function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === "naver" || value === "google" || value === "kakao" || value === "github";
}

function serializeOAuthCookie(
  name: string,
  value: string,
  options: {
    expires?: Date;
    httpOnly?: boolean;
    maxAge: number;
    path: string;
  }
): string {
  const attributes = [
    `${name}=${value}`,
    "SameSite=Lax",
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`
  ];

  if (options.httpOnly) {
    attributes.push("HttpOnly");
  }

  if (options.expires) {
    attributes.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}
