import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApplicationArtifact,
  ApplicationArtifactIdentity,
  ApplicationArtifactProviderLocation
} from "@sketchcatch/types";
import {
  ApplicationArtifactBuildInProgressError,
  ApplicationArtifactIsolationError,
  resolveApplicationArtifact,
  type ApplicationArtifactClaim,
  type ApplicationArtifactRegistryRepository
} from "./application-artifact-registry.js";

const projectId = "project-1";
const sourceRepositoryId = "repository-1";
const now = new Date("2026-07-16T00:00:00.000Z");
const identity: ApplicationArtifactIdentity = {
  artifactFingerprint: "a".repeat(64),
  repositoryIdentity: "github:nearthyou/sketchcatch",
  commitSha: "b".repeat(40),
  kind: "container_image",
  buildConfigSha256: "c".repeat(64),
  buildContractVersion: "application-artifact/v1",
  targetOs: "linux",
  targetArchitecture: "amd64",
  buildInputIdentitySha256: "d".repeat(64)
};
const location: ApplicationArtifactProviderLocation = {
  provider: "aws",
  accountId: "123456789012",
  region: "ap-northeast-2",
  storageNamespace: "customer-api",
  artifactReference: `ecr://customer-api@sha256:${"e".repeat(64)}`,
  ownershipScope: `project:${projectId}`
};

