import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { serializeAuthCookie } from "../auth/session.js";
import type { GitHubAppInstallation } from "./github-app-client.js";

const authorizationAudience = "sketchcatch.github_app.user_authorization";
const authorizationIssuer = "sketchcatch.api";
const authorizationTtlMs = 10 * 60 * 1000;
const authorizationCookieName = "sketchcatch_github_app_authorization";
const authorizationCookiePath = "/api/source-repositories/github/user-authorization";
const authorizationCookieMaxAgeSeconds = 10 * 60;

export type GitHubAppUserAuthorizationCookie = {
  nonce: string;
  codeVerifier: string;
};

export type GitHubAppUserAuthorizationState = {
  userId: string;
  installationId: string;
  setupState: string;
  nonce: string;
  codeChallenge: string;
  expiresAt: Date;
};

export type GitHubAppUserAuthorizationConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

export class GitHubAppUserAuthorizationError extends Error {
  readonly name = "GitHubAppUserAuthorizationError";
}

export async function createGitHubAppUserAuthorization(input: {
  userId: string;
  installationId: string;
  setupState: string;
  stateSecret: string;
  config: Pick<GitHubAppUserAuthorizationConfig, "clientId" | "callbackUrl">;
  now?: () => Date;
  generateNonce?: () => string;
  generateCodeVerifier?: () => string;
}): Promise<{
  authorizationUrl: string;
  cookie: GitHubAppUserAuthorizationCookie;
  expiresAt: Date;
}> {
  const now = input.now ?? (() => new Date());
  const issuedAt = now();
  const expiresAt = new Date(issuedAt.getTime() + authorizationTtlMs);
  const nonce = input.generateNonce?.() ?? randomBytes(32).toString("base64url");
  const codeVerifier =
    input.generateCodeVerifier?.() ?? randomBytes(32).toString("base64url");
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = await new SignJWT({
    userId: input.userId,
    installationId: input.installationId,
    setupState: input.setupState,
    nonce,
    codeChallenge,
    expiresAt: expiresAt.toISOString()
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(authorizationIssuer)
    .setAudience(authorizationAudience)
    .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(createSecretKey(input.stateSecret));
  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", input.config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", input.config.callbackUrl);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("prompt", "select_account");

  return {
    authorizationUrl: authorizationUrl.toString(),
    cookie: { nonce, codeVerifier },
    expiresAt
  };
}

export async function verifyGitHubAppUserAuthorization(input: {
  state: string;
  stateSecret: string;
  cookie: GitHubAppUserAuthorizationCookie;
  now?: () => Date;
}): Promise<GitHubAppUserAuthorizationState> {
  const now = input.now ?? (() => new Date());
  let payload: Record<string, unknown>;

  try {
    ({ payload } = await jwtVerify(input.state, createSecretKey(input.stateSecret), {
      issuer: authorizationIssuer,
      audience: authorizationAudience,
      currentDate: now()
    }));
  } catch {
    throw new GitHubAppUserAuthorizationError("GIT_APP_USER_AUTHORIZATION_INVALID");
  }

  if (
    typeof payload.userId !== "string" ||
    typeof payload.installationId !== "string" ||
    typeof payload.setupState !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.codeChallenge !== "string" ||
    typeof payload.expiresAt !== "string" ||
    payload.nonce !== input.cookie.nonce ||
    payload.codeChallenge !== createCodeChallenge(input.cookie.codeVerifier)
  ) {
    throw new GitHubAppUserAuthorizationError("GIT_APP_USER_AUTHORIZATION_INVALID");
  }

  const expiresAt = new Date(payload.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now().getTime()) {
    throw new GitHubAppUserAuthorizationError("GIT_APP_USER_AUTHORIZATION_INVALID");
  }

  return {
    userId: payload.userId,
    installationId: payload.installationId,
    setupState: payload.setupState,
    nonce: payload.nonce,
    codeChallenge: payload.codeChallenge,
    expiresAt
  };
}

export async function findUserAuthorizedGitHubInstallation(input: {
  code: string;
  codeVerifier: string;
  installationId: string;
  config: GitHubAppUserAuthorizationConfig;
  fetcher?: typeof fetch;
}): Promise<GitHubAppInstallation | null> {
  const fetcher = input.fetcher ?? fetch;
  const accessToken = await exchangeCodeForUserAccessToken(input, fetcher);

  for (let page = 1; page <= 10; page += 1) {
    const response = await fetcher(
      `https://api.github.com/user/installations?per_page=100&page=${page}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${accessToken}`,
          "user-agent": "SketchCatch-GitHub-App/1.0",
          "x-github-api-version": "2022-11-28"
        }
      }
    );
    if (!response.ok) {
      throw new GitHubAppUserAuthorizationError("GIT_APP_USER_AUTHORIZATION_FAILED");
    }
    const body = (await response.json()) as { installations?: unknown };
    const installations = Array.isArray(body.installations) ? body.installations : [];

    for (const candidate of installations) {
      const installation = parseInstallation(candidate);
      if (installation?.installationId === input.installationId) {
        return installation;
      }
    }

    if (installations.length < 100) {
      break;
    }
  }

  return null;
}

