import assert from "node:assert/strict";
import test from "node:test";
import {
  ListEventBusesCommand,
  ListRulesCommand,
  ListTagsForResourceCommand,
  ListTargetsByRuleCommand
} from "@aws-sdk/client-eventbridge";
import type {
  DiscoveredResource,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord
} from "./aws-provider-adapter.js";
import * as gatewayModule from "./aws-reverse-engineering-gateway.js";
import { classifyReverseEngineeringManagement } from "./reverse-engineering-management-policy.js";
import { createReverseEngineeringPublicCoverage } from "./reverse-engineering-public-errors.js";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";
import { createReverseEngineeringTerraformProjection } from "./reverse-engineering-terraform-projection.js";

const credentials: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "fixture-access-key",
  AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
  AWS_REGION: "ap-northeast-2"
};
const ruleArn = "arn:aws:events:ap-northeast-2:123456789012:rule/orders-bus/daily";
const logGroupArn =
  "arn:aws:logs:ap-northeast-2:123456789012:log-group:/aws/events/orders";

type EventBridgeReader = (
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: () => { send(command: object): Promise<unknown> }
) => Promise<{
  records: AwsDiscoveredResourceRecord[];
  scanErrors: Array<{ serviceKey?: string; reason: string }>;
}>;

type EventBridgeRelationshipResolver = (
  records: AwsDiscoveredResourceRecord[]
) => AwsDiscoveredResourceRecord[];

const readEventBridgeResourcesWithDiagnostics = (
  gatewayModule as unknown as {
    readEventBridgeResourcesWithDiagnostics?: EventBridgeReader;
  }
).readEventBridgeResourcesWithDiagnostics;
const resolveEventBridgeTargetRelationships = (
  gatewayModule as unknown as {
    resolveEventBridgeTargetRelationships?: EventBridgeRelationshipResolver;
  }
).resolveEventBridgeTargetRelationships;

test("EventBridge reader는 Rule과 각 Target의 모든 page를 읽고 원본 관계를 보존한다", async () => {
  assert.equal(typeof readEventBridgeResourcesWithDiagnostics, "function");
  if (!readEventBridgeResourcesWithDiagnostics) return;

  const commands: object[] = [];
  const result = await readEventBridgeResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command);
        if (command instanceof ListEventBusesCommand) {
          return command.input.NextToken
            ? { EventBuses: [{ Name: "orders-bus" }] }
            : { EventBuses: [{ Name: "default" }], NextToken: "buses-page-2" };
        }
        if (command instanceof ListRulesCommand) {
          if (command.input.EventBusName === "default") {
            return {
              Rules: [{
                Name: "scheduled",
                Arn: "arn:aws:events:ap-northeast-2:123456789012:rule/scheduled",
                EventBusName: "default",
                ScheduleExpression: "rate(5 minutes)",
                State: "ENABLED"
              }]
            };
          }
          return command.input.NextToken
            ? {
                Rules: []
              }
            : {
                Rules: [{
                  Name: "daily",
                  Arn: ruleArn,
                  Description: "Daily order event",
                  EventBusName: "orders-bus",
                  EventPattern: "{\"source\":[\"orders\"]}",
                  State: "ENABLED"
                }],
                NextToken: "rules-page-2"
              };
        }

        if (command instanceof ListTagsForResourceCommand) {
          return command.input.ResourceARN === ruleArn
            ? {
                Tags: [
                  { Key: "Environment", Value: "production" },
                  { Key: "Optional", Value: "" }
                ]
              }
            : { Tags: [] };
        }

        assert.ok(command instanceof ListTargetsByRuleCommand);
        if (command.input.Rule === "daily") {
          return command.input.NextToken
            ? {
                Targets: [{
                  Id: "lambda",
                  Arn: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders"
                }]
              }
            : {
                Targets: [{ Id: "logs", Arn: logGroupArn }],
                NextToken: "targets-page-2"
              };
        }
        return { Targets: [] };
      }
    })
  );

  assert.deepEqual(result.scanErrors, []);
  assert.deepEqual(
    commands
      .filter(
        (command): command is ListEventBusesCommand =>
          command instanceof ListEventBusesCommand
      )
      .map((command) => command.input.NextToken),
    [undefined, "buses-page-2"]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is ListRulesCommand =>
          command instanceof ListRulesCommand && command.input.EventBusName === "orders-bus"
      )
      .map((command) => command.input.NextToken),
    [undefined, "rules-page-2"]
  );
  assert.deepEqual(
    commands
      .filter(
        (command): command is ListTargetsByRuleCommand =>
          command instanceof ListTargetsByRuleCommand && command.input.Rule === "daily"
      )
      .map((command) => command.input.NextToken),
    [undefined, "targets-page-2"]
  );
  assert.equal(
    result.records.filter((record) => record.providerResourceType === "AWS::Events::Rule")
      .length,
    2
  );
  assert.equal(
    result.records.filter((record) => record.providerResourceType === "AWS::Events::Target")
      .length,
    2
  );
  const dailyRule = result.records.find((record) => record.displayName === "daily");
  assert.deepEqual(dailyRule?.config, {
    name: "daily",
    description: "Daily order event",
    eventBusName: "orders-bus",
    eventPattern: "{\"source\":[\"orders\"]}",
    state: "ENABLED",
    tagsReadComplete: true,
    tags: [
      { key: "Environment", value: "production" },
      { key: "Optional", value: "" }
    ]
  });
  const logsTarget = result.records.find((record) => record.displayName === "logs");
  assert.deepEqual(logsTarget?.relationships, [
    { type: "depends_on", targetProviderResourceId: ruleArn },
    { type: "attached_to", targetProviderResourceId: logGroupArn }
  ]);
});

