import assert from "node:assert/strict";
import test from "node:test";

import {
  createEcsFargateRuntimeCoordinatesFingerprint,
  reconcileEcsFargateRuntimeConfig,
  resolveEcsFargateRuntimeOutputs
} from "./ecs-fargate-output-reconciliation.js";
import {
  DirectApplicationReleaseError,
  createPostgresDirectApplicationReleaseRepository,
  prepareDirectApplicationRelease,
  reconcileDirectApplicationReleaseOutput,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationOutputReconciliationRepository,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";
import { resolveAwsDeploymentTargetIdentity } from "../runtime-convergence/deployment-target-identity.js";

test("Full-stack ECS preparation stores a pending artifact before its output URL exists", async () => {
  let prepareCalls = 0;
  let savedRelease:
    | Parameters<DirectApplicationReleaseRepository["savePreparedRelease"]>[0]
    | null = null;
  const context = {
    sourceRepository: {
      id: "repository-1",
      provider: "github",
      installationId: "installation-1",
      owner: "NearthYou",
      name: "SketchCatch"
    },
    deployment: {
      id: "deployment-1",
      projectId: "project-1",
      scope: "full_stack",
      source: "direct",
      targetKind: "ecs_fargate"
    },
    target: {
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig: {
        sourceRoot: ".",
        evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
        installPreset: "none",
        buildPreset: "docker_build",
        artifactOutputPath: null,
        runtimeEntrypoint: null,
        healthCheckPath: "/",
        dockerfilePath: "Dockerfile",
        packageManifestPath: null,
        samTemplatePath: null,
        appSpecPath: null,
        staticOutputPath: null,
        exactSemVerTag: null,
        manifestVersion: null,
        confirmedCommitSha: "a".repeat(40),
        confirmedAt: "2026-07-15T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "audience-live-check-app-build",
        ecrRepositoryName: "audience-live-check-app",
        clusterName: "audience-live-check-cluster",
        serviceName: "audience-live-check-service",
        containerName: "web",
        outputUrl: null
      }
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  } satisfies DirectApplicationReleaseContext;
  const repository = {
    async findContext() {
      return context;
    },
    async findRelease() {
      return undefined;
    },
    async savePreparedRelease(
      input: Parameters<DirectApplicationReleaseRepository["savePreparedRelease"]>[0]
    ) {
      savedRelease = input;
      return input;
    }
  } as unknown as DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() {
      prepareCalls += 1;
      return {
        commitSha: "a".repeat(40),
        digest: "b".repeat(64),
        reference: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/app@sha256:digest",
        buildRevisionId: "build-1",
        metadata: { phase: "prepare" }
      };
    }
  } as unknown as DirectApplicationReleaseGateway;

  const release = await prepareDirectApplicationRelease(
    { deploymentId: "deployment-1", userId: "user-1" },
    repository,
    gateway,
    () => "release-1",
    () => new Date("2026-07-15T01:00:00.000Z")
  );

  assert.equal(prepareCalls, 1);
  assert.equal(release?.status, "pending");
  assert.equal(
    release?.providerRevision?.metadata["ecsRuntimeCoordinatesFingerprint"],
    createEcsFargateRuntimeCoordinatesFingerprint(context.target.runtimeConfig)
  );
  assert.equal(release?.providerRevision?.metadata["ecsPreparedOutputUrl"], null);
  assert.equal(release, savedRelease);
});

test("Full-stack ECS retry refreshes a failed artifact and target fingerprints after output synchronization", async () => {
  const initialRuntimeConfig = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "sketchcatch-5ac411f8-build",
    ecrRepositoryName: "audience-live-check-app",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "web",
    outputUrl: null
  };
  const runtimeConfig = reconcileEcsFargateRuntimeConfig(initialRuntimeConfig, {
    expectedCoordinatesFingerprint:
      createEcsFargateRuntimeCoordinatesFingerprint(initialRuntimeConfig),
    outputs: resolveEcsFargateRuntimeOutputs(createEcsWebTerraformOutputs())
  }).runtimeConfig;
  const currentFingerprint = createEcsFargateRuntimeCoordinatesFingerprint(runtimeConfig);
  const existing = {
    id: "release-1",
    deploymentId: "deployment-1",
    status: "failed",
    deploymentTargetFingerprint: resolveAwsDeploymentTargetIdentity({
      projectId: "project-1",
      accountId: "123456789012",
      region: "ap-northeast-2",
      runtimeConfig: initialRuntimeConfig,
      healthCheckPath: undefined
    }).deploymentTargetFingerprint,
    providerRevision: {
      provider: "aws",
      resourceType: "codebuild_artifact",
      revisionId: "build-1",
      artifactReference: "s3://release-candidate/artifact",
      metadata: { ecsRuntimeCoordinatesFingerprint: "stale-demo-fingerprint" }
    }
  } as unknown as Awaited<ReturnType<DirectApplicationReleaseRepository["findRelease"]>>;
  let resetInput:
    | Parameters<DirectApplicationReleaseRepository["resetReleaseForRetry"]>[0]
    | undefined;
  const repository = {
    async findContext() {
      return {
        sourceRepository: {
          provider: "github",
          installationId: "installation-1",
          owner: "jh-9999",
          name: "audience-live-check"
        },
        deployment: {
          id: "deployment-1",
          projectId: "project-1",
          scope: "full_stack",
          source: "direct",
          targetKind: "ecs_fargate"
        },
        target: {
          runtimeTargetKind: "ecs_fargate",
          confirmedBuildConfig: {
            confirmedCommitSha: "a".repeat(40)
          },
          runtimeConfig
        },
        connection: {
          accountId: "123456789012",
          roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
          externalId: "external-id",
          region: "ap-northeast-2"
        }
      } as unknown as DirectApplicationReleaseContext;
    },
    async findRelease() {
      return existing;
    },
    async resetReleaseForRetry(
      input: Parameters<DirectApplicationReleaseRepository["resetReleaseForRetry"]>[0]
    ) {
      resetInput = input;
      return {
        ...existing,
        providerRevision: input.providerRevision,
        updatedAt: input.updatedAt
      };
    }
  } as unknown as DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() {
      throw new Error("unchanged immutable artifact must be reused");
    }
  } as unknown as DirectApplicationReleaseGateway;

  const release = await prepareDirectApplicationRelease(
    { deploymentId: "deployment-1", userId: "user-1" },
    repository,
    gateway,
    () => "unused",
    () => new Date("2026-07-16T10:00:00.000Z")
  );

  assert.equal(
    resetInput?.providerRevision.metadata["ecsRuntimeCoordinatesFingerprint"],
    currentFingerprint
  );
  assert.equal(
    resetInput?.providerRevision.metadata["ecsPreparedOutputUrl"],
    runtimeConfig.outputUrl
  );
  assert.equal(
    resetInput?.deploymentTargetFingerprint,
    resolveAwsDeploymentTargetIdentity({
      projectId: "project-1",
      accountId: "123456789012",
      region: "ap-northeast-2",
      runtimeConfig,
      healthCheckPath: undefined
    }).deploymentTargetFingerprint
  );
  assert.equal(
    release?.providerRevision?.metadata["ecsRuntimeCoordinatesFingerprint"],
    currentFingerprint
  );
});

