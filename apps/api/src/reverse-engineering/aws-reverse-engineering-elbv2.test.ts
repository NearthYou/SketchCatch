import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeListenerAttributesCommand,
  DescribeListenersCommand,
  DescribeLoadBalancerAttributesCommand,
  DescribeLoadBalancersCommand,
  DescribeTagsCommand,
  DescribeTargetGroupAttributesCommand,
  DescribeTargetGroupsCommand
} from "@aws-sdk/client-elastic-load-balancing-v2";
import type { ReverseEngineeringResourceSelection } from "@sketchcatch/types";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import type { AwsProviderScanInput } from "./aws-provider-adapter.js";
import {
  isReverseEngineeringPromotedResourceArn,
  readElasticLoadBalancingResourcesWithDiagnostics,
  uniqueDiscoveredRecordsByProviderId
} from "./aws-reverse-engineering-gateway.js";

const region = "ap-northeast-2";
const accountId = "123456789012";
const loadBalancerArn = `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/app/orders/lb-id`;
const targetGroupArn = `arn:aws:elasticloadbalancing:${region}:${accountId}:targetgroup/orders/tg-id`;
const listenerArn = `arn:aws:elasticloadbalancing:${region}:${accountId}:listener/app/orders/lb-id/listener-id`;
const credentials: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "access-key",
  AWS_SECRET_ACCESS_KEY: "secret-key",
  AWS_SESSION_TOKEN: "session-token",
  AWS_REGION: region
};

/** gg: ELBv2 family 선택값을 실제 provider scan 입력으로 만듭니다. */
function scanInput(
  resourceTypes: ReverseEngineeringResourceSelection[] = ["ALL"]
): AwsProviderScanInput {
  return { provider: "aws", region, resourceTypes };
}

/** gg: 안전한 ALB 한 개를 상세 reader 테스트용 SDK 응답으로 만듭니다. */
function loadBalancer() {
  return {
    LoadBalancerArn: loadBalancerArn,
    LoadBalancerName: "orders",
    Type: "application" as const,
    Scheme: "internet-facing" as const,
    DNSName: "orders.example.elb.amazonaws.com",
    VpcId: "vpc-orders",
    SecurityGroups: ["sg-orders"],
    AvailabilityZones: [{ ZoneName: `${region}a`, SubnetId: "subnet-public-a" }],
    State: { Code: "active" as const },
    IpAddressType: "ipv4" as const
  };
}

/** gg: 관리 가능한 HTTP/IP Target Group 응답을 한 곳에서 재사용합니다. */
function targetGroup() {
  return {
    TargetGroupArn: targetGroupArn,
    TargetGroupName: "orders-api",
    Protocol: "HTTP" as const,
    Port: 8080,
    VpcId: "vpc-orders",
    HealthCheckEnabled: true,
    HealthCheckProtocol: "HTTP" as const,
    HealthCheckPort: "traffic-port",
    HealthCheckPath: "/health",
    HealthCheckIntervalSeconds: 30,
    HealthCheckTimeoutSeconds: 5,
    HealthyThresholdCount: 2,
    UnhealthyThresholdCount: 2,
    Matcher: { HttpCode: "200-399" },
    TargetType: "ip" as const,
    LoadBalancerArns: [loadBalancerArn],
    IpAddressType: "ipv4" as const,
    ProtocolVersion: "HTTP1"
  };
}

/** gg: 단일 forward action만 가진 HTTP Listener 응답을 만듭니다. */
function listener() {
  return {
    ListenerArn: listenerArn,
    LoadBalancerArn: loadBalancerArn,
    Port: 80,
    Protocol: "HTTP" as const,
    DefaultActions: [{ Type: "forward" as const, TargetGroupArn: targetGroupArn }]
  };
}

