import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { classifyReverseEngineeringManagement } from "./reverse-engineering-management-policy.js";

test("자동 지원 워크로드와 AMI를 Terraform 관리 경계에 맞게 분류한다", () => {
  assert.equal(classifyReverseEngineeringManagement(resource("S3")), "managed");
  assert.equal(classifyReverseEngineeringManagement(resource("ECS_SERVICE")), "managed");
  assert.equal(classifyReverseEngineeringManagement(resource("AMI")), "reference");
});

test("AWS가 소유한 IAM service-linked Role과 KMS Key는 관리하지 않는다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(resource("IAM_ROLE", { roleName: "AWSServiceRoleForECS" })),
    "aws_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(resource("IAM_ROLE", { roleName: "AWSReservedSSO_Admin" })),
    "aws_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(resource("KMS_KEY", { keyManager: "AWS" })),
    "aws_managed"
  );
});

test("SketchCatch 연결 제어 Role, Policy, Stack은 Terraform 관리에서 제외한다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_ROLE", { roleName: "SketchCatchImportCfn-connection" })
    ),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_POLICY", { policyName: "SketchCatchImportRead-connection" })
    ),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("UNKNOWN", { stackName: "SketchCatchImportPolicy-connection" }, "AWS::CloudFormation::Stack")
    ),
    "sketchcatch_managed"
  );
});

test("CloudFormation 소유 증거가 있는 고객 리소스는 관리하지 않는다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", { cloudFormationStackId: "stack-123" })
    ),
    "reference"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", { managedBy: "cloudformation" })
    ),
    "reference"
  );
});

test("지원되지 않은 고객 리소스는 명시적 매핑 전까지 관리하지 않는다", () => {
  assert.equal(classifyReverseEngineeringManagement(resource("UNKNOWN")), "needs_mapping");
  assert.equal(
    classifyReverseEngineeringManagement(resource("LAMBDA", { functionName: "customer-handler" })),
    "needs_mapping"
  );
});

function resource(
  resourceType: ResourceType,
  config: Record<string, unknown> = {},
  providerResourceType = PROVIDER_RESOURCE_TYPES[resourceType] ?? `AWS::Test::${resourceType}`
): DiscoveredResource {
  return {
    id: `resource-${resourceType}`,
    provider: "aws",
    providerResourceType,
    providerResourceId: `aws-ref-${resourceType.toLowerCase()}`,
    region: "ap-northeast-2",
    displayName: `customer-${resourceType.toLowerCase()}`,
    resourceType,
    config
  };
}

const PROVIDER_RESOURCE_TYPES: Partial<Record<ResourceType, string>> = {
  IAM_ROLE: "AWS::IAM::Role",
  IAM_POLICY: "AWS::IAM::Policy",
  KMS_KEY: "AWS::KMS::Key"
};