test("Full-stack ECS preparation upgrades a legacy pending release with its prepared output URL", async () => {
  const baseRuntimeConfig = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "sketchcatch-5ac411f8-build",
    ecrRepositoryName: "audience-live-check-app",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "web",
    outputUrl: null
  };
  const runtimeConfig = reconcileEcsFargateRuntimeConfig(baseRuntimeConfig, {
    expectedCoordinatesFingerprint:
      createEcsFargateRuntimeCoordinatesFingerprint(baseRuntimeConfig),
    outputs: resolveEcsFargateRuntimeOutputs(createEcsWebTerraformOutputs())
  }).runtimeConfig;
  const targetIdentity = resolveAwsDeploymentTargetIdentity({
    projectId: "project-1",
    accountId: "123456789012",
    region: "ap-northeast-2",
    runtimeConfig,
    healthCheckPath: "/health"
  });
  const existing = {
    id: "release-legacy",
    deploymentId: "deployment-1",
    status: "pending",
    deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
    providerRevision: {
      provider: "aws",
      resourceType: "codebuild_artifact",
      revisionId: "build-1",
      artifactReference: "s3://release-candidate/artifact",
      metadata: {
        ecsRuntimeCoordinatesFingerprint:
          createEcsFargateRuntimeCoordinatesFingerprint(runtimeConfig)
      }
    }
  } as unknown as Awaited<ReturnType<DirectApplicationReleaseRepository["findRelease"]>>;
  let resetInput:
    | Parameters<DirectApplicationReleaseRepository["resetReleaseForRetry"]>[0]
    | undefined;
  const repository = {
    async findContext() {
      return {
        sourceRepository: {
          provider: "github",
          installationId: "installation-1",
          owner: "jh-9999",
          name: "audience-live-check"
        },
        deployment: {
          id: "deployment-1",
          projectId: "project-1",
          scope: "full_stack",
          source: "direct",
          targetKind: "ecs_fargate"
        },
        target: {
          runtimeTargetKind: "ecs_fargate",
          confirmedBuildConfig: {
            confirmedCommitSha: "a".repeat(40),
            healthCheckPath: "/health"
          },
          runtimeConfig
        },
        connection: {
          accountId: "123456789012",
          roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
          externalId: "external-id",
          region: "ap-northeast-2"
        }
      } as unknown as DirectApplicationReleaseContext;
    },
    async findRelease() {
      return existing;
    },
    async resetReleaseForRetry(
      input: Parameters<DirectApplicationReleaseRepository["resetReleaseForRetry"]>[0]
    ) {
      resetInput = input;
      return { ...existing, providerRevision: input.providerRevision };
    }
  } as unknown as DirectApplicationReleaseRepository;

  await prepareDirectApplicationRelease(
    { deploymentId: "deployment-1", userId: "user-1" },
    repository,
    {} as DirectApplicationReleaseGateway,
    () => "unused"
  );

  assert.equal(
    resetInput?.providerRevision.metadata["ecsPreparedOutputUrl"],
    runtimeConfig.outputUrl
  );
});

