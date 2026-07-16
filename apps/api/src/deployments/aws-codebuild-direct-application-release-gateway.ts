import {
  BatchGetBuildsCommand,
  BatchGetProjectsCommand,
  CodeBuildClient,
  StartBuildCommand,
  type CodeBuildClientConfig,
  type EnvironmentVariable
} from "@aws-sdk/client-codebuild";
import {
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  type ECSClientConfig
} from "@aws-sdk/client-ecs";
import type {
  ApplicationArtifact,
  ApplicationReleaseStatus,
  ApplicationReleaseProviderRevision,
  GitOpsReleaseEvidence,
  JsonValue,
  RuntimeDeploymentTarget,
  RuntimeTargetKind
} from "@sketchcatch/types";
import { normalizeLegacyRuntimeDeploymentTarget } from "@sketchcatch/types";
import { createAwsApplicationArtifactProviderVerifier } from "../artifacts/aws-application-artifact-verifier.js";
import type { ApplicationArtifactProviderVerification } from "../artifacts/application-artifact-registry.js";
import { createAwsSdkStsGateway } from "../aws-connections/aws-connection-test-service.js";
import {
  DirectApplicationReleaseError,
  type DirectApplicationArtifact,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationReleaseRecord
} from "./direct-application-release-service.js";
import { createDirectApplicationReleaseEvidenceVerifier } from "./direct-application-release-evidence-verifier.js";
import { createDeploymentTargetIdentity } from "../runtime-convergence/deployment-target-identity.js";
import type { RuntimeProviderCurrentState } from "../runtime-convergence/runtime-convergence-service.js";
import {
  createPublicHttpsHealthProbe,
  type PublicHttpsHealthProbe
} from "./public-https-health-probe.js";

export type CodeBuildCommandClient = {
  send(
    command: { input: Record<string, unknown> },
    options?: { abortSignal?: AbortSignal }
  ): Promise<CodeBuildCommandResponse>;
  destroy(): void;
};

type CodeBuildCommandResponse = {
  build?: { id?: string };
  builds?: Array<{
    buildStatus?: string;
    exportedEnvironmentVariables?: Array<{ name?: string; value?: string }>;
  }>;
  projects?: Array<{
    name?: string;
    source?: {
      type?: string;
      location?: string;
      auth?: { type?: string };
    };
  }>;
};

export type VerifiedDirectRuntimeRelease = {
  providerRevision: ApplicationReleaseProviderRevision;
  outputUrl: string;
  healthEvidence: JsonValue;
  rollbackEvidence: JsonValue | null;
  status: Extract<ApplicationReleaseStatus, "succeeded" | "rolled_back">;
};

export type VerifyDirectReleaseEvidence = (input: {
  context: DirectApplicationReleaseContext;
  artifact: DirectApplicationArtifact;
  evidence: GitOpsReleaseEvidence;
}) => Promise<VerifiedDirectRuntimeRelease>;

type AssumeDirectReleaseRole = (input: {
  roleArn: string;
  externalId: string;
  region: string;
  roleSessionName: string;
  abortSignal?: AbortSignal;
}) => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }>;

type CreateCodeBuildClient = (configuration: CodeBuildClientConfig) => CodeBuildCommandClient;
type CreateEcsClient = (configuration: ECSClientConfig) => ECSClient;
type WaitForCodeBuildPoll = (milliseconds: number, abortSignal?: AbortSignal) => Promise<void>;

