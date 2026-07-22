import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  AWS_IMPORT_READERS,
  type AwsImportServiceKey
} from "./aws-import-access-catalog.js";
import {
  AWS_IMPORT_PROBE_EXECUTORS,
  probeAwsImportAccess,
  probeEventBridge,
  probeLambda,
  probeResourceExplorer,
  probeS3,
  type AwsImportProbeExecutor,
  type AwsImportProbeOutcome
} from "./aws-import-access-probe.js";

const connection: AwsConnection = {
  id: "11111111-2222-4333-8444-555555555555",
  userId: "owner-user",
  accountId: "123456789012",
  roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
  externalId: "external-id",
  region: "ap-northeast-2",
  status: "verified",
  lastVerifiedAt: "2026-07-19T12:00:00.000Z",
  createdAt: "2026-07-19T12:00:00.000Z",
  updatedAt: "2026-07-19T12:00:00.000Z"
};

test("probe executor keys exactly match the reader catalog", () => {
  assert.deepEqual(
    [...AWS_IMPORT_PROBE_EXECUTORS.keys()].sort(),
    AWS_IMPORT_READERS.map((reader) => reader.serviceKey).sort()
  );
});

test("empty core reads are successful and expanded denial is limited", async () => {
  const result = await probeAwsImportAccess(
    { connection },
    createProbeDependencies({ iam: "permission_denied" })
  );

  assert.equal(result.status, "limited");
  assert.equal(result.coreReady, true);
  assert.deepEqual(result.limitedServiceLabels, ["IAM"]);
});

test("one successful AssumeRole session is reused by all catalog executors", async () => {
  const credentials = {
    accessKeyId: "temporary-access-key",
    secretAccessKey: "temporary-secret-key",
    sessionToken: "temporary-session-token"
  };
  let assumeRoleCalls = 0;
  const receivedCredentials: unknown[] = [];
  const executors = createExecutors(async (context) => {
    receivedCredentials.push(context.credentials);
    return "success";
  });

  const result = await probeAwsImportAccess(
    { connection },
    {
      executors,
      async assumeRole() {
        assumeRoleCalls += 1;
        return credentials;
      }
    }
  );

  assert.equal(result.status, "ready");
  assert.equal(assumeRoleCalls, 1);
  assert.equal(receivedCredentials.length, AWS_IMPORT_READERS.length);
  assert(receivedCredentials.every((value) => value === credentials));
});

test("bootstrap credential-provider failure is a safe retry_required server issue", async () => {
  const rawError = Object.assign(
    new Error("SSO token /Users/private/.aws/sso/cache/raw-token RequestId: private-id"),
    { name: "CredentialsProviderError" }
  );
  const result = await probeAwsImportAccess(
    { connection },
    {
      executors: createExecutors(async () => "success"),
      async assumeRole() {
        throw rawError;
      }
    }
  );

  assert.equal(result.status, "retry_required");
  assert.equal(result.safeErrorCode, "bootstrap_credentials_unavailable");
  assert.doesNotMatch(JSON.stringify(result), /raw-token|RequestId|private-id|\/Users\/private/u);
});

test("target Role AssumeRole denial requires connection settings", async () => {
  const result = await probeAwsImportAccess(
    { connection },
    {
      executors: createExecutors(async () => "success"),
      async assumeRole() {
        throw Object.assign(new Error("not authorized for sts:AssumeRole"), {
          name: "AccessDenied"
        });
      }
    }
  );

  assert.equal(result.status, "connection_required");
  assert.equal(result.safeErrorCode, "target_role_unavailable");
});

test("unknown AssumeRole network failure defaults to retry_required", async () => {
  const result = await probeAwsImportAccess(
    { connection },
    {
      executors: createExecutors(async () => "success"),
      async assumeRole() {
        throw new Error("socket disconnected RequestId: private-id");
      }
    }
  );

  assert.equal(result.status, "retry_required");
  assert.equal(result.safeErrorCode, "assume_role_retry");
  assert.doesNotMatch(JSON.stringify(result), /socket disconnected|RequestId/u);
});