test("Direct application preparation fails before CodeBuild without an output URL", async () => {
  let prepareCalls = 0;
  const context = {
    sourceRepository: {
      id: "repository-1",
      provider: "github",
      installationId: "installation-1",
      owner: "NearthYou",
      name: "SketchCatch"
    },
    deployment: {
      id: "deployment-1",
      projectId: "project-1",
      scope: "application",
      source: "direct",
      targetKind: "ecs_fargate"
    },
    target: {
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig: {
        sourceRoot: ".",
        evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
        installPreset: "none",
        buildPreset: "docker_build",
        artifactOutputPath: null,
        runtimeEntrypoint: null,
        healthCheckPath: "/",
        dockerfilePath: "Dockerfile",
        packageManifestPath: null,
        samTemplatePath: null,
        appSpecPath: null,
        staticOutputPath: null,
        exactSemVerTag: null,
        manifestVersion: null,
        confirmedCommitSha: "a".repeat(40),
        confirmedAt: "2026-07-15T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "audience-live-check-app-build",
        ecrRepositoryName: "audience-live-check-app",
        clusterName: "audience-live-check-cluster",
        serviceName: "audience-live-check-service",
        containerName: "web",
        outputUrl: null
      }
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  } satisfies DirectApplicationReleaseContext;
  const repository = {
    async findContext() {
      return context;
    }
  } as unknown as DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() {
      prepareCalls += 1;
      throw new Error("should not run");
    }
  } as unknown as DirectApplicationReleaseGateway;

  await assert.rejects(
    prepareDirectApplicationRelease(
      { deploymentId: "deployment-1", userId: "user-1" },
      repository,
      gateway,
      () => "release-1"
    ),
    (error: unknown) =>
      error instanceof DirectApplicationReleaseError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_REQUIRED"
  );
  assert.equal(prepareCalls, 0);
});

