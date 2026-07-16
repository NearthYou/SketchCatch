import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { GitHubProjectConnectionTarget } from "@sketchcatch/types";

const githubAppStateAudience = "sketchcatch.github_app.install";
const githubAppStateIssuer = "sketchcatch.api";
const githubAppStateTtlMs = 10 * 60 * 1000;

type GitHubAppStateBasePayload = {
  userId: string;
  nonce: string;
  expiresAt: Date;
};

export type GitHubAppStatePayload =
  | (GitHubAppStateBasePayload & { scope: "account" })
  | (GitHubAppStateBasePayload & {
      scope: "project";
      projectId: string;
      targetRepository?: GitHubProjectConnectionTarget | undefined;
      resumeKey?: string | undefined;
    });

type CreateGitHubAppStateBaseInput = {
  userId: string;
  secret: string;
  now?: () => Date;
  generateNonce?: () => string;
};

export type CreateGitHubAppStateInput = CreateGitHubAppStateBaseInput &
  (
    | { scope: "account" }
    | {
        scope: "project";
        projectId: string;
        targetRepository?: GitHubProjectConnectionTarget | undefined;
        resumeKey?: string | undefined;
      }
  );

export type VerifyGitHubAppStateInput = {
  state: string;
  secret: string;
  now?: () => Date;
};

type GitHubAppStateJwtPayload = {
  readonly userId?: unknown;
  readonly scope?: unknown;
  readonly projectId?: unknown;
  readonly targetRepository?: unknown;
  readonly resumeKey?: unknown;
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
  const projectTarget = input.scope === "project"
    ? normalizeProjectTarget(input.targetRepository, input.resumeKey)
    : null;
  const state = await new SignJWT({
    userId: input.userId,
    scope: input.scope,
    ...(input.scope === "project" ? { projectId: input.projectId } : {}),
    ...(projectTarget ?? {}),
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
    (payload.scope !== "account" && payload.scope !== "project") ||
    typeof payload.nonce !== "string" ||
    typeof payload.expiresAt !== "string"
  ) {
    throw new Error("Invalid GitHub App state payload");
  }

  const expiresAt = new Date(payload.expiresAt);

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now().getTime()) {
    throw new Error("GitHub App state expired");
  }

  const basePayload = {
    userId: payload.userId,
    nonce: payload.nonce,
    expiresAt
  };

  if (payload.scope === "account") {
    if (
      payload.projectId !== undefined ||
      payload.targetRepository !== undefined ||
      payload.resumeKey !== undefined
    ) {
      throw new Error("Invalid GitHub App state payload");
    }

    return { ...basePayload, scope: "account" };
  }

  if (typeof payload.projectId !== "string" || payload.projectId.length === 0) {
    throw new Error("Invalid GitHub App state payload");
  }

  const projectTarget = readProjectTarget(payload.targetRepository, payload.resumeKey);

  return {
    ...basePayload,
    scope: "project",
    projectId: payload.projectId,
    ...(projectTarget ?? {})
  };
}

function normalizeProjectTarget(
  targetRepository: GitHubProjectConnectionTarget | undefined,
  resumeKey: string | undefined
): { targetRepository: GitHubProjectConnectionTarget; resumeKey: string } | null {
  if (targetRepository === undefined && resumeKey === undefined) return null;

  const owner = targetRepository?.owner.trim().toLowerCase() ?? "";
  const name = targetRepository?.name.trim().toLowerCase() ?? "";
  const normalizedResumeKey = resumeKey?.trim() ?? "";

  if (!owner || !name || normalizedResumeKey.length < 8 || normalizedResumeKey.length > 128) {
    throw new Error("Invalid GitHub App project target");
  }

  return {
    targetRepository: { owner, name },
    resumeKey: normalizedResumeKey
  };
}

function readProjectTarget(
  targetRepository: unknown,
  resumeKey: unknown
): { targetRepository: GitHubProjectConnectionTarget; resumeKey: string } | null {
  if (targetRepository === undefined && resumeKey === undefined) {
    return null;
  }

  if (
    typeof targetRepository !== "object" ||
    targetRepository === null ||
    !("owner" in targetRepository) ||
    !("name" in targetRepository) ||
    typeof targetRepository.owner !== "string" ||
    typeof targetRepository.name !== "string" ||
    typeof resumeKey !== "string"
  ) {
    throw new Error("Invalid GitHub App state payload");
  }

  return normalizeProjectTarget(
    { owner: targetRepository.owner, name: targetRepository.name },
    resumeKey
  );
}

function createStateSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}