test("expired bootstrap credentials require retry instead of connection changes", async () => {
  const result = await probeAwsImportAccess(
    { connection },
    {
      executors: createExecutors(async () => "success"),
      async assumeRole() {
        throw Object.assign(new Error("expired"), { name: "ExpiredToken" });
      }
    }
  );

  assert.equal(result.status, "retry_required");
});

test("core transient takes precedence over core permission and expanded failures", async () => {
  const result = await probeAwsImportAccess(
    { connection },
    createProbeDependencies({
      ec2: "permission_denied",
      s3: "transient",
      iam: "permission_denied"
    })
  );

  assert.equal(result.status, "retry_required");
  assert.equal(result.coreReady, false);
});

test("core permission is update_required and expanded missing setup remains distinct", async () => {
  const coreDenied = await probeAwsImportAccess(
    { connection },
    createProbeDependencies({ ec2: "permission_denied" })
  );
  const optionalMissing = await probeAwsImportAccess(
    { connection },
    createProbeDependencies({ "resource-explorer": "not_configured" })
  );

  assert.equal(coreDenied.status, "update_required");
  assert.equal(optionalMissing.status, "limited");
  assert.deepEqual(optionalMissing.limitedServiceLabels, ["Resource Explorer"]);
  assert.equal(
    optionalMissing.serviceResults.find(
      (result) => result.serviceKey === "resource-explorer"
    )?.outcome,
    "not_configured"
  );
});

test("EventBridge 권한 거부는 전체 가져오기를 막지 않고 서비스별 제한으로 남긴다", async () => {
  const executors = createExecutors(async (_context, serviceKey) =>
    String(serviceKey) === "eventbridge" ? "permission_denied" : "success"
  );
  const result = await probeAwsImportAccess(
    { connection },
    {
      executors,
      async assumeRole() {
        return {
          accessKeyId: "temporary-access-key",
          secretAccessKey: "temporary-secret-key",
          sessionToken: "temporary-session-token"
        };
      }
    }
  );

  assert.equal(result.status, "limited");
  assert.deepEqual(result.limitedServiceLabels, ["EventBridge"]);
  assert.equal(
    result.serviceResults.find((service) => service.serviceKey === "eventbridge")?.outcome,
    "permission_denied"
  );
});

test("EventBridge probe는 Rule 한 page와 첫 Rule의 Target 한 page만 읽는다", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];

  const outcome = await probeEventBridge({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      calls.push({ name: value.constructor.name, input: value.input });
      return calls.length === 1
        ? { Rules: [{ Name: "nightly", EventBusName: "default" }] }
        : { Targets: [] };
    }
  });

  assert.equal(outcome, "success");
  assert.deepEqual(calls.map((call) => call.name), [
    "ListRulesCommand",
    "ListTargetsByRuleCommand"
  ]);
  assert.equal(calls[0]?.input["Limit"], 1);
  assert.equal(calls[1]?.input["Limit"], 1);
  assert.equal(calls[1]?.input["Rule"], "nightly");
  assert.equal(calls[1]?.input["EventBusName"], "default");
});

test("Resource Explorer uses GetDefaultView then GetView then one Search", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const outcome = await probeResourceExplorer({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      calls.push({ name: value.constructor.name, input: value.input });
      if (value.constructor.name === "GetDefaultViewCommand") {
        return { ViewArn: "arn:aws:resource-explorer-2:region:account:view/default" };
      }
      if (value.constructor.name === "GetViewCommand") {
        return { View: { ViewArn: "arn:aws:resource-explorer-2:region:account:view/default" } };
      }
      return { Resources: [], NextToken: "ignored-next-page" };
    }
  });

  assert.equal(outcome, "success");
  assert.deepEqual(calls.map((call) => call.name), [
    "GetDefaultViewCommand",
    "GetViewCommand",
    "SearchCommand"
  ]);
  assert.equal(calls[2]?.input["MaxResults"], 1);
});

test("Resource Explorer missing default setup is not_configured without Search", async () => {
  let calls = 0;
  const outcome = await probeResourceExplorer({
    async send() {
      calls += 1;
      return {};
    }
  });

  assert.equal(outcome, "not_configured");
  assert.equal(calls, 1);
});

