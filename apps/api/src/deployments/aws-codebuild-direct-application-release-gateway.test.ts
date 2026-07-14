import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAwsCodeBuildDirectApplicationReleaseGateway,
  type CodeBuildCommandClient
} from "./aws-codebuild-direct-application-release-gateway.js";
import type {
  DirectApplicationReleaseContext,
  DirectApplicationReleaseRecord
} from "./direct-application-release-service.js";

const commitSha = "a".repeat(40);
const digest = "b".repeat(64);

test("prepare starts the confirmed CodeBuild project at the confirmed commit and reads immutable exports", async () => {
  const client = new FakeCodeBuildClient([
    codeBuildProject(),
    { build: { id: "build/api:42" } },
    {
      builds: [{
        id: "build/api:42",
        buildStatus: "SUCCEEDED",
        exportedEnvironmentVariables: [
          { name: "SKETCHCATCH_COMMIT_SHA", value: commitSha },
          { name: "SKETCHCATCH_ARTIFACT_DIGEST", value: `sha256:${digest}` },
          {
            name: "SKETCHCATCH_ARTIFACT_REFERENCE",
            value: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:${digest}`
          }
        ]
      }]
    }
  ]);
  const gateway = createAwsCodeBuildDirectApplicationReleaseGateway({
    assumeRole: async () => ({ accessKeyId: "test", secretAccessKey: "test" }),
    createClient: () => client,
    wait: async () => undefined
  });

  const artifact = await gateway.prepareArtifact(createContext());

  assert.equal(artifact.digest, digest);
  assert.equal(artifact.buildRevisionId, "build/api:42");
  assert.equal(client.commands[0]?.name, "BatchGetProjectsCommand");
  assert.equal(client.commands[1]?.input.projectName, "sketchcatch-api-build");
  assert.equal(client.commands[1]?.input.sourceVersion, commitSha);
  assert.match(String(client.commands[1]?.input.buildspecOverride), /env:\s+shell: bash/);
  const environmentVariables = client.commands[1]?.input.environmentVariablesOverride as
    | Array<{ name?: string; value?: string }>
    | undefined;
  assert.deepEqual(
    environmentVariables?.map((item) => [item.name, item.value]),
    [
      ["SKETCHCATCH_RELEASE_PHASE", "prepare"],
      ["SKETCHCATCH_RUNTIME_TARGET_KIND", "ecs_fargate"],
      ["SKETCHCATCH_CONFIRMED_COMMIT_SHA", commitSha],
      ["SKETCHCATCH_SOURCE_ROOT", "."],
      ["SKETCHCATCH_DOCKERFILE_PATH", "Dockerfile"],
      ["SKETCHCATCH_ECR_REPOSITORY", "sketchcatch/api"]
    ]
  );
});

test("deploy accepts release evidence only after the runtime verifier re-queries AWS", async () => {
  const evidence = {
    schemaVersion: 1,
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha,
    imageDigest: `sha256:${digest}`,
    imageUri: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:${digest}`,
    clusterName: "sketchcatch",
    serviceName: "api",
    containerName: "api",
    taskDefinitionArn: "task-definition/api:42",
    previousTaskDefinitionArn: "task-definition/api:41",
    outputUrl: "https://api.example.com"
  };
  const client = new FakeCodeBuildClient([
    codeBuildProject(),
    { build: { id: "build/api:deploy-42" } },
    {
      builds: [{
        id: "build/api:deploy-42",
        buildStatus: "SUCCEEDED",
        exportedEnvironmentVariables: [{
          name: "SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64",
          value: Buffer.from(JSON.stringify(evidence)).toString("base64")
        }]
      }]
    }
  ]);
  const verifierCalls: unknown[] = [];
  const gateway = createAwsCodeBuildDirectApplicationReleaseGateway({
    assumeRole: async () => ({ accessKeyId: "test", secretAccessKey: "test" }),
    createClient: () => client,
    wait: async () => undefined,
    verifyEvidence: async (input) => {
      verifierCalls.push(input);
      return {
        providerRevision: {
          provider: "aws",
          resourceType: "ecs_service",
          revisionId: "task-definition/api:42",
          artifactReference: evidence.imageUri,
          metadata: { runningCount: 1 }
        },
        outputUrl: evidence.outputUrl,
        healthEvidence: { state: "healthy", runningCount: 1 },
        rollbackEvidence: null,
        status: "succeeded"
      };
    }
  });

  const result = await gateway.deployArtifact({
    context: createContext(),
    artifact: {
      commitSha,
      digest,
      reference: evidence.imageUri,
      buildRevisionId: "build/api:42",
      metadata: {}
    }
  });

  assert.equal(verifierCalls.length, 1);
  assert.deepEqual((verifierCalls[0] as { evidence: unknown }).evidence, evidence);
  assert.equal(result.providerRevision.revisionId, "task-definition/api:42");
  assert.equal(client.destroyed, true);
});

test("prepare rejects a CodeBuild project connected to a different repository", async () => {
  const client = new FakeCodeBuildClient([
    codeBuildProject("https://github.com/NearthYou/another-repository.git")
  ]);
  const gateway = createAwsCodeBuildDirectApplicationReleaseGateway({
    assumeRole: async () => ({ accessKeyId: "test", secretAccessKey: "test" }),
    createClient: () => client,
    wait: async () => undefined
  });

  await assert.rejects(gateway.prepareArtifact(createContext()), /source repository/i);
  assert.equal(client.commands.length, 1);
  assert.equal(client.destroyed, true);
});

test("cleanup restores the recorded ECS baseline and requires verified rollback evidence", async () => {
  const evidence = {
    schemaVersion: 1,
    runtimeTargetKind: "ecs_fargate",
    outcome: "rolled_back",
    commitSha,
    imageDigest: `sha256:${digest}`,
    imageUri: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:${digest}`,
    clusterName: "sketchcatch",
    serviceName: "api",
    containerName: "api",
    taskDefinitionArn: "task-definition/api:42",
    previousTaskDefinitionArn: "task-definition/api:41",
    restoredTaskDefinitionArn: "task-definition/api:41",
    outputUrl: "https://api.example.com"
  } as const;
  const client = new FakeCodeBuildClient([
    codeBuildProject(),
    { build: { id: "build/api:cleanup-42" } },
    {
      builds: [{
        buildStatus: "SUCCEEDED",
        exportedEnvironmentVariables: [{
          name: "SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64",
          value: Buffer.from(JSON.stringify(evidence)).toString("base64")
        }]
      }]
    }
  ]);
  const gateway = createAwsCodeBuildDirectApplicationReleaseGateway({
    assumeRole: async () => ({ accessKeyId: "test", secretAccessKey: "test" }),
    createClient: () => client,
    wait: async () => undefined,
    verifyEvidence: async () => ({
      providerRevision: {
        provider: "aws",
        resourceType: "ecs_service",
        revisionId: "task-definition/api:41",
        artifactReference: evidence.imageUri,
        metadata: { previousTaskDefinitionArn: "task-definition/api:41" }
      },
      outputUrl: evidence.outputUrl,
      healthEvidence: { state: "restored", runningCount: 1 },
      rollbackEvidence: { restoredTaskDefinitionArn: "task-definition/api:41" },
      status: "rolled_back"
    })
  });

  const result = await gateway.rollbackArtifact({
    context: createContext(),
    artifact: {
      commitSha,
      digest,
      reference: evidence.imageUri,
      buildRevisionId: "build/api:42",
      metadata: {}
    },
    release: createRelease(evidence.imageUri)
  });

  assert.equal(result.status, "rolled_back");
  assert.match(String(client.commands[1]?.input.buildspecOverride), /PREVIOUS_TASK_DEFINITION/);
  const environmentVariables = client.commands[1]?.input.environmentVariablesOverride as
    | Array<{ name?: string; value?: string }>
    | undefined;
  assert.equal(
    environmentVariables?.find((item) => item.name === "SKETCHCATCH_PREVIOUS_TASK_DEFINITION")?.value,
    "task-definition/api:41"
  );
});

function codeBuildProject(
  location = "https://github.com/NearthYou/sketchcatch-deployment-sandbox.git"
) {
  return {
    projects: [{
      name: "sketchcatch-api-build",
      source: {
        type: "GITHUB",
        location,
        auth: { type: "CODECONNECTIONS" }
      }
    }]
  };
}

class FakeCodeBuildClient implements CodeBuildCommandClient {
  readonly commands: Array<{ name: string; input: Record<string, unknown> }> = [];
  destroyed = false;

  constructor(private readonly responses: unknown[]) {}

  async send(command: { input: Record<string, unknown> }) {
    this.commands.push({ name: command.constructor.name, input: command.input });
    return this.responses.shift() as never;
  }

  destroy() {
    this.destroyed = true;
  }
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

function createRelease(artifactReference: string): DirectApplicationReleaseRecord {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: "22222222-2222-4222-8222-222222222222",
    deploymentId: "11111111-1111-4111-8111-111111111111",
    pipelineRunId: null,
    source: "direct",
    runtimeTargetKind: "ecs_fargate",
    version: commitSha.slice(0, 12),
    commitSha,
    artifactDigestAlgorithm: "sha256",
    artifactDigest: digest,
    providerRevision: {
      provider: "aws",
      resourceType: "ecs_service",
      revisionId: "task-definition/api:42",
      artifactReference,
      metadata: {
        preparedBuildRevisionId: "build/api:42",
        previousTaskDefinitionArn: "task-definition/api:41"
      }
    },
    outputUrl: "https://api.example.com",
    status: "succeeded",
    healthEvidence: { state: "healthy" },
    rollbackEvidence: null,
    startedAt: new Date("2026-07-14T00:00:00.000Z"),
    completedAt: new Date("2026-07-14T00:01:00.000Z"),
    createdAt: new Date("2026-07-14T00:00:00.000Z"),
    updatedAt: new Date("2026-07-14T00:01:00.000Z")
  };
}
