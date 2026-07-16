import assert from "node:assert/strict";
import test from "node:test";
import { parseReleaseEvidence } from "./github-actions-run-provider.js";

test("GitHub Actions release parser accepts strict convergence v3 evidence and keeps v1/v2 compatible", () => {
  const digest = "a".repeat(64);
  const imageUri =
    `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/customer-api@sha256:${digest}`;
  const common = {
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha: "b".repeat(40),
    imageDigest: `sha256:${digest}`,
    imageUri,
    clusterName: "cluster",
    serviceName: "service",
    containerName: "web",
    taskDefinitionArn:
      "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/customer-api:2",
    previousTaskDefinitionArn:
      "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/customer-api:1",
    outputUrl: "https://api.example.com"
  };
  const v1 = { schemaVersion: 1, ...common };
  const v2 = {
    schemaVersion: 2,
    ...common,
    artifact: {
      kind: "container_image",
      artifactFingerprint: "c".repeat(64),
      buildContractVersion: "application-artifact/v1",
      digestAlgorithm: "sha256",
      digest,
      location: {
        provider: "aws",
        accountId: "123456789012",
        region: "ap-northeast-2",
        storageNamespace: "customer-api",
        artifactReference: imageUri,
        ownershipScope: "project:project-1"
      }
    }
  };
  const v3 = {
    ...v2,
    schemaVersion: 3,
    convergence: {
      contractVersion: "runtime-convergence/v1",
      adapterKind: "ecs_service_fargate",
      outcome: "already_active",
      deploymentTargetFingerprint: "d".repeat(64),
      artifactFingerprint: v2.artifact.artifactFingerprint,
      artifactDigestAlgorithm: "sha256",
      artifactDigest: digest,
      providerStateVerifiedAt: "2026-07-16T00:00:00.000Z",
      fallbackReason: null
    }
  };
  const invalidV3 = {
    ...v3,
    convergence: { ...v3.convergence, artifactFingerprint: "e".repeat(64) }
  };
  const logs = [v1, v2, v3, invalidV3]
    .map(
      (evidence) =>
        `SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=${Buffer.from(JSON.stringify(evidence)).toString("base64")}`
    )
    .join("\n");

  const parsed = parseReleaseEvidence(logs);
  assert.deepEqual(parsed.map((evidence) => evidence.schemaVersion), [1, 2, 3]);
});
