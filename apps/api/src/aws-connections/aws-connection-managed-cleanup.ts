import {
  BatchGetProjectsCommand,
  DeleteProjectCommand,
  CodeBuildClient,
  type CodeBuildClientConfig
} from "@aws-sdk/client-codebuild";
import {
  DeleteConnectionCommand,
  CodeConnectionsClient,
  ListTagsForResourceCommand,
  type CodeConnectionsClientConfig
} from "@aws-sdk/client-codeconnections";
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  type CloudWatchLogsClientConfig
} from "@aws-sdk/client-cloudwatch-logs";
import {
  DeleteRepositoryCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  ListTagsForResourceCommand as ListEcrTagsForResourceCommand,
  type ECRClientConfig
} from "@aws-sdk/client-ecr";
import {
  DeleteRoleCommand,
  DeleteRolePermissionsBoundaryCommand,
  DeleteRolePolicyCommand,
  IAMClient,
  ListRoleTagsCommand,
  type IAMClientConfig
} from "@aws-sdk/client-iam";
import { setTimeout as sleep } from "node:timers/promises";
import type { CleanupAwsConnectionManagedResources } from "./aws-connection-service.js";
import { createAwsSdkStsGateway } from "./aws-connection-test-service.js";
import { createProjectBuildCacheIdentity } from "../build-environments/project-build-cache.js";

const buildServicePolicyName = "SketchCatchRepositoryBuildOnly";
const awsCleanupMaxAttempts = 6;
const iamConsistencyRetryDelaysMs = [250, 500, 1_000, 2_000, 4_000, 8_000, 16_000] as const;
const retryableAwsCleanupConsistencyErrorNames = new Set([
  "ConcurrentModification",
  "ConcurrentModificationException",
  "DeleteConflict",
  "DeleteConflictException"
]);

type CleanupClient = {
  send(command: unknown): Promise<unknown>;
  destroy(): void;
};

