import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDeploymentPlanOptimizationEvidence,
  createDeploymentPlanSingleFlight,
  createTerraformDesiredStateIdentity,
  createTerraformResourceChangeEvidence,
  evaluatePendingPlanReuse,
  isTerraformPlanNoChange,
  parseDeploymentPlanOptimizationEvidence
} from "./deployment-optimization.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const deploymentId = "22222222-2222-4222-8222-222222222222";
const planArtifactId = "33333333-3333-4333-8333-333333333333";
const planArtifactSha256 = "a".repeat(64);
const driftVerifiedAt = "2026-07-16T00:00:00.000Z";

function createIdentity(
  overrides: Partial<Parameters<typeof createTerraformDesiredStateIdentity>[0]> = {}
) {
  return createTerraformDesiredStateIdentity({
    projectId,
    canonicalTerraformBundle: Buffer.from("resource \"aws_s3_bucket\" \"assets\" {}\n"),
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode:
          'variable "environment" { type = string }\nresource "aws_s3_bucket" "assets" {}\n'
      }
    ],
    providerLockContent:
      'provider "registry.terraform.io/hashicorp/aws" {\n  version = "5.100.0"\n}\n',
    target: {
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2"
    },
    state: {
      lineage: "state-lineage-one",
      serial: 7
    },
    ...overrides
  });
}

function createEvidence(identity = createIdentity()) {
  return createDeploymentPlanOptimizationEvidence({
    projectId,
    deploymentId,
    planArtifactId,
    planArtifactSha256,
    desiredStateIdentity: identity,
    driftVerifiedAt,
    planSummary: {
      createCount: 1,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: false,
      warnings: []
    },
    preDeploymentResult: { findings: [] },
    resourceChanges: [{ resourceAddress: "aws_s3_bucket.assets", action: "create" }]
  });
}

function evaluateReuse(
  overrides: Partial<Parameters<typeof evaluatePendingPlanReuse>[0]> = {}
) {
  const identity = createIdentity();
  const evidence = createEvidence(identity);

  return evaluatePendingPlanReuse({
    startedFromStatus: "PENDING",
    projectId,
    deploymentId,
    currentPlanArtifactId: planArtifactId,
    approvedAt: null,
    planSummary: {
      createCount: 1,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: false,
      warnings: []
    },
    planArtifact: {
      id: planArtifactId,
      deploymentId,
      terraformArtifactId: "44444444-4444-4444-8444-444444444444",
      terraformArtifactSha256: identity.terraformBundleSha256,
      operation: "apply",
      sha256: planArtifactSha256,
      accountId: "123456789012",
      region: "ap-northeast-2"
    },
    expectedTerraformArtifactId: "44444444-4444-4444-8444-444444444444",
    expectedAccountId: "123456789012",
    expectedRegion: "ap-northeast-2",
    actualPlanArtifactSha256: planArtifactSha256,
    evidence,
    currentDesiredStateIdentity: identity,
    now: new Date("2026-07-16T00:04:59.000Z"),
    driftTtlMs: 5 * 60 * 1_000,
    ...overrides
  });
}

test("canonical desired-state identity is stable across Terraform file order", () => {
  const files = [
    { fileName: "variables.tf", terraformCode: 'variable "environment" {}\n' },
    { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}\n' }
  ];
  const first = createIdentity({ terraformFiles: files });
  const second = createIdentity({ terraformFiles: [...files].reverse() });

  assert.deepEqual(first, second);
});

test("account, region, provider lock, state lineage, and state serial participate in Plan identity", () => {
  const baseline = createIdentity();
  const variants = [
    createIdentity({
      canonicalTerraformBundle: 'resource "aws_s3_bucket" "changed" {}\n'
    }),
    createIdentity({
      target: { provider: "aws", accountId: "999999999999", region: "ap-northeast-2" }
    }),
    createIdentity({
      target: { provider: "aws", accountId: "123456789012", region: "us-east-1" }
    }),
    createIdentity({ providerLockContent: "different lock" }),
    createIdentity({ state: { lineage: "state-lineage-two", serial: 7 } }),
    createIdentity({ state: { lineage: "state-lineage-one", serial: 8 } })
  ];

  for (const variant of variants) {
    assert.notEqual(variant.fingerprint, baseline.fingerprint);
  }
});