export function createAwsCodeBuildDirectApplicationReleaseGateway(options: {
  assumeRole?: AssumeDirectReleaseRole;
  createClient?: CreateCodeBuildClient;
  createEcsClient?: CreateEcsClient;
  probeHealth?: PublicHttpsHealthProbe;
  wait?: WaitForCodeBuildPoll;
  verifyEvidence?: VerifyDirectReleaseEvidence;
  verifyArtifact?: (
    context: DirectApplicationReleaseContext,
    artifact: ApplicationArtifact
  ) => Promise<ApplicationArtifactProviderVerification>;
} = {}): DirectApplicationReleaseGateway {
  const assumeRole = options.assumeRole ?? (async (input) => {
    const credentials = await createAwsSdkStsGateway().assumeRole(input);
    return credentials;
  });
  const createClient = options.createClient ?? ((configuration) =>
    new CodeBuildClient(configuration) as unknown as CodeBuildCommandClient);
  const createEcsClient = options.createEcsClient ?? ((configuration) =>
    new ECSClient(configuration));
  const probeHealth = options.probeHealth ?? createPublicHttpsHealthProbe();
  const wait = options.wait ?? waitForPoll;
  const verifyEvidence =
    options.verifyEvidence ?? createDirectApplicationReleaseEvidenceVerifier();
  const verifyArtifact = options.verifyArtifact ?? (async (context, artifact) =>
    createAwsApplicationArtifactProviderVerifier({
      projectId: context.deployment.projectId,
      accountId: context.connection.accountId,
      roleArn: context.connection.roleArn,
      externalId: context.connection.externalId,
      region: context.connection.region
    }).verify(artifact));

  return {
    async verifyArtifact(context, artifact) {
      return verifyArtifact(context, artifact);
    },
    async prepareArtifact(context, abortSignal) {
      const result = await runCodeBuildPhase({
        context,
        phase: "prepare",
        assumeRole,
        createClient,
        wait,
        ...(abortSignal ? { abortSignal } : {})
      });
      const commitSha = requireExport(result.exports, "SKETCHCATCH_COMMIT_SHA").toLowerCase();
      const digest = normalizeDigest(
        requireExport(result.exports, "SKETCHCATCH_ARTIFACT_DIGEST")
      );
      const reference = requireExport(result.exports, "SKETCHCATCH_ARTIFACT_REFERENCE");
      return {
        commitSha,
        digest,
        reference,
        buildRevisionId: result.buildId,
        metadata: {
          buildProjectName: requireCodeBuildProjectName(context),
          region: context.connection.region,
          runtimeTargetKind: context.target.runtimeTargetKind
        }
      };
    },
    async inspectCurrentRuntime({ context, target, abortSignal }) {
      return inspectEcsDirectRuntime({
        context,
        target,
        assumeRole,
        createEcsClient,
        probeHealth,
        ...(abortSignal ? { abortSignal } : {})
      });
    },
    async deployArtifact({ context, artifact, abortSignal }) {
      const result = await runCodeBuildPhase({
        context,
        artifact,
        phase: "deploy",
        assumeRole,
        createClient,
        wait,
        ...(abortSignal ? { abortSignal } : {})
      });
      const evidenceName = releaseEvidenceExportName(context.target.runtimeTargetKind);
      const evidence = parseReleaseEvidence(
        requireExport(result.exports, evidenceName),
        context.target.runtimeTargetKind
      );
      return verifyEvidence({ context, artifact, evidence });
    },
    async rollbackArtifact({ context, artifact, release, abortSignal }) {
      const result = await runCodeBuildPhase({
        context,
        artifact,
        release,
        phase: "cleanup",
        assumeRole,
        createClient,
        wait,
        ...(abortSignal ? { abortSignal } : {})
      });
      const evidenceName = releaseEvidenceExportName(context.target.runtimeTargetKind);
      const evidence = parseReleaseEvidence(
        requireExport(result.exports, evidenceName),
        context.target.runtimeTargetKind
      );
      const verified = await verifyEvidence({ context, artifact, evidence });
      if (verified.status !== "rolled_back") {
        throw new DirectApplicationReleaseError(
          "Application cleanup did not restore the previous runtime revision"
        );
      }
      return { ...verified, status: "rolled_back" };
    }
  };
}