test("Full-stack ECS output reconciliation uses the prepared coordinates fingerprint", async () => {
  const runtimeConfig = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "audience-live-check-app-build",
    ecrRepositoryName: "audience-live-check-app",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "web",
    outputUrl: null
  };
  const fingerprint = createEcsFargateRuntimeCoordinatesFingerprint(runtimeConfig);
  let reconcileInput:
    | Parameters<DirectApplicationOutputReconciliationRepository["reconcileEcsFargateOutput"]>[0]
    | undefined;
  const repository = {
    async findContext() {
      return {
        sourceRepository: {
          id: "repository-1",
          provider: "github",
          installationId: "installation-1",
          owner: "NearthYou",
          name: "SketchCatch"
        },
        deployment: {
          id: "deployment-1",
          projectId: "project-1",
          scope: "full_stack",
          source: "direct",
          targetKind: "ecs_fargate"
        },
        target: {
          runtimeTargetKind: "ecs_fargate",
          confirmedBuildConfig: {},
          runtimeConfig
        },
        connection: {
          accountId: "123456789012",
          roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
          externalId: "external-id",
          region: "ap-northeast-2"
        }
      } as unknown as DirectApplicationReleaseContext;
    },
    async findRelease() {
      return {
        id: "release-1",
        deploymentTargetFingerprint: "d".repeat(64),
        status: "pending",
        providerRevision: {
          provider: "aws",
          resourceType: "codebuild_artifact",
          revisionId: "build-1",
          artifactReference: "ecr://artifact",
          metadata: { ecsRuntimeCoordinatesFingerprint: fingerprint }
        }
      };
    },
    async reconcileEcsFargateOutput(
      input: Parameters<
        DirectApplicationOutputReconciliationRepository["reconcileEcsFargateOutput"]
      >[0]
    ) {
      reconcileInput = input;
      return "updated" as const;
    }
  } as unknown as DirectApplicationOutputReconciliationRepository;
  const outputs = createEcsWebTerraformOutputs();
  const resolvedOutputs = resolveEcsFargateRuntimeOutputs(outputs);

  const outputUrl = await reconcileDirectApplicationReleaseOutput(
    {
      deploymentId: "deployment-1",
      userId: "user-1",
      outputs,
      resources: createEcsWebTerraformResources(resolvedOutputs),
      accountId: "123456789012",
      region: "ap-northeast-2"
    },
    repository,
    () => new Date("2026-07-15T02:00:00.000Z")
  );

  assert.equal(outputUrl, "https://d111111abcdef8.cloudfront.net");
  assert.deepEqual(reconcileInput, {
    releaseId: "release-1",
    projectId: "project-1",
    expectedCoordinatesFingerprint: fingerprint,
    outputs: resolvedOutputs,
    updatedAt: new Date("2026-07-15T02:00:00.000Z")
  });
});

