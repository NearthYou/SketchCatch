import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource } from "@sketchcatch/types";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord
} from "./aws-provider-adapter.js";
import {
  createReverseEngineeringTerraformProjection,
  createStableTerraformResourceName
} from "./reverse-engineering-terraform-projection.js";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";

const region = "ap-northeast-2";
const accountId = "123456789012";
const loadBalancerArn =
  `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/app/orders/a1b2c3d4e5f6a7b8`;
const targetGroupArn =
  `arn:aws:elasticloadbalancing:${region}:${accountId}:targetgroup/orders/b1c2d3e4f5a6b7c8`;
const listenerArn =
  `arn:aws:elasticloadbalancing:${region}:${accountId}:listener/app/orders/a1b2c3d4e5f6a7b8/c1d2e3f4a5b6c7d8`;

/** gg: 관리 가능한 ELBv2 chain과 VPC 원본 record를 같은 scan 순서로 만듭니다. */
function completeRecords(): AwsDiscoveredResourceRecord[] {
  return [
    {
      providerResourceType: "AWS::EC2::VPC",
      providerResourceId: "vpc-orders",
      displayName: "orders-vpc",
      region,
      config: { cidrBlock: "10.0.0.0/16", instanceTenancy: "default" },
      relationships: []
    },
    {
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: loadBalancerArn,
      displayName: "orders",
      region,
      config: {
        name: "orders",
        type: "application",
        scheme: "internet-facing",
        ipAddressType: "ipv4",
        subnetIds: ["subnet-public-a"],
        reverseEngineeringDetailsVersion: 1,
        attributesReadComplete: true,
        tagsReadComplete: true,
        attributes: {},
        tags: [{ key: "Environment", value: "demo" }]
      },
      relationships: [{ type: "depends_on", targetProviderResourceId: "vpc-orders" }]
    },
    {
      providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroup",
      providerResourceId: targetGroupArn,
      displayName: "orders-api",
      region,
      config: {
        name: "orders-api",
        targetGroupName: "orders-api",
        protocol: "HTTP",
        port: 8080,
        vpcId: "vpc-orders",
        targetType: "ip",
        healthCheck: {
          enabled: true,
          protocol: "HTTP",
          port: "traffic-port",
          path: "/health",
          matcher: "200-399",
          interval: 30,
          timeout: 5,
          healthyThreshold: 2,
          unhealthyThreshold: 2
        },
        deregistrationDelay: 120,
        reverseEngineeringDetailsVersion: 1,
        attributesReadComplete: true,
        tagsReadComplete: true,
        attributes: { "deregistration_delay.timeout_seconds": "120" },
        tags: [{ key: "Environment", value: "demo" }]
      },
      relationships: [
        { type: "depends_on", targetProviderResourceId: "vpc-orders" },
        { type: "attached_to", targetProviderResourceId: loadBalancerArn }
      ]
    },
    {
      providerResourceType: "AWS::ElasticLoadBalancingV2::Listener",
      providerResourceId: listenerArn,
      displayName: "HTTP:80",
      region,
      config: {
        port: 80,
        protocol: "HTTP",
        defaultAction: { type: "forward" },
        simpleForwardAction: true,
        reverseEngineeringDetailsVersion: 1,
        attributesReadComplete: true,
        tagsReadComplete: true,
        attributes: {},
        tags: [{ key: "Environment", value: "demo" }]
      },
      relationships: [
        { type: "depends_on", targetProviderResourceId: loadBalancerArn },
        { type: "attached_to", targetProviderResourceId: targetGroupArn }
      ]
    }
  ];
}

/** gg: 제공한 raw record를 공개 또는 서버 전용 adapter 결과로 변환합니다. */
async function scanRecords(
  records: AwsDiscoveredResourceRecord[],
  resultVisibility: "public" | "private"
) {
  return createAwsProviderAdapter(
    { async discoverResources() { return structuredClone(records); } },
    { resultVisibility }
  ).scan({ provider: "aws", region, resourceTypes: ["ALL"] });
}