export async function inspectEcsDirectRuntime(input: {
  readonly context: DirectApplicationReleaseContext;
  readonly target: RuntimeDeploymentTarget;
  readonly abortSignal?: AbortSignal | undefined;
  readonly assumeRole: AssumeDirectReleaseRole;
  readonly createEcsClient: CreateEcsClient;
  readonly probeHealth: PublicHttpsHealthProbe;
}): Promise<RuntimeProviderCurrentState> {
  assertEcsFargateRuntimeTarget(input.target);
  const target = input.target;
  const credentials = await input.assumeRole({
    ...input.context.connection,
    roleSessionName: `sketchcatch-direct-inspect-${input.context.deployment.id}`,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
  });
  const client = input.createEcsClient({
    region: input.context.connection.region,
    credentials
  });
  try {
    const serviceResponse = await client.send(
      new DescribeServicesCommand({
        cluster: target.orchestrator.clusterName,
        services: [target.orchestrator.serviceName]
      }),
      input.abortSignal ? { abortSignal: input.abortSignal } : undefined
    );
    const service = serviceResponse.services?.[0];
    if (!service?.taskDefinition || serviceResponse.failures?.length) {
      throw new DirectApplicationReleaseError("ECS service current state was unavailable");
    }
    const taskResponse = await client.send(
      new DescribeTaskDefinitionCommand({
        taskDefinition: service.taskDefinition,
        include: ["TAGS"]
      }),
      input.abortSignal ? { abortSignal: input.abortSignal } : undefined
    );
    const containers = taskResponse.taskDefinition?.containerDefinitions?.filter(
      (container) => container.name === target.compute.containerName
    ) ?? [];
    if (containers.length !== 1 || !containers[0]?.image) {
      throw new DirectApplicationReleaseError("ECS task definition current state was incomplete");
    }
    const marker = taskResponse.tags?.find(
      (tag) => tag.key === "sketchcatch:runtime-convergence"
    )?.value ?? "";
    const markerMatch = /^sketchcatch:artifact=([a-f0-9]{64});target=([a-f0-9]{64})$/u.exec(
      marker
    );
    const deploymentConfiguration = service.deploymentConfiguration;
    const activeDeployment = service.deployments?.length === 1
      ? service.deployments[0]
      : undefined;
    const fargateCapacity = service.launchType === "FARGATE" ||
      (service.capacityProviderStrategy?.length ?? 0) > 0 &&
      service.capacityProviderStrategy?.every((item) =>
        item.capacityProvider === "FARGATE" || item.capacityProvider === "FARGATE_SPOT"
      ) === true;
    const providerHealthy =
      service.status === "ACTIVE" &&
      service.desiredCount !== undefined &&
      service.desiredCount > 0 &&
      service.runningCount === service.desiredCount &&
      (service.pendingCount ?? 0) === 0 &&
      (service.deployments?.length ?? 0) === 1 &&
      fargateCapacity &&
      (target.capacity.platformVersion === null ||
        activeDeployment?.platformVersion === target.capacity.platformVersion) &&
      deploymentConfiguration?.minimumHealthyPercent ===
        target.rollout.minimumHealthyPercent &&
      deploymentConfiguration?.maximumPercent === target.rollout.maximumPercent &&
      deploymentConfiguration?.deploymentCircuitBreaker?.enable === true &&
      deploymentConfiguration?.deploymentCircuitBreaker?.rollback ===
        target.rollout.circuitBreakerRollback;
    const healthVerifiedAt = new Date().toISOString();
    const endpointHealthy = await inspectDirectHealthEndpoint(
      target,
      input.probeHealth,
      input.abortSignal
    );
    const image = containers[0].image;
    const digest = /@sha256:([a-f0-9]{64})$/u.exec(image)?.[1] ?? "0".repeat(64);

    return {
      adapterKind: "ecs_service_fargate",
      deploymentTargetFingerprint: markerMatch?.[2] ?? "0".repeat(64),
      scope: {
        projectId: input.context.deployment.projectId,
        provider: "aws",
        accountId: input.context.connection.accountId,
        region: input.context.connection.region
      },
      target,
      artifact: {
        artifactFingerprint: markerMatch?.[1] ?? "0".repeat(64),
        digestAlgorithm: "sha256",
        digest,
        reference: image
      },
      providerRevision: {
        provider: "aws",
        resourceType: "ecs_service",
        revisionId: service.taskDefinition,
        artifactReference: image,
        metadata: {
          clusterName: target.orchestrator.clusterName,
          serviceName: target.orchestrator.serviceName,
          desiredCount: service.desiredCount ?? -1,
          runningCount: service.runningCount ?? -1
        }
      },
      health: {
        status: providerHealthy && endpointHealthy ? "healthy" : "unhealthy",
        verifiedAt: healthVerifiedAt
      },
      healthEvidence: {
        state: providerHealthy && endpointHealthy ? "healthy" : "unhealthy",
        providerHealthy,
        endpointHealthy,
        desiredCount: service.desiredCount ?? -1,
        runningCount: service.runningCount ?? -1,
        verifiedAt: healthVerifiedAt
      },
      rollbackEvidence: null
    };
  } finally {
    client.destroy();
  }
}

function assertEcsFargateRuntimeTarget(
  target: RuntimeDeploymentTarget
): asserts target is Extract<RuntimeDeploymentTarget, { adapterKind: "ecs_service_fargate" }> {
  if (target.adapterKind !== "ecs_service_fargate") {
    throw new DirectApplicationReleaseError(
      "A read-only provider inspector is not configured for this Direct runtime adapter"
    );
  }
}

