import { createHash, randomUUID } from "node:crypto";
import {
  GetRoleCommand,
  IAMClient,
  UpdateAssumeRolePolicyCommand
} from "@aws-sdk/client-iam";
import { and, eq } from "drizzle-orm";
import type {
  AwsConnection,
  GitCicdAwsRoleDiff,
  GitCicdAwsRoleDiffApplyResponse
} from "@sketchcatch/types";
import {
  prepareTerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway,
  type AwsTemporaryCredentials
} from "../aws-connections/aws-connection-test-service.js";
import type { Database } from "../db/client.js";
import { awsConnections, projectDeploymentTargets } from "../db/schema.js";
import type {
  GitCicdHandoffRepository,
  ProjectAccessContext
} from "./git-cicd-handoff-service.js";
import {
  getGitCicdHandoff,
  GitCicdHandoffNotFoundError
} from "./git-cicd-handoff-service.js";

export type AwsRoleDiffGateway = {
  getAssumeRolePolicy(roleArn: string): Promise<Record<string, unknown>>;
  updateAssumeRolePolicy(roleArn: string, policy: Record<string, unknown>): Promise<void>;
};

export type AwsRoleDiffConnectionRepository = {
  findVerifiedProjectAwsConnection(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnection | undefined>;
};

export type IamAwsRoleDiffGatewayOptions = {
  region?: string;
  credentials?: AwsTemporaryCredentials;
};

export type ConnectedIamAwsRoleDiffGatewayOptions = {
  projectId: string;
  accessContext: ProjectAccessContext;
  roleArn: string;
  connectionRepository: AwsRoleDiffConnectionRepository;
  stsGateway?: AwsConnectionStsGateway;
  createGateway?: (options: Required<IamAwsRoleDiffGatewayOptions>) => AwsRoleDiffGateway;
};

export class AwsRoleDiffApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsRoleDiffApplyError";
  }
}

export function createIamAwsRoleDiffGateway(
  options: IamAwsRoleDiffGatewayOptions = {}
): AwsRoleDiffGateway {
  const client = new IAMClient({
    ...(options.region ? { region: options.region } : {}),
    ...(options.credentials ? { credentials: options.credentials } : {})
  });

  return {
    async getAssumeRolePolicy(roleArn) {
      try {
        const roleName = parseRoleName(roleArn);
        const response = await client.send(new GetRoleCommand({ RoleName: roleName }));
        const document = response.Role?.AssumeRolePolicyDocument;

        if (!document) {
          throw new AwsRoleDiffApplyError("IAM role assume role policy document was not found");
        }

        return parsePolicyDocument(document);
      } catch (error) {
        throw toAwsRoleDiffApplyError(error, "read");
      }
    },
    async updateAssumeRolePolicy(roleArn, policy) {
      try {
        const roleName = parseRoleName(roleArn);

        await client.send(
          new UpdateAssumeRolePolicyCommand({
            RoleName: roleName,
            PolicyDocument: JSON.stringify(policy)
          })
        );
      } catch (error) {
        throw toAwsRoleDiffApplyError(error, "update");
      }
    }
  };
}

export function createPostgresAwsRoleDiffConnectionRepository(
  db: Database
): AwsRoleDiffConnectionRepository {
  return {
    async findVerifiedProjectAwsConnection(projectId, accessContext) {
      const [connection] = await db
        .select({
          id: awsConnections.id,
          userId: awsConnections.userId,
          accountId: awsConnections.accountId,
          roleArn: awsConnections.roleArn,
          externalId: awsConnections.externalId,
          region: awsConnections.region,
          status: awsConnections.status,
          lastVerifiedAt: awsConnections.lastVerifiedAt,
          createdAt: awsConnections.createdAt,
          updatedAt: awsConnections.updatedAt
        })
        .from(projectDeploymentTargets)
        .innerJoin(awsConnections, eq(awsConnections.id, projectDeploymentTargets.connectionId))
        .where(
          and(
            eq(projectDeploymentTargets.projectId, projectId),
            eq(awsConnections.userId, accessContext.userId),
            eq(awsConnections.status, "verified")
          )
        );

      return connection
        ? {
            ...connection,
            lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
            createdAt: connection.createdAt.toISOString(),
            updatedAt: connection.updatedAt.toISOString()
          }
        : undefined;
    }
  };
}