export function createAwsConnectionManagedCleanup(options: {
  assumeRole?: ReturnType<typeof createAwsSdkStsGateway>["assumeRole"];
  createCodeBuildClient?: (configuration: CodeBuildClientConfig) => CleanupClient;
  createCodeConnectionsClient?: (configuration: CodeConnectionsClientConfig) => CleanupClient;
  createEcrClient?: (configuration: ECRClientConfig) => CleanupClient;
  createCloudWatchLogsClient?: (configuration: CloudWatchLogsClientConfig) => CleanupClient;
  createIamClient?: (configuration: IAMClientConfig) => CleanupClient;
} = {}): CleanupAwsConnectionManagedResources {
  const assumeRole = options.assumeRole ?? createAwsSdkStsGateway().assumeRole;
  const createCodeBuildClient = options.createCodeBuildClient ?? ((configuration) =>
    new CodeBuildClient(configuration) as unknown as CleanupClient);
  const createCodeConnectionsClient = options.createCodeConnectionsClient ?? ((configuration) =>
    new CodeConnectionsClient(configuration) as unknown as CleanupClient);
  const createEcrClient = options.createEcrClient ?? ((configuration) =>
    new ECRClient(configuration) as unknown as CleanupClient);
  const createCloudWatchLogsClient = options.createCloudWatchLogsClient ?? ((configuration) =>
    new CloudWatchLogsClient(configuration) as unknown as CleanupClient);
  const createIamClient = options.createIamClient ?? ((configuration) =>
    new IAMClient(configuration) as unknown as CleanupClient);

  return async ({ connection, resources }) => {
    if (resources.codeBuildProjects.length === 0 && !resources.codeConnectionArn) return;
    const roleArn = connection.roleArn;
    if (!roleArn) {
      throw new Error("AWS 연결 Role ARN이 없어 관리 리소스를 안전하게 삭제할 수 없습니다.");
    }
    const accountId = connection.accountId;
    if (!accountId) {
      throw new Error("AWS 계정 ID가 없어 관리 리소스를 안전하게 삭제할 수 없습니다.");
    }
    const credentials = await assumeRole({
      roleArn,
      externalId: connection.externalId,
      region: connection.region,
      roleSessionName: `sketchcatch-cleanup-${connection.id.slice(0, 32)}`
    });
    const configuration = {
      region: connection.region,
      credentials,
      maxAttempts: awsCleanupMaxAttempts
    };
    const codeBuild = withAwsCleanupConsistencyRetries(createCodeBuildClient(configuration));
    const codeConnections = withAwsCleanupConsistencyRetries(
      createCodeConnectionsClient(configuration)
    );
    const ecr = withAwsCleanupConsistencyRetries(createEcrClient(configuration));
    const logs = withAwsCleanupConsistencyRetries(createCloudWatchLogsClient(configuration));
    const iam = withAwsCleanupConsistencyRetries(createIamClient(configuration));
    try {
      for (const build of resources.codeBuildProjects) {
        const roleName = parseRoleName(build.serviceRoleArn);
        const projectExists = await verifyCodeBuildOwnership(codeBuild, build);
        const roleExists = await verifyRoleOwnership(iam, roleName, build.projectId);
        if (projectExists) {
          await ignoreMissing(() =>
            logs.send(
              new DeleteLogGroupCommand({ logGroupName: `/aws/codebuild/${build.projectName}` })
            )
          );
          await ignoreMissing(() =>
            codeBuild.send(new DeleteProjectCommand({ name: build.projectName }))
          );
        }
        if (roleExists) {
          await ignoreMissing(() =>
            iam.send(
              new DeleteRolePolicyCommand({
                RoleName: roleName,
                PolicyName: buildServicePolicyName
              })
            )
          );
          await ignoreMissing(() =>
            iam.send(new DeleteRolePermissionsBoundaryCommand({ RoleName: roleName }))
          );
          await ignoreMissing(() => iam.send(new DeleteRoleCommand({ RoleName: roleName })));
        }
        await deleteOwnedBuildCache(ecr, {
          projectId: build.projectId,
          accountId,
          region: connection.region
        });
      }
      if (resources.codeConnectionArn) {
        const connectionArn = resources.codeConnectionArn;
        if (await verifyCodeConnectionOwnership(codeConnections, connectionArn, connection.id)) {
          await ignoreMissing(() =>
            codeConnections.send(
              new DeleteConnectionCommand({ ConnectionArn: connectionArn })
            )
          );
        }
      }
    } finally {
      codeBuild.destroy();
      codeConnections.destroy();
      logs.destroy();
      iam.destroy();
      ecr.destroy();
    }
  };
}

async function deleteOwnedBuildCache(
  client: CleanupClient,
  input: { projectId: string; accountId: string; region: string }
): Promise<void> {
  const cache = createProjectBuildCacheIdentity(input);
  let repository:
    | { repositoryArn?: string; repositoryName?: string }
    | undefined;
  try {
    const response = await client.send(
      new DescribeRepositoriesCommand({ repositoryNames: [cache.repositoryName] })
    ) as { repositories?: Array<{ repositoryArn?: string; repositoryName?: string }> };
    repository = response.repositories?.[0];
  } catch (error) {
    if (isMissingAwsResource(error)) return;
    throw error;
  }
  if (!repository) return;
  if (
    repository.repositoryArn !== cache.repositoryArn ||
    repository.repositoryName !== cache.repositoryName
  ) {
    throw new Error("SketchCatch 빌드 캐시 ECR Repository 좌표가 관리 계약과 다릅니다.");
  }
  const response = await client.send(
    new ListEcrTagsForResourceCommand({ resourceArn: cache.repositoryArn })
  ) as { tags?: Array<{ Key?: string; Value?: string }> };
  const tags = normalizeTags(response.tags);
  if (
    tags.get("ManagedBy") !== "SketchCatch" ||
    tags.get("SketchCatchProject") !== input.projectId ||
    tags.get("SketchCatchPurpose") !== "BuildCache"
  ) {
    throw new Error("SketchCatch 빌드 캐시 ECR Repository 소유권 태그가 일치하지 않습니다.");
  }
  await ignoreMissing(() =>
    client.send(
      new DeleteRepositoryCommand({ repositoryName: cache.repositoryName, force: true })
    )
  );
}