async function inspectDirectHealthEndpoint(
  target: Extract<RuntimeDeploymentTarget, { adapterKind: "ecs_service_fargate" }>,
  probeHealth: PublicHttpsHealthProbe,
  abortSignal?: AbortSignal
): Promise<boolean> {
  if (target.health.kind === "provider") return true;
  if (target.health.kind !== "https") return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const onAbort = () => controller.abort();
  abortSignal?.addEventListener("abort", onAbort, { once: true });
  try {
    const url = `${target.health.outputUrl.replace(/\/+$/u, "")}/${target.health.path.replace(/^\/+/, "")}`;
    return await probeHealth(url, controller.signal);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    abortSignal?.removeEventListener("abort", onAbort);
  }
}

async function runCodeBuildPhase(input: {
  context: DirectApplicationReleaseContext;
  artifact?: DirectApplicationArtifact;
  release?: DirectApplicationReleaseRecord;
  phase: "prepare" | "deploy" | "cleanup";
  abortSignal?: AbortSignal;
  assumeRole: AssumeDirectReleaseRole;
  createClient: CreateCodeBuildClient;
  wait: WaitForCodeBuildPoll;
}): Promise<{ buildId: string; exports: Map<string, string> }> {
  const credentials = await input.assumeRole({
    ...input.context.connection,
    roleSessionName: `sketchcatch-direct-${input.phase}-${input.context.deployment.id}`,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
  });
  const client = input.createClient({ region: input.context.connection.region, credentials });
  try {
    await assertCodeBuildProjectSource(client, input.context, input.abortSignal);
    const started = await client.send(
      new StartBuildCommand({
        projectName: requireCodeBuildProjectName(input.context),
        sourceVersion: input.context.target.confirmedBuildConfig.confirmedCommitSha,
        ...(renderDirectBuildspec(input.context, input.phase)
          ? { buildspecOverride: renderDirectBuildspec(input.context, input.phase) }
          : {}),
        environmentVariablesOverride: createEnvironmentOverrides(
          input.context,
          input.phase,
          input.artifact,
          input.release
        )
      }) as unknown as { input: Record<string, unknown> },
      input.abortSignal ? { abortSignal: input.abortSignal } : undefined
    );
    const buildId = started.build?.id;
    if (typeof buildId !== "string" || !buildId.trim()) {
      throw new DirectApplicationReleaseError("CodeBuild did not return a build id");
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await client.send(
        new BatchGetBuildsCommand({ ids: [buildId] }) as unknown as {
          input: Record<string, unknown>;
        },
        input.abortSignal ? { abortSignal: input.abortSignal } : undefined
      );
      const build = response.builds?.[0];
      const status = build?.buildStatus;
      if (status === "SUCCEEDED") {
        const exports = new Map<string, string>();
        for (const variable of build?.exportedEnvironmentVariables ?? []) {
          if (typeof variable.name === "string" && typeof variable.value === "string") {
            exports.set(variable.name, variable.value);
          }
        }
        return { buildId, exports };
      }
      if (["FAILED", "FAULT", "STOPPED", "TIMED_OUT"].includes(status ?? "")) {
        throw new DirectApplicationReleaseError(
          `CodeBuild ${input.phase} phase failed with status ${status}`
        );
      }
      await input.wait(5_000, input.abortSignal);
    }
    throw new DirectApplicationReleaseError(`CodeBuild ${input.phase} phase timed out`);
  } finally {
    client.destroy();
  }
}

async function assertCodeBuildProjectSource(
  client: CodeBuildCommandClient,
  context: DirectApplicationReleaseContext,
  abortSignal?: AbortSignal
): Promise<void> {
  const projectName = requireCodeBuildProjectName(context);
  const sourceRepository = context.sourceRepository;
  if (!sourceRepository) {
    throw new DirectApplicationReleaseError(
      "An active GitHub source repository is required for an application release"
    );
  }
  const response = await client.send(
    new BatchGetProjectsCommand({ names: [projectName] }) as unknown as {
      input: Record<string, unknown>;
    },
    abortSignal ? { abortSignal } : undefined
  );
  const project = response.projects?.find((candidate) => candidate.name === projectName);
  const expectedLocation = normalizeGitHubRepositoryLocation(
    sourceRepository.owner,
    sourceRepository.name
  );
  const actualLocation = project?.source?.location
    ? normalizeGitHubLocation(project.source.location)
    : null;
  if (
    !project ||
    project.source?.type !== "GITHUB" ||
    project.source.auth?.type !== "CODECONNECTIONS" ||
    actualLocation !== expectedLocation
  ) {
    throw new DirectApplicationReleaseError(
      "CodeBuild project source repository or GitHub App connection does not match the active project repository"
    );
  }
}

function normalizeGitHubRepositoryLocation(owner: string, name: string): string {
  return `github.com/${owner.toLowerCase()}/${name.toLowerCase().replace(/\.git$/u, "")}`;
}