export async function createConnectedIamAwsRoleDiffGateway(
  options: ConnectedIamAwsRoleDiffGatewayOptions
): Promise<AwsRoleDiffGateway> {
  const connection = await options.connectionRepository.findVerifiedProjectAwsConnection(
    options.projectId,
    options.accessContext
  );

  if (!connection?.roleArn || connection.roleArn !== options.roleArn) {
    throw new AwsRoleDiffApplyError(
      "The CI/CD role no longer matches the verified project AWS connection"
    );
  }

  let preparedCredentials;
  try {
    preparedCredentials = await prepareTerraformAwsCredentialEnv(
      connection,
      options.stsGateway ?? createAwsSdkStsGateway(),
      {
        createRoleSessionName: () => `sketchcatch-role-diff-${randomUUID()}`
      }
    );
  } catch (error) {
    throw new AwsRoleDiffApplyError(
      error instanceof Error ? error.message : "Verified AWS connection could not be assumed"
    );
  }

  const credentials = {
    accessKeyId: preparedCredentials.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: preparedCredentials.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: preparedCredentials.env.AWS_SESSION_TOKEN ?? ""
  };
  const createGateway = options.createGateway ?? createIamAwsRoleDiffGateway;

  return createGateway({
    region: connection.region,
    credentials
  });
}

export async function applyGitCicdAwsRoleDiffUsingProjectConnection(
  input: {
    handoffId: string;
    accessContext: ProjectAccessContext;
    now?: () => Date;
  },
  repository: GitCicdHandoffRepository,
  connectionRepository: AwsRoleDiffConnectionRepository
): Promise<GitCicdAwsRoleDiffApplyResponse> {
  const handoff = await getGitCicdHandoff(input, repository);
  const diff = requireAwsRoleDiff(handoff.awsRoleDiff);
  const gateway = await createConnectedIamAwsRoleDiffGateway({
    projectId: handoff.projectId,
    accessContext: input.accessContext,
    roleArn: diff.roleArn,
    connectionRepository
  });

  return applyResolvedGitCicdAwsRoleDiff(input, handoff.id, diff, repository, gateway);
}

export async function applyGitCicdAwsRoleDiff(
  input: {
    handoffId: string;
    accessContext: ProjectAccessContext;
    now?: () => Date;
  },
  repository: GitCicdHandoffRepository,
  gateway: AwsRoleDiffGateway
): Promise<GitCicdAwsRoleDiffApplyResponse> {
  const handoff = await getGitCicdHandoff(input, repository);
  const diff = requireAwsRoleDiff(handoff.awsRoleDiff);

  return applyResolvedGitCicdAwsRoleDiff(input, handoff.id, diff, repository, gateway);
}

