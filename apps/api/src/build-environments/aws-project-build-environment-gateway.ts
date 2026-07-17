import { setTimeout as delay } from "node:timers/promises";
import {
  BatchGetProjectsCommand,
  CodeBuildClient,
  CreateProjectCommand,
  DeleteProjectCommand,
  UpdateProjectCommand,
  type CodeBuildClientConfig
} from "@aws-sdk/client-codebuild";
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  type CloudWatchLogsClientConfig
} from "@aws-sdk/client-cloudwatch-logs";
import {
  CreateRepositoryCommand,
  DeleteRepositoryCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  GetLifecyclePolicyCommand,
  ListTagsForResourceCommand as ListEcrTagsForResourceCommand,
  PutImageScanningConfigurationCommand,
  PutImageTagMutabilityCommand,
  PutLifecyclePolicyCommand,
  type ECRClientConfig
} from "@aws-sdk/client-ecr";
import {
  CreateRoleCommand,
  DeleteRoleCommand,
  DeleteRolePermissionsBoundaryCommand,
  DeleteRolePolicyCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListRoleTagsCommand,
  ListRolePoliciesCommand,
  PutRolePermissionsBoundaryCommand,
  PutRolePolicyCommand,
  TagRoleCommand,
  UpdateAssumeRolePolicyCommand,
  type IAMClientConfig
} from "@aws-sdk/client-iam";
import { createAwsSdkStsGateway } from "../aws-connections/aws-connection-test-service.js";
import {
  createProjectBuildCacheIdentity,
  projectBuildCacheRepositoryActions
} from "./project-build-cache.js";
import type {
  DesiredProjectBuildEnvironment,
  ProjectBuildEnvironmentGateway,
  ProjectBuildEnvironmentRemoval,
  ProjectBuildEnvironmentVerification
} from "./project-build-environment-service.js";

const buildServicePolicyName = "SketchCatchRepositoryBuildOnly";
const iamPropagationRetryDelaysMs = [250, 500, 1_000, 2_000, 4_000, 8_000, 16_000] as const;
const propagationPendingVerificationReasons = new Set([
  "CodeBuild service role was not found",
  "CodeBuild project was not found"
]);
const trustedNoopBuildspec = `version: 0.2
phases:
  build:
    commands:
      - echo "SketchCatch server-generated buildspecOverride is required"
`;
const forbiddenBuildRoleActions = ["ecs:", "s3:", "cloudfront:", "iam:passrole"];
const buildCacheLifecyclePolicy = {
  rules: [
    {
      rulePriority: 1,
      description: "Keep the three most recent SketchCatch build cache images",
      selection: {
        tagStatus: "any",
        countType: "imageCountMoreThan",
        countNumber: 3
      },
      action: { type: "expire" }
    }
  ]
} as const;
const buildCacheLifecyclePolicyText = JSON.stringify(buildCacheLifecyclePolicy);

type AwsCommandClient = {
  send(command: unknown): Promise<Record<string, unknown>>;
  destroy(): void;
};