function normalizeGitHubLocation(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
    const parts = url.pathname.replace(/^\/+|\/+$/gu, "").split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return normalizeGitHubRepositoryLocation(parts[0], parts[1]);
  } catch {
    return null;
  }
}

function createEnvironmentOverrides(
  context: DirectApplicationReleaseContext,
  phase: "prepare" | "deploy" | "cleanup",
  artifact?: DirectApplicationArtifact,
  release?: DirectApplicationReleaseRecord
): EnvironmentVariable[] {
  const build = context.target.confirmedBuildConfig;
  const runtime = context.target.runtimeConfig;
  const values: Array<[string, string | null | undefined]> = [
    ["SKETCHCATCH_RELEASE_PHASE", phase],
    ["SKETCHCATCH_RUNTIME_TARGET_KIND", context.target.runtimeTargetKind],
    ["SKETCHCATCH_CONFIRMED_COMMIT_SHA", build.confirmedCommitSha],
    ["SKETCHCATCH_SOURCE_ROOT", build.sourceRoot],
    ["SKETCHCATCH_DOCKERFILE_PATH", build.dockerfilePath]
  ];
  if (runtime.runtimeTargetKind === "ecs_fargate") {
    values.push(["SKETCHCATCH_ECR_REPOSITORY", runtime.ecrRepositoryName]);
    if (phase !== "prepare") {
      values.push(
        ["SKETCHCATCH_ECS_CLUSTER", runtime.clusterName],
        ["SKETCHCATCH_ECS_SERVICE", runtime.serviceName],
        ["SKETCHCATCH_ECS_CONTAINER", runtime.containerName],
        ["SKETCHCATCH_OUTPUT_URL", runtime.outputUrl],
        ["SKETCHCATCH_HEALTH_CHECK_PATH", build.healthCheckPath ?? "/"]
      );
    }
  } else if (runtime.runtimeTargetKind === "lambda") {
    values.push(
      ["SKETCHCATCH_SAM_TEMPLATE", build.samTemplatePath],
      ["SKETCHCATCH_FUNCTION_LOGICAL_ID", runtime.functionLogicalId],
      ["SKETCHCATCH_LAMBDA_FUNCTION", runtime.functionName],
      ["SKETCHCATCH_LAMBDA_ALIAS", runtime.aliasName],
      ["SKETCHCATCH_CODEDEPLOY_APPLICATION", runtime.codeDeployApplicationName],
      ["SKETCHCATCH_CODEDEPLOY_GROUP", runtime.codeDeployDeploymentGroupName],
      ["SKETCHCATCH_OUTPUT_URL", runtime.outputUrl],
      ["SKETCHCATCH_HEALTH_CHECK_PATH", build.healthCheckPath ?? "/"]
    );
  } else if (runtime.runtimeTargetKind === "ec2_asg") {
    values.push(
      ["SKETCHCATCH_APPSPEC_PATH", build.appSpecPath],
      ["SKETCHCATCH_CODEDEPLOY_APPLICATION", runtime.codeDeployApplicationName],
      ["SKETCHCATCH_CODEDEPLOY_GROUP", runtime.codeDeployDeploymentGroupName],
      ["SKETCHCATCH_ASG_NAME", runtime.autoScalingGroupName],
      ["SKETCHCATCH_OUTPUT_URL", runtime.outputUrl],
      ["SKETCHCATCH_HEALTH_CHECK_PATH", build.healthCheckPath ?? "/"]
    );
  } else {
    values.push(
      ["SKETCHCATCH_INSTALL_PRESET", build.installPreset],
      ["SKETCHCATCH_STATIC_OUTPUT_PATH", build.staticOutputPath],
      ["SKETCHCATCH_STATIC_BUCKET", runtime.hostingBucketName],
      ["SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID", runtime.cloudFrontDistributionId],
      ["SKETCHCATCH_CLOUDFRONT_ORIGIN_ID", runtime.cloudFrontOriginId],
      ["SKETCHCATCH_OUTPUT_URL", runtime.outputUrl]
    );
  }
  if (artifact) {
    const runtimeTarget = context.target.runtimeTarget ??
      normalizeLegacyRuntimeDeploymentTarget(context.target.runtimeConfig, {
        healthCheckPath: context.target.confirmedBuildConfig.healthCheckPath
      });
    const targetIdentity = createDeploymentTargetIdentity({
      contractVersion: "runtime-convergence/v1",
      scope: {
        projectId: context.deployment.projectId,
        provider: "aws",
        accountId: context.connection.accountId,
        region: context.connection.region
      },
      target: runtimeTarget
    });
    values.push(
      ["SKETCHCATCH_ARTIFACT_DIGEST", `sha256:${artifact.digest}`],
      ["SKETCHCATCH_ARTIFACT_REFERENCE", artifact.reference],
      ["SKETCHCATCH_ARTIFACT_FINGERPRINT", artifact.artifactFingerprint],
      [
        "SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT",
        targetIdentity.deploymentTargetFingerprint
      ]
    );
  }
  if (release?.providerRevision) {
    values.push(
      ["SKETCHCATCH_CURRENT_PROVIDER_REVISION", release.providerRevision.revisionId],
      [
        "SKETCHCATCH_PREVIOUS_TASK_DEFINITION",
        metadataString(release.providerRevision.metadata, "previousTaskDefinitionArn")
      ],
      [
        "SKETCHCATCH_PREVIOUS_LAMBDA_VERSION",
        metadataString(release.providerRevision.metadata, "previousVersion")
      ],
      [
        "SKETCHCATCH_PREVIOUS_ARTIFACT_URI",
        metadataString(release.providerRevision.metadata, "previousArtifactUri")
      ],
      [
        "SKETCHCATCH_PREVIOUS_ARTIFACT_VERSION_ID",
        metadataString(release.providerRevision.metadata, "previousArtifactVersionId")
      ],
      [
        "SKETCHCATCH_PREVIOUS_RELEASE_PREFIX",
        metadataString(release.providerRevision.metadata, "previousReleasePrefix")
      ],
      [
        "SKETCHCATCH_RELEASE_PREFIX",
        metadataString(release.providerRevision.metadata, "releasePrefix")
      ],
      [
        "SKETCHCATCH_MANIFEST_VERSION_ID",
        metadataString(release.providerRevision.metadata, "manifestVersionId")
      ]
    );
  }
  return values
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, value]) => ({ name, value, type: "PLAINTEXT" }));
}

