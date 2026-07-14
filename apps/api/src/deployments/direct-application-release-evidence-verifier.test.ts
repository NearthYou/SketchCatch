import assert from "node:assert/strict";
import { test } from "node:test";
import type { EcsGitOpsCloudGateway } from "../git-cicd/ecs-gitops-release-reconciler.js";
import { createDirectApplicationReleaseEvidenceVerifier } from "./direct-application-release-evidence-verifier.js";
import type {
  DirectApplicationArtifact,
  DirectApplicationReleaseContext
} from "./direct-application-release-service.js";

const commitSha = "a".repeat(40);
const digest = "b".repeat(64);
const imageUri = `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:${digest}`;

test("ECS evidence is converted only after the ECS gateway observes the same healthy revision", async () => {
  const inspections: unknown[] = [];
  const ecsGateway: EcsGitOpsCloudGateway = {
    async inspect(input) {
      inspections.push(input);
      return {
        taskDefinitionArn: "task-definition/api:42",
        desiredCount: 1,
        runningCount: 1,
        minimumHealthyPercent: 0,
        maximumPercent: 100,
        circuitBreakerEnabled: true,
        circuitBreakerRollback: true,
        containerName: "api",
        imageUri
      };
    }
  };
  const verify = createDirectApplicationReleaseEvidenceVerifier({ ecsGateway });

  const result = await verify({
    context: createContext(),
    artifact: createArtifact(),
    evidence: createEvidence()
  });

  assert.equal(inspections.length, 1);
  assert.equal(result.providerRevision.resourceType, "ecs_service");
  assert.equal(result.providerRevision.revisionId, "task-definition/api:42");
  assert.equal(
    result.providerRevision.metadata.previousTaskDefinitionArn,
    "task-definition/api:41"
  );
  assert.equal((result.healthEvidence as Record<string, unknown>).state, "healthy");
  assert.equal(
    (result.healthEvidence as Record<string, unknown>).observedTaskDefinitionArn,
    "task-definition/api:42"
  );
  assert.equal((result.healthEvidence as Record<string, unknown>).desiredCount, 1);
  assert.equal((result.healthEvidence as Record<string, unknown>).runningCount, 1);
  assert.equal(
    typeof (result.healthEvidence as Record<string, unknown>).verifiedAt,
    "string"
  );
});

test("release evidence cannot substitute a different prepared artifact", async () => {
  const verify = createDirectApplicationReleaseEvidenceVerifier({
    ecsGateway: {
      async inspect() {
        throw new Error("AWS must not be queried for substituted evidence");
      }
    }
  });

  await assert.rejects(
    verify({
      context: createContext(),
      artifact: createArtifact(),
      evidence: { ...createEvidence(), imageDigest: `sha256:${"c".repeat(64)}` }
    }),
    /prepared artifact/i
  );
});

function createArtifact(): DirectApplicationArtifact {
  return {
    commitSha,
    digest,
    reference: imageUri,
    buildRevisionId: "build/api:42",
    metadata: {}
  };
}

function createEvidence() {
  return {
    schemaVersion: 1 as const,
    runtimeTargetKind: "ecs_fargate" as const,
    outcome: "succeeded" as const,
    commitSha,
    imageDigest: `sha256:${digest}`,
    imageUri,
    clusterName: "sketchcatch",
    serviceName: "api",
    containerName: "api",
    taskDefinitionArn: "task-definition/api:42",
    previousTaskDefinitionArn: "task-definition/api:41",
    outputUrl: "https://api.example.com"
  };
}

function createContext(): DirectApplicationReleaseContext {
  return {
    sourceRepository: {
      provider: "github",
      installationId: "123456",
      owner: "NearthYou",
      name: "sketchcatch-deployment-sandbox"
    },
    deployment: {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
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
        healthCheckPath: "/health",
        dockerfilePath: "Dockerfile",
        packageManifestPath: null,
        samTemplatePath: null,
        appSpecPath: null,
        staticOutputPath: null,
        exactSemVerTag: null,
        manifestVersion: null,
        confirmedCommitSha: commitSha,
        confirmedAt: "2026-07-14T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "sketchcatch-api-build",
        ecrRepositoryName: "sketchcatch/api",
        clusterName: "sketchcatch",
        serviceName: "api",
        containerName: "api",
        outputUrl: "https://api.example.com"
      }
    },
    connection: {
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchExecutionRole",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  };
}