test("EventBridge Target 뒤 page가 실패해도 앞 page와 다른 Rule을 살리고 안전한 진단 하나만 남긴다", async () => {
  assert.equal(typeof readEventBridgeResourcesWithDiagnostics, "function");
  if (!readEventBridgeResourcesWithDiagnostics) return;

  const result = await readEventBridgeResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof ListEventBusesCommand) {
          return {
            EventBuses: [{ Name: "default" }, { Name: "orders-bus" }]
          };
        }
        if (command instanceof ListRulesCommand) {
          return command.input.EventBusName === "orders-bus"
            ? {
                Rules: [{
                  Name: "daily",
                  Arn: ruleArn,
                  EventBusName: "orders-bus",
                  EventPattern: "{}",
                  State: "ENABLED"
                }]
              }
            : {
                Rules: [{
                Name: "scheduled",
                Arn: "arn:aws:events:ap-northeast-2:123456789012:rule/scheduled",
                EventBusName: "default",
                ScheduleExpression: "rate(1 hour)",
                State: "ENABLED"
                }]
              };
        }

        if (command instanceof ListTagsForResourceCommand) {
          return { Tags: [] };
        }

        assert.ok(command instanceof ListTargetsByRuleCommand);
        if (command.input.Rule === "daily" && command.input.NextToken) {
          throw Object.assign(new Error("private target page"), {
            name: "AccessDeniedException"
          });
        }
        if (command.input.Rule === "daily") {
          return {
            Targets: [{ Id: "logs", Arn: logGroupArn }],
            NextToken: "blocked-page"
          };
        }
        return { Targets: [] };
      }
    })
  );

  assert.deepEqual(
    result.records.map((record) => record.displayName).sort(),
    ["daily", "logs", "scheduled"]
  );
  assert.deepEqual(result.scanErrors, [
    {
      id: "scan-error-service-eventbridge",
      serviceKey: "eventbridge",
      resourceType: "EVENTBRIDGE_TARGET",
      stage: "provider_api",
      reason: "permission_denied",
      message: "이 서비스를 읽을 권한이 부족합니다.",
      retryable: false
    }
  ]);
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /private target page/iu);
});

