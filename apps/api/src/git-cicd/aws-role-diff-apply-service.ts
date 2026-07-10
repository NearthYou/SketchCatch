import {
  GetRoleCommand,
  IAMClient,
  UpdateAssumeRolePolicyCommand
} from "@aws-sdk/client-iam";
import type {
  GitCicdAwsRoleDiff,
  GitCicdAwsRoleDiffApplyResponse
} from "@sketchcatch/types";
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

export class AwsRoleDiffApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsRoleDiffApplyError";
  }
}

export function createIamAwsRoleDiffGateway(): AwsRoleDiffGateway {
  const client = new IAMClient({});

  return {
    async getAssumeRolePolicy(roleArn) {
      const roleName = parseRoleName(roleArn);
      const response = await client.send(new GetRoleCommand({ RoleName: roleName }));
      const document = response.Role?.AssumeRolePolicyDocument;

      if (!document) {
        throw new AwsRoleDiffApplyError("IAM role assume role policy document was not found");
      }

      return parsePolicyDocument(document);
    },
    async updateAssumeRolePolicy(roleArn, policy) {
      const roleName = parseRoleName(roleArn);

      await client.send(
        new UpdateAssumeRolePolicyCommand({
          RoleName: roleName,
          PolicyDocument: JSON.stringify(policy)
        })
      );
    }
  };
}

export async function applyGitCicdAwsRoleDiff(
  input: {
    handoffId: string;
    accessContext: ProjectAccessContext;
    now?: () => Date;
  },
  repository: GitCicdHandoffRepository,
  gateway: AwsRoleDiffGateway = createIamAwsRoleDiffGateway()
): Promise<GitCicdAwsRoleDiffApplyResponse> {
  const handoff = await getGitCicdHandoff(input, repository);
  const diff = handoff.awsRoleDiff;

  if (!diff) {
    throw new GitCicdHandoffNotFoundError("Git/CI/CD AWS role diff not found");
  }

  if (!diff.roleArn) {
    throw new AwsRoleDiffApplyError("AWS role ARN is required before role diff can be applied");
  }

  if (!diff.approved) {
    throw new AwsRoleDiffApplyError("AWS role diff must be user-approved before apply");
  }

  const currentPolicy = await gateway.getAssumeRolePolicy(diff.roleArn);
  const nextPolicy = mergeGitHubOidcTrustStatement(currentPolicy, diff);

  await gateway.updateAssumeRolePolicy(diff.roleArn, nextPolicy);

  const verifiedPolicy = await gateway.getAssumeRolePolicy(diff.roleArn);
  const verified = policyHasGitHubOidcStatement(verifiedPolicy, diff);
  const appliedAt = (input.now ?? (() => new Date()))().toISOString();

  if (!verified) {
    throw new AwsRoleDiffApplyError("AWS role trust policy update could not be verified");
  }

  await repository.updateHandoffAutomationMetadata?.(handoff.id, {
    awsRoleDiff: {
      ...diff,
      applied: true,
      appliedAt,
      verified: true
    }
  });

  return {
    applied: true,
    roleArn: diff.roleArn,
    repository: diff.repository,
    environmentName: diff.environmentName,
    appliedAt,
    verified
  };
}

function mergeGitHubOidcTrustStatement(
  policy: Record<string, unknown>,
  diff: GitCicdAwsRoleDiff
): Record<string, unknown> {
  const statements = normalizeStatements(policy.Statement);
  const nextStatement = createGitHubOidcTrustStatement(diff);
  const retainedStatements = statements.filter(
    (statement) => !isSketchCatchGitHubOidcStatement(statement)
  );

  return {
    ...policy,
    Version: typeof policy.Version === "string" ? policy.Version : "2012-10-17",
    Statement: [...retainedStatements, nextStatement]
  };
}

function createGitHubOidcTrustStatement(diff: GitCicdAwsRoleDiff): Record<string, unknown> {
  return {
    Sid: "SketchCatchGitHubActionsOidc",
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
  return normalizeStatements(policy.Statement).some((statement) => {
    const condition = readRecord(statement.Condition);
    const stringEquals = readRecord(condition.StringEquals);

    return (
      isSketchCatchGitHubOidcStatement(statement) &&
      stringEquals["token.actions.githubusercontent.com:aud"] ===
        diff.requiredTrustConditions["token.actions.githubusercontent.com:aud"] &&
      stringEquals["token.actions.githubusercontent.com:sub"] ===
        diff.requiredTrustConditions["token.actions.githubusercontent.com:sub"]
    );
  });
}

function isSketchCatchGitHubOidcStatement(statement: Record<string, unknown>): boolean {
  return statement.Sid === "SketchCatchGitHubActionsOidc";
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
