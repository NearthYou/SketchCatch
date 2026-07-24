import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiscoveredResource,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import { RESOURCE_TYPES } from "@sketchcatch/types";
import {
  buildReverseEngineeringResourceAccordionModel,
  getReverseEngineeringResourceCategory,
  getSearchExpandedReverseEngineeringResourceCategories,
  REVERSE_ENGINEERING_RESOURCE_CATEGORIES,
  type ReverseEngineeringResourceCategoryKey
} from "./reverse-engineering-detail-model";

function resource(
  id: string,
  providerResourceType: string,
  resourceType: DiscoveredResource["resourceType"]
): DiscoveredResource {
  return {
    id,
    provider: "aws",
    providerResourceType,
    providerResourceId: id,
    region: "ap-northeast-2",
    displayName: id,
    resourceType,
    config: {}
  };
}

test("Resource Explorer·Tagging·CloudFormation의 타입 표기도 기존 여섯 분류로 묶는다", () => {
  assert.deepEqual(
    REVERSE_ENGINEERING_RESOURCE_CATEGORIES.map((category) => category.label),
    ["네트워크", "서버·컴퓨팅", "데이터·저장소", "보안·권한", "애플리케이션·운영", "기타 AWS 리소스"]
  );

  const cases = [
    ["AWS::EC2::NetworkInterface", "network"],
    ["AWS::EC2::DhcpOptions", "network"],
    ["AWS::EC2::SecurityGroupRule", "security"],
    ["AWS::RDS::DBParameterGroup", "data"],
    ["AWS::RDS::DBOptionGroup", "data"],
    ["AWS::CloudFormation::Stack", "operations"],
    ["AWS::S3::Bucket", "data"],
    ["AWS::ECS::Service", "compute"],
    ["AWS::IAM::Role", "security"]
  ] as const satisfies readonly (readonly [string, ReverseEngineeringResourceCategoryKey])[];

  for (const [providerResourceType, expectedCategory] of cases) {
    assert.equal(
      getReverseEngineeringResourceCategory(providerResourceType),
      expectedCategory,
      providerResourceType
    );
  }

  assert.equal(
    getReverseEngineeringResourceCategory("inventory-record", "NETWORK_ACL"),
    "network"
  );
  assert.equal(
    getReverseEngineeringResourceCategory("tagging-record", "DYNAMODB_TABLE"),
    "data"
  );
  assert.equal(getReverseEngineeringResourceCategory("AWS::NewService::Widget", "UNKNOWN"), "other");
});

test("팔레트에 있는 AWS 리소스 enum은 UNKNOWN 외에 기타로 빠지지 않는다", () => {
  const resourceTypesWithoutAwsPalette = new Set<ReverseEngineeringResourceSelection>([
    "RANDOM_PASSWORD",
    "UNKNOWN"
  ]);

  for (const resourceType of RESOURCE_TYPES) {
    if (resourceTypesWithoutAwsPalette.has(resourceType)) {
      continue;
    }

    assert.notEqual(
      getReverseEngineeringResourceCategory("inventory-record", resourceType),
      "other",
      resourceType
    );
  }
});

test("검색은 결과가 있는 분류만 열고, 읽기 실패는 리소스 분류와 따로 집계한다", () => {
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
        reason: "permission_required",
        remedy: "open_settings",
        affectedProviderResourceTypes: ["AWS::RDS::DBOptionGroup"]
      },
      {
        serviceKey: "resource-explorer",
        displayName: "Resource Explorer",
        reason: "retry",
        remedy: "retry"
      }
    ]
  };
  const resources = [
    resource("production-vpc", "AWS::EC2::VPC", "VPC"),
    resource("assets", "AWS::S3::Bucket", "S3"),
    resource("viewer-role", "AWS::IAM::Role", "UNKNOWN")
  ];
  const unfiltered = buildReverseEngineeringResourceAccordionModel({
    resources,
    coverage,
    scanErrors: [],
    search: ""
  });
  const network = unfiltered.groups.find((group) => group.key === "network");
  const data = unfiltered.groups.find((group) => group.key === "data");
  const security = unfiltered.groups.find((group) => group.key === "security");

  assert.equal(network?.resources.length, 1);
  assert.equal(network?.supportedCount, 1);
  assert.equal(network?.unreadableServiceCount, 1);
  assert.deepEqual(network?.unreadableServiceNames, ["EC2"]);
  assert.equal(data?.resources.length, 1);
  assert.equal(data?.unreadableServiceCount, 1);
  assert.equal(security?.reviewOnlyCount, 1);
  assert.equal(unfiltered.unclassifiedUnreadableServiceCount, 1);
  assert.deepEqual(unfiltered.unclassifiedUnreadableServiceNames, ["Resource Explorer"]);
  assert.deepEqual([...getSearchExpandedReverseEngineeringResourceCategories(unfiltered)], []);

  const filtered = buildReverseEngineeringResourceAccordionModel({
    resources,
    coverage,
    scanErrors: [],
    search: "AWS::S3::Bucket"
  });

  assert.deepEqual([...getSearchExpandedReverseEngineeringResourceCategories(filtered)], ["data"]);
  assert.equal(filtered.groups.find((group) => group.key === "data")?.matchingResources[0]?.id, "assets");
  assert.equal(filtered.groups.find((group) => group.key === "network")?.matchingResources.length, 0);
});
