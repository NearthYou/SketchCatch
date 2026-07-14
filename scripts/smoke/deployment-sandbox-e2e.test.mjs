import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluateSandboxPreflight,
  redactSensitiveEvidence,
  runSandboxCli,
  runSandboxPreflight,
  validateSandboxEvidence
} from "./deployment-sandbox-e2e.mjs";

const UUIDS = {
  run: "00000000-0000-4000-8000-000000000001",
  project: "00000000-0000-4000-8000-000000000002",
  observation: "00000000-0000-4000-8000-000000000003",
  notification: "00000000-0000-4000-8000-000000000004"
};
const SHA = {
  commit: "a".repeat(40),
  digest: `sha256:${"b".repeat(64)}`,
  evidence: "c".repeat(64),
  revision: "d".repeat(64)
};
const STARTED_AT = "2026-07-14T01:00:00.000Z";
const FINISHED_AT = "2026-07-14T01:30:00.000Z";
const RUNTIMES = ["ecs_fargate", "lambda", "ec2_asg", "static_site"];
const SCOPES = ["infrastructure", "application", "full_stack"];

test("live deployment smoke retries once after an access token expires", () => {
  const scriptPath = fileURLToPath(new URL("./live-demo-web-service.ps1", import.meta.url));
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /\$statusCode -eq 401/);
  assert.match(script, /Get-SmokeAccessToken -Force/);
  assert.match(script, /\$attempt -lt 2/);
  assert.match(script, /deploymentScope = \$DeploymentScope/);
});

function buildValidPreflight(overrides = {}) {
  return {
    mutationApproved: true,
    awsIdentity: { accountId: "111122223333" },
    expectedAwsAccountId: "111122223333",
    productionAccountIds: ["555980271919"],
    apiBaseUrl: "https://api.sandbox.sketchcatch.dev",
    productionApiHosts: ["sketchcatch.net"],
    accessTokenPresent: true,
    awsConnectionId: "00000000-0000-4000-8000-000000000010",
    awsConnection: {
      id: "00000000-0000-4000-8000-000000000010",
      accountId: "111122223333",
      region: "ap-northeast-2",
      status: "verified"
    },
    region: "ap-northeast-2",
    githubRepository: "NearthYou/sketchcatch-deployment-sandbox",
    productionRepositories: ["NearthYou/SketchCatch"],
    cleanupOwner: "siwon",
    budgetUsd: 25,
    ...overrides
  };
}

function buildDirect(scope, index) {
  const deploymentId = `10000000-0000-4000-8000-00000000000${index}`;
  const outputUrl = scope === "infrastructure" ? null : `https://${scope}.sandbox.example.com`;

  return {
    scope,
    projectId: UUIDS.project,
    deploymentId,
    status: "SUCCESS",
    revision: {
      preparedSnapshotHash: SHA.revision,
      approvedSnapshotHash: SHA.revision,
      executedSnapshotHash: SHA.revision
    },
    logsSha256: SHA.evidence,
    outputsSha256: SHA.evidence,
    release:
      scope === "infrastructure"
        ? null
        : {
            version: `1.0.${index}`,
            commitSha: SHA.commit,
            artifactDigest: SHA.digest,
            providerRevision: `direct-${index}`,
            outputUrl
          },
    outputProbe:
      outputUrl === null ? null : { url: outputUrl, statusCode: 200, observedAt: FINISHED_AT },
    destroy: { status: "DESTROYED", logsSha256: SHA.evidence, verifiedAt: FINISHED_AT }
  };
}

function buildGitOps(runtime, index) {
  const outputUrl = `https://${runtime.replace("_", "-")}.sandbox.example.com`;

  return {
    runtime,
    projectId: UUIDS.project,
    handoffId: `20000000-0000-4000-8000-00000000000${index}`,
    pipelineRunId: `30000000-0000-4000-8000-00000000000${index}`,
    status: "pipeline_success",
    commit: { pushedSha: SHA.commit, detectedSha: SHA.commit },
    ci: {
      runId: String(1000 + index),
      runUrl: `https://github.com/NearthYou/sketchcatch-deployment-sandbox/actions/runs/${1000 + index}`,
      stages: ["build", "publish", "deploy", "health"],
      logsSha256: SHA.evidence,
      secretsMasked: true
    },
    release: {
      version: `2.0.${index}`,
      commitSha: SHA.commit,
      artifactDigest: SHA.digest,
      providerRevision: `${runtime}-revision-${index}`,
      outputUrl
    },
    outputProbe: { url: outputUrl, statusCode: 200, observedAt: FINISHED_AT },
    rollback: {
      failureInjected: true,
      failedRevision: `${runtime}-failed-${index}`,
      previousRevision: `${runtime}-previous-${index}`,
      restoredRevision: `${runtime}-previous-${index}`,
      status: "verified",
      healthStatusCode: 200,
      verifiedAt: FINISHED_AT
    },
    destroy: {
      status: "success",
      runUrl: `https://github.com/NearthYou/sketchcatch-deployment-sandbox/actions/runs/${2000 + index}`,
      logsSha256: SHA.evidence,
      verifiedAt: FINISHED_AT
    }
  };
}