test("ELBv2 reader는 ALB, Target Group, HTTP Listener의 상세 정보와 관계를 함께 읽는다", async () => {
  const commands: object[] = [];

  const result = await readElasticLoadBalancingResourcesWithDiagnostics(
    scanInput(),
    region,
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command);
        if (command instanceof DescribeLoadBalancersCommand) {
          return { LoadBalancers: [loadBalancer()] };
        }
        if (command instanceof DescribeLoadBalancerAttributesCommand) {
          return {
            Attributes: [
              { Key: "access_logs.s3.bucket", Value: "" },
              { Key: "access_logs.s3.enabled", Value: "false" },
              { Key: "access_logs.s3.prefix", Value: "" },
              { Key: "connection_logs.s3.bucket", Value: "" },
              { Key: "connection_logs.s3.enabled", Value: "false" },
              { Key: "connection_logs.s3.prefix", Value: "" },
              { Key: "deletion_protection.enabled", Value: "false" },
              { Key: "idle_timeout.timeout_seconds", Value: "60" },
              { Key: "routing.http2.enabled", Value: "true" }
            ]
          };
        }
        if (command instanceof DescribeTargetGroupsCommand) {
          return { TargetGroups: [targetGroup()] };
        }
        if (command instanceof DescribeTargetGroupAttributesCommand) {
          return {
            Attributes: [
              { Key: "deregistration_delay.timeout_seconds", Value: "120" },
              { Key: "load_balancing.algorithm.type", Value: "round_robin" },
              {
                Key: "load_balancing.cross_zone.enabled",
                Value: "use_load_balancer_configuration"
              },
              { Key: "slow_start.duration_seconds", Value: "0" },
              { Key: "stickiness.enabled", Value: "false" },
              { Key: "stickiness.type", Value: "lb_cookie" },
              { Key: "stickiness.lb_cookie.duration_seconds", Value: "86400" }
            ]
          };
        }
        if (command instanceof DescribeListenersCommand) {
          return { Listeners: [listener()] };
        }
        if (command instanceof DescribeListenerAttributesCommand) {
          return {
            Attributes: [{ Key: "routing.http.response.server.enabled", Value: "true" }]
          };
        }
        if (command instanceof DescribeTagsCommand) {
          return {
            TagDescriptions: command.input.ResourceArns?.map((ResourceArn) => ({
              ResourceArn,
              Tags: [
                { Key: "Environment", Value: "demo" },
                { Key: "Empty", Value: "" }
              ]
            }))
          };
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    })
  );

  assert.deepEqual(result.scanErrors, []);
  assert.deepEqual(
    result.records.map((record) => record.providerResourceType),
    [
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      "AWS::ElasticLoadBalancingV2::TargetGroup",
      "AWS::ElasticLoadBalancingV2::Listener"
    ]
  );
  const alb = result.records[0];
  const target = result.records[1];
  const httpListener = result.records[2];

  assert.equal(alb?.config["attributesReadComplete"], true);
  assert.equal(alb?.config["attributesProjectionComplete"], true);
  assert.equal(alb?.config["tagsReadComplete"], true);
  assert.deepEqual(alb?.config["tags"], [
    { key: "Environment", value: "demo" },
    { key: "Empty", value: "" }
  ]);
  assert.equal(target?.config["deregistrationDelay"], 120);
  assert.equal(target?.config["attributesReadComplete"], true);
  assert.equal(target?.config["attributesProjectionComplete"], true);
  assert.equal(target?.config["tagsReadComplete"], true);
  assert.deepEqual(target?.relationships, [
    { type: "depends_on", targetProviderResourceId: "vpc-orders" },
    { type: "attached_to", targetProviderResourceId: loadBalancerArn }
  ]);
  assert.equal(httpListener?.config["simpleForwardAction"], true);
  assert.equal(httpListener?.config["attributesReadComplete"], true);
  assert.equal(httpListener?.config["attributesProjectionComplete"], true);
  assert.equal(httpListener?.config["tagsReadComplete"], true);
  assert.deepEqual(httpListener?.relationships, [
    { type: "depends_on", targetProviderResourceId: loadBalancerArn },
    { type: "attached_to", targetProviderResourceId: targetGroupArn }
  ]);

  const tagCommands = commands.filter(
    (command): command is DescribeTagsCommand => command instanceof DescribeTagsCommand
  );
  assert.equal(tagCommands.length, 1);
  assert.deepEqual(tagCommands[0]?.input.ResourceArns, [
    loadBalancerArn,
    targetGroupArn,
    listenerArn
  ]);
});

