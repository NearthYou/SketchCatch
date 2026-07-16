import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationArtifactEvidenceV2Schema,
  applicationArtifactProviderLocationSchema
} from "./application-artifact-schemas.js";

test("ApplicationArtifact evidence DTO accepts only strict secret-free provider metadata", () => {
  const location = {
    provider: "aws",
    accountId: "123456789012",
    region: "ap-northeast-2",
    storageNamespace: "customer-api",
    artifactReference: "ecr://customer-api@sha256:digest",
    ownershipScope: "project:project-1"
  };
  const evidence = {
    kind: "container_image",
    artifactFingerprint: "a".repeat(64),
    buildContractVersion: "application-artifact/v1",
    digestAlgorithm: "sha256",
    digest: "b".repeat(64),
    location
  };

  assert.deepEqual(applicationArtifactEvidenceV2Schema.parse(evidence), evidence);
  assert.equal(
    applicationArtifactProviderLocationSchema.safeParse({
      ...location,
      accessToken: "must-not-be-accepted"
    }).success,
    false
  );
  assert.equal(
    applicationArtifactEvidenceV2Schema.safeParse({
      ...evidence,
      digest: `sha256:${"b".repeat(64)}`
    }).success,
    false
  );
});
