import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashApplicationArtifact,
  resolveApplicationReleaseVersion,
  verifyApplicationReleaseProviderRevision
} from "./application-release-identity.js";

const commitSha = "A".repeat(40);

test("release version prefers an exact SemVer tag, then manifest version, then commit SHA", () => {
  assert.equal(
    resolveApplicationReleaseVersion({
      exactSemVerTag: "v2.1.0-rc.1",
      manifestVersion: "2.0.0",
      commitSha
    }),
    "v2.1.0-rc.1"
  );
  assert.equal(
    resolveApplicationReleaseVersion({ manifestVersion: "2.0.0", commitSha }),
    "2.0.0"
  );
  assert.equal(resolveApplicationReleaseVersion({ commitSha }), `sha-${"a".repeat(12)}`);
});

test("release version rejects unverified version evidence", () => {
  assert.throws(
    () => resolveApplicationReleaseVersion({ exactSemVerTag: "latest", commitSha }),
    /SemVer/
  );
  assert.throws(
    () => resolveApplicationReleaseVersion({ manifestVersion: "../../escape", commitSha }),
    /manifest version/
  );
  assert.throws(
    () => resolveApplicationReleaseVersion({ commitSha: "not-a-sha" }),
    /commit SHA/
  );
});

test("application artifacts use a deterministic SHA-256 digest", () => {
  assert.equal(
    hashApplicationArtifact("release artifact"),
    "133cfccb5b503cf4040c95f3dfad56d07c1574283a1e39066b594f6ee33711ba"
  );
});

test("provider revision verification is stable across metadata key order", () => {
  const expected = {
    provider: "aws" as const,
    resourceType: "ecs_service",
    revisionId: "task-definition/api:42",
    artifactReference: "ecr/api@sha256:abc",
    metadata: { desiredCount: 2, circuitBreaker: true }
  };
  const observed = {
    ...expected,
    metadata: { circuitBreaker: true, desiredCount: 2 }
  };

  const result = verifyApplicationReleaseProviderRevision(expected, observed);

  assert.equal(result.matches, true);
  assert.equal(result.expectedFingerprint, result.observedFingerprint);
});

test("provider revision verification exposes drift without provider-specific branching", () => {
  const expected = {
    provider: "aws" as const,
    resourceType: "ecs_service",
    revisionId: "task-definition/api:42",
    artifactReference: null,
    metadata: {}
  };

  const result = verifyApplicationReleaseProviderRevision(expected, {
    ...expected,
    revisionId: "task-definition/api:43"
  });

  assert.equal(result.matches, false);
  assert.notEqual(result.expectedFingerprint, result.observedFingerprint);
});