export function createAwsProjectBuildEnvironmentGateway(options: {
  assumeRole?: ReturnType<typeof createAwsSdkStsGateway>["assumeRole"];
  createIamClient?: (configuration: IAMClientConfig) => AwsCommandClient;
  createCodeBuildClient?: (configuration: CodeBuildClientConfig) => AwsCommandClient;
  createEcrClient?: (configuration: ECRClientConfig) => AwsCommandClient;
  createCloudWatchLogsClient?: (
    configuration: CloudWatchLogsClientConfig
  ) => AwsCommandClient;
} = {}): ProjectBuildEnvironmentGateway {
  const assumeRole = options.assumeRole ?? createAwsSdkStsGateway().assumeRole;
  const createIamClient =
    options.createIamClient ??
    ((configuration) => new IAMClient(configuration) as unknown as AwsCommandClient);
  const createCodeBuildClient =
    options.createCodeBuildClient ??
    ((configuration) => new CodeBuildClient(configuration) as unknown as AwsCommandClient);
  const createEcrClient =
    options.createEcrClient ??
    ((configuration) => new ECRClient(configuration) as unknown as AwsCommandClient);
  const createCloudWatchLogsClient =
    options.createCloudWatchLogsClient ??
    ((configuration) => new CloudWatchLogsClient(configuration) as unknown as AwsCommandClient);

  async function withClients<T>(
    input: DesiredProjectBuildEnvironment,
    operation: (clients: {
      iam: AwsCommandClient;
      codeBuild: AwsCommandClient;
      ecr: AwsCommandClient;
      logs: AwsCommandClient;
    }) => Promise<T>
  ): Promise<T> {
    const credentials = await assumeRole({
      roleArn: input.awsConnection.roleArn,
      externalId: input.awsConnection.externalId,
      region: input.awsConnection.region,
      roleSessionName: `sketchcatch-build-${input.projectId.slice(0, 32)}`
    });
    const iam = createIamClient({ region: input.awsConnection.region, credentials });
    const codeBuild = createCodeBuildClient({
      region: input.awsConnection.region,
      credentials
    });
    const ecr = createEcrClient({ region: input.awsConnection.region, credentials });
    const logs = createCloudWatchLogsClient({ region: input.awsConnection.region, credentials });
    try {
      return await operation({ iam, codeBuild, ecr, logs });
    } finally {
      iam.destroy();
      codeBuild.destroy();
      ecr.destroy();
      logs.destroy();
    }
  }

  return {
    async reconcile(input) {
      return withClients(input, async ({ iam, codeBuild, ecr }) => {
        let createdCacheRepository = false;
        let createdRole = false;
        let createdProject = false;
        try {
          createdCacheRepository = await reconcileBuildCacheRepository(ecr, input);
          createdRole = await reconcileBuildRole(iam, input);
          createdProject = await reconcileCodeBuildProject(codeBuild, input);
          return await verifyBuildEnvironmentWithPropagationRetry({ iam, codeBuild, ecr }, input);
        } catch (error) {
          if (createdProject) {
            await cleanupOwnedCodeBuildProject(codeBuild, input).catch(() => undefined);
          }
          if (createdRole) {
            await cleanupOwnedBuildRole(iam, input).catch(() => undefined);
          }
          if (createdCacheRepository) {
            await cleanupOwnedBuildCacheRepository(ecr, input).catch(() => undefined);
          }
          throw error;
        }
      });
    },

    async verify(input) {
      return withClients(input, (clients) => verifyBuildEnvironment(clients, input));
    },

    async remove(input) {
      return withRemovalClients(
        input,
        {
          assumeRole,
          createIamClient,
          createCodeBuildClient,
          createEcrClient,
          createCloudWatchLogsClient
        },
        async ({ iam, codeBuild, ecr, logs }) => {
          const buildCache = createProjectBuildCacheIdentity({
            projectId: input.projectId,
            accountId: input.awsConnection.accountId,
            region: input.awsConnection.region
          });
          const project = await getCodeBuildProject(codeBuild, input.codeBuildProjectName);
          const role = await getRole(iam, input.codeBuildServiceRoleName);
          const roleTags = role ? await getRoleTags(iam, input.codeBuildServiceRoleName) : [];
          if (
            project &&
            (project.serviceRole !== input.codeBuildServiceRoleArn ||
              !hasOwnershipTags(project.tags, input.projectId))
          ) {
            throw new Error("Refusing to delete an unmanaged CodeBuild project");
          }
          if (
            role &&
            (role.arn !== input.codeBuildServiceRoleArn ||
              role.permissionsBoundaryArn !== input.permissionsBoundaryArn ||
              !hasOwnershipTags(roleTags, input.projectId))
          ) {
            throw new Error("Refusing to delete an unmanaged CodeBuild service role");
          }
          if (project || role) {
            await ignoreMissing(() =>
              logs.send(
                new DeleteLogGroupCommand({
                  logGroupName: `/aws/codebuild/${input.codeBuildProjectName}`
                })
              )
            );
          }
          if (project) {
            await ignoreMissing(() =>
              codeBuild.send(new DeleteProjectCommand({ name: input.codeBuildProjectName }))
            );
          }
          if (role) await cleanupBuildRole(iam, input.codeBuildServiceRoleName);
          await cleanupOwnedBuildCacheRepository(ecr, {
            ...input,
            buildCache
          });
        }
      );
    }
  };
}

async function withRemovalClients<T>(
  input: ProjectBuildEnvironmentRemoval,
  dependencies: {
    assumeRole: ReturnType<typeof createAwsSdkStsGateway>["assumeRole"];
    createIamClient: (configuration: IAMClientConfig) => AwsCommandClient;
    createCodeBuildClient: (configuration: CodeBuildClientConfig) => AwsCommandClient;
    createEcrClient: (configuration: ECRClientConfig) => AwsCommandClient;
    createCloudWatchLogsClient: (
      configuration: CloudWatchLogsClientConfig
    ) => AwsCommandClient;
  },
  operation: (clients: {
    iam: AwsCommandClient;
    codeBuild: AwsCommandClient;
    ecr: AwsCommandClient;
    logs: AwsCommandClient;
  }) => Promise<T>
): Promise<T> {
  const credentials = await dependencies.assumeRole({
    roleArn: input.awsConnection.roleArn,
    externalId: input.awsConnection.externalId,
    region: input.awsConnection.region,
    roleSessionName: `sketchcatch-build-delete-${input.projectId.slice(0, 24)}`
  });
  const configuration = { region: input.awsConnection.region, credentials };
  const iam = dependencies.createIamClient(configuration);
  const codeBuild = dependencies.createCodeBuildClient(configuration);
  const ecr = dependencies.createEcrClient(configuration);
  const logs = dependencies.createCloudWatchLogsClient(configuration);
  try {
    return await operation({ iam, codeBuild, ecr, logs });
  } finally {
    iam.destroy();
    codeBuild.destroy();
    ecr.destroy();
    logs.destroy();
  }
}

