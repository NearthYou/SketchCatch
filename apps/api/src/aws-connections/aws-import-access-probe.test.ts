import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  AWS_IMPORT_READERS,
  type AwsImportServiceKey
} from "./aws-import-access-catalog.js";
import {
  AWS_IMPORT_PROBE_EXECUTORS,
  probeApplicationAutoScaling,
  probeAwsImportAccess,
  probeCloudFrontTopology,
  probeCloudWatchMetadata,
  probeElbv2Topology,
  probeEventBridge,
  probeIamRoleAttachments,
  probeLambda,
  probeLogsMetadata,
  probeResourceExplorer,
  probeS3,
  type AwsImportProbeExecutor,
  type AwsImportProbeOutcome
} from "./aws-import-access-probe.js";

test("ELBv2 probe는 첫 LB, Target Group, Listener의 속성과 태그만 읽는다", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const outcome = await probeElbv2Topology({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      calls.push({ name: value.constructor.name, input: value.input });
      if (value.constructor.name === "DescribeLoadBalancersCommand") {
        return { LoadBalancers: [{ LoadBalancerArn: "arn:aws:elasticloadbalancing:lb/app" }] };
      }
      if (value.constructor.name === "DescribeTargetGroupsCommand") {
        return { TargetGroups: [{ TargetGroupArn: "arn:aws:elasticloadbalancing:targetgroup/api" }] };
      }
      if (value.constructor.name === "DescribeListenersCommand") {
        return {
          Listeners: [{
            ListenerArn: "arn:aws:elasticloadbalancing:listener/app/https",
            Protocol: "HTTPS"
          }]
        };
      }
      return {};
    }
  });

  assert.equal(outcome, "success");
  assert.deepEqual(calls.map((call) => call.name), [
    "DescribeLoadBalancersCommand",
    "DescribeLoadBalancerAttributesCommand",
    "DescribeTagsCommand",
    "DescribeTargetGroupsCommand",
    "DescribeTargetGroupAttributesCommand",
    "DescribeTagsCommand",
    "DescribeListenersCommand",
    "DescribeListenerAttributesCommand",
    "DescribeListenerCertificatesCommand"
  ]);
  assert.equal(calls[0]?.input["PageSize"], 1);
  assert.deepEqual(calls[2]?.input["ResourceArns"], [
    "arn:aws:elasticloadbalancing:lb/app"
  ]);
  assert.equal(calls[3]?.input["PageSize"], 1);
  assert.deepEqual(calls[5]?.input["ResourceArns"], [
    "arn:aws:elasticloadbalancing:targetgroup/api"
  ]);
  assert.equal(calls[6]?.input["PageSize"], 1);
  assert.equal(calls[8]?.input["PageSize"], 1);
});

test("ELBv2 probe는 빈 목록과 비 TLS Listener의 추가 읽기를 생략한다", async () => {
  const emptyCalls: string[] = [];
  await probeElbv2Topology({
    async send(command) {
      emptyCalls.push(command.constructor.name);
      return { LoadBalancers: [] };
    }
  });
  assert.deepEqual(emptyCalls, ["DescribeLoadBalancersCommand"]);

  const httpCalls: string[] = [];
  await probeElbv2Topology({
    async send(command) {
      httpCalls.push(command.constructor.name);
      if (command.constructor.name === "DescribeLoadBalancersCommand") {
        return { LoadBalancers: [{ LoadBalancerArn: "arn:aws:elasticloadbalancing:lb/app" }] };
      }
      if (command.constructor.name === "DescribeTargetGroupsCommand") {
        return { TargetGroups: [] };
      }
      if (command.constructor.name === "DescribeListenersCommand") {
        return { Listeners: [{ ListenerArn: "listener-http", Protocol: "HTTP" }] };
      }
      return {};
    }
  });
  assert.equal(httpCalls.includes("DescribeListenerAttributesCommand"), true);
  assert.equal(httpCalls.includes("DescribeListenerCertificatesCommand"), false);
  assert.equal(httpCalls.includes("DescribeTargetGroupAttributesCommand"), false);
});

test("CloudWatch와 Logs probe는 첫 Resource ARN의 태그만 읽는다", async () => {
  const alarmCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  await probeCloudWatchMetadata({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      alarmCalls.push({ name: value.constructor.name, input: value.input });
      return value.constructor.name === "DescribeAlarmsCommand"
        ? { MetricAlarms: [{ AlarmArn: "arn:aws:cloudwatch:alarm/api" }] }
        : {};
    }
  });
  assert.deepEqual(alarmCalls.map((call) => call.name), [
    "DescribeAlarmsCommand",
    "ListTagsForResourceCommand"
  ]);
  assert.equal(alarmCalls[0]?.input["MaxRecords"], 1);
  assert.equal(alarmCalls[1]?.input["ResourceARN"], "arn:aws:cloudwatch:alarm/api");

  const logCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  await probeLogsMetadata({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      logCalls.push({ name: value.constructor.name, input: value.input });
      return value.constructor.name === "DescribeLogGroupsCommand"
        ? { logGroups: [{
            logGroupArn: "arn:aws:logs:ap-northeast-2:123:log-group:/ecs/api"
          }] }
        : {};
    }
  });
  assert.deepEqual(logCalls.map((call) => call.name), [
    "DescribeLogGroupsCommand",
    "ListTagsForResourceCommand"
  ]);
  assert.equal(logCalls[0]?.input["limit"], 1);
  assert.equal(
    logCalls[1]?.input["resourceArn"],
    "arn:aws:logs:ap-northeast-2:123:log-group:/ecs/api"
  );
});

