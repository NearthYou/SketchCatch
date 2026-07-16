import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const githubOidcIssuer = "https://token.actions.githubusercontent.com";
export const githubReleaseOidcAudience = "sketchcatch-release-run";
const githubJwks = createRemoteJWKSet(
  new URL(`${githubOidcIssuer}/.well-known/jwks`)
);

export type GitHubReleaseIdentity = {
  subject: string;
  repository: string;
  repositoryId: string;
  commitSha: string;
  ref: string;
  workflowRef: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  environment: string;
};

export type VerifyGitHubReleaseIdentity = (
  token: string
) => Promise<GitHubReleaseIdentity>;

export class GitHubReleaseIdentityError extends Error {
  readonly statusCode = 401;
  readonly errorCode = "GITHUB_OIDC_INVALID";

  constructor(message = "GitHub Actions identity could not be verified") {
    super(message);
    this.name = "GitHubReleaseIdentityError";
  }
}

export function createGitHubReleaseIdentityVerifier(options: {
  verifyToken?: (token: string) => Promise<JWTPayload>;
} = {}): VerifyGitHubReleaseIdentity {
  const verifyToken = options.verifyToken ?? (async (token: string) => {
    const result = await jwtVerify(token, githubJwks, {
      issuer: githubOidcIssuer,
      audience: githubReleaseOidcAudience
    });
    return result.payload;
  });

  return async (token) => {
    try {
      const payload = await verifyToken(token);
      const workflowRunAttempt = Number(requireClaim(payload, "run_attempt"));
      if (!Number.isSafeInteger(workflowRunAttempt) || workflowRunAttempt <= 0) {
        throw new GitHubReleaseIdentityError();
      }
      return {
        subject: requireClaim(payload, "sub"),
        repository: requireClaim(payload, "repository"),
        repositoryId: requireClaim(payload, "repository_id"),
        commitSha: requireClaim(payload, "sha").toLowerCase(),
        ref: requireClaim(payload, "ref"),
        workflowRef:
          optionalClaim(payload, "job_workflow_ref") ?? requireClaim(payload, "workflow_ref"),
        workflowRunId: requireClaim(payload, "run_id"),
        workflowRunAttempt,
        environment: requireClaim(payload, "environment")
      };
    } catch (error) {
      if (error instanceof GitHubReleaseIdentityError) throw error;
      throw new GitHubReleaseIdentityError();
    }
  };
}

function optionalClaim(payload: JWTPayload, name: string): string | null {
  const value = payload[name];
  return typeof value === "string" && value.trim() ? value : null;
}

function requireClaim(payload: JWTPayload, name: string): string {
  const value = payload[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new GitHubReleaseIdentityError();
  }
  return value;
}
