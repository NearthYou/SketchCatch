import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringResourceSelection } from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import {
  getNextReverseEngineeringResourceSelections,
  isReverseEngineeringResourceSelectionChecked,
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES,
  REVERSE_ENGINEERING_RESOURCE_TYPES
} from "./reverse-engineering-resource-types";

test("모든 AWS Resource 정의가 스캔 선택 목록에 한 번씩 들어간다", () => {
  const expectedResourceTypes = [
    ...new Set(
      resourceDefinitions
        .filter(
          (definition) =>
            definition.provider === "aws" &&
            definition.terraform.blockType === "resource" &&
            definition.terraform.resourceType.startsWith("aws_") &&
            definition.resourceType !== "UNKNOWN"
        )
        .map((definition) => definition.resourceType)
    )
  ];

  assert.deepEqual(REVERSE_ENGINEERING_RESOURCE_TYPES, expectedResourceTypes);
  assert.equal(REVERSE_ENGINEERING_RESOURCE_TYPES.includes("RANDOM_PASSWORD"), false);
  assert.equal(REVERSE_ENGINEERING_RESOURCE_TYPES.includes("AWS_CALLER_IDENTITY"), false);
});

test("하위 구성 선택은 중복 reader 없이 상위 AWS family로 요청한다", () => {
  assert.equal(REVERSE_ENGINEERING_RESOURCE_TYPES.includes("NETWORK_ACL_RULE"), true);
  assert.deepEqual(getNextReverseEngineeringResourceSelections([], "NETWORK_ACL_RULE"), [
    "NETWORK_ACL"
  ]);
  assert.equal(
    isReverseEngineeringResourceSelectionChecked(["NETWORK_ACL"], "NETWORK_ACL_RULE"),
    true
  );
  assert.deepEqual(getNextReverseEngineeringResourceSelections([], "KMS_ALIAS"), ["KMS_KEY"]);
  assert.deepEqual(getNextReverseEngineeringResourceSelections([], "API_GATEWAY_STAGE"), [
    "API_GATEWAY_REST_API"
  ]);
});

test("지원 Resource는 전체와 개별 AWS 스캔 선택에서 빠지지 않는다", () => {
  for (const resourceType of [
    "LOAD_BALANCER",
    "CLOUDFRONT",
    "ECS_CLUSTER",
    "ECS_SERVICE",
    "ECS_TASK_DEFINITION",
    "CLOUDWATCH_LOG_GROUP",
    "API_GATEWAY_REST_API",
    "CLOUDWATCH_METRIC_ALARM",
    "LAMBDA",
    "IAM_ROLE",
    "KMS_KEY",
    "EVENTBRIDGE_RULE",
    "ROUTE_TABLE_ASSOCIATION",
    "ELASTIC_IP",
    "NAT_GATEWAY",
    "ECR_REPOSITORY",
    "SECRETS_MANAGER_SECRET"
  ] as const) {
    assert.equal(REVERSE_ENGINEERING_RESOURCE_TYPES.includes(resourceType), true);
  }
});

test("전체 선택은 모든 표시 Resource를 선택 상태로 유지한다", () => {
  const selections: ReverseEngineeringResourceSelection[] = [
    REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
  ];

  assert.equal(
    isReverseEngineeringResourceSelectionChecked(
      selections,
      REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
    ),
    true
  );
  assert.ok(
    REVERSE_ENGINEERING_RESOURCE_TYPES.every((resourceType) =>
      isReverseEngineeringResourceSelectionChecked(selections, resourceType)
    )
  );
});

test("전체 선택에서 개별 Resource를 해제하면 나머지 선택을 보존한다", () => {
  assert.deepEqual(
    getNextReverseEngineeringResourceSelections(
      [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION],
      "EC2"
    ),
    REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.filter((resourceType) => resourceType !== "EC2")
  );
});

test("마지막 개별 Resource를 고르면 전체 스캔 값으로 정규화한다", () => {
  assert.deepEqual(
    getNextReverseEngineeringResourceSelections(
      REVERSE_ENGINEERING_RESOURCE_TYPES.filter((resourceType) => resourceType !== "S3"),
      "S3"
    ),
    [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION]
  );
});