test("EventBridge Rule 태그를 읽지 못하면 Rule과 Target 자동 관리를 함께 막는다", async () => {
  assert.equal(typeof readEventBridgeResourcesWithDiagnostics, "function");
  assert.equal(typeof resolveEventBridgeTargetRelationships, "function");
  if (!readEventBridgeResourcesWithDiagnostics || !resolveEventBridgeTargetRelationships) {
    return;
  }

  const readResult = await readEventBridgeResourcesWithDiagnostics(
    "ap-northeast-2",
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof ListEventBusesCommand) {
          return { EventBuses: [{ Name: "orders-bus" }] };
        }
        if (command instanceof ListRulesCommand) {
          return {
            Rules: [{
              Name: "daily",
              Arn: ruleArn,
              EventBusName: "orders-bus",
              EventPattern: "{}",
              State: "ENABLED"
            }]
          };
        }
        if (command instanceof ListTagsForResourceCommand) {
          throw Object.assign(new Error("private tag error"), {
            name: "AccessDeniedException"
          });
        }
        assert.ok(command instanceof ListTargetsByRuleCommand);
        return { Targets: [{ Id: "logs", Arn: logGroupArn }] };
      }
    })
  );
  const result = await scan(
    resolveEventBridgeTargetRelationships([...readResult.records, logGroupRecord()])
  );
  const rule = findResource(result, "EVENTBRIDGE_RULE");
  const target = findResource(result, "EVENTBRIDGE_TARGET");

  assert.equal(rule.config["tagsReadComplete"], false);
  assert.equal(classifyReverseEngineeringManagement(rule), "needs_mapping");
  assert.equal(classifyReverseEngineeringManagement(target), "needs_mapping");
  assert.ok(
    result.importSuggestions
      .filter((suggestion) => suggestion.resourceId === rule.id || suggestion.resourceId === target.id)
      .every((suggestion) => suggestion.status !== "ready")
  );
  assert.equal(readResult.scanErrors[0]?.serviceKey, "eventbridge");
  assert.doesNotMatch(JSON.stringify(readResult.scanErrors), /private tag error/iu);
});

test("별도 Role을 쓰는 EventBridge Rule의 단순 Target도 dangling Terraform 참조를 만들지 않는다", async () => {
  assert.equal(typeof resolveEventBridgeTargetRelationships, "function");
  if (!resolveEventBridgeTargetRelationships) return;

  const unsafeRule = eventRuleRecord();
  unsafeRule.config = { ...unsafeRule.config, hasRoleArn: true };
  const result = await scan(
    resolveEventBridgeTargetRelationships([
      unsafeRule,
      eventTargetRecord({ targetArn: logGroupArn }),
      logGroupRecord()
    ])
  );
  const rule = findResource(result, "EVENTBRIDGE_RULE");
  const target = findResource(result, "EVENTBRIDGE_TARGET");

  assert.equal(classifyReverseEngineeringManagement(rule), "needs_mapping");
  assert.equal(classifyReverseEngineeringManagement(target), "needs_mapping");
  assert.equal(target.config["ruleTerraformReference"], undefined);
  assert.equal(target.config["targetTerraformReference"], undefined);
});

test("발견된 Lambda ECS SNS 대상은 EventBridge Target 관계로만 안전하게 연결한다", () => {
  assert.equal(typeof resolveEventBridgeTargetRelationships, "function");
  if (!resolveEventBridgeTargetRelationships) return;

  const destinations = [
    {
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders",
      displayName: "orders",
      config: { functionName: "orders" }
    },
    {
      providerResourceType: "AWS::ECS::Cluster",
      providerResourceId: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders",
      displayName: "orders",
      config: { name: "orders" }
    },
    {
      providerResourceType: "AWS::SNS::Topic",
      providerResourceId: "arn:aws:sns:ap-northeast-2:123456789012:orders",
      displayName: "orders",
      config: {}
    }
  ];
  const records = destinations.flatMap((destination, index) => [
    {
      ...eventTargetRecord(
        { targetArn: destination.providerResourceId },
        `target-${index}`
      )
    },
    {
      ...destination,
      region: "ap-northeast-2",
      relationships: []
    }
  ]);
  const resolved = resolveEventBridgeTargetRelationships([eventRuleRecord(), ...records]);

  for (const [index, destination] of destinations.entries()) {
    const target = resolved.find(
      (record) => record.providerResourceId === `eventbridge-target:orders-bus/daily/target-${index}`
    );
    assert.ok(target);
    assert.ok(
      target.relationships.some(
        (relationship) =>
          relationship.targetProviderResourceId === destination.providerResourceId
      )
    );
    assert.equal(target.config["targetReferenceReady"], false);
  }
});