export function setGitHubAppUserAuthorizationCookie(
  reply: FastifyReply,
  value: GitHubAppUserAuthorizationCookie,
  stateSecret: string
): void {
  appendSetCookieHeader(
    reply,
    serializeAuthCookie(
      authorizationCookieName,
      signCookieValue(value, stateSecret),
      {
        httpOnly: true,
        maxAge: authorizationCookieMaxAgeSeconds,
        path: authorizationCookiePath
      }
    )
  );
}

export function readGitHubAppUserAuthorizationCookie(
  request: FastifyRequest,
  stateSecret: string
): GitHubAppUserAuthorizationCookie | null {
  const rawValue = getCookie(request, authorizationCookieName);
  if (!rawValue) return null;

  const [payload, signature] = rawValue.split(".");
  if (!payload || !signature || !isValidSignature(payload, signature, stateSecret)) {
    return null;
  }

  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<GitHubAppUserAuthorizationCookie>;
    return typeof value.nonce === "string" && typeof value.codeVerifier === "string"
      ? { nonce: value.nonce, codeVerifier: value.codeVerifier }
      : null;
  } catch {
    return null;
  }
}

export function clearGitHubAppUserAuthorizationCookie(reply: FastifyReply): void {
  appendSetCookieHeader(
    reply,
    serializeAuthCookie(authorizationCookieName, "", {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: authorizationCookiePath
    })
  );
}

async function exchangeCodeForUserAccessToken(
  input: {
    code: string;
    codeVerifier: string;
    config: GitHubAppUserAuthorizationConfig;
  },
  fetcher: typeof fetch
): Promise<string> {
  const response = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "SketchCatch-GitHub-App/1.0"
    },
    body: new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.config.callbackUrl
    })
  });
  if (!response.ok) {
    throw new GitHubAppUserAuthorizationError("GIT_APP_USER_AUTHORIZATION_FAILED");
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== "string" || body.access_token.length === 0) {
    throw new GitHubAppUserAuthorizationError("GIT_APP_USER_AUTHORIZATION_FAILED");
  }
  return body.access_token;
}

function parseInstallation(value: unknown): GitHubAppInstallation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const account = candidate.account;
  if (!account || typeof account !== "object") return null;
  const accountRecord = account as Record<string, unknown>;
  if (
    (typeof candidate.id !== "number" && typeof candidate.id !== "string") ||
    (typeof accountRecord.id !== "number" && typeof accountRecord.id !== "string") ||
    typeof accountRecord.login !== "string"
  ) {
    return null;
  }
  const repositorySelection =
    candidate.repository_selection === "all" || candidate.repository_selection === "selected"
      ? candidate.repository_selection
      : null;
  return {
    installationId: String(candidate.id),
    accountId: String(accountRecord.id),
    accountLogin: accountRecord.login,
    accountType: typeof accountRecord.type === "string" ? accountRecord.type : null,
    repositorySelection,
    htmlUrl: typeof candidate.html_url === "string" ? candidate.html_url : null
  };
}

function createCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function createSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function signCookieValue(
  value: GitHubAppUserAuthorizationCookie,
  secret: string
): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function isValidSignature(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(
    createHmac("sha256", secret).update(payload).digest("base64url")
  );
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getCookie(request: FastifyRequest, cookieName: string): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  for (const cookie of cookies.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (rawName !== cookieName) continue;
    try {
      const rawValue = rawValueParts.join("=");
      return rawValue ? decodeURIComponent(rawValue) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function appendSetCookieHeader(reply: FastifyReply, cookie: string): void {
  const existing = reply.getHeader("set-cookie");
  reply.header(
    "set-cookie",
    existing
      ? [...(Array.isArray(existing) ? existing.map(String) : [String(existing)]), cookie]
      : cookie
  );
}