function renderDirectBuildspec(
  context: DirectApplicationReleaseContext,
  phase: "prepare" | "deploy" | "cleanup"
): string | undefined {
  if (context.target.runtimeTargetKind !== "ecs_fargate") return undefined;
  if (phase === "prepare") return renderEcsPrepareBuildspec();
  return phase === "deploy" ? renderEcsDeployBuildspec() : renderEcsCleanupBuildspec();
}

function renderEcsPrepareBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  exported-variables:
    - SKETCHCATCH_COMMIT_SHA
    - SKETCHCATCH_ARTIFACT_DIGEST
    - SKETCHCATCH_ARTIFACT_REFERENCE

phases:
  pre_build:
    commands:
      - set -euo pipefail
      - test "$CODEBUILD_RESOLVED_SOURCE_VERSION" = "$SKETCHCATCH_CONFIRMED_COMMIT_SHA"
      - test -f "$SKETCHCATCH_DOCKERFILE_PATH"
      - AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
      - ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$SKETCHCATCH_ECR_REPOSITORY"
      - aws ecr describe-repositories --repository-names "$SKETCHCATCH_ECR_REPOSITORY" >/dev/null
      - aws ecr get-login-password | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com"
  build:
    commands:
      - docker build --file "$SKETCHCATCH_DOCKERFILE_PATH" --tag "$ECR_URI:$SKETCHCATCH_CONFIRMED_COMMIT_SHA" "$SKETCHCATCH_SOURCE_ROOT"
  post_build:
    commands:
      - docker push "$ECR_URI:$SKETCHCATCH_CONFIRMED_COMMIT_SHA"
      - IMAGE_DIGEST=$(aws ecr describe-images --repository-name "$SKETCHCATCH_ECR_REPOSITORY" --image-ids imageTag="$SKETCHCATCH_CONFIRMED_COMMIT_SHA" --query 'imageDetails[0].imageDigest' --output text)
      - test "$(aws ecr describe-images --repository-name "$SKETCHCATCH_ECR_REPOSITORY" --image-ids imageDigest="$IMAGE_DIGEST" --query 'imageDetails[0].imageDigest' --output text)" = "$IMAGE_DIGEST"
      - SKETCHCATCH_COMMIT_SHA="$SKETCHCATCH_CONFIRMED_COMMIT_SHA"
      - SKETCHCATCH_ARTIFACT_DIGEST="$IMAGE_DIGEST"
      - SKETCHCATCH_ARTIFACT_REFERENCE="$ECR_URI@$IMAGE_DIGEST"
