import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  presentReverseEngineeringResource,
  summarizeReverseEngineeringScan
} from "./reverse-engineering-presentation";

function createResource(overrides: Partial<DiscoveredResource> = {}): DiscoveredResource {
  return {
    id: "resource-1",
    provider: "aws",
    providerResourceType: "AWS::EC2::VPC",
    providerResourceId: "vpc-0123456789abcdef0",
    region: "ap-northeast-2",
    displayName: "Production VPC",
    resourceType: "VPC",
    config: {},
    ...overrides
  };
}

test("VPC는 지원됨 상태와 사람이 읽을 수 있는 서비스 이름으로 표시한다", () => {
  const presentation = presentReverseEngineeringResource(createResource());

  assert.equal(presentation.displayState, "supported");
  assert.equal(presentation.serviceLabel, "VPC");
  assert.equal(presentation.statusLabel, "지원됨");
  assert.equal(presentation.displayName, "Production VPC");
});

test("관계가 있는 Lambda UNKNOWN은 확인 필요 상태로 사람이 붙인 이름을 유지한다", () => {
  const presentation = presentReverseEngineeringResource(
    createResource({
      displayName: "Order processing handler",
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:order-handler",
      relationships: [{ type: "depends_on", targetResourceId: "vpc-1" }],
      resourceType: "UNKNOWN"
    })
  );

  assert.equal(presentation.displayState, "review_only");
  assert.equal(presentation.serviceLabel, "Lambda 함수");
  assert.equal(presentation.statusLabel, "확인 필요");
  assert.equal(presentation.displayName, "Order processing handler");
});

test("관계가 없는 IAM Role UNKNOWN은 검토 전용 상태로 사람이 붙인 이름을 유지한다", () => {
  const presentation = presentReverseEngineeringResource(
    createResource({
      displayName: "Operations read-only role",
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/operations-read-only",
      relationships: [],
      resourceType: "UNKNOWN"
    })
  );

  assert.equal(presentation.displayState, "review_only");
  assert.equal(presentation.statusLabel, "검토 전용");
  assert.equal(presentation.displayName, "Operations read-only role");
});

test("ARN만 있는 UNKNOWN은 전체 ARN을 기본 이름으로 노출하지 않는다", () => {
  const presentation = presentReverseEngineeringResource(
    createResource({
      displayName: "",
      providerResourceType: "AWS::CloudFormation::Stack",
      providerResourceId: "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/example/abc",
      resourceType: "UNKNOWN"
    })
  );

  assert.equal(presentation.displayState, "review_only");
  assert.equal(presentation.serviceLabel, "AWS Resource");
  assert.equal(presentation.displayName.includes("arn:aws:"), false);
});

test("빈 이름의 비-ARN provider ID는 서비스 기반 기본 이름으로 표시하고 technical identity에만 보존한다", () => {
  const presentation = presentReverseEngineeringResource(
    createResource({
      displayName: "",
      providerResourceId: "vpc-0123456789abcdef0"
    })
  );

  assert.equal(presentation.displayName, "이름 미확인 VPC");
  assert.equal(presentation.technicalIdentity, "vpc-0123456789abcdef0");
});

test("스캔 요약은 발견, Board, 확인 전용, 읽지 못한 서비스 수를 분리한다", () => {
  const summary = summarizeReverseEngineeringScan({
    architectureJson: { nodes: [{ id: "vpc-1", type: "VPC", label: "VPC", positionX: 0, positionY: 0, config: {} }], edges: [] },
    discoveredResources: [
      createResource(),
      createResource({ id: "unknown-1", resourceType: "UNKNOWN" }),
      createResource({ id: "excluded-1", analysisExcluded: true })
    ],
    scanErrors: [
      { id: "error-vpc", resourceType: "VPC", stage: "provider_api", reason: "permission_denied", message: "Denied", retryable: false },
      { id: "error-s3", resourceType: "S3", stage: "provider_api", reason: "throttled", message: "Throttled", retryable: true }
    ]
  } as unknown as ReverseEngineeringScanResult);

  assert.deepEqual(summary, {
    discoveredCount: 3,
    boardCount: 1,
    reviewOnlyCount: 2,
    unreadableServiceCount: 2
  });
});

test("스캔 요약은 같은 Resource 서비스의 반복 오류를 하나의 읽지 못한 서비스로 센다", () => {
  const summary = summarizeReverseEngineeringScan({
    architectureJson: { nodes: [], edges: [] },
    discoveredResources: [],
    scanErrors: [
      { id: "error-vpc-1", resourceType: "VPC", stage: "provider_api", reason: "permission_denied", message: "Denied", retryable: false },
      { id: "error-vpc-2", resourceType: "VPC", stage: "provider_api", reason: "throttled", message: "Throttled", retryable: true },
      { id: "error-s3", resourceType: "S3", stage: "provider_api", reason: "permission_denied", message: "Denied", retryable: false }
    ]
  } as unknown as ReverseEngineeringScanResult);

  assert.equal(summary.unreadableServiceCount, 2);
});