async function reconcileBuildCacheRepository(
  ecr: AwsCommandClient,
  input: DesiredProjectBuildEnvironment
): Promise<boolean> {
  const observed = await getBuildCacheRepository(ecr, input.buildCache.repositoryName);
  if (observed) {
    const tags = await getBuildCacheTags(ecr, input.buildCache.repositoryArn);
    if (!hasBuildCacheOwnershipTags(tags, input.projectId)) {
      throw new Error("Refusing to update an unmanaged ECR build cache repository");
    }
    if (!hasSupportedBuildCacheEncryption(observed)) {
      throw new Error("ECR build cache repository encryption does not match the project contract");
    }
    if (observed.imageTagMutability !== "MUTABLE") {
      await ecr.send(
        new PutImageTagMutabilityCommand({
          repositoryName: input.buildCache.repositoryName,
          imageTagMutability: "MUTABLE"
        })
      );
    }
    if (readScanOnPush(observed) !== false) {
      await ecr.send(
        new PutImageScanningConfigurationCommand({
          repositoryName: input.buildCache.repositoryName,
          imageScanningConfiguration: { scanOnPush: false }
        })
      );
    }
    await putBuildCacheLifecyclePolicy(ecr, input.buildCache.repositoryName);
    return false;
  }

  await ecr.send(
    new CreateRepositoryCommand({
      repositoryName: input.buildCache.repositoryName,
      imageTagMutability: "MUTABLE",
      imageScanningConfiguration: { scanOnPush: false },
      encryptionConfiguration: { encryptionType: "AES256" },
      tags: buildCacheOwnershipTags(input.projectId)
    })
  );
  await putBuildCacheLifecyclePolicy(ecr, input.buildCache.repositoryName);
  return true;
}

async function putBuildCacheLifecyclePolicy(
  ecr: AwsCommandClient,
  repositoryName: string
): Promise<void> {
  await ecr.send(
    new PutLifecyclePolicyCommand({
      repositoryName,
      lifecyclePolicyText: buildCacheLifecyclePolicyText
    })
  );
}

async function verifyBuildCacheRepository(
  ecr: AwsCommandClient,
  input: DesiredProjectBuildEnvironment
): Promise<ProjectBuildEnvironmentVerification> {
  const repository = await getBuildCacheRepository(ecr, input.buildCache.repositoryName);
  if (!repository) return failed("ECR build cache repository was not found");
  if (
    repository.repositoryName !== input.buildCache.repositoryName ||
    repository.repositoryArn !== input.buildCache.repositoryArn ||
    repository.repositoryUri !== input.buildCache.repositoryUri
  ) {
    return failed("ECR build cache repository coordinates do not match the project contract");
  }
  if (
    repository.imageTagMutability !== "MUTABLE" ||
    readScanOnPush(repository) !== false ||
    !hasSupportedBuildCacheEncryption(repository)
  ) {
    return failed("ECR build cache repository configuration changed from the project contract");
  }
  const tags = await getBuildCacheTags(ecr, input.buildCache.repositoryArn);
  if (!hasBuildCacheOwnershipTags(tags, input.projectId)) {
    return failed("ECR build cache repository ownership tags are missing or changed");
  }
  const lifecyclePolicy = await getBuildCacheLifecyclePolicy(
    ecr,
    input.buildCache.repositoryName
  );
  if (!lifecyclePolicy || !jsonDocumentsEqual(lifecyclePolicy, buildCacheLifecyclePolicyText)) {
    return failed("ECR build cache repository lifecycle policy changed from the project contract");
  }
  return { verified: true, statusReason: null };
}

async function cleanupOwnedBuildCacheRepository(
  ecr: AwsCommandClient,
  input: { projectId: string; buildCache: DesiredProjectBuildEnvironment["buildCache"] }
): Promise<void> {
  const repository = await getBuildCacheRepository(ecr, input.buildCache.repositoryName);
  if (!repository) return;
  if (
    repository.repositoryArn !== input.buildCache.repositoryArn ||
    repository.repositoryUri !== input.buildCache.repositoryUri
  ) {
    throw new Error("Refusing to delete an unmanaged ECR build cache repository");
  }
  const tags = await getBuildCacheTags(ecr, input.buildCache.repositoryArn);
  if (!hasBuildCacheOwnershipTags(tags, input.projectId)) {
    throw new Error("Refusing to delete an unmanaged ECR build cache repository");
  }
  await ignoreMissing(() =>
    ecr.send(
      new DeleteRepositoryCommand({
        repositoryName: input.buildCache.repositoryName,
        force: true
      })
    )
  );
}

