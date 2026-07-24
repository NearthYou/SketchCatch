import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiscoveredResource,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import { RESOURCE_TYPES } from "@sketchcatch/types";
import {
  getReverseEngineeringProviderTypeLabel,
  presentReverseEngineeringResource,
  presentReverseEngineeringScanErrors
} from "./reverse-engineering-detail-presentation";
import {
  buildReverseEngineeringResourceAccordionModel,
  getReverseEngineeringCategoryReadStatusLabel,
  getReverseEngineeringResourceCategory,
  getSearchExpandedReverseEngineeringResourceCategories,
  REVERSE_ENGINEERING_RESOURCE_CATEGORIES,
  type ReverseEngineeringResourceCategoryKey
} from "./reverse-engineering-detail-model";

/** gg: 작은 고정 리소스로 분류·검색 계약을 읽기 쉽게 만듭니다. */
function createResource(
  id: string,
  providerResourceType: string,
  resourceType: DiscoveredResource["resourceType"],
  overrides: Partial<DiscoveredResource> = {}
): DiscoveredResource {
  return {
    config: {},
    displayName: id,
    id,
    provider: "aws",
    providerResourceId: id,
    providerResourceType,
    region: "ap-northeast-2",
    resourceType,
    ...overrides
  };
}

test("AWS 표기와 팔레트 type을 여섯 분류로 일관되게 묶는다", () => {
  assert.deepEqual(
    REVERSE_ENGINEERING_RESOURCE_CATEGORIES.map((category) => category.label),
    ["네트워크", "서버·컴퓨팅", "데이터·저장소", "보안·권한", "애플리케이션·운영", "기타 AWS 리소스"]
  );

  const cases = [
    ["AWS::EC2::NetworkInterface", undefined, "network"],
    ["AWS::EC2::SecurityGroupRule", undefined, "security"],
    ["AWS::RDS::DBParameterGroup", undefined, "data"],
    ["AWS::CloudFormation::Stack", undefined, "operations"],
    ["AWS::ECS::Service", undefined, "compute"],
    ["inventory-record", "DYNAMODB_TABLE", "data"],
    ["AWS::NewService::Widget", "UNKNOWN", "other"]
  ] as const satisfies readonly (readonly [
    string,
    DiscoveredResource["resourceType"] | undefined,
    ReverseEngineeringResourceCategoryKey
  ])[];

  for (const [providerResourceType, resourceType, expected] of cases) {
    assert.equal(
      getReverseEngineeringResourceCategory(providerResourceType, resourceType),
      expected,
      providerResourceType
    );
  }

  for (const resourceType of RESOURCE_TYPES) {
    const category = getReverseEngineeringResourceCategory("inventory-record", resourceType);
    assert.notEqual(category, undefined, resourceType);
  }
});

test("사람 이름은 유지하고 ARN과 내부 ID만 기본 상세 이름에서 숨긴다", () => {
  const arn = "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler";
  const presentation = presentReverseEngineeringResource(
    createResource("hidden", "AWS::Lambda::Function", "LAMBDA", {
      displayName: arn,
      providerResourceId: arn
    })
  );

  assert.equal(presentation.displayName, "orders-handler");
  assert.equal(presentation.serviceLabel, "Lambda");
  assert.equal(presentation.resourceKindLabel, "함수");
  assert.equal(presentation.sourceProviderType, "AWS::Lambda::Function");
  assert.equal(getReverseEngineeringProviderTypeLabel("AWS::CloudFormation::Stack"), "CloudFormation 스택");
  assert.equal(
    presentReverseEngineeringResource(
      createResource("opaque", "AWS::EC2::VPC", "VPC", {
        displayName: "",
        providerResourceId: "vpc-0123456789abcdef0"
      })
    ).displayName,
    "이름 미확인 VPC"
  );
});

test("검색은 결과가 있는 분류만 열고 읽기 실패를 리소스 상태와 섞지 않는다", () => {
  const coverage: ReverseEngineeringServiceCoverage = {
    status: "partial",
    unavailableServices: [
      {
        serviceKey: "ec2",
        displayName: "EC2",
        reason: "permission_required",
        remedy: "open_settings",
        affectedProviderResourceTypes: ["AWS::EC2::NetworkInterface"]
      },
      {
        serviceKey: "rds",
        displayName: "RDS",
        reason: "retry",
        remedy: "retry"
      }
    ],
    capabilityLimits: [
      {
        serviceKey: "resource-explorer",
        displayName: "Resource Explorer",
        reason: "not_supported"
      }
    ]
  };
  const model = buildReverseEngineeringResourceAccordionModel({
    coverage,
    resources: [
      createResource("production-vpc", "AWS::EC2::VPC", "VPC"),
      createResource("assets", "AWS::S3::Bucket", "S3"),
      createResource("viewer-role", "AWS::IAM::Role", "UNKNOWN")
    ],
    scanErrors: [],
    search: "S3 버킷"
  });
  const network = model.groups.find((group) => group.key === "network");
  const data = model.groups.find((group) => group.key === "data");
  const security = model.groups.find((group) => group.key === "security");

  assert.equal(network?.supportedCount, 1);
  assert.equal(network?.unreadableServiceCount, 1);
  assert.equal(network?.unreadableServices[0]?.serviceLabel, "EC2");
  assert.equal(data?.matchingResources[0]?.id, "assets");
  assert.equal(security?.reviewOnlyCount, 1);
  assert.equal(model.unclassifiedUnreadableServices[0]?.serviceLabel, "RDS");
  assert.equal(model.capabilityLimits[0]?.serviceLabel, "Resource Explorer");
  assert.deepEqual([...getSearchExpandedReverseEngineeringResourceCategories(model)], ["data"]);
  assert.equal(getReverseEngineeringCategoryReadStatusLabel(network?.unreadableServiceCount ?? 0), "읽기 실패 1");
  assert.equal(getReverseEngineeringCategoryReadStatusLabel(0), "읽기 완료");
});

test("스캔 오류는 raw message나 임의 service key 대신 짧은 안전한 안내를 반환한다", () => {
  const scanErrors: ReverseEngineeringScanError[] = [
    {
      affectedProviderResourceTypes: [
        "AWS::EC2::VPC",
        "arn:aws:ec2:ap-northeast-2:123456789012:vpc/vpc-secret"
      ],
      failedAwsApiActions: ["ec2:DescribeVpcs"],
      id: "scan-error-1",
      message: "Access denied for arn:aws:iam::123456789012:role/private-role",
      reason: "permission_denied",
      resourceType: "VPC",
      retryable: false,
      serviceKey: "ec2",
      stage: "provider_api"
    },
    {
      id: "scan-error-2",
      message: "do not render this raw provider error",
      reason: "provider_error",
      resourceType: "VPC",
      retryable: true,
      serviceKey: "untrusted-private-service-key",
      stage: "provider_api"
    }
  ];
  const presentation = presentReverseEngineeringScanErrors(scanErrors);

  assert.equal(presentation.length, 1);
  assert.deepEqual(presentation[0]?.affectedProviderResourceTypes, ["AWS::EC2::VPC"]);
  assert.equal(presentation[0]?.serviceLabel, "EC2");
  assert.equal(presentation[0]?.causeLabel, "권한 부족");
  assert.equal(presentation[0]?.action, "open_settings");
  assert.equal(JSON.stringify(presentation).includes("private-role"), false);
  assert.equal(JSON.stringify(presentation).includes("untrusted-private-service-key"), false);
});
