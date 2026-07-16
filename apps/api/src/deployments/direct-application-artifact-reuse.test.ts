import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_ARTIFACT_CONTRACT_VERSION,
  type ApplicationArtifact
} from "@sketchcatch/types";
import { createApplicationArtifactIdentity } from "../artifacts/application-artifact-identity.js";
import type { ApplicationArtifactClaim } from "../artifacts/application-artifact-registry.js";
import {
  prepareDirectApplicationRelease,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationReleaseRecord,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";

const commitSha = "a".repeat(40);
const digest = "b".repeat(64);

test("Direct preparation reuses a provider-verified registry artifact without starting CodeBuild", async () => {
  const context = createContext();
  const artifact = createArtifact(context);
  let prepareCalls = 0;
  let saved: DirectApplicationReleaseRecord | undefined;
  const repository = {
    artifactRegistry: {
      async acquire() {
        return { outcome: "available" as const, artifact };
      },
      async invalidate() {},
      async renew(input: { claim: ApplicationArtifactClaim }) { return input.claim; },
      async complete() { throw new Error("must not complete a reused artifact"); },
      async fail() { throw new Error("must not fail a reused artifact"); },
      async recordVerified() { return artifact; }
    },
    async findContext() { return context; },
    async findRelease() { return undefined; },
    async savePreparedRelease(input: DirectApplicationReleaseRecord) {
      saved = input;
      return input;
    }
  } as unknown as DirectApplicationReleaseRepository;
  const gateway = {
    async prepareArtifact() {
      prepareCalls += 1;
      throw new Error("CodeBuild must not run for a verified artifact");
    },
    async verifyArtifact() {
      return { outcome: "verified" as const, digest, location: artifact.location };
    }
  } as unknown as DirectApplicationReleaseGateway;

  const release = await prepareDirectApplicationRelease(
    { deploymentId: "deployment-1", userId: "user-1" },
    repository,
    gateway,
    () => "release-1",
    () => new Date("2026-07-16T00:00:00.000Z")
  );

  assert.equal(prepareCalls, 0);
  assert.equal(release?.artifactId, artifact.id);
  assert.equal(saved?.artifactDigest, artifact.digest);
  assert.equal(saved?.providerRevision?.resourceType, "application_artifact");
  assert.equal(saved?.providerRevision?.metadata.reuseOutcome, "reused");
  assert.equal(saved?.providerRevision?.metadata.applicationArtifactId, artifact.id);
  assert.equal(saved?.providerRevision?.metadata.preparedBuildRevisionId, undefined);
});

function createContext(): DirectApplicationReleaseContext {
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
        confirmedAt: "2026-07-16T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "customer-api-build",
        ecrRepositoryName: "customer-api",
        clusterName: "customer-cluster",
        serviceName: "customer-api",
        containerName: "web",
        outputUrl: "https://api.example.com"
      }
    },
    connection: {
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
      externalId: "external-id",
      region: "ap-northeast-2"
    }
  } as DirectApplicationReleaseContext;
}

function createArtifact(context: DirectApplicationReleaseContext): ApplicationArtifact {
  const timestamp = "2026-07-16T00:00:00.000Z";
  const build = context.target.confirmedBuildConfig;
  const sourceRepository = context.sourceRepository;
  assert.ok(sourceRepository);
  const identity = createApplicationArtifactIdentity({
    repository: {
      provider: sourceRepository.provider,
      owner: sourceRepository.owner,
      name: sourceRepository.name
    },
    commitSha,
    kind: "container_image",
    confirmedBuildConfig: build,
    buildContractVersion: APPLICATION_ARTIFACT_CONTRACT_VERSION,
    targetOs: "linux",
    targetArchitecture: "amd64",
    buildInputs: {}
  });
  return {
    id: "artifact-1",
    projectId: "project-1",
    sourceRepositoryId: "repository-1",
    ...identity,
    digestAlgorithm: "sha256",
    digest,
    location: {
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2",
      storageNamespace: "customer-api",
      artifactReference: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/customer-api@sha256:${digest}`,
      ownershipScope: "project:project-1"
    },
    status: "available",
    verifiedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