async function getBuildCacheRepository(
  ecr: AwsCommandClient,
  repositoryName: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await ecr.send(
      new DescribeRepositoriesCommand({ repositoryNames: [repositoryName] })
    );
    return ((response.repositories as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? null;
  } catch (error) {
    if (isEcrRepositoryMissing(error)) return null;
    throw error;
  }
}

async function getBuildCacheTags(
  ecr: AwsCommandClient,
  repositoryArn: string
): Promise<Array<{ Key?: string; Value?: string }>> {
  const response = await ecr.send(
    new ListEcrTagsForResourceCommand({ resourceArn: repositoryArn })
  );
  return (response.tags as Array<{ Key?: string; Value?: string }> | undefined) ?? [];
}

async function getBuildCacheLifecyclePolicy(
  ecr: AwsCommandClient,
  repositoryName: string
): Promise<string | null> {
  try {
    const response = await ecr.send(new GetLifecyclePolicyCommand({ repositoryName }));
    return typeof response.lifecyclePolicyText === "string"
      ? response.lifecyclePolicyText
      : null;
  } catch (error) {
    if (isEcrLifecyclePolicyMissing(error)) return null;
    throw error;
  }
}

function buildCacheOwnershipTags(projectId: string) {
  return [
    { Key: "ManagedBy", Value: "SketchCatch" },
    { Key: "SketchCatchProject", Value: projectId },
    { Key: "SketchCatchPurpose", Value: "BuildCache" }
  ];
}

function hasBuildCacheOwnershipTags(
  tags: Array<{ Key?: string; Value?: string }>,
  projectId: string
): boolean {
  const normalized = new Map(
    tags.flatMap((tag) =>
      typeof tag.Key === "string" && typeof tag.Value === "string"
        ? [[tag.Key, tag.Value] as const]
        : []
    )
  );
  return (
    normalized.get("ManagedBy") === "SketchCatch" &&
    normalized.get("SketchCatchProject") === projectId &&
    normalized.get("SketchCatchPurpose") === "BuildCache"
  );
}

function hasSupportedBuildCacheEncryption(repository: Record<string, unknown>): boolean {
  const encryption = repository.encryptionConfiguration as
    | { encryptionType?: unknown }
    | undefined;
  return encryption?.encryptionType === "AES256";
}

function readScanOnPush(repository: Record<string, unknown>): boolean | undefined {
  return (repository.imageScanningConfiguration as { scanOnPush?: boolean } | undefined)
    ?.scanOnPush;
}

function jsonDocumentsEqual(left: string, right: string): boolean {
  try {
    return canonicalizePolicyValue(JSON.parse(left)) === canonicalizePolicyValue(JSON.parse(right));
  } catch {
    return false;
  }
}

function isEcrRepositoryMissing(error: unknown): boolean {
  return getAwsErrorName(error) === "RepositoryNotFoundException";
}

function isEcrLifecyclePolicyMissing(error: unknown): boolean {
  return getAwsErrorName(error) === "LifecyclePolicyNotFoundException";
}

function getAwsErrorName(error: unknown): string | undefined {
  return error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name)
    : undefined;
}

async function reconcileBuildRole(
  iam: AwsCommandClient,
  input: DesiredProjectBuildEnvironment
): Promise<boolean> {
  const assumeRolePolicyDocument = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "codebuild.amazonaws.com" },
        Action: "sts:AssumeRole"
      }
    ]
  });
  const observed = await getRole(iam, input.codeBuildServiceRoleName);
  let createdByThisCall = false;
  try {
    if (!observed) {
      await iam.send(
        new CreateRoleCommand({
          RoleName: input.codeBuildServiceRoleName,
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
          PermissionsBoundary: input.permissionsBoundaryArn,
          Description: "Build-only role for a SketchCatch project Repository",
          Tags: [
            { Key: "ManagedBy", Value: "SketchCatch" },
            { Key: "SketchCatchProject", Value: input.projectId }
          ]
        })
      );
      createdByThisCall = true;
    } else {
      const roleTags = await getRoleTags(iam, input.codeBuildServiceRoleName);
      if (!hasOwnershipTags(roleTags, input.projectId)) {
        throw new Error("Refusing to update an unmanaged CodeBuild service role");
      }
      await iam.send(
        new UpdateAssumeRolePolicyCommand({
          RoleName: input.codeBuildServiceRoleName,
          PolicyDocument: assumeRolePolicyDocument
        })
      );
      await iam.send(
        new TagRoleCommand({
          RoleName: input.codeBuildServiceRoleName,
          Tags: [
            { Key: "ManagedBy", Value: "SketchCatch" },
            { Key: "SketchCatchProject", Value: input.projectId }
          ]
        })
      );
      if (observed.permissionsBoundaryArn !== input.permissionsBoundaryArn) {
        await iam.send(
          new PutRolePermissionsBoundaryCommand({
            RoleName: input.codeBuildServiceRoleName,
            PermissionsBoundary: input.permissionsBoundaryArn
          })
        );
      }
    }

    await putBuildRolePolicyWithPropagationRetry(iam, input);
    return createdByThisCall;
  } catch (error) {
    if (createdByThisCall) {
      await cleanupOwnedBuildRole(iam, input).catch(() => undefined);
    }
    throw error;
  }
}