test("발견된 단순 Log Group Target은 Rule과 대상 참조를 가진 Terraform import로 승격한다", async () => {
  assert.equal(typeof resolveEventBridgeTargetRelationships, "function");
  if (!resolveEventBridgeTargetRelationships) return;

  const result = await scan(
    resolveEventBridgeTargetRelationships([
      eventRuleRecord(),
      eventTargetRecord({ targetArn: logGroupArn }),
      logGroupRecord()
    ])
  );
  const rule = findResource(result, "EVENTBRIDGE_RULE");
  const target = findResource(result, "EVENTBRIDGE_TARGET");
  const logGroup = findResource(result, "CLOUDWATCH_LOG_GROUP");
  const ruleSuggestion = result.importSuggestions.find(
    (suggestion) => suggestion.resourceId === rule.id
  );
  const targetSuggestion = result.importSuggestions.find(
    (suggestion) => suggestion.resourceId === target.id
  );

  assert.equal(ruleSuggestion?.status, "ready");
  assert.match(ruleSuggestion?.importCommand ?? "", / orders-bus\/daily$/u);
  assert.equal(targetSuggestion?.status, "ready");
  assert.match(targetSuggestion?.importCommand ?? "", / orders-bus\/daily\/logs$/u);
  assert.deepEqual(
    target.relationships?.map((relationship) => relationship.targetResourceId).sort(),
    [rule.id, logGroup.id].sort()
  );

  const ruleProjection = createReverseEngineeringTerraformProjection(rule);
  const targetProjection = createReverseEngineeringTerraformProjection(target);
  const logGroupProjection = createReverseEngineeringTerraformProjection(logGroup);
  assert.deepEqual(ruleProjection.terraformValues, {
    name: "daily",
    description: "Daily order event",
    eventBusName: "orders-bus",
    eventPattern: "{\"source\":[\"orders\"]}",
    state: "ENABLED",
    tags: { Environment: "production" }
  });
  assert.deepEqual(targetProjection.terraformValues, {
    targetId: "logs",
    eventBusName: "orders-bus",
    rule: `${ruleProjection.terraformResourceType}.${ruleProjection.terraformResourceName}.name`,
    arn: `${logGroupProjection.terraformResourceType}.${logGroupProjection.terraformResourceName}.arn`
  });
});

test("저장 결과를 공개 응답으로 바꿔도 EventBridge Target의 안전한 Terraform 참조를 보존한다", async () => {
  assert.equal(typeof resolveEventBridgeTargetRelationships, "function");
  if (!resolveEventBridgeTargetRelationships) return;

  const privateResult = await scan(
    resolveEventBridgeTargetRelationships([
      eventRuleRecord(),
      eventTargetRecord({ targetArn: logGroupArn }),
      logGroupRecord()
    ])
  );
  const publicResult = normalizeReverseEngineeringScanResult(
    privateResult.scan,
    privateResult
  );
  const target = findResource(publicResult, "EVENTBRIDGE_TARGET");
  const targetNode = publicResult.architectureJson.nodes.find(
    (node) => node.id === target.id
  );

  assert.match(String(target.config["ruleTerraformReference"]), /^aws_cloudwatch_event_rule\./u);
  assert.match(String(target.config["targetTerraformReference"]), /^aws_cloudwatch_log_group\./u);
  assert.match(String(targetNode?.config["rule"]), /^aws_cloudwatch_event_rule\./u);
  assert.match(String(targetNode?.config["arn"]), /^aws_cloudwatch_log_group\./u);
  assert.doesNotMatch(JSON.stringify(publicResult), /123456789012/gu);
});