function buildValidReport() {
  const direct = SCOPES.map(buildDirect);
  const gitops = RUNTIMES.map(buildGitOps);
  const fullStack = direct.find(({ scope }) => scope === "full_stack");

  return {
    kind: "sketchcatch_deployment_sandbox_e2e",
    schemaVersion: 1,
    runId: UUIDS.run,
    startedAt: STARTED_AT,
    finishedAt: FINISHED_AT,
    environment: {
      awsAccountId: "111122223333",
      awsRegion: "ap-northeast-2",
      apiBaseUrl: "https://api.sandbox.sketchcatch.dev",
      githubRepository: "NearthYou/sketchcatch-deployment-sandbox",
      mutationApprovedAt: STARTED_AT,
      cleanupOwner: "siwon",
      budgetUsd: 25,
      productionMutation: false
    },
    direct,
    gitops,
    observation: {
      observationId: UUIDS.observation,
      deploymentId: fullStack.deploymentId,
      targetUrl: fullStack.release.outputUrl,
      qrPayloadSha256: SHA.evidence,
      expiresAt: FINISHED_AT,
      acceptedRequestCount: 3,
      receiptCount: 3,
      cloudWatch: {
        source: "cloudwatch",
        requestCount: 3,
        errorCount: 0,
        latencyP95Ms: 42,
        capacity: 2,
        querySha256: SHA.evidence,
        observedAt: FINISHED_AT
      }
    },
    notifications: {
      inbox: {
        notificationId: UUIDS.notification,
        directDeploymentId: fullStack.deploymentId,
        gitopsPipelineRunId: gitops[0].pipelineRunId,
        persisted: true,
        observedAt: FINISHED_AT
      },
      webPush: {
        notificationId: UUIDS.notification,
        providerStatusCode: 201,
        delivered: true,
        observedAt: FINISHED_AT
      }
    },
    cleanup: {
      directDeploymentIds: direct.map(({ deploymentId }) => deploymentId),
      categories: Object.fromEntries(
        ["ecr", "s3", "codebuild", "cloudwatch"].map((category) => [
          category,
          {
            providerVerified: true,
            remainingCount: 0,
            querySha256: SHA.evidence,
            checkedAt: FINISHED_AT
          }
        ])
      ),
      completedAt: FINISHED_AT
    },
    knownRisks: []
  };
}

test("sandbox preflight accepts only an explicitly approved non-production target", () => {
  const result = evaluateSandboxPreflight(buildValidPreflight());

  assert.equal(result.ready, true);
  assert.deepEqual(result.errors, []);
});

test("sandbox preflight blocks production AWS, API, and GitHub targets", () => {
  const result = evaluateSandboxPreflight(
    buildValidPreflight({
      awsIdentity: { accountId: "555980271919" },
      expectedAwsAccountId: "555980271919",
      awsConnection: {
        id: "00000000-0000-4000-8000-000000000010",
        accountId: "555980271919",
        region: "ap-northeast-2",
        status: "verified"
      },
      apiBaseUrl: "https://sketchcatch.net",
      githubRepository: "NearthYou/SketchCatch"
    })
  );

  assert.equal(result.ready, false);
  assert.deepEqual(
    result.errors.map(({ code }) => code),
    ["production_aws_account", "production_api", "production_github_repository"]
  );
});

test("sandbox preflight blocks unverified or account-drifted service connections", () => {
  const result = evaluateSandboxPreflight(
    buildValidPreflight({
      awsConnection: {
        id: "00000000-0000-4000-8000-000000000010",
        accountId: "999900001111",
        region: "us-east-1",
        status: "pending"
      }
    })
  );

  assert.equal(result.ready, false);
  assert.deepEqual(
    result.errors.map(({ code }) => code),
    [
      "aws_connection_unverified",
      "aws_connection_account_mismatch",
      "aws_connection_region_mismatch"
    ]
  );
});

test("sandbox preflight requires an explicit AWS region", () => {
  const result = evaluateSandboxPreflight(
    buildValidPreflight({
      region: "",
      awsConnection: {
        id: "00000000-0000-4000-8000-000000000010",
        accountId: "111122223333",
        region: "",
        status: "verified"
      }
    })
  );

  assert.equal(result.ready, false);
  assert.ok(result.errors.some(({ code }) => code === "aws_region_missing"));
});