async function putBuildRolePolicyWithPropagationRetry(
  iam: AwsCommandClient,
  input: DesiredProjectBuildEnvironment
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await iam.send(
        new PutRolePolicyCommand({
          RoleName: input.codeBuildServiceRoleName,
          PolicyName: buildServicePolicyName,
          PolicyDocument: JSON.stringify(createBuildOnlyPolicy(input))
        })
      );
      return;
    } catch (error) {
      const retryDelayMs = iamPropagationRetryDelaysMs[attempt];
      if (!isNoSuchEntity(error) || retryDelayMs === undefined) throw error;
      await delay(retryDelayMs);
    }
  }
}

async function reconcileCodeBuildProject(
  codeBuild: AwsCommandClient,
  input: DesiredProjectBuildEnvironment
): Promise<boolean> {
  const project = createCodeBuildProjectInput(input);
  const observed = await getCodeBuildProject(codeBuild, input.codeBuildProjectName);
  if (observed) {
    if (!hasOwnershipTags(observed.tags, input.projectId)) {
      throw new Error("Refusing to update an unmanaged CodeBuild project");
    }
    await codeBuild.send(new UpdateProjectCommand(project));
    return false;
  }
  await createCodeBuildProjectWithPropagationRetry(codeBuild, project);
  return true;
}

async function createCodeBuildProjectWithPropagationRetry(
  codeBuild: AwsCommandClient,
  project: ReturnType<typeof createCodeBuildProjectInput>
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await codeBuild.send(new CreateProjectCommand(project));
      return;
    } catch (error) {
      const retryDelayMs = iamPropagationRetryDelaysMs[attempt];
      if (!isCodeBuildRolePropagationError(error) || retryDelayMs === undefined) throw error;
      await delay(retryDelayMs);
    }
  }
}

async function cleanupOwnedCodeBuildProject(
  codeBuild: AwsCommandClient,
  input: DesiredProjectBuildEnvironment
): Promise<void> {
  const project = await getCodeBuildProject(codeBuild, input.codeBuildProjectName);
  if (!project) return;
  if (
    project.serviceRole !== input.codeBuildServiceRoleArn ||
    !hasOwnershipTags(project.tags, input.projectId)
  ) {
    throw new Error("Refusing to delete an unmanaged CodeBuild project during compensation");
  }
  await ignoreMissing(() =>
    codeBuild.send(new DeleteProjectCommand({ name: input.codeBuildProjectName }))
  );
}

async function cleanupOwnedBuildRole(
  iam: AwsCommandClient,
  input: DesiredProjectBuildEnvironment
): Promise<void> {
  const role = await getRole(iam, input.codeBuildServiceRoleName);
  if (!role) return;
  const tags = await getRoleTags(iam, input.codeBuildServiceRoleName);
  if (
    role.arn !== input.codeBuildServiceRoleArn ||
    role.permissionsBoundaryArn !== input.permissionsBoundaryArn ||
    !hasOwnershipTags(tags, input.projectId)
  ) {
    throw new Error("Refusing to delete an unmanaged CodeBuild role during compensation");
  }
  await cleanupBuildRole(iam, input.codeBuildServiceRoleName);
}

async function cleanupBuildRole(iam: AwsCommandClient, roleName: string): Promise<void> {
  await ignoreMissing(() =>
    iam.send(
      new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: buildServicePolicyName })
    )
  );
  await ignoreMissing(() =>
    iam.send(new DeleteRolePermissionsBoundaryCommand({ RoleName: roleName }))
  );
  await ignoreMissing(() => iam.send(new DeleteRoleCommand({ RoleName: roleName })));
}