async function applyResolvedGitCicdAwsRoleDiff(
  input: {
    accessContext: ProjectAccessContext;
    now?: () => Date;
  },
  handoffId: string,
  diff: GitCicdAwsRoleDiff & { roleArn: string },
  repository: GitCicdHandoffRepository,
  gateway: AwsRoleDiffGateway
): Promise<GitCicdAwsRoleDiffApplyResponse> {
  const persistAutomationMetadata = repository.updateHandoffAutomationMetadata;

  if (!persistAutomationMetadata) {
    throw new AwsRoleDiffApplyError(
      "AWS role trust policy verification evidence cannot be persisted"
    );
  }

  const now = input.now ?? (() => new Date());
  const approvedDiff: GitCicdAwsRoleDiff = diff.approved
    ? diff
    : {
        ...diff,
        approved: true,
        approvedByUserId: input.accessContext.userId,
        approvedAt: now().toISOString()
      };

  const currentPolicy = await gateway.getAssumeRolePolicy(diff.roleArn);
  let verifiedPolicy = currentPolicy;

  if (!policyHasGitHubOidcStatement(currentPolicy, approvedDiff)) {
    const nextPolicy = mergeGitHubOidcTrustStatement(currentPolicy, approvedDiff);
    await gateway.updateAssumeRolePolicy(diff.roleArn, nextPolicy);
    verifiedPolicy = await gateway.getAssumeRolePolicy(diff.roleArn);
  }

  const verified = policyHasGitHubOidcStatement(verifiedPolicy, approvedDiff);
  const appliedAt = now().toISOString();

  if (!verified) {
    throw new AwsRoleDiffApplyError("AWS role trust policy update could not be verified");
  }

  const persistedHandoff = await persistAutomationMetadata.call(repository, handoffId, {
    awsRoleDiff: {
      ...approvedDiff,
      applied: true,
      appliedAt,
      verified: true
    }
  });

  if (persistedHandoff?.awsRoleDiff?.verified !== true) {
    throw new AwsRoleDiffApplyError(
      "AWS role trust policy verification evidence was not persisted"
    );
  }

  return {
    applied: true,
    roleArn: diff.roleArn,
    repository: diff.repository,
    environmentName: diff.environmentName,
    appliedAt,
    verified
  };
}

function requireAwsRoleDiff(
  diff: GitCicdAwsRoleDiff | null
): GitCicdAwsRoleDiff & { roleArn: string } {
  if (!diff) {
    throw new GitCicdHandoffNotFoundError("CI/CD AWS role diff not found");
  }

  if (!diff.roleArn) {
    throw new AwsRoleDiffApplyError("AWS role ARN is required before role diff can be applied");
  }

  return diff as GitCicdAwsRoleDiff & { roleArn: string };
}

function toAwsRoleDiffApplyError(error: unknown, operation: "read" | "update"): Error {
  if (error instanceof AwsRoleDiffApplyError) {
    return error;
  }

  const errorName = isRecord(error) && typeof error.name === "string" ? error.name : "";
  if (errorName === "AccessDenied" || errorName === "AccessDeniedException") {
    return new AwsRoleDiffApplyError(
      operation === "read"
        ? "The connected AWS role does not allow iam:GetRole"
        : "The connected AWS role does not allow iam:UpdateAssumeRolePolicy"
    );
  }

  if (errorName === "NoSuchEntity") {
    return new AwsRoleDiffApplyError("The connected AWS role could not be found");
  }

  return new AwsRoleDiffApplyError("AWS role trust policy request failed");
}

function mergeGitHubOidcTrustStatement(
  policy: Record<string, unknown>,
  diff: GitCicdAwsRoleDiff
): Record<string, unknown> {
  const statements = normalizeStatements(policy.Statement);
  const nextStatement = createGitHubOidcTrustStatement(diff);
  const retainedStatements = statements.filter(
    (statement) =>
      statement.Sid !== createScopedGitHubOidcStatementId(diff) &&
      !isMatchingLegacyGitHubOidcStatement(statement, diff)
  );

  return {
    ...policy,
    Version: typeof policy.Version === "string" ? policy.Version : "2012-10-17",
    Statement: [...retainedStatements, nextStatement]
  };
}

function createGitHubOidcTrustStatement(diff: GitCicdAwsRoleDiff): Record<string, unknown> {
  return {
    Sid: createScopedGitHubOidcStatementId(diff),
    Effect: "Allow",
    Principal: {
      Federated: `arn:aws:iam::${parseAwsAccountId(diff.roleArn ?? "")}:oidc-provider/token.actions.githubusercontent.com`
    },
    Action: "sts:AssumeRoleWithWebIdentity",
    Condition: {
      StringEquals: {
        "token.actions.githubusercontent.com:aud":
          diff.requiredTrustConditions["token.actions.githubusercontent.com:aud"],
        "token.actions.githubusercontent.com:sub":
          diff.requiredTrustConditions["token.actions.githubusercontent.com:sub"]
      }
    }
  };
}