test("Terraform output synchronization repairs only the prepared target for the same AWS scope", async () => {
  const initialRuntimeConfig = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "audience-live-check-app-build",
    ecrRepositoryName: "audience-live-check-app",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "web",
    outputUrl: null
  };
  const outputs = resolveEcsFargateRuntimeOutputs(createEcsWebTerraformOutputs());
  const runtimeConfig = reconcileEcsFargateRuntimeConfig(initialRuntimeConfig, {
    expectedCoordinatesFingerprint:
      createEcsFargateRuntimeCoordinatesFingerprint(initialRuntimeConfig),
    outputs
  }).runtimeConfig;
  const preparedCoordinatesFingerprint =
    createEcsFargateRuntimeCoordinatesFingerprint(initialRuntimeConfig);
  const reconciledCoordinatesFingerprint =
    createEcsFargateRuntimeCoordinatesFingerprint(runtimeConfig);
  const preparedTargetIdentity = resolveAwsDeploymentTargetIdentity({
    projectId: "project-1",
    accountId: "123456789012",
    region: "ap-northeast-2",
    runtimeConfig: initialRuntimeConfig,
    healthCheckPath: "/health"
  });
  const persistedUpdates: Record<string, unknown>[] = [];
  const targetRow = {
    accountId: "123456789012",
    confirmedBuildConfig: { healthCheckPath: "/health" },
    deploymentTargetFingerprint: "f".repeat(64),
    region: "ap-northeast-2",
    runtimeConfig,
    runtimeTarget: {
      adapterKind: "ecs_service_fargate",
      orchestrator: {
        kind: "ecs_service",
        clusterName: "stale-cluster",
        serviceName: "stale-service"
      }
    },
    runtimeTargetKind: "ecs_fargate"
  };
  const preparedReleaseRow = {
    id: "release-1",
    deploymentTargetFingerprint: preparedTargetIdentity.deploymentTargetFingerprint,
    providerRevision: {
      provider: "aws",
      resourceType: "codebuild_artifact",
      revisionId: "build-1",
      artifactReference: "ecr://artifact",
      metadata: { ecsRuntimeCoordinatesFingerprint: preparedCoordinatesFingerprint }
    }
  };
  const updateQuery = {
    set(values: Record<string, unknown>) {
      persistedUpdates.push(values);
      return this;
    },
    where() {
      return this;
    },
    async returning() {
      return [{ id: "release-1", projectId: "project-1" }];
    }
  };
  let selectCount = 0;
  const repository = createPostgresDirectApplicationReleaseRepository({
    async transaction(operation: (transaction: unknown) => Promise<unknown>) {
      return operation({
        select() {
          const rows = selectCount++ === 0 ? [targetRow] : [preparedReleaseRow];
          const query = {
            from() {
              return this;
            },
            innerJoin() {
              return this;
            },
            where() {
              return this;
            },
            async for() {
              return rows;
            }
          };
          return query;
        },
        update() {
          return updateQuery;
        }
      });
    }
  } as never);

  const result = await repository.reconcileEcsFargateOutput({
    releaseId: "release-1",
    projectId: "project-1",
    expectedCoordinatesFingerprint: preparedCoordinatesFingerprint,
    outputs,
    updatedAt: new Date("2026-07-18T12:00:00.000Z")
  });

  const expectedIdentity = resolveAwsDeploymentTargetIdentity({
    projectId: "project-1",
    accountId: "123456789012",
    region: "ap-northeast-2",
    runtimeConfig,
    healthCheckPath: "/health"
  });
  assert.equal(result, "updated");
  assert.equal(persistedUpdates.length, 2);
  const [persistedTarget, persistedRelease] = persistedUpdates;
  assert.ok(persistedTarget);
  assert.ok(persistedRelease);
  assert.deepEqual(persistedTarget.runtimeConfig, runtimeConfig);
  assert.deepEqual(persistedTarget.runtimeTarget, expectedIdentity.target);
  assert.equal(
    persistedTarget.deploymentTargetFingerprint,
    expectedIdentity.deploymentTargetFingerprint
  );
  assert.equal(
    persistedRelease.deploymentTargetFingerprint,
    expectedIdentity.deploymentTargetFingerprint
  );
  assert.equal(
    (
      persistedRelease.providerRevision as {
        metadata: { ecsRuntimeCoordinatesFingerprint: string };
      }
    ).metadata.ecsRuntimeCoordinatesFingerprint,
    reconciledCoordinatesFingerprint
  );

  selectCount = 0;
  persistedUpdates.length = 0;
  preparedReleaseRow.deploymentTargetFingerprint = resolveAwsDeploymentTargetIdentity({
    projectId: "project-1",
    accountId: "999999999999",
    region: "ap-northeast-2",
    runtimeConfig: initialRuntimeConfig,
    healthCheckPath: "/health"
  }).deploymentTargetFingerprint;
  await assert.rejects(
    repository.reconcileEcsFargateOutput({
      releaseId: "release-1",
      projectId: "project-1",
      expectedCoordinatesFingerprint: preparedCoordinatesFingerprint,
      outputs,
      updatedAt: new Date("2026-07-18T12:01:00.000Z")
    }),
    (error: unknown) =>
      error instanceof DirectApplicationReleaseError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_CONFLICT"
  );
  assert.equal(persistedUpdates.length, 0);
});