async function verifyCodeBuildOwnership(
  client: CleanupClient,
  build: {
    projectId: string;
    projectName: string;
    serviceRoleArn: string;
  }
): Promise<boolean> {
  const response = await client.send(
    new BatchGetProjectsCommand({ names: [build.projectName] })
  ) as { projects?: Array<{ serviceRole?: string; tags?: Array<{ key?: string; value?: string }> }> };
  const project = response.projects?.[0];
  if (!project) return false;
  if (project.serviceRole !== build.serviceRoleArn) {
    throw new Error("SketchCatch CodeBuild service role 소유권이 DB 기록과 다릅니다.");
  }
  assertOwnedTags(project.tags, build.projectId);
  return true;
}

async function verifyRoleOwnership(
  client: CleanupClient,
  roleName: string,
  projectId: string
): Promise<boolean> {
  try {
    const response = await client.send(new ListRoleTagsCommand({ RoleName: roleName })) as {
      Tags?: Array<{ Key?: string; Value?: string }>;
    };
    assertOwnedTags(response.Tags, projectId);
    return true;
  } catch (error) {
    if (isMissingAwsResource(error)) return false;
    throw error;
  }
}

async function verifyCodeConnectionOwnership(
  client: CleanupClient,
  connectionArn: string,
  awsConnectionId: string
): Promise<boolean> {
  try {
    const response = await client.send(
      new ListTagsForResourceCommand({ ResourceArn: connectionArn })
    ) as { Tags?: Array<{ Key?: string; Value?: string }> };
    const tags = normalizeTags(response.Tags);
    if (
      tags.get("ManagedBy") !== "SketchCatch" ||
      tags.get("SketchCatchAwsConnection") !== awsConnectionId
    ) {
      throw new Error("SketchCatch CodeConnection 소유권 태그가 일치하지 않습니다.");
    }
    return true;
  } catch (error) {
    if (isMissingAwsResource(error)) return false;
    throw error;
  }
}

function assertOwnedTags(
  values:
    | Array<{ Key?: string; Value?: string }>
    | Array<{ key?: string; value?: string }>
    | undefined,
  projectId: string
): void {
  const tags = normalizeTags(values);
  if (
    tags.get("ManagedBy") !== "SketchCatch" ||
    tags.get("SketchCatchProject") !== projectId
  ) {
    throw new Error("SketchCatch 관리 리소스 소유권 태그가 일치하지 않습니다.");
  }
}

function normalizeTags(
  values:
    | Array<
        | { Key?: string; Value?: string }
        | { key?: string; value?: string }
      >
    | undefined
): Map<string, string> {
  return new Map(
    (values ?? []).flatMap((tag) => {
      const key = "Key" in tag ? tag.Key : "key" in tag ? tag.key : undefined;
      const value = "Value" in tag ? tag.Value : "value" in tag ? tag.value : undefined;
      return typeof key === "string" && typeof value === "string" ? [[key, value]] : [];
    })
  );
}

function parseRoleName(roleArn: string): string {
  const match = /^arn:aws:iam::\d{12}:role\/(.+)$/u.exec(roleArn);
  if (!match?.[1] || match[1].includes("/")) {
    throw new Error("SketchCatch CodeBuild service role ARN is invalid");
  }
  return match[1];
}

async function ignoreMissing(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isMissingAwsResource(error)) return;
    throw error;
  }
}

function withAwsCleanupConsistencyRetries(client: CleanupClient): CleanupClient {
  return {
    send: (command) => retryAwsCleanupConsistencyOperation(() => client.send(command)),
    destroy: () => client.destroy()
  };
}

async function retryAwsCleanupConsistencyOperation<Result>(
  operation: () => Promise<Result>
): Promise<Result> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryDelayMs = iamConsistencyRetryDelaysMs[attempt];
      if (
        retryDelayMs === undefined ||
        !isRetryableAwsCleanupConsistencyError(error)
      ) {
        throw error;
      }
      await sleep(retryDelayMs);
    }
  }
}

function isRetryableAwsCleanupConsistencyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  return retryableAwsCleanupConsistencyErrorNames.has(name);
}

function isMissingAwsResource(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  return [
    "ResourceNotFoundException",
    "RepositoryNotFoundException",
    "NoSuchEntity",
    "NoSuchEntityException",
    "ResourceNotFound"
  ].includes(name);
}
