import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

const githubAppStateAudience = "sketchcatch.github_app.install";
const githubAppStateIssuer = "sketchcatch.api";
const githubAppStateTtlMs = 10 * 60 * 1000;

export type GitHubAppStatePayload = {
  userId: string;
  projectId: string;
  nonce: string;
  expiresAt: Date;
};

export type CreateGitHubAppStateInput = {
  userId: string;
  projectId: string;
  secret: string;
  now?: () => Date;
  generateNonce?: () => string;
};

export type VerifyGitHubAppStateInput = {
  state: string;
  secret: string;
  now?: () => Date;
};

type GitHubAppStateJwtPayload = {
  readonly userId?: unknown;
  readonly projectId?: unknown;
  readonly nonce?: unknown;
  readonly expiresAt?: unknown;
};

export async function createGitHubAppState(
  input: CreateGitHubAppStateInput
): Promise<{ state: string; expiresAt: Date }> {
  const now = input.now ?? (() => new Date());
  const generateNonce = input.generateNonce ?? randomUUID;
  const issuedAt = now();
  const expiresAt = new Date(issuedAt.getTime() + githubAppStateTtlMs);
  const secretKey = createStateSecretKey(input.secret);
  const state = await new SignJWT({
    userId: input.userId,
    projectId: input.projectId,
    nonce: generateNonce(),
    expiresAt: expiresAt.toISOString()
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(githubAppStateIssuer)
    .setAudience(githubAppStateAudience)
    .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey);

  return { state, expiresAt };
}

export async function verifyGitHubAppState(
  input: VerifyGitHubAppStateInput
): Promise<GitHubAppStatePayload> {
  const now = input.now ?? (() => new Date());
  const { payload } = await jwtVerify<GitHubAppStateJwtPayload>(
    input.state,
    createStateSecretKey(input.secret),
    {
      issuer: githubAppStateIssuer,
      audience: githubAppStateAudience,
      currentDate: now()
    }
  );

  if (
    typeof payload.userId !== "string" ||
    typeof payload.projectId !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.expiresAt !== "string"
  ) {
    throw new Error("Invalid GitHub App state payload");
  }

  const expiresAt = new Date(payload.expiresAt);

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now().getTime()) {
    throw new Error("GitHub App state expired");
  }

  return {
    userId: payload.userId,
    projectId: payload.projectId,
    nonce: payload.nonce,
    expiresAt
  };
}

function createStateSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}