test("sandbox preflight rejects credential-bearing API URLs", () => {
  const result = evaluateSandboxPreflight(
    buildValidPreflight({
      apiBaseUrl: "https://user:pass@api.sandbox.sketchcatch.dev/path?token=secret"
    })
  );

  assert.equal(result.ready, false);
  assert.ok(result.errors.some(({ code }) => code === "invalid_api"));
});

test("complete sandbox evidence proves all Direct scopes and GitOps runtimes", () => {
  const result = validateSandboxEvidence(buildValidReport());

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("sandbox evidence rejects incomplete matrix, identity drift, and missing cleanup", () => {
  const report = buildValidReport();
  report.gitops.pop();
  report.gitops[0].commit.detectedSha = "e".repeat(40);
  report.gitops[1].rollback.restoredRevision = "wrong-revision";
  report.cleanup.categories.ecr.remainingCount = 1;

  const result = validateSandboxEvidence(report);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("gitops.static_site: missing"));
  assert.ok(result.errors.includes("gitops.ecs_fargate.commit: release identity mismatch"));
  assert.ok(result.errors.includes("gitops.lambda.rollback: previous revision was not restored"));
  assert.ok(result.errors.includes("cleanup.ecr: temporary resources remain"));
});

test("sandbox evidence requires run metadata, GitOps destroy, and provider observation proof", () => {
  const report = buildValidReport();
  delete report.environment.cleanupOwner;
  delete report.gitops[0].destroy;
  delete report.observation.cloudWatch.querySha256;
  delete report.knownRisks;

  const result = validateSandboxEvidence(report);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("environment.cleanupOwner: missing"));
  assert.ok(result.errors.includes("gitops.ecs_fargate.destroy: provider evidence missing"));
  assert.ok(result.errors.includes("observation.cloudWatch: actual metrics are incomplete"));
  assert.ok(result.errors.includes("knownRisks: must be an array"));
});

test("sandbox evidence rejects duplicate or unsupported matrix entries", () => {
  const report = buildValidReport();
  report.direct.push({ ...report.direct[0] });
  report.gitops.push({ ...report.gitops[0], runtime: "eks" });

  const result = validateSandboxEvidence(report);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("direct: duplicate or unsupported entries"));
  assert.ok(result.errors.includes("gitops: duplicate or unsupported entries"));
});

test("sandbox evidence rejects non-HTTPS Output URLs", () => {
  const report = buildValidReport();
  report.gitops[0].release.outputUrl = "http://ecs.sandbox.example.com";
  report.gitops[0].outputProbe.url = "http://ecs.sandbox.example.com";

  const result = validateSandboxEvidence(report);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("gitops.ecs_fargate.release.outputUrl: invalid"));
});

test("sandbox evidence rejects production mutation and credential-bearing values", () => {
  const report = buildValidReport();
  report.environment.productionMutation = true;
  report.gitops[0].ci.runUrl = "https://example.com/actions?token=secret";

  const result = validateSandboxEvidence(report);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("environment.productionMutation: must be false"));
  assert.ok(result.errors.includes("report: credential-bearing value detected"));
});

test("sandbox evidence rejects opaque values stored under sensitive keys", () => {
  const report = buildValidReport();
  report.accessToken = "opaque-value";

  const result = validateSandboxEvidence(report);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("report: credential-bearing value detected"));
});

test("sandbox evidence normalizes repeated delimiters in sensitive keys", () => {
  const report = buildValidReport();
  report.access__token = "opaque-value";
  report.nested = { "private--key": "opaque-value" };

  const result = validateSandboxEvidence(report);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("report: credential-bearing value detected"));
});

test("sensitive evidence redaction masks secret keys and strips URL credentials", () => {
  const redacted = redactSensitiveEvidence({
    accessToken: "secret-token",
    nested: {
      authorization: "Bearer secret",
      outputUrl: "https://user:pass@example.com/path?token=secret#fragment"
    }
  });

  assert.deepEqual(redacted, {
    accessToken: "<redacted>",
    nested: {
      authorization: "<redacted>",
      outputUrl: "https://example.com/path"
    }
  });
});

function buildSandboxEnvironment() {
  return {
    SKETCHCATCH_SANDBOX_MUTATION_APPROVED: "true",
    SKETCHCATCH_SANDBOX_AWS_PROFILE: "sandbox",
    SKETCHCATCH_SANDBOX_AWS_ACCOUNT_ID: "111122223333",
    SKETCHCATCH_SANDBOX_REGION: "ap-northeast-2",
    SKETCHCATCH_SANDBOX_API_BASE_URL: "https://api.sandbox.sketchcatch.dev",
    SKETCHCATCH_SANDBOX_ACCESS_TOKEN: "must-not-appear",
    SKETCHCATCH_SANDBOX_AWS_CONNECTION_ID: "00000000-0000-4000-8000-000000000010",
    SKETCHCATCH_SANDBOX_GITHUB_REPOSITORY: "NearthYou/sketchcatch-deployment-sandbox",
    SKETCHCATCH_SANDBOX_CLEANUP_OWNER: "siwon",
    SKETCHCATCH_SANDBOX_BUDGET_USD: "25"
  };
}