async function verifyBuildEnvironment(
  clients: { iam: AwsCommandClient; codeBuild: AwsCommandClient; ecr: AwsCommandClient },
  input: DesiredProjectBuildEnvironment
): Promise<ProjectBuildEnvironmentVerification> {
  const cacheVerification = await verifyBuildCacheRepository(clients.ecr, input);
  if (!cacheVerification.verified) return cacheVerification;
  const role = await getRole(clients.iam, input.codeBuildServiceRoleName);
  if (!role) return failed("CodeBuild service role was not found");
  if (role.arn !== input.codeBuildServiceRoleArn) {
    return failed("CodeBuild service role ARN does not match the project contract");
  }
  if (role.permissionsBoundaryArn !== input.permissionsBoundaryArn) {
    return failed("CodeBuild service role permissions boundary is missing or changed");
  }
  const roleTags = await getRoleTags(clients.iam, input.codeBuildServiceRoleName);
  if (!hasOwnershipTags(roleTags, input.projectId)) {
    return failed("CodeBuild service role ownership tags are missing or changed");
  }

  const policyNames = await listRolePolicyNames(clients.iam, input.codeBuildServiceRoleName);
  if (policyNames.some((name) => name !== buildServicePolicyName)) {
    return failed("CodeBuild service role contains an unmanaged inline policy");
  }
  const attachedPolicyArns = await listAttachedRolePolicyArns(
    clients.iam,
    input.codeBuildServiceRoleName
  );
  if (attachedPolicyArns.length > 0) {
    return failed("CodeBuild service role contains an attached managed policy");
  }
  const buildPolicy = await getRolePolicyDocument(
    clients.iam,
    input.codeBuildServiceRoleName,
    buildServicePolicyName
  );
  if (!policiesEqual(buildPolicy, createBuildOnlyPolicy(input))) {
    return failed("CodeBuild service role policy does not match the build-only contract");
  }
  const boundaryPolicy = await getManagedPolicyDocument(clients.iam, input.permissionsBoundaryArn);
  if (!policiesEqual(boundaryPolicy, createBuildPermissionsBoundaryPolicy(input))) {
    return failed("CodeBuild permissions boundary policy changed from the build-only contract");
  }
  const actions = collectAllowedActions(buildPolicy);
  if (actions.some((action) => forbiddenBuildRoleActions.some((prefix) => action.startsWith(prefix)))) {
    return failed("CodeBuild service role contains a deployment permission");
  }
  const requiredActions = [
    "logs:createloggroup",
    "logs:createlogstream",
    "logs:putlogevents",
    "codeconnections:useconnection",
    "codeconnections:getconnection",
    "codeconnections:getconnectiontoken",
    "codestar-connections:useconnection",
    "ecr:getauthorizationtoken",
    ...projectBuildCacheRepositoryActions.map((action) => action.toLowerCase())
  ];
  if (requiredActions.some((action) => !actions.includes(action))) {
    return failed("CodeBuild service role is missing a build-only permission");
  }

  const project = await getCodeBuildProject(clients.codeBuild, input.codeBuildProjectName);
  if (!project) return failed("CodeBuild project was not found");
  if (!matchesCodeBuildProject(project, input)) {
    return failed("CodeBuild project configuration does not match the approved build environment");
  }
  return { verified: true, statusReason: null };
}

async function verifyBuildEnvironmentWithPropagationRetry(
  clients: { iam: AwsCommandClient; codeBuild: AwsCommandClient; ecr: AwsCommandClient },
  input: DesiredProjectBuildEnvironment
): Promise<ProjectBuildEnvironmentVerification> {
  for (let attempt = 0; ; attempt += 1) {
    const retryDelayMs = iamPropagationRetryDelaysMs[attempt];
    try {
      const verification = await verifyBuildEnvironment(clients, input);
      if (
        verification.verified ||
        !verification.statusReason ||
        !propagationPendingVerificationReasons.has(verification.statusReason) ||
        retryDelayMs === undefined
      ) {
        return verification;
      }
    } catch (error) {
      if (!isNoSuchEntity(error) || retryDelayMs === undefined) throw error;
    }
    await delay(retryDelayMs);
  }
}

function createBuildOnlyPolicy(input: DesiredProjectBuildEnvironment): Record<string, unknown> {
  const logsPrefix = `arn:aws:logs:${input.awsConnection.region}:${input.awsConnection.accountId}:log-group:/aws/codebuild/${input.codeBuildProjectName}`;
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: [logsPrefix, `${logsPrefix}:*`]
      },
      {
        Effect: "Allow",
        Action: [
          "codeconnections:GetConnection",
          "codeconnections:GetConnectionToken",
          "codeconnections:UseConnection",
          "codestar-connections:UseConnection"
        ],
        Resource: input.codeConnectionArn
      },
      {
        Effect: "Allow",
        Action: "ecr:GetAuthorizationToken",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: projectBuildCacheRepositoryActions,
        Resource: input.buildCache.repositoryArn
      }
    ]
  };
}

