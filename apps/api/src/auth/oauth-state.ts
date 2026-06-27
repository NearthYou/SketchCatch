import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { OAuthProvider } from "@sketchcatch/types";

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
    serializeOAuthCookie(OAUTH_STATE_COOKIE_NAME, encodeURIComponent(JSON.stringify(value)), {
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
    const parsedValue = JSON.parse(rawValue) as Partial<OAuthStateCookie>;

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