test("Resource Explorer maps direct denial and transient errors to safe outcomes", async () => {
  for (const [name, expected] of [
    ["AccessDeniedException", "permission_denied"],
    ["ThrottlingException", "transient"]
  ] as const) {
    const outcome = await probeResourceExplorer({
      async send() {
        throw Object.assign(new Error("raw provider failure RequestId: private"), { name });
      }
    });
    assert.equal(outcome, expected);
  }
});

test("Resource Explorer Search ResourceNotFound is transient after the View was verified", async () => {
  let calls = 0;
  const outcome = await probeResourceExplorer({
    async send() {
      calls += 1;
      if (calls === 1) return { ViewArn: "arn:aws:resource-explorer-2:view/default" };
      if (calls === 2) {
        return { View: { ViewArn: "arn:aws:resource-explorer-2:view/default" } };
      }
      throw Object.assign(new Error("search view disappeared"), {
        name: "ResourceNotFoundException"
      });
    }
  });

  assert.equal(outcome, "transient");
});

test("Lambda without a resource policy is a successful readable seed", async () => {
  let calls = 0;
  const outcome = await probeLambda({
    async send() {
      calls += 1;
      if (calls === 1) return { Functions: [{ FunctionName: "seed" }] };
      throw Object.assign(new Error("policy missing"), { name: "ResourceNotFoundException" });
    }
  });

  assert.equal(outcome, "success");
  assert.equal(calls, 2);
});

test("S3 optional bucket configuration absence still proves read access", async () => {
  for (const missingName of [
    "NoSuchPublicAccessBlockConfiguration",
    "NoSuchBucketPolicy"
  ]) {
    let calls = 0;
    const outcome = await probeS3({
      async send() {
        calls += 1;
        if (calls === 1) return { Buckets: [{ Name: "seed" }] };
        throw Object.assign(new Error("optional setup missing"), { name: missingName });
      }
    });
    assert.equal(outcome, "success", missingName);
  }
});

test("catalog executors run sequentially to bound account-wide read pressure", async () => {
  let active = 0;
  let maximumActive = 0;
  const seen: AwsImportServiceKey[] = [];
  const executors = createExecutors(async (_context, serviceKey) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    seen.push(serviceKey);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active -= 1;
    return "success";
  });

  await probeAwsImportAccess(
    { connection },
    {
      executors,
      async assumeRole() {
        return {
          accessKeyId: "temporary-access-key",
          secretAccessKey: "temporary-secret-key",
          sessionToken: "temporary-session-token"
        };
      }
    }
  );

  assert.equal(maximumActive, 1);
  assert.deepEqual(seen, AWS_IMPORT_READERS.map((reader) => reader.serviceKey));
});

test("the overall read deadline aborts a slow executor before the operation lease", async () => {
  const startedAt = Date.now();
  const executors = createExecutors(async (context) => {
    if (!context.abortSignal) {
      await new Promise<void>((resolve) => setTimeout(resolve, 60));
      return "success";
    }
    await new Promise<void>((_resolve, reject) => {
      context.abortSignal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted raw request"), { name: "AbortError" }));
      }, { once: true });
    });
    return "success";
  });

  const result = await probeAwsImportAccess(
    { connection },
    {
      executors,
      readTimeoutMs: 10,
      async assumeRole() {
        return {
          accessKeyId: "temporary-access-key",
          secretAccessKey: "temporary-secret-key",
          sessionToken: "temporary-session-token"
        };
      }
    }
  );

  assert.equal(result.status, "retry_required");
  assert(Date.now() - startedAt < 1_000);
});

function createProbeDependencies(
  outcomes: Partial<Record<AwsImportServiceKey, AwsImportProbeOutcome>>
) {
  return {
    executors: createExecutors(async (_context, serviceKey) => outcomes[serviceKey] ?? "success"),
    async assumeRole() {
      return {
        accessKeyId: "temporary-access-key",
        secretAccessKey: "temporary-secret-key",
        sessionToken: "temporary-session-token"
      };
    }
  };
}

function createExecutors(
  execute: AwsImportProbeExecutor
): ReadonlyMap<AwsImportServiceKey, AwsImportProbeExecutor> {
  return new Map(
    AWS_IMPORT_READERS.map((reader) => [
      reader.serviceKey,
      (context) => execute(context, reader.serviceKey)
    ])
  );
}