function createBuildPermissionsBoundaryPolicy(
  input: DesiredProjectBuildEnvironment
): Record<string, unknown> {
  const logsPrefix = `arn:aws:logs:${input.awsConnection.region}:${input.awsConnection.accountId}:log-group:/aws/codebuild/*`;
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: [logsPrefix, `${logsPrefix}:*`]
      },
      {
        Effect: "Allow",
        Action: [
          "codeconnections:GetConnection",
          "codeconnections:GetConnectionToken",
          "codeconnections:UseConnection",
          "codestar-connections:UseConnection"
        ],
        Resource: [
          `arn:aws:codeconnections:${input.awsConnection.region}:${input.awsConnection.accountId}:connection/*`,
          `arn:aws:codestar-connections:${input.awsConnection.region}:${input.awsConnection.accountId}:connection/*`
        ]
      },
      {
        Effect: "Allow",
        Action: "ecr:GetAuthorizationToken",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: projectBuildCacheRepositoryActions,
        Resource:
          `arn:aws:ecr:${input.awsConnection.region}:${input.awsConnection.accountId}:repository/sketchcatch-*-build-cache`
      }
    ]
  };
}

function createCodeBuildProjectInput(input: DesiredProjectBuildEnvironment) {
  return {
    name: input.codeBuildProjectName,
    description: "Build-only project managed by SketchCatch",
    serviceRole: input.codeBuildServiceRoleArn,
    source: {
      type: "GITHUB" as const,
      location: input.sourceRepositoryUrl,
      buildspec: trustedNoopBuildspec,
      auth: {
        type: "CODECONNECTIONS" as const,
        resource: input.codeConnectionArn
      },
      reportBuildStatus: false,
      gitCloneDepth: 1
    },
    artifacts: { type: "NO_ARTIFACTS" as const },
    cache: { type: "NO_CACHE" as const },
    environment: {
      type: "LINUX_CONTAINER" as const,
      computeType: input.computeType,
      image: input.image,
      privilegedMode: true,
      environmentVariables: []
    },
    timeoutInMinutes: 30,
    queuedTimeoutInMinutes: 15,
    concurrentBuildLimit: 1,
    badgeEnabled: false,
    tags: [
      { key: "ManagedBy", value: "SketchCatch" },
      { key: "SketchCatchProject", value: input.projectId }
    ]
  };
}

async function getRole(
  iam: AwsCommandClient,
  roleName: string
): Promise<{ arn: string | null; permissionsBoundaryArn: string | null } | null> {
  try {
    const response = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    const role = response.Role as
      | {
          Arn?: string;
          PermissionsBoundary?: { PermissionsBoundaryArn?: string };
        }
      | undefined;
    if (!role) return null;
    return {
      arn: role.Arn ?? null,
      permissionsBoundaryArn: role.PermissionsBoundary?.PermissionsBoundaryArn ?? null
    };
  } catch (error) {
    if (isNoSuchEntity(error)) return null;
    throw error;
  }
}

async function listRolePolicyNames(iam: AwsCommandClient, roleName: string): Promise<string[]> {
  const response = await iam.send(new ListRolePoliciesCommand({ RoleName: roleName }));
  return ((response.PolicyNames as string[] | undefined) ?? []).filter(Boolean);
}

async function listAttachedRolePolicyArns(
  iam: AwsCommandClient,
  roleName: string
): Promise<string[]> {
  const response = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
  return ((response.AttachedPolicies as Array<{ PolicyArn?: string }> | undefined) ?? [])
    .map((policy) => policy.PolicyArn)
    .filter((policyArn): policyArn is string => typeof policyArn === "string" && Boolean(policyArn));
}

async function getRolePolicyDocument(
  iam: AwsCommandClient,
  roleName: string,
  policyName: string
): Promise<Record<string, unknown> | null> {
  const response = await iam.send(
    new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName })
  );
  return parsePolicyDocument(response.PolicyDocument);
}

async function getManagedPolicyDocument(
  iam: AwsCommandClient,
  policyArn: string
): Promise<Record<string, unknown> | null> {
  const policy = await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
  const defaultVersionId = (policy.Policy as { DefaultVersionId?: unknown } | undefined)
    ?.DefaultVersionId;
  if (typeof defaultVersionId !== "string" || !defaultVersionId) return null;
  const version = await iam.send(
    new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: defaultVersionId })
  );
  return parsePolicyDocument(
    (version.PolicyVersion as { Document?: unknown } | undefined)?.Document
  );
}