test("secret variable values never appear in desired-state identity metadata", () => {
  const secret = "do-not-log-this-secret";
  const identity = createIdentity({
    canonicalTerraformBundle: `variable "token" { default = "${secret}" }`,
    terraformFiles: [
      {
        fileName: "variables.tf",
        terraformCode: `variable "token" { default = "${secret}" }`
      }
    ]
  });

  assert.equal(JSON.stringify(identity).includes(secret), false);
});

test("verified pending Plan reuse requires unexpired evidence and matching hashes", () => {
  assert.deepEqual(evaluateReuse(), {
    outcome: "reuse",
    reason: "verified_pending_plan"
  });
});

test("drift TTL expiry forces a fresh Plan", () => {
  assert.deepEqual(
    evaluateReuse({ now: new Date("2026-07-16T00:05:00.001Z") }),
    { outcome: "execute", reason: "drift_ttl_expired" }
  );
});

test("stale Terraform state forces a fresh Plan", () => {
  assert.deepEqual(
    evaluateReuse({
      currentDesiredStateIdentity: createIdentity({
        state: { lineage: "state-lineage-one", serial: 8 }
      })
    }),
    { outcome: "execute", reason: "state_changed" }
  );
});

test("corrupt cache validation safely falls back to normal execution", () => {
  assert.deepEqual(
    evaluateReuse({ actualPlanArtifactSha256: "b".repeat(64) }),
    { outcome: "fallback_execute", reason: "cache_validation_failed" }
  );
  assert.throws(
    () => parseDeploymentPlanOptimizationEvidence(Buffer.from('{"schemaVersion":1}')),
    /optimization evidence/
  );
});

test("Plan evidence cannot be reused across projects", () => {
  assert.deepEqual(
    evaluateReuse({ projectId: "99999999-9999-4999-8999-999999999999" }),
    { outcome: "fallback_execute", reason: "cache_validation_failed" }
  );
});

test("Terraform show evidence records bounded actions by sanitized resource address", () => {
  const evidence = createTerraformResourceChangeEvidence(
    JSON.stringify({
      resource_changes: [
        {
          address: 'aws_instance.web["tenant-secret"]',
          mode: "managed",
          change: { actions: ["delete", "create"] }
        },
        {
          address: "data.aws_ami.selected",
          mode: "data",
          change: { actions: ["read"] }
        }
      ]
    })
  );

  assert.deepEqual(evidence, [
    { resourceAddress: "aws_instance.web[*]", action: "replace" }
  ]);
  assert.equal(JSON.stringify(evidence).includes("tenant-secret"), false);
});

test("Terraform resource change evidence is capped before persistence or logging", () => {
  const evidence = createTerraformResourceChangeEvidence(
    JSON.stringify({
      resource_changes: Array.from({ length: 1_001 }, (_, index) => ({
        address: `aws_s3_bucket.bucket_${index}`,
        mode: "managed",
        change: { actions: ["create"] }
      }))
    })
  );

  assert.equal(evidence.length, 1_000);
  assert.deepEqual(evidence.at(-1), {
    resourceAddress: "aws_s3_bucket.bucket_999",
    action: "create"
  });
});

test("identical concurrent Plan work is single-flight", async () => {
  const singleFlight = createDeploymentPlanSingleFlight<number>();
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operation = async () => {
    calls += 1;
    await gate;
    return 42;
  };

  const first = singleFlight.run(`${projectId}:${deploymentId}`, operation);
  const second = singleFlight.run(`${projectId}:${deploymentId}`, operation);

  assert.equal(first.joined, false);
  assert.equal(second.joined, true);
  release?.();
  assert.deepEqual(await Promise.all([first.promise, second.promise]), [42, 42]);
  assert.equal(calls, 1);
  assert.equal(singleFlight.size, 0);
});

test("zero Terraform mutations are classified for Apply skip", () => {
  assert.equal(
    isTerraformPlanNoChange({
      createCount: 0,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: false,
      warnings: []
    }),
    true
  );
});
