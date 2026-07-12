import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { OAuthProvider } from "@sketchcatch/types";
import { requireAuthTokenSecret } from "../config/env.js";
import { serializeAuthCookie } from "./session.js";

const OAUTH_STATE_COOKIE_NAME = "sketchcatch_oauth_state";
const OAUTH_STATE_COOKIE_PATH = "/api/auth/oauth";
const OAUTH_STATE_COOKIE_MAX_AGE_SECONDS = 5 * 60;

export type OAuthStateCookie = {
  provider: OAuthProvider;
  state: string;
  persistent: boolean;
  returnTo?: string | undefined;
};

type OAuthStateCookieInput = {
  provider: OAuthProvider;
  state: string;
  persistent?: boolean;
  returnTo?: string | undefined;
};

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

// OAuth callback 뒤 복귀 정보까지 서명해 browser가 값을 바꿀 수 없게 저장합니다.
export function setOAuthStateCookie(reply: FastifyReply, value: OAuthStateCookieInput): void {
  appendSetCookieHeader(
    reply,
    serializeAuthCookie(
      OAUTH_STATE_COOKIE_NAME,
      signOAuthStateCookieValue({
        provider: value.provider,
        ...(value.returnTo ? { returnTo: value.returnTo } : {}),
        state: value.state,
        persistent: value.persistent === true
      }),
      {
        httpOnly: true,
        maxAge: OAUTH_STATE_COOKIE_MAX_AGE_SECONDS,
        path: OAUTH_STATE_COOKIE_PATH
      }
    )
  );
}

// 서명과 필드 모양이 모두 올바른 OAuth 임시 상태만 callback에 전달합니다.
export function readOAuthStateCookie(request: FastifyRequest): OAuthStateCookie | null {
  const rawValue = getCookie(request, OAUTH_STATE_COOKIE_NAME);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = verifyOAuthStateCookieValue(rawValue);

    if (
      !isOAuthProvider(parsedValue.provider) ||
      typeof parsedValue.state !== "string" ||
      (parsedValue.persistent !== undefined && typeof parsedValue.persistent !== "boolean") ||
      (parsedValue.returnTo !== undefined && typeof parsedValue.returnTo !== "string")
    ) {
      return null;
    }

    return {
      provider: parsedValue.provider,
      ...(parsedValue.returnTo ? { returnTo: parsedValue.returnTo } : {}),
      state: parsedValue.state,
      persistent: parsedValue.persistent ?? false
    };
  } catch {
    return null;
  }
}

export function clearOAuthStateCookie(reply: FastifyReply): void {
  appendSetCookieHeader(
    reply,
    serializeAuthCookie(OAUTH_STATE_COOKIE_NAME, "", {
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
  return value === "naver" || value === "kakao" || value === "github";
}