function policyHasGitHubOidcStatement(
  policy: Record<string, unknown>,
  diff: GitCicdAwsRoleDiff
): boolean {
  const scopedStatementId = createScopedGitHubOidcStatementId(diff);
  const statements = normalizeStatements(policy.Statement);
  const scopedStatements = statements.filter(
    (statement) => statement.Sid === scopedStatementId
  );

  return (
    scopedStatements.length === 1 &&
    githubOidcStatementMatches(scopedStatements[0] ?? {}, diff) &&
    !statements.some((statement) => isMatchingLegacyGitHubOidcStatement(statement, diff))
  );
}

function createScopedGitHubOidcStatementId(diff: GitCicdAwsRoleDiff): string {
  const scope = `${diff.repository}\n${diff.environmentName}`;
  const digest = createHash("sha256").update(scope).digest("hex").slice(0, 24);

  return `SketchCatchGitHubActionsOidc${digest}`;
}

function isMatchingLegacyGitHubOidcStatement(
  statement: Record<string, unknown>,
  diff: GitCicdAwsRoleDiff
): boolean {
  return (
    statement.Sid === "SketchCatchGitHubActionsOidc" &&
    githubOidcStatementMatches(statement, diff)
  );
}

function githubOidcStatementMatches(
  statement: Record<string, unknown>,
  diff: GitCicdAwsRoleDiff
): boolean {
  const principal = readRecord(statement.Principal);
  const condition = readRecord(statement.Condition);
  const stringEquals = readRecord(condition.StringEquals);

  return (
    hasExactKeys(statement, ["Sid", "Effect", "Principal", "Action", "Condition"]) &&
    statement.Effect === "Allow" &&
    statement.Action === "sts:AssumeRoleWithWebIdentity" &&
    hasExactKeys(principal, ["Federated"]) &&
    principal.Federated ===
      `arn:aws:iam::${parseAwsAccountId(diff.roleArn ?? "")}:oidc-provider/token.actions.githubusercontent.com` &&
    hasExactKeys(condition, ["StringEquals"]) &&
    hasExactKeys(stringEquals, [
      "token.actions.githubusercontent.com:aud",
      "token.actions.githubusercontent.com:sub"
    ]) &&
    stringEquals["token.actions.githubusercontent.com:aud"] ===
      diff.requiredTrustConditions["token.actions.githubusercontent.com:aud"] &&
    stringEquals["token.actions.githubusercontent.com:sub"] ===
      diff.requiredTrustConditions["token.actions.githubusercontent.com:sub"]
  );
}

function hasExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  return (
    JSON.stringify(Object.keys(record).sort()) ===
    JSON.stringify([...expectedKeys].sort())
  );
}

function normalizeStatements(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => isRecord(item));
  }

  return isRecord(value) ? [value] : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePolicyDocument(document: string): Record<string, unknown> {
  const decoded = safeDecodeURIComponent(document);
  const parsed = JSON.parse(decoded) as unknown;

  if (!isRecord(parsed)) {
    throw new AwsRoleDiffApplyError("IAM role assume role policy document is invalid");
  }

  return parsed;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseRoleName(roleArn: string): string {
  const match = /^arn:aws:iam::\d{12}:role\/(.+)$/.exec(roleArn);

  if (!match?.[1]) {
    throw new AwsRoleDiffApplyError("AWS role ARN must reference an IAM role");
  }

  return match[1].split("/").at(-1) ?? match[1];
}

function parseAwsAccountId(roleArn: string): string {
  const match = /^arn:aws:iam::(\d{12}):role\/.+$/.exec(roleArn);

  if (!match?.[1]) {
    throw new AwsRoleDiffApplyError("AWS role ARN must include an account id");
  }

  return match[1];
}