test("완전한 Target Group과 HTTP Listener는 같은 scan 참조로 Terraform과 import를 만든다", async () => {
  const result = await scanRecords(completeRecords(), "private");
  const target = result.discoveredResources.find(
    (resource) => resource.resourceType === "LOAD_BALANCER_TARGET_GROUP"
  );
  const listener = result.discoveredResources.find(
    (resource) => resource.resourceType === "LOAD_BALANCER_LISTENER"
  );
  assert.ok(target);
  assert.ok(listener);

  const targetProjection = createReverseEngineeringTerraformProjection(
    target,
    result.discoveredResources
  );
  const listenerProjection = createReverseEngineeringTerraformProjection(
    listener,
    result.discoveredResources
  );
  const vpc = result.discoveredResources.find((resource) => resource.resourceType === "VPC");
  const alb = result.discoveredResources.find(
    (resource) => resource.resourceType === "LOAD_BALANCER"
  );
  assert.ok(vpc);
  assert.ok(alb);

  assert.equal(targetProjection.management, "managed");
  assert.equal(targetProjection.terraformResourceType, "aws_lb_target_group");
  assert.deepEqual(targetProjection.terraformValues, {
    name: "orders-api",
    port: 8080,
    protocol: "HTTP",
    targetType: "ip",
    vpcId: `aws_vpc.${targetProjectionName(vpc)}.id`,
    deregistrationDelay: 120,
    healthCheck: {
      enabled: true,
      protocol: "HTTP",
      port: "traffic-port",
      path: "/health",
      matcher: "200-399",
      interval: 30,
      timeout: 5,
      healthyThreshold: 2,
      unhealthyThreshold: 2
    },
    tags: { Environment: "demo" }
  });
  assert.equal(listenerProjection.management, "managed");
  assert.equal(listenerProjection.terraformResourceType, "aws_lb_listener");
  assert.deepEqual(listenerProjection.terraformValues, {
    loadBalancerArn: `aws_lb.${targetProjectionName(alb)}.arn`,
    port: 80,
    protocol: "HTTP",
    defaultAction: [{
      type: "forward",
      targetGroupArn: `aws_lb_target_group.${targetProjectionName(target)}.arn`
    }],
    tags: { Environment: "demo" }
  });

  const targetSuggestion = result.importSuggestions.find(
    (suggestion) => suggestion.resourceId === target.id
  );
  const listenerSuggestion = result.importSuggestions.find(
    (suggestion) => suggestion.resourceId === listener.id
  );
  assert.equal(targetSuggestion?.status, "ready");
  assert.match(targetSuggestion?.importCommand ?? "", new RegExp(targetGroupArn));
  assert.equal(listenerSuggestion?.status, "ready");
  assert.match(listenerSuggestion?.importCommand ?? "", new RegExp(listenerArn));
});

test("공개 ELBv2 결과에는 ARN을 숨기고 안전 판정과 편집 필드만 남긴다", async () => {
  const result = await scanRecords(completeRecords(), "public");
  const serialized = JSON.stringify(result);

  assert.doesNotMatch(serialized, /arn:aws:elasticloadbalancing/iu);
  for (const resource of result.discoveredResources.filter((candidate) =>
    candidate.resourceType === "LOAD_BALANCER" ||
    candidate.resourceType === "LOAD_BALANCER_TARGET_GROUP" ||
    candidate.resourceType === "LOAD_BALANCER_LISTENER"
  )) {
    assert.match(resource.providerResourceId, /^aws-ref-[a-f0-9]{24}$/u);
    assert.equal(resource.config["attributesReadComplete"], true);
    assert.equal(resource.config["tagsReadComplete"], true);
  }
});