test("Terraform output synchronization repairs a redeploy after only the target stored replacement outputs", async () => {
  const baseRuntimeConfig = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "audience-live-check-app-build",
    ecrRepositoryName: "audience-live-check-app",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "web",
    outputUrl: null
  };
  const previousRuntimeConfig = reconcileEcsFargateRuntimeConfig(baseRuntimeConfig, {
    expectedCoordinatesFingerprint:
      createEcsFargateRuntimeCoordinatesFingerprint(baseRuntimeConfig),
    outputs: resolveEcsFargateRuntimeOutputs(createEcsWebTerraformOutputs())
  }).runtimeConfig;
  const replacementOutputs = resolveEcsFargateRuntimeOutputs(
    createEcsWebTerraformOutputs({
      static_bucket_name: "audience-live-check-web-assets-replacement",
      cloudfront_distribution_id: "E0987654321",
      cloudfront_domain_name: "d222222abcdef8.cloudfront.net",
      cloudfront_url: "https://d222222abcdef8.cloudfront.net",
      ecs_task_definition_arn:
        "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/audience-live-check-task:2",
      alb_arn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/2",
      alb_dns_name: "audience-live-check-v2.ap-northeast-2.elb.amazonaws.com",
      target_group_arn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/audience-live-check/2",
      api_origin_url: "http://audience-live-check-v2.ap-northeast-2.elb.amazonaws.com"
    })
  );
  const replacementRuntimeConfig = reconcileEcsFargateRuntimeConfig(previousRuntimeConfig, {
    expectedCoordinatesFingerprint:
      createEcsFargateRuntimeCoordinatesFingerprint(previousRuntimeConfig),
    outputs: replacementOutputs
  }).runtimeConfig;
  const previousTargetIdentity = resolveAwsDeploymentTargetIdentity({
    projectId: "project-1",
    accountId: "123456789012",
    region: "ap-northeast-2",
    runtimeConfig: previousRuntimeConfig,
    healthCheckPath: "/health"
  });
  const persistedUpdates: Record<string, unknown>[] = [];
  const targetRow = {
    accountId: "123456789012",
    confirmedBuildConfig: { healthCheckPath: "/health" },
    deploymentTargetFingerprint: "f".repeat(64),
    region: "ap-northeast-2",
    runtimeConfig: replacementRuntimeConfig,
    runtimeTarget: previousTargetIdentity.target,
    runtimeTargetKind: "ecs_fargate"
  };
  const preparedReleaseRow = {
    id: "release-1",
    deploymentTargetFingerprint: previousTargetIdentity.deploymentTargetFingerprint,
    providerRevision: {
      provider: "aws",
      resourceType: "codebuild_artifact",
      revisionId: "build-1",
      artifactReference: "ecr://artifact",
      metadata: {
        ecsRuntimeCoordinatesFingerprint:
          createEcsFargateRuntimeCoordinatesFingerprint(previousRuntimeConfig),
        ecsPreparedOutputUrl: previousRuntimeConfig.outputUrl
      }
    }
  };
  const updateQuery = {
    set(values: Record<string, unknown>) {
      persistedUpdates.push(values);
      return this;
    },
    where() {
      return this;
    },
    async returning() {
      return [{ id: "release-1", projectId: "project-1" }];
    }
  };
  let selectCount = 0;
  const repository = createPostgresDirectApplicationReleaseRepository({
    async transaction(operation: (transaction: unknown) => Promise<unknown>) {
      return operation({
        select() {
          const rows = selectCount++ === 0 ? [targetRow] : [preparedReleaseRow];
          return {
            from() {
              return this;
            },
            innerJoin() {
              return this;
            },
            where() {
              return this;
            },
            async for() {
              return rows;
            }
          };
        },
        update() {
          return updateQuery;
        }
      });
    }
  } as never);

  const result = await repository.reconcileEcsFargateOutput({
    releaseId: "release-1",
    projectId: "project-1",
    expectedCoordinatesFingerprint:
      createEcsFargateRuntimeCoordinatesFingerprint(previousRuntimeConfig),
    outputs: replacementOutputs,
    updatedAt: new Date("2026-07-18T13:00:00.000Z")
  });

  const expectedIdentity = resolveAwsDeploymentTargetIdentity({
    projectId: "project-1",
    accountId: "123456789012",
    region: "ap-northeast-2",
    runtimeConfig: replacementRuntimeConfig,
    healthCheckPath: "/health"
  });
  assert.equal(result, "updated");
  assert.equal(persistedUpdates.length, 2);
  assert.equal(
    persistedUpdates[0]?.deploymentTargetFingerprint,
    expectedIdentity.deploymentTargetFingerprint
  );
  assert.equal(
    persistedUpdates[1]?.deploymentTargetFingerprint,
    expectedIdentity.deploymentTargetFingerprint
  );
});