test("ELBv2 reader는 unknown 또는 non-default attribute를 projection 불완전으로 표시한다", async () => {
  const result = await readElasticLoadBalancingResourcesWithDiagnostics(
    scanInput(),
    region,
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof DescribeLoadBalancersCommand) {
          return { LoadBalancers: [loadBalancer()] };
        }
        if (command instanceof DescribeLoadBalancerAttributesCommand) {
          return { Attributes: [{ Key: "future.attribute", Value: "default" }] };
        }
        if (command instanceof DescribeTargetGroupsCommand) {
          return { TargetGroups: [targetGroup()] };
        }
        if (command instanceof DescribeTargetGroupAttributesCommand) {
          return {
            Attributes: [
              { Key: "deregistration_delay.timeout_seconds", Value: "120" },
              { Key: "stickiness.enabled", Value: "true" }
            ]
          };
        }
        if (command instanceof DescribeListenersCommand) {
          return { Listeners: [listener()] };
        }
        if (command instanceof DescribeListenerAttributesCommand) {
          return {
            Attributes: [{ Key: "routing.http.response.server.enabled", Value: "false" }]
          };
        }
        if (command instanceof DescribeTagsCommand) {
          return {
            TagDescriptions: command.input.ResourceArns?.map((ResourceArn) => ({
              ResourceArn,
              Tags: []
            }))
          };
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    })
  );

  assert.deepEqual(
    result.records.map((record) => record.config["attributesProjectionComplete"]),
    [false, false, false]
  );
  assert.equal(result.records[1]?.config["deregistrationDelay"], 120);
});

test("ELBv2 reader는 빈 attribute와 누락 또는 불완전한 tag 응답을 complete로 표시하지 않는다", async () => {
  const result = await readElasticLoadBalancingResourcesWithDiagnostics(
    scanInput(),
    region,
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof DescribeLoadBalancersCommand) {
          return { LoadBalancers: [loadBalancer()] };
        }
        if (command instanceof DescribeLoadBalancerAttributesCommand) {
          return {};
        }
        if (command instanceof DescribeTargetGroupsCommand) {
          return { TargetGroups: [targetGroup()] };
        }
        if (command instanceof DescribeTargetGroupAttributesCommand) {
          return { Attributes: [] };
        }
        if (command instanceof DescribeListenersCommand) {
          return { Listeners: [listener()] };
        }
        if (command instanceof DescribeListenerAttributesCommand) {
          return { Attributes: [] };
        }
        if (command instanceof DescribeTagsCommand) {
          const [loadBalancerResourceArn, targetGroupResourceArn] =
            command.input.ResourceArns ?? [];
          return {
            TagDescriptions: [
              { ResourceArn: loadBalancerResourceArn, Tags: [] },
              { ResourceArn: targetGroupResourceArn, Tags: [{ Key: "Owner" }] }
            ]
          };
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    })
  );

  assert.deepEqual(
    result.records.map((record) => record.config["attributesProjectionComplete"]),
    [false, false, false]
  );
  assert.deepEqual(
    result.records.map((record) => record.config["tagsReadComplete"]),
    [true, false, false]
  );
  assert.deepEqual(result.records[0]?.config["tags"], []);
  assert.equal(result.records[1]?.config["tags"], undefined);
  assert.equal(result.records[2]?.config["tags"], undefined);
});

test("Target Group later page 실패는 앞 page와 안전한 scan error를 함께 보존한다", async () => {
  let targetGroupPages = 0;

  const result = await readElasticLoadBalancingResourcesWithDiagnostics(
    scanInput(["LOAD_BALANCER_TARGET_GROUP"]),
    region,
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof DescribeLoadBalancersCommand) {
          return { LoadBalancers: [loadBalancer()] };
        }
        if (command instanceof DescribeLoadBalancerAttributesCommand) {
          return { Attributes: [] };
        }
        if (command instanceof DescribeTargetGroupsCommand) {
          targetGroupPages += 1;
          if (targetGroupPages === 2) {
            throw Object.assign(new Error(`AccessDenied ${targetGroupArn}`), {
              name: "AccessDeniedException",
              requestId: "private-request-id"
            });
          }
          return { TargetGroups: [targetGroup()], NextMarker: "page-2" };
        }
        if (command instanceof DescribeTargetGroupAttributesCommand) {
          return { Attributes: [] };
        }
        if (command instanceof DescribeTagsCommand) {
          return { TagDescriptions: [] };
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    })
  );

  assert.equal(
    result.records.some(
      (record) => record.providerResourceType === "AWS::ElasticLoadBalancingV2::TargetGroup"
    ),
    true
  );
  assert.equal(
    result.scanErrors.some((error) => error.resourceType === "LOAD_BALANCER_TARGET_GROUP"),
    true
  );
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /private-request-id|arn:aws/iu);
});