test("지원 밖 Target Group과 Listener 또는 불완전 상세 조회는 needs_mapping으로 닫힌다", async () => {
  const scenarios: Array<{
    name: string;
    mutate(records: AwsDiscoveredResourceRecord[]): void;
    resourceType: "LOAD_BALANCER_TARGET_GROUP" | "LOAD_BALANCER_LISTENER";
  }> = [
    {
      name: "TCP Target Group",
      resourceType: "LOAD_BALANCER_TARGET_GROUP",
      mutate(records) { records[2]!.config["protocol"] = "TCP"; }
    },
    {
      name: "Lambda Target Group",
      resourceType: "LOAD_BALANCER_TARGET_GROUP",
      mutate(records) { records[2]!.config["targetType"] = "lambda"; }
    },
    {
      name: "ALB 관계 없는 Target Group",
      resourceType: "LOAD_BALANCER_TARGET_GROUP",
      mutate(records) { records[2]!.relationships = records[2]!.relationships.slice(0, 1); }
    },
    {
      name: "attribute 실패 Target Group",
      resourceType: "LOAD_BALANCER_TARGET_GROUP",
      mutate(records) {
        records[2]!.config["attributesReadComplete"] = false;
        records[2]!.config["reverseEngineeringIncompleteDetails"] = ["attributes"];
      }
    },
    {
      name: "HTTPS Listener",
      resourceType: "LOAD_BALANCER_LISTENER",
      mutate(records) { records[3]!.config["protocol"] = "HTTPS"; }
    },
    {
      name: "redirect Listener",
      resourceType: "LOAD_BALANCER_LISTENER",
      mutate(records) {
        records[3]!.config["simpleForwardAction"] = false;
        records[3]!.config["hasAdvancedDefaultAction"] = true;
      }
    },
    {
      name: "Target Group 관계 없는 Listener",
      resourceType: "LOAD_BALANCER_LISTENER",
      mutate(records) { records[3]!.relationships = records[3]!.relationships.slice(0, 1); }
    }
  ];

  for (const scenario of scenarios) {
    const records = completeRecords();
    scenario.mutate(records);
    const result = await scanRecords(records, "private");
    const resource = result.discoveredResources.find(
      (candidate) => candidate.resourceType === scenario.resourceType
    );
    assert.ok(resource, scenario.name);
    const projection = createReverseEngineeringTerraformProjection(
      resource,
      result.discoveredResources
    );
    assert.equal(projection.management, "needs_mapping", scenario.name);
    const suggestion = result.importSuggestions.find(
      (candidate) => candidate.resourceId === resource.id
    );
    assert.equal(suggestion?.handoffReady, false, scenario.name);
  }
});

test("과거 ALB 저장 결과는 새 상세 marker가 없어도 기존 읽기 동작을 유지한다", async () => {
  const records = completeRecords();
  delete records[1]!.config["reverseEngineeringDetailsVersion"];
  delete records[1]!.config["attributesReadComplete"];
  delete records[1]!.config["tagsReadComplete"];
  delete records[1]!.config["attributes"];

  const result = await scanRecords(records.slice(0, 2), "private");
  const alb = result.discoveredResources.find(
    (resource) => resource.resourceType === "LOAD_BALANCER"
  );
  assert.ok(alb);
  assert.equal(
    createReverseEngineeringTerraformProjection(alb, result.discoveredResources).management,
    "managed"
  );
});

test("저장된 완전한 ELBv2 chain은 읽기 보정 뒤에도 관리 상태를 유지하고 ARN은 숨긴다", async () => {
  const privateResult = await scanRecords(completeRecords(), "private");
  const publicResult = normalizeReverseEngineeringScanResult(
    privateResult.scan,
    privateResult
  );
  const target = publicResult.discoveredResources.find(
    (resource) => resource.resourceType === "LOAD_BALANCER_TARGET_GROUP"
  );
  const listener = publicResult.discoveredResources.find(
    (resource) => resource.resourceType === "LOAD_BALANCER_LISTENER"
  );
  assert.ok(target);
  assert.ok(listener);
  assert.match(target.providerResourceId, /^aws-ref-[a-f0-9]{24}$/u);
  assert.match(listener.providerResourceId, /^aws-ref-[a-f0-9]{24}$/u);
  assert.doesNotMatch(JSON.stringify(publicResult), /arn:aws/iu);

  for (const resource of [target, listener]) {
    const suggestion = publicResult.importSuggestions.find(
      (candidate) => candidate.resourceId === resource.id
    );
    const node = publicResult.architectureJson.nodes.find(
      (candidate) => candidate.id === resource.id
    );
    assert.equal(suggestion?.status, "ready");
    assert.equal(suggestion?.handoffReady, true);
    assert.equal(suggestion?.importCommand, undefined);
    assert.equal(node?.config["reverseEngineeringManagement"], "managed");
  }
});

/** gg: projection의 동일 이름 생성 함수를 외부 노출 없이 결과에서 읽습니다. */
function targetProjectionName(resource: DiscoveredResource): string {
  return createStableTerraformResourceName(resource.id);
}