test("Direct application preparation rejects a null runtime config without a TypeError", async () => {
  let prepareCalls = 0;
  const context = {
    sourceRepository: {
      id: "repository-1",
      provider: "github",
      installationId: "installation-1",
      owner: "NearthYou",
      name: "SketchCatch"
    },
    deployment: {
      id: "deployment-1",
      projectId: "project-1",
      scope: "application",
      source: "direct",
      targetKind: "ecs_fargate"
    },
    target: {
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig: {},
      runtimeConfig: null
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  } as unknown as DirectApplicationReleaseContext;
  const repository = {
    async findContext() {
      return context;
    }
  } as unknown as DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() {
      prepareCalls += 1;
      throw new Error("should not run");
    }
  } as unknown as DirectApplicationReleaseGateway;

  await assert.rejects(
    prepareDirectApplicationRelease(
      { deploymentId: "deployment-1", userId: "user-1" },
      repository,
      gateway,
      () => "release-1"
    ),
    (error: unknown) =>
      error instanceof DirectApplicationReleaseError &&
      error.message === "Direct deployment runtime does not match the confirmed project target"
  );
  assert.equal(prepareCalls, 0);
});

function createEcsWebTerraformOutputs(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    static_bucket_name: "audience-live-check-web-assets",
    cloudfront_distribution_id: "E1234567890",
    cloudfront_domain_name: "d111111abcdef8.cloudfront.net",
    cloudfront_url: "https://d111111abcdef8.cloudfront.net",
    ecr_repository_name: "audience-live-check-app",
    ecr_repository_arn:
      "arn:aws:ecr:ap-northeast-2:123456789012:repository/audience-live-check-app",
    ecr_repository_url: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/audience-live-check-app",
    ecs_cluster_name: "audience-live-check-cluster",
    ecs_service_name: "audience-live-check-service",
    ecs_task_definition_family: "audience-live-check-task",
    ecs_task_definition_arn:
      "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/audience-live-check-task:1",
    ecs_task_role_arn: "arn:aws:iam::123456789012:role/audience-live-check-task-role",
    ecs_execution_role_arn: "arn:aws:iam::123456789012:role/audience-live-check-execution-role",
    ecs_container_name: "web",
    ecs_container_port: 3000,
    alb_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/1",
    alb_dns_name: "audience-live-check.ap-northeast-2.elb.amazonaws.com",
    target_group_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/audience-live-check/1",
    api_origin_url: "http://audience-live-check.ap-northeast-2.elb.amazonaws.com",
    log_group_names: ["/ecs/audience-live-check"],
    ...overrides
  };
  return Object.entries(values).map(([name, value]) => ({
    name,
    value,
    sensitive: false
  }));
}

function createEcsWebTerraformResources(
  outputs: ReturnType<typeof resolveEcsFargateRuntimeOutputs>
) {
  const region = "ap-northeast-2";
  const accountId = "123456789012";
  return [
    { terraformType: "aws_s3_bucket", resourceId: outputs.frontendBucketName, region },
    {
      terraformType: "aws_cloudfront_distribution",
      resourceId: outputs.cloudFrontDistributionId,
      region
    },
    { terraformType: "aws_ecr_repository", resourceId: outputs.ecrRepositoryName, region },
    {
      terraformType: "aws_ecs_cluster",
      resourceId: `arn:aws:ecs:${region}:${accountId}:cluster/${outputs.clusterName}`,
      region
    },
    {
      terraformType: "aws_ecs_service",
      resourceId: `arn:aws:ecs:${region}:${accountId}:service/${outputs.clusterName}/${outputs.serviceName}`,
      region
    },
    {
      terraformType: "aws_ecs_task_definition",
      resourceId: outputs.taskDefinitionArn,
      region
    },
    { terraformType: "aws_iam_role", resourceId: outputs.taskRoleArn, region },
    { terraformType: "aws_iam_role", resourceId: outputs.executionRoleArn, region },
    { terraformType: "aws_lb", resourceId: outputs.loadBalancerArn, region },
    { terraformType: "aws_lb_target_group", resourceId: outputs.targetGroupArn, region },
    ...outputs.logGroupNames.map((resourceId) => ({
      terraformType: "aws_cloudwatch_log_group",
      resourceId,
      region
    }))
  ];
}