function createArtifact(overrides: Partial<ApplicationArtifact> = {}): ApplicationArtifact {
  return {
    id: "artifact-1",
    projectId,
    sourceRepositoryId,
    ...identity,
    digestAlgorithm: "sha256",
    digest: "e".repeat(64),
    location,
    status: "available",
    verifiedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function createClaim(): ApplicationArtifactClaim {
  return {
    artifactId: "artifact-2",
    projectId,
    sourceRepositoryId,
    identity,
    claimToken: "claim-token",
    leaseExpiresAt: new Date(now.getTime() + 60_000)
  };
}

function createRepository(
  acquisitions: Awaited<ReturnType<ApplicationArtifactRegistryRepository["acquire"]>>[]
): ApplicationArtifactRegistryRepository & {
  invalidated: string[];
  completed: string[];
  failed: string[];
  verified: string[];
  renewed: string[];
} {
  return {
    invalidated: [],
    completed: [],
    failed: [],
    verified: [],
    renewed: [],
    async acquire() {
      const next = acquisitions.shift();
      assert.ok(next, "unexpected registry acquisition");
      return next;
    },
    async invalidate(input) {
      this.invalidated.push(input.artifactId);
    },
    async renew(input: { claim: ApplicationArtifactClaim }) {
      this.renewed.push(input.claim.artifactId);
      return input.claim;
    },
    async complete(input) {
      this.completed.push(input.claim.artifactId);
      return createArtifact({
        id: input.claim.artifactId,
        digest: input.built.digest,
        location: input.built.location
      });
    },
    async fail(input) {
      this.failed.push(input.claim.artifactId);
    },
    async recordVerified(input) {
      this.verified.push(input.artifact.id);
      return { ...input.artifact, verifiedAt: input.verifiedAt.toISOString() };
    }
  };
}

test("reuses only after provider existence, digest, target, and ownership verification", async () => {
  const artifact = createArtifact();
  const repository = createRepository([{ outcome: "available", artifact }]);
  let buildCalls = 0;

  const result = await resolveApplicationArtifact({
    projectId,
    sourceRepositoryId,
    identity,
    expectedLocation: {
      provider: "aws",
      accountId: location.accountId,
      region: location.region,
      storageNamespace: location.storageNamespace,
      ownershipScope: location.ownershipScope
    },
    now,
    repository,
    verifier: {
      async verify() {
        return { outcome: "verified", digest: artifact.digest, location: artifact.location };
      }
    },
    async build() {
      buildCalls += 1;
      return { digest: artifact.digest, location: artifact.location };
    }
  });

  assert.equal(result.outcome, "reused");
  assert.equal(result.artifact.id, artifact.id);
  assert.equal(buildCalls, 0);
  assert.deepEqual(repository.verified, [artifact.id]);
});

test("provider mismatch invalidates the stale row and falls back to one claimed build", async () => {
  const stale = createArtifact();
  const claim = createClaim();
  const repository = createRepository([
    { outcome: "available", artifact: stale },
    { outcome: "claimed", claim }
  ]);
  let verificationCalls = 0;

  const result = await resolveApplicationArtifact({
    projectId,
    sourceRepositoryId,
    identity,
    expectedLocation: {
      provider: "aws",
      accountId: location.accountId,
      region: location.region,
      storageNamespace: location.storageNamespace,
      ownershipScope: location.ownershipScope
    },
    now,
    repository,
    verifier: {
      async verify(artifact) {
        verificationCalls += 1;
        return verificationCalls === 1
          ? { outcome: "verified", digest: "f".repeat(64), location: artifact.location }
          : { outcome: "verified", digest: artifact.digest, location: artifact.location };
      }
    },
    async build() {
      return { digest: "e".repeat(64), location };
    }
  });

  assert.equal(result.outcome, "built");
  assert.deepEqual(repository.invalidated, [stale.id]);
  assert.deepEqual(repository.completed, [claim.artifactId]);
  assert.equal(verificationCalls, 2);
});

test("a caller with release evidence can require the exact provider reference", async () => {
  const cached = createArtifact();
  const claim = createClaim();
  const expectedReference = `ecr.example/customer-api@sha256:${"e".repeat(64)}`;
  const expectedLocation = { ...location, artifactReference: expectedReference };
  const repository = createRepository([
    { outcome: "available", artifact: cached },
    { outcome: "claimed", claim }
  ]);

  const result = await resolveApplicationArtifact({
    projectId,
    sourceRepositoryId,
    identity,
    expectedLocation: {
      provider: "aws",
      accountId: location.accountId,
      region: location.region,
      storageNamespace: location.storageNamespace,
      ownershipScope: location.ownershipScope,
      artifactReference: expectedReference
    },
    now,
    repository,
    verifier: {
      async verify(artifact) {
        return { outcome: "verified", digest: artifact.digest, location: artifact.location };
      }
    },
    async build() {
      return { digest: "e".repeat(64), location: expectedLocation };
    }
  });

  assert.equal(result.outcome, "built");
  assert.deepEqual(repository.invalidated, [cached.id]);
  assert.equal(result.artifact.location.artifactReference, expectedReference);
});

test("project isolation is enforced even if a repository returns a foreign row", async () => {
  const repository = createRepository([
    { outcome: "available", artifact: createArtifact({ projectId: "project-2" }) }
  ]);

  await assert.rejects(
    resolveApplicationArtifact({
      projectId,
      sourceRepositoryId,
      identity,
      expectedLocation: {
        provider: "aws",
        accountId: location.accountId,
        region: location.region,
        storageNamespace: location.storageNamespace,
        ownershipScope: location.ownershipScope
      },
      now,
      repository,
      verifier: { async verify() { throw new Error("must not verify foreign artifacts"); } },
      async build() { throw new Error("must not build after isolation failure"); }
    }),
    ApplicationArtifactIsolationError
  );
});

test("a corrupt same-project identity is invalidated and rebuilt instead of being trusted", async () => {
  const corrupt = createArtifact({ commitSha: "f".repeat(40) });
  const claim = createClaim();
  const repository = createRepository([
    { outcome: "available", artifact: corrupt },
    { outcome: "claimed", claim }
  ]);

  const result = await resolveApplicationArtifact({
    projectId,
    sourceRepositoryId,
    identity,
    expectedLocation: {
      provider: "aws",
      accountId: location.accountId,
      region: location.region,
      storageNamespace: location.storageNamespace,
      ownershipScope: location.ownershipScope
    },
    now,
    repository,
    verifier: {
      async verify(artifact) {
        return { outcome: "verified", digest: artifact.digest, location: artifact.location };
      }
    },
    async build() { return { digest: "e".repeat(64), location }; }
  });

  assert.equal(result.outcome, "built");
  assert.deepEqual(repository.invalidated, [corrupt.id]);
});

test("a corrupt same-project digest is a cache miss instead of trusted registry evidence", async () => {
  const corrupt = createArtifact({ digest: "not-a-sha256-digest" });
  const claim = createClaim();
  const repository = createRepository([
    { outcome: "available", artifact: corrupt },
    { outcome: "claimed", claim }
  ]);
  let verificationCalls = 0;

  const result = await resolveApplicationArtifact({
    projectId,
    sourceRepositoryId,
    identity,
    expectedLocation: {
      provider: "aws",
      accountId: location.accountId,
      region: location.region,
      storageNamespace: location.storageNamespace,
      ownershipScope: location.ownershipScope
    },
    now,
    repository,
    verifier: {
      async verify(artifact) {
        verificationCalls += 1;
        return { outcome: "verified", digest: artifact.digest, location: artifact.location };
      }
    },
    async build() { return { digest: "e".repeat(64), location }; }
  });

  assert.equal(result.outcome, "built");
  assert.deepEqual(repository.invalidated, [corrupt.id]);
  assert.equal(verificationCalls, 1);
});

test("a claim must match the complete requested repository and artifact identity", async () => {
  const claim = createClaim();
  const repository = createRepository([
    {
      outcome: "claimed",
      claim: {
        ...claim,
        sourceRepositoryId: "repository-2",
        identity: { ...claim.identity, commitSha: "f".repeat(40) }
      }
    }
  ]);
  let buildCalls = 0;

  await assert.rejects(
    resolveApplicationArtifact({
      projectId,
      sourceRepositoryId,
      identity,
      expectedLocation: {
        provider: "aws",
        accountId: location.accountId,
        region: location.region,
        storageNamespace: location.storageNamespace,
        ownershipScope: location.ownershipScope
      },
      now,
      repository,
      verifier: { async verify() { throw new Error("must not verify an invalid claim"); } },
      async build() {
        buildCalls += 1;
        return { digest: "e".repeat(64), location };
      }
    }),
    ApplicationArtifactIsolationError
  );
  assert.equal(buildCalls, 0);
});

test("a persistence result cannot replace provider-verified artifact bytes", async () => {
  const claim = createClaim();
  const repository = createRepository([{ outcome: "claimed", claim }]);
  repository.complete = async (input) => {
    repository.completed.push(input.claim.artifactId);
    return createArtifact({
      id: input.claim.artifactId,
      digest: "f".repeat(64),
      location: input.built.location
    });
  };

  await assert.rejects(
    resolveApplicationArtifact({
      projectId,
      sourceRepositoryId,
      identity,
      expectedLocation: {
        provider: "aws",
        accountId: location.accountId,
        region: location.region,
        storageNamespace: location.storageNamespace,
        ownershipScope: location.ownershipScope
      },
      now,
      repository,
      verifier: {
        async verify(artifact) {
          return { outcome: "verified", digest: artifact.digest, location: artifact.location };
        }
      },
      async build() { return { digest: "e".repeat(64), location }; }
    }),
    ApplicationArtifactIsolationError
  );
  assert.deepEqual(repository.invalidated, [claim.artifactId]);
});

test("an active lease blocks duplicate builds and a failed new-artifact verification fails the claim", async () => {
  const busyRepository = createRepository([
    { outcome: "busy", leaseExpiresAt: new Date(now.getTime() + 60_000) }
  ]);

  await assert.rejects(
    resolveApplicationArtifact({
      projectId,
      sourceRepositoryId,
      identity,
      expectedLocation: {
        provider: "aws",
        accountId: location.accountId,
        region: location.region,
        storageNamespace: location.storageNamespace,
        ownershipScope: location.ownershipScope
      },
      now,
      repository: busyRepository,
      verifier: { async verify() { throw new Error("must not verify"); } },
      async build() { throw new Error("must not build"); }
    }),
    ApplicationArtifactBuildInProgressError
  );

  const claim = createClaim();
  const failedRepository = createRepository([{ outcome: "claimed", claim }]);
  await assert.rejects(
    resolveApplicationArtifact({
      projectId,
      sourceRepositoryId,
      identity,
      expectedLocation: {
        provider: "aws",
        accountId: location.accountId,
        region: location.region,
        storageNamespace: location.storageNamespace,
        ownershipScope: location.ownershipScope
      },
      now,
      repository: failedRepository,
      verifier: { async verify() { return { outcome: "miss", reason: "missing" }; } },
      async build() { return { digest: "e".repeat(64), location }; }
    }),
    /provider verification failed/i
  );
  assert.deepEqual(failedRepository.failed, [claim.artifactId]);
});

test("a long-running build renews its persistent claim lease", async () => {
  const claim = createClaim();
  const repository = createRepository([{ outcome: "claimed", claim }]);

  await resolveApplicationArtifact({
    projectId,
    sourceRepositoryId,
    identity,
    expectedLocation: {
      provider: "aws",
      accountId: location.accountId,
      region: location.region,
      storageNamespace: location.storageNamespace,
      ownershipScope: location.ownershipScope
    },
    now,
    leaseDurationMs: 30,
    repository,
    verifier: {
      async verify(artifact) {
        return { outcome: "verified", digest: artifact.digest, location: artifact.location };
      }
    },
    async build() {
      await new Promise((resolve) => setTimeout(resolve, 35));
      return { digest: "e".repeat(64), location };
    }
  });

  assert.ok(repository.renewed.length >= 1);
});