`;
}

function renderEcsDeployBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  exported-variables:
    - SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64

phases:
  build:
    commands:
      - |
        set -euo pipefail
        test "$CODEBUILD_RESOLVED_SOURCE_VERSION" = "$SKETCHCATCH_CONFIRMED_COMMIT_SHA"
        [[ "$SKETCHCATCH_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]
        [[ "$SKETCHCATCH_ARTIFACT_REFERENCE" == *@"$SKETCHCATCH_ARTIFACT_DIGEST" ]]
        aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --output json > service-before.json
        PREVIOUS_TASK_DEFINITION=$(jq -r '.services[0].taskDefinition // empty' service-before.json)
        test -n "$PREVIOUS_TASK_DEFINITION"
        aws ecs describe-task-definition --task-definition "$PREVIOUS_TASK_DEFINITION" --query taskDefinition --output json > task-before.json
        python3 - "$SKETCHCATCH_ECS_CONTAINER" "$SKETCHCATCH_ARTIFACT_REFERENCE" <<'PY'
        import json, sys
        container_name, image_uri = sys.argv[1:]
        with open("task-before.json", encoding="utf-8") as handle:
            task = json.load(handle)
        for key in ["taskDefinitionArn", "revision", "status", "requiresAttributes", "compatibilities", "registeredAt", "registeredBy", "deregisteredAt"]:
            task.pop(key, None)
        matches = [item for item in task.get("containerDefinitions", []) if item.get("name") == container_name]
        if len(matches) != 1:
            raise SystemExit("confirmed ECS container was not found exactly once")
        matches[0]["image"] = image_uri
        with open("task-next.json", "w", encoding="utf-8") as handle:
            json.dump(task, handle)
        PY
        NEW_TASK_DEFINITION=$(aws ecs register-task-definition --cli-input-json file://task-next.json --tags key=sketchcatch:runtime-convergence,value="sketchcatch:artifact=$SKETCHCATCH_ARTIFACT_FINGERPRINT;target=$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT" --query taskDefinition.taskDefinitionArn --output text)
        set +e
        aws ecs update-service --cluster "$SKETCHCATCH_ECS_CLUSTER" --service "$SKETCHCATCH_ECS_SERVICE" --task-definition "$NEW_TASK_DEFINITION" --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' --force-new-deployment >/dev/null
        aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
        RELEASE_STATUS=$?
        HEALTH_URL="\${SKETCHCATCH_OUTPUT_URL%/}\${SKETCHCATCH_HEALTH_CHECK_PATH}"
        if [ "$RELEASE_STATUS" -eq 0 ]; then
          curl --fail --show-error --max-time 10 --max-redirs 0 --proto '=https' "$HEALTH_URL" >/dev/null
          RELEASE_STATUS=$?
        fi
        set -e
        OUTCOME=succeeded
        RESTORED_TASK_DEFINITION=""
        if [ "$RELEASE_STATUS" -ne 0 ]; then
          aws ecs update-service --cluster "$SKETCHCATCH_ECS_CLUSTER" --service "$SKETCHCATCH_ECS_SERVICE" --task-definition "$PREVIOUS_TASK_DEFINITION" --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' --force-new-deployment >/dev/null
          aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
          OUTCOME=rolled_back
          RESTORED_TASK_DEFINITION="$PREVIOUS_TASK_DEFINITION"
        fi
        export PREVIOUS_TASK_DEFINITION NEW_TASK_DEFINITION OUTCOME RESTORED_TASK_DEFINITION
        SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=$(python3 - <<'PY'
        import base64, json, os
        evidence = {
            "schemaVersion": 1,
            "runtimeTargetKind": "ecs_fargate",
            "outcome": os.environ["OUTCOME"],
            "commitSha": os.environ["SKETCHCATCH_CONFIRMED_COMMIT_SHA"],
            "imageDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"],
            "imageUri": os.environ["SKETCHCATCH_ARTIFACT_REFERENCE"],
            "clusterName": os.environ["SKETCHCATCH_ECS_CLUSTER"],
            "serviceName": os.environ["SKETCHCATCH_ECS_SERVICE"],
            "containerName": os.environ["SKETCHCATCH_ECS_CONTAINER"],
            "taskDefinitionArn": os.environ["NEW_TASK_DEFINITION"],
            "previousTaskDefinitionArn": os.environ["PREVIOUS_TASK_DEFINITION"],
            "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"]
        }
        if os.environ["RESTORED_TASK_DEFINITION"]:
            evidence["restoredTaskDefinitionArn"] = os.environ["RESTORED_TASK_DEFINITION"]
        print(base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode())
        PY
        )
`;
}

function renderEcsCleanupBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  exported-variables:
    - SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64

phases:
  build:
    commands:
      - |
        set -euo pipefail
        test -n "$SKETCHCATCH_PREVIOUS_TASK_DEFINITION"
        ACTIVE_TASK_DEFINITION=$(aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --query 'services[0].taskDefinition' --output text)
        test "$ACTIVE_TASK_DEFINITION" = "$SKETCHCATCH_CURRENT_PROVIDER_REVISION"
        aws ecs update-service --cluster "$SKETCHCATCH_ECS_CLUSTER" --service "$SKETCHCATCH_ECS_SERVICE" --task-definition "$SKETCHCATCH_PREVIOUS_TASK_DEFINITION" --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' --force-new-deployment >/dev/null
        aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
        RESTORED_TASK_DEFINITION=$(aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --query 'services[0].taskDefinition' --output text)
        test "$RESTORED_TASK_DEFINITION" = "$SKETCHCATCH_PREVIOUS_TASK_DEFINITION"
        export ACTIVE_TASK_DEFINITION RESTORED_TASK_DEFINITION
        SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=$(python3 - <<'PY'
        import base64, json, os
        evidence = {
            "schemaVersion": 1,
            "runtimeTargetKind": "ecs_fargate",
            "outcome": "rolled_back",
            "commitSha": os.environ["SKETCHCATCH_CONFIRMED_COMMIT_SHA"],
            "imageDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"],
            "imageUri": os.environ["SKETCHCATCH_ARTIFACT_REFERENCE"],
            "clusterName": os.environ["SKETCHCATCH_ECS_CLUSTER"],
            "serviceName": os.environ["SKETCHCATCH_ECS_SERVICE"],
            "containerName": os.environ["SKETCHCATCH_ECS_CONTAINER"],
            "taskDefinitionArn": os.environ["ACTIVE_TASK_DEFINITION"],
            "previousTaskDefinitionArn": os.environ["SKETCHCATCH_PREVIOUS_TASK_DEFINITION"],
            "restoredTaskDefinitionArn": os.environ["RESTORED_TASK_DEFINITION"],
            "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"]
        }
        print(base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode())
        PY
        )
`;
}

function metadataString(metadata: Record<string, JsonValue>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requireCodeBuildProjectName(context: DirectApplicationReleaseContext): string {
  const projectName = context.target.runtimeConfig.codeBuildProjectName;
  if (!projectName || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,254}$/.test(projectName)) {
    throw new DirectApplicationReleaseError(
      "A confirmed CodeBuild project is required for Direct application release"
    );
  }
  return projectName;
}

function requireExport(exports: Map<string, string>, name: string): string {
  const value = exports.get(name)?.trim();
  if (!value) {
    throw new DirectApplicationReleaseError(`CodeBuild export ${name} is missing`);
  }
  return value;
}

function normalizeDigest(value: string): string {
  const digest = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new DirectApplicationReleaseError("CodeBuild artifact digest is not a SHA-256 digest");
  }
  return digest;
}

function releaseEvidenceExportName(runtimeTargetKind: RuntimeTargetKind): string {
  if (runtimeTargetKind === "ecs_fargate") return "SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64";
  if (runtimeTargetKind === "lambda") return "SKETCHCATCH_LAMBDA_RELEASE_EVIDENCE_B64";
  if (runtimeTargetKind === "ec2_asg") return "SKETCHCATCH_EC2_RELEASE_EVIDENCE_B64";
  return "SKETCHCATCH_STATIC_RELEASE_EVIDENCE_B64";
}

function parseReleaseEvidence(
  encoded: string,
  expectedRuntimeTargetKind: RuntimeTargetKind
): GitOpsReleaseEvidence {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new DirectApplicationReleaseError("CodeBuild release evidence is not valid base64 JSON");
  }
  if (
    !value ||
    typeof value !== "object" ||
    ![1, 2].includes(Number((value as { schemaVersion?: unknown }).schemaVersion)) ||
    (value as { runtimeTargetKind?: unknown }).runtimeTargetKind !== expectedRuntimeTargetKind
  ) {
    throw new DirectApplicationReleaseError(
      "CodeBuild release evidence does not match the confirmed runtime"
    );
  }
  return value as GitOpsReleaseEvidence;
}

function waitForPoll(milliseconds: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortSignal.reason ?? new Error("Direct application release was cancelled"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortSignal?.reason ?? new Error("Direct application release was cancelled"));
    };
    const timeout = setTimeout(() => {
      abortSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}
