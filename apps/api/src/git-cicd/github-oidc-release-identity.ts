import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const githubOidcIssuer = "https://token.actions.githubusercontent.com";
export const githubReleaseOidcAudience = "sketchcatch-release-run";
export const githubInfrastructureOidcAudience = "sketchcatch-infrastructure-run";
export type GitHubOidcAudience =
  | typeof githubReleaseOidcAudience
  | typeof githubInfrastructureOidcAudience;
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
  audience?: GitHubOidcAudience;
  verifyToken?: (token: string, audience: GitHubOidcAudience) => Promise<JWTPayload>;
} = {}): VerifyGitHubReleaseIdentity {
  const audience = options.audience ?? githubReleaseOidcAudience;
  const verifyToken = options.verifyToken ?? (async (token: string) => {
    const result = await jwtVerify(token, githubJwks, {
      issuer: githubOidcIssuer,
      audience
    });
    return result.payload;
  });

  return async (token) => {
    try {
      const payload = await verifyToken(token, audience);
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

export function isExactGitHubWorkflowRef(input: {
  workflowRef: string;
  repository: string;
  workflowPath: ".github/workflows/sketchcatch-app.yml" | ".github/workflows/sketchcatch-infra.yml";
  ref: string;
}): boolean {
  const suffix = `/${input.workflowPath}@${input.ref}`;
  if (!input.workflowRef.endsWith(suffix)) return false;
  const repository = input.workflowRef.slice(0, -suffix.length);
  return repository.toLowerCase() === input.repository.toLowerCase();
}

export function isExpectedGitHubEnvironmentSubject(input: {
  subject: string;
  repository: string;
  repositoryId: string;
  environment: string;
}): boolean {
  const encodedEnvironment = input.environment.replaceAll(":", "%3A");
  const contextSuffix = `:environment:${encodedEnvironment}`;
  if (input.subject === `repo:${input.repository}${contextSuffix}`) return true;

  const separatorIndex = input.repository.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === input.repository.length - 1) return false;
  const owner = input.repository.slice(0, separatorIndex);
  const repositoryName = input.repository.slice(separatorIndex + 1);
  const immutablePrefix = `repo:${owner}@`;
  const immutableSuffix = `/${repositoryName}@${input.repositoryId}${contextSuffix}`;
  if (
    !input.subject.startsWith(immutablePrefix) ||
    !input.subject.endsWith(immutableSuffix)
  ) return false;

  const ownerId = input.subject.slice(
    immutablePrefix.length,
    input.subject.length - immutableSuffix.length
  );
  return /^[1-9]\d*$/u.test(ownerId);
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