test("외부 ARN과 고급 전달 설정이 있는 EventBridge Target은 항상 수동 매핑으로 닫는다", async () => {
  assert.equal(typeof resolveEventBridgeTargetRelationships, "function");
  if (!resolveEventBridgeTargetRelationships) return;

  for (const targetConfig of [
    { targetArn: "arn:aws:sns:ap-northeast-2:999999999999:external" },
    { targetArn: logGroupArn, roleArn: "arn:aws:iam::123456789012:role/events" },
    { targetArn: logGroupArn, input: "{\"demo\":true}" },
    { targetArn: logGroupArn, inputPath: "$.detail" },
    { targetArn: logGroupArn, inputTransformer: { InputTemplate: "{}" } },
    { targetArn: logGroupArn, deadLetterConfig: { Arn: "arn:aws:sqs:::dead" } },
    { targetArn: logGroupArn, retryPolicy: { MaximumRetryAttempts: 3 } },
    { targetArn: logGroupArn, ecsParameters: { TaskDefinitionArn: "task" } }
  ]) {
    const result = await scan(
      resolveEventBridgeTargetRelationships([
        eventRuleRecord(),
        eventTargetRecord(targetConfig),
        logGroupRecord()
      ])
    );
    const target = findResource(result, "EVENTBRIDGE_TARGET");
    const suggestion = result.importSuggestions.find(
      (candidate) => candidate.resourceId === target.id
    );

    assert.equal(classifyReverseEngineeringManagement(target), "needs_mapping");
    assert.equal(suggestion?.status, "manual_review");
    assert.equal(suggestion?.handoffReady, false);
    assert.deepEqual(createReverseEngineeringTerraformProjection(target), {
      management: "needs_mapping",
      terraformValues: {}
    });
  }
});

test("EventBridge 실패는 공개 coverage에서 EventBridge 서비스 하나로 표시한다", () => {
  const { coverage } = createReverseEngineeringPublicCoverage([
    {
      id: "scan-error-service-eventbridge",
      resourceType: "EVENTBRIDGE_RULE",
      stage: "provider_api",
      reason: "permission_denied",
      message: "private message",
      retryable: false
    },
    {
      id: "scan-error-service-eventbridge",
      resourceType: "EVENTBRIDGE_TARGET",
      stage: "provider_api",
      reason: "provider_error",
      message: "private message",
      retryable: true
    }
  ]);

  assert.deepEqual(coverage.unavailableServices, [
    {
      serviceKey: "eventbridge",
      displayName: "EventBridge",
      reason: "permission_required",
      remedy: "open_settings"
    }
  ]);
});

// gg: EventBridge Rule의 import와 projection에 필요한 안전한 fixture를 만듭니다.
function eventRuleRecord(): AwsDiscoveredResourceRecord {
  return {
    providerResourceType: "AWS::Events::Rule",
    providerResourceId: ruleArn,
    displayName: "daily",
    region: "ap-northeast-2",
    config: {
      name: "daily",
      description: "Daily order event",
      eventBusName: "orders-bus",
      eventPattern: "{\"source\":[\"orders\"]}",
      state: "ENABLED",
      tagsReadComplete: true,
      tags: [{ key: "Environment", value: "production" }]
    },
    relationships: []
  };
}

// gg: AWS Target 응답의 위험 필드는 resolver가 공개 marker로 바꾸도록 원본 모양으로 둡니다.
function eventTargetRecord(
  config: Record<string, unknown>,
  targetId = "logs"
): AwsDiscoveredResourceRecord {
  return {
    providerResourceType: "AWS::Events::Target",
    providerResourceId: `eventbridge-target:orders-bus/daily/${targetId}`,
    displayName: targetId,
    region: "ap-northeast-2",
    config: {
      targetId,
      ruleName: "daily",
      eventBusName: "orders-bus",
      ruleProviderResourceId: ruleArn,
      ...config
    },
    relationships: [{ type: "depends_on", targetProviderResourceId: ruleArn }]
  };
}

// gg: 단순 EventBridge Target이 안전하게 Terraform 참조할 관리 가능 Log Group입니다.
function logGroupRecord(): AwsDiscoveredResourceRecord {
  return {
    providerResourceType: "AWS::Logs::LogGroup",
    providerResourceId: `${logGroupArn}:*`,
    displayName: "/aws/events/orders",
    region: "ap-northeast-2",
    config: { logGroupName: "/aws/events/orders", retentionInDays: 30 },
    relationships: []
  };
}

// gg: 실제 private scan과 같은 adapter 경계에서 import suggestion까지 확인합니다.
async function scan(
  records: AwsDiscoveredResourceRecord[]
): Promise<ReverseEngineeringScanResult> {
  return createAwsProviderAdapter(
    {
      async discoverResources() {
        return records;
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
}

function findResource(
  result: ReverseEngineeringScanResult,
  resourceType: DiscoveredResource["resourceType"]
): DiscoveredResource {
  const resource = result.discoveredResources.find(
    (candidate) => candidate.resourceType === resourceType
  );
  assert.ok(resource, `${resourceType} fixture resource`);
  return resource;
}