test("CloudFront와 Auto Scaling probe는 첫 Resource의 태그만 읽는다", async () => {
  const cloudFrontCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  await probeCloudFrontTopology({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      cloudFrontCalls.push({ name: value.constructor.name, input: value.input });
      if (value.constructor.name === "ListDistributionsCommand") {
        return { DistributionList: { Items: [{ ARN: "arn:aws:cloudfront::123:distribution/D1" }] } };
      }
      return {};
    }
  });
  assert.deepEqual(cloudFrontCalls.map((call) => call.name), [
    "ListDistributionsCommand",
    "ListTagsForResourceCommand",
    "ListOriginAccessControlsCommand"
  ]);
  assert.equal(cloudFrontCalls[0]?.input["MaxItems"], 1);
  assert.equal(
    cloudFrontCalls[1]?.input["Resource"],
    "arn:aws:cloudfront::123:distribution/D1"
  );

  const scalingCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  await probeApplicationAutoScaling({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      scalingCalls.push({ name: value.constructor.name, input: value.input });
      if (value.constructor.name === "DescribeScalableTargetsCommand") {
        return {
          ScalableTargets: [{
            ResourceId: "service/cluster/api",
            ScalableDimension: "ecs:service:DesiredCount",
            ServiceNamespace: "ecs",
            ScalableTargetARN: "arn:aws:application-autoscaling:target/one"
          }]
        };
      }
      return {};
    }
  });
  assert.deepEqual(scalingCalls.map((call) => call.name), [
    "DescribeScalableTargetsCommand",
    "DescribeScalingPoliciesCommand",
    "ListTagsForResourceCommand"
  ]);
  assert.equal(scalingCalls[0]?.input["MaxResults"], 1);
  assert.equal(
    scalingCalls[2]?.input["ResourceARN"],
    "arn:aws:application-autoscaling:target/one"
  );
});

test("tag probe는 빈 목록이면 추가 호출하지 않는다", async () => {
  for (const probe of [probeCloudWatchMetadata, probeLogsMetadata, probeCloudFrontTopology]) {
    let calls = 0;
    await probe({
      async send() {
        calls += 1;
        return {};
      }
    });
    assert.equal(calls, probe === probeCloudFrontTopology ? 2 : 1);
  }
});

test("IAM probe는 첫 Role의 연결된 Managed Policy 읽기 권한까지 확인한다", async () => {
  const commands: object[] = [];
  const outcome = await probeIamRoleAttachments({
    async send(command) {
      commands.push(command);
      if (command.constructor.name === "ListRolesCommand") {
        return { Roles: [{ RoleName: "application-role" }] };
      }
      return {};
    }
  });

  assert.equal(outcome, "success");
  assert.deepEqual(commands.map((command) => command.constructor.name), [
    "ListRolesCommand",
    "ListPoliciesCommand",
    "ListInstanceProfilesCommand",
    "ListAttachedRolePoliciesCommand"
  ]);
});

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

test("새 데모 metadata 서비스 오류는 각각 안전한 expanded 제한으로 남긴다", async () => {
  const executors = createExecutors(async (_context, serviceKey) => {
    if (String(serviceKey) === "ecr") return "permission_denied";
    if (String(serviceKey) === "secretsmanager") return "transient";
    return "success";
  });
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
  assert.deepEqual(result.limitedServiceLabels, ["ECR", "Secrets Manager"]);
  assert.deepEqual(
    result.serviceResults
      .filter((service) => ["ecr", "secretsmanager"].includes(service.serviceKey))
      .map((service) => [service.serviceKey, service.outcome]),
    [
      ["ecr", "permission_denied"],
      ["secretsmanager", "transient"]
    ]
  );
});

test("EventBridge probe는 첫 Event Bus의 첫 Rule과 Target, tag metadata만 읽는다", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];

  const outcome = await probeEventBridge({
    async send(command) {
      const value = command as { constructor: { name: string }; input: Record<string, unknown> };
      calls.push({ name: value.constructor.name, input: value.input });
      if (value.constructor.name === "ListEventBusesCommand") {
        return { EventBuses: [{ Name: "orders-bus" }] };
      }
      if (value.constructor.name === "ListRulesCommand") {
        return {
            Rules: [{
              Name: "nightly",
              EventBusName: "orders-bus",
              Arn: "arn:aws:events:ap-northeast-2:123456789012:rule/orders-bus/nightly"
            }]
          };
      }
      return { Targets: [] };
    }
  });

  assert.equal(outcome, "success");
  assert.deepEqual(calls.map((call) => call.name), [
    "ListEventBusesCommand",
    "ListRulesCommand",
    "ListTargetsByRuleCommand",
    "ListTagsForResourceCommand"
  ]);
  assert.equal(calls[0]?.input["Limit"], 1);
  assert.equal(calls[1]?.input["Limit"], 1);
  assert.equal(calls[1]?.input["EventBusName"], "orders-bus");
  assert.equal(calls[2]?.input["Limit"], 1);
  assert.equal(calls[2]?.input["Rule"], "nightly");
  assert.equal(calls[2]?.input["EventBusName"], "orders-bus");
  assert.equal(
    calls[3]?.input["ResourceARN"],
    "arn:aws:events:ap-northeast-2:123456789012:rule/orders-bus/nightly"
  );
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