test("Listener later page 실패와 attribute 실패는 읽은 결과를 incomplete로 닫는다", async () => {
  let listenerPages = 0;

  const result = await readElasticLoadBalancingResourcesWithDiagnostics(
    scanInput(["LOAD_BALANCER_LISTENER"]),
    region,
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof DescribeLoadBalancersCommand) {
          return { LoadBalancers: [loadBalancer()] };
        }
        if (command instanceof DescribeLoadBalancerAttributesCommand) {
          return { Attributes: [] };
        }
        if (command instanceof DescribeTargetGroupsCommand) {
          return { TargetGroups: [targetGroup()] };
        }
        if (command instanceof DescribeTargetGroupAttributesCommand) {
          return { Attributes: [] };
        }
        if (command instanceof DescribeListenersCommand) {
          listenerPages += 1;
          if (listenerPages === 2) {
            throw new Error("InternalServerException private-listener-page");
          }
          return { Listeners: [listener()], NextMarker: "listener-page-2" };
        }
        if (command instanceof DescribeListenerAttributesCommand) {
          throw new Error("AccessDenied private-listener-attribute");
        }
        if (command instanceof DescribeTagsCommand) {
          return { TagDescriptions: [] };
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    })
  );

  const httpListener = result.records.find(
    (record) => record.providerResourceType === "AWS::ElasticLoadBalancingV2::Listener"
  );
  assert.deepEqual(httpListener?.config["reverseEngineeringIncompleteDetails"], [
    "attributes",
    "tags"
  ]);
  assert.equal(
    result.scanErrors.some((error) => error.resourceType === "LOAD_BALANCER_LISTENER"),
    true
  );
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /private-listener/iu);
});

test("ELBv2 tag batch 실패는 대상 record를 incomplete로 남기고 20개 이하로만 요청한다", async () => {
  const tagBatchSizes: number[] = [];

  const result = await readElasticLoadBalancingResourcesWithDiagnostics(
    scanInput(["LOAD_BALANCER_TARGET_GROUP"]),
    region,
    credentials,
    () => ({
      async send(command: object): Promise<unknown> {
        if (command instanceof DescribeLoadBalancersCommand) {
          return { LoadBalancers: [loadBalancer()] };
        }
        if (command instanceof DescribeLoadBalancerAttributesCommand) {
          return { Attributes: [] };
        }
        if (command instanceof DescribeTargetGroupsCommand) {
          return { TargetGroups: [targetGroup()] };
        }
        if (command instanceof DescribeTargetGroupAttributesCommand) {
          return { Attributes: [] };
        }
        if (command instanceof DescribeTagsCommand) {
          tagBatchSizes.push(command.input.ResourceArns?.length ?? 0);
          throw new Error("AccessDenied private-tag-response");
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    })
  );

  assert.ok(tagBatchSizes.every((size) => size > 0 && size <= 20));
  assert.ok(
    result.records.every(
      (record) =>
        Array.isArray(record.config["reverseEngineeringIncompleteDetails"]) &&
        record.config["reverseEngineeringIncompleteDetails"].includes("tags")
    )
  );
  assert.ok(result.scanErrors.length > 0);
});

test("generic ELB inventory는 dedicated 상세 조회가 완전할 때만 중복에서 밀린다", () => {
  const generic = {
    providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroup",
    providerResourceId: targetGroupArn,
    displayName: "orders/tg-id",
    region,
    config: { service: "elasticloadbalancing", tags: [{ key: "Source", value: "generic" }] },
    relationships: []
  };
  const completeDedicated = {
    ...generic,
    displayName: "orders-api",
    config: {
      targetGroupName: "orders-api",
      reverseEngineeringDetailsVersion: 1,
      attributesReadComplete: true,
      tagsReadComplete: true
    }
  };
  const incompleteDedicated = {
    ...completeDedicated,
    config: {
      ...completeDedicated.config,
      attributesReadComplete: false,
      reverseEngineeringIncompleteDetails: ["attributes"]
    }
  };

  assert.equal(
    uniqueDiscoveredRecordsByProviderId([generic, completeDedicated])[0]?.displayName,
    "orders-api"
  );
  assert.equal(
    uniqueDiscoveredRecordsByProviderId([incompleteDedicated, generic])[0]?.displayName,
    "orders/tg-id"
  );
  assert.equal(isReverseEngineeringPromotedResourceArn(loadBalancerArn), false);
  assert.equal(isReverseEngineeringPromotedResourceArn(targetGroupArn), false);
  assert.equal(isReverseEngineeringPromotedResourceArn(listenerArn), false);
});