test("runtime preflight resolves STS identity without exposing the API token", async () => {
  const profiles = [];
  const connectionRequests = [];
  const report = await runSandboxPreflight(buildSandboxEnvironment(), {
    now: () => new Date(STARTED_AT),
    resolveAwsIdentity: async (profile) => {
      profiles.push(profile);
      return { accountId: "111122223333" };
    },
    resolveAwsConnection: async (input) => {
      connectionRequests.push(input);
      return {
        id: input.connectionId,
        accountId: "111122223333",
        region: "ap-northeast-2",
        status: "verified"
      };
    }
  });

  assert.deepEqual(profiles, ["sandbox"]);
  assert.equal(connectionRequests[0].accessToken, "must-not-appear");
  assert.equal(report.ready, true);
  assert.equal(report.target.awsAccountId, "111122223333");
  assert.equal(report.target.region, "ap-northeast-2");
  assert.doesNotMatch(JSON.stringify(report), /must-not-appear/);
});

test("runtime preflight appends api to a root base URL without a duplicate slash", async () => {
  const env = buildSandboxEnvironment();
  env.SKETCHCATCH_SANDBOX_API_BASE_URL = "https://sandbox.example.com/";
  const requestedUrls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (String(url) === "https://sandbox.example.com/api/aws/connections") {
      return new Response(
        JSON.stringify({
          awsConnections: [
            {
              id: env.SKETCHCATCH_SANDBOX_AWS_CONNECTION_ID,
              roleArn: "arn:aws:iam::111122223333:role/SketchCatchTerraformExecutionRole",
              status: "verified"
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (
      String(url) ===
      `https://sandbox.example.com/api/aws/connections/${env.SKETCHCATCH_SANDBOX_AWS_CONNECTION_ID}/test`
    ) {
      return new Response(
        JSON.stringify({ ok: true, accountId: "111122223333", region: "ap-northeast-2" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(null, { status: 404 });
  };

  try {
    const report = await runSandboxPreflight(env, {
      resolveAwsIdentity: async () => ({ accountId: "111122223333" })
    });

    assert.equal(report.ready, true);
    assert.deepEqual(requestedUrls, [
      "https://sandbox.example.com/api/aws/connections",
      `https://sandbox.example.com/api/aws/connections/${env.SKETCHCATCH_SANDBOX_AWS_CONNECTION_ID}/test`
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runtime preflight never echoes credentials embedded in an invalid API URL", async () => {
  const env = buildSandboxEnvironment();
  env.SKETCHCATCH_SANDBOX_API_BASE_URL =
    "https://user:pass@api.sandbox.sketchcatch.dev/path?token=secret";
  const report = await runSandboxPreflight(env, {
    resolveAwsIdentity: async () => ({ accountId: "111122223333" }),
    resolveAwsConnection: async ({ connectionId }) => ({
      id: connectionId,
      accountId: "111122223333",
      region: "ap-northeast-2",
      status: "verified"
    })
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.ready, false);
  assert.doesNotMatch(serialized, /user|pass|token=secret/);
});

test("runtime preflight does not send a token to a denied API host", async () => {
  const env = buildSandboxEnvironment();
  env.SKETCHCATCH_SANDBOX_API_BASE_URL = "https://sketchcatch.net";
  let connectionCalls = 0;
  const report = await runSandboxPreflight(env, {
    resolveAwsIdentity: async () => ({ accountId: "111122223333" }),
    resolveAwsConnection: async () => {
      connectionCalls += 1;
      return null;
    }
  });

  assert.equal(report.ready, false);
  assert.equal(connectionCalls, 0);
});

test("preflight CLI emits a blocked report and non-zero status when STS is unavailable", async () => {
  const output = [];
  const code = await runSandboxCli(["preflight"], buildSandboxEnvironment(), {
    write: (value) => output.push(value),
    resolveAwsIdentity: async () => null,
    resolveAwsConnection: async ({ connectionId }) => ({
      id: connectionId,
      accountId: "111122223333",
      region: "ap-northeast-2",
      status: "verified"
    }),
    now: () => new Date(STARTED_AT)
  });
  const report = JSON.parse(output.join(""));

  assert.equal(code, 2);
  assert.equal(report.ready, false);
  assert.equal(report.errors[0].code, "aws_identity_unavailable");
});

test("verify CLI returns success only for a complete evidence report", async () => {
  const output = [];
  const code = await runSandboxCli(
    ["verify", "report.json"],
    {},
    {
      write: (value) => output.push(value),
      readFile: async () => JSON.stringify(buildValidReport())
    }
  );

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join("")), { valid: true, errors: [] });
});