function parsePolicyDocument(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function collectAllowedActions(document: Record<string, unknown> | null): string[] {
  const statements = Array.isArray(document?.Statement) ? document.Statement : [];
  return statements
    .filter(
      (statement): statement is Record<string, unknown> =>
        Boolean(statement) && typeof statement === "object" &&
        (statement as Record<string, unknown>).Effect === "Allow"
    )
    .filter((statement) => statement.Effect === "Allow")
    .flatMap((statement) =>
      Array.isArray(statement.Action) ? statement.Action : [statement.Action]
    )
    .filter((action): action is string => typeof action === "string")
    .map((action) => action.toLowerCase());
}

function policiesEqual(
  observed: Record<string, unknown> | null,
  expected: Record<string, unknown>
): boolean {
  if (!observed) return false;
  return canonicalizePolicyValue(observed) === canonicalizePolicyValue(expected);
}

function canonicalizePolicyValue(value: unknown, key?: string): string {
  if (key === "Action" || key === "Resource") {
    const values = Array.isArray(value) ? value : [value];
    return `[${values.map((item) => canonicalizePolicyValue(item)).sort().join(",")}]`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizePolicyValue(item)).sort().join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([entryKey]) => entryKey !== "Sid")
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([entryKey, entryValue]) =>
        `${JSON.stringify(entryKey)}:${canonicalizePolicyValue(entryValue, entryKey)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function getCodeBuildProject(
  codeBuild: AwsCommandClient,
  projectName: string
): Promise<Record<string, unknown> | null> {
  const response = await codeBuild.send(new BatchGetProjectsCommand({ names: [projectName] }));
  return ((response.projects as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? null;
}

function matchesCodeBuildProject(
  project: Record<string, unknown>,
  input: DesiredProjectBuildEnvironment
): boolean {
  const source = project.source as Record<string, unknown> | undefined;
  const auth = source?.auth as Record<string, unknown> | undefined;
  const environment = project.environment as Record<string, unknown> | undefined;
  const artifacts = project.artifacts as Record<string, unknown> | undefined;
  const cache = project.cache as Record<string, unknown> | undefined;
  const badge = project.badge as Record<string, unknown> | undefined;
  const environmentVariables = environment?.environmentVariables;
  return (
    project.name === input.codeBuildProjectName &&
    project.serviceRole === input.codeBuildServiceRoleArn &&
    source?.type === "GITHUB" &&
    source.location === input.sourceRepositoryUrl &&
    source.buildspec === trustedNoopBuildspec &&
    auth?.type === "CODECONNECTIONS" &&
    auth.resource === input.codeConnectionArn &&
    source.reportBuildStatus === false &&
    source.gitCloneDepth === 1 &&
    environment?.type === "LINUX_CONTAINER" &&
    environment.computeType === input.computeType &&
    environment.image === input.image &&
    environment.privilegedMode === true &&
    Array.isArray(environmentVariables) &&
    environmentVariables.length === 0 &&
    artifacts?.type === "NO_ARTIFACTS" &&
    cache?.type === "NO_CACHE" &&
    project.timeoutInMinutes === 30 &&
    project.queuedTimeoutInMinutes === 15 &&
    project.concurrentBuildLimit === 1 &&
    badge?.badgeEnabled === false &&
    isEmptyArray(project.secondarySources) &&
    isEmptyArray(project.secondaryArtifacts) &&
    hasOwnershipTags(project.tags, input.projectId)
  );
}

function isEmptyArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

async function getRoleTags(
  iam: AwsCommandClient,
  roleName: string
): Promise<Array<{ Key?: string; Value?: string }>> {
  const response = await iam.send(new ListRoleTagsCommand({ RoleName: roleName }));
  return (response.Tags as Array<{ Key?: string; Value?: string }> | undefined) ?? [];
}

function hasOwnershipTags(value: unknown, projectId: string): boolean {
  if (!Array.isArray(value)) return false;
  const tags = new Map<string, string>();
  for (const tag of value) {
    if (!tag || typeof tag !== "object") continue;
    const key = "Key" in tag ? tag.Key : "key" in tag ? tag.key : undefined;
    const tagValue = "Value" in tag ? tag.Value : "value" in tag ? tag.value : undefined;
    if (typeof key === "string" && typeof tagValue === "string") tags.set(key, tagValue);
  }
  return tags.get("ManagedBy") === "SketchCatch" && tags.get("SketchCatchProject") === projectId;
}

function failed(statusReason: string): ProjectBuildEnvironmentVerification {
  return { verified: false, statusReason };
}

function isNoSuchEntity(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  const name = (error as { name?: unknown }).name;
  return name === "NoSuchEntity" || name === "NoSuchEntityException";
}

async function ignoreMissing(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isNoSuchEntity(error) || isResourceNotFound(error)) return;
    throw error;
  }
}

function isResourceNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "ResourceNotFoundException"
  );
}

function isCodeBuildRolePropagationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name !== "InvalidInput" && error.name !== "InvalidInputException") return false;
  return error.message
    .toLowerCase()
    .includes("codebuild is not authorized to perform: sts:assumerole on service role");
}
