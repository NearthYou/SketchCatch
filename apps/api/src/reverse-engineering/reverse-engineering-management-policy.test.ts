import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { classifyReverseEngineeringManagement } from "./reverse-engineering-management-policy.js";

test("자동 지원 워크로드와 AMI를 Terraform 관리 경계에 맞게 분류한다", () => {
  assert.equal(classifyReverseEngineeringManagement(resource("S3")), "managed");
  assert.equal(classifyReverseEngineeringManagement(resource("ECS_SERVICE")), "managed");
  assert.equal(
    classifyReverseEngineeringManagement(resource("CLOUDWATCH_LOG_GROUP")),
    "managed"
  );
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

test("KMS 연결 Log Group은 보드에만 남기고 암호화되지 않은 Log Group만 관리한다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_LOG_GROUP", { hasKmsKey: true })
    ),
    "needs_mapping"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("CLOUDWATCH_LOG_GROUP", {
        kmsKeyId:
          "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555"
      })
    ),
    "needs_mapping"
  );
  assert.equal(
    classifyReverseEngineeringManagement(resource("CLOUDWATCH_LOG_GROUP")),
    "managed"
  );
});

test("SketchCatch 연결 제어 Role과 Policy는 Terraform 관리에서 제외한다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_ROLE", { roleName: "SketchCatchImportCfn-cf4c4732fd3b8f8a" })
    ),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_POLICY", { policyName: "SketchCatchImportRead-cf4c4732fd3b8f8a" })
    ),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("IAM_ROLE", { roleName: "SketchCatchTerraformExecutionRole-467ff1a5" })
    ),
    "sketchcatch_managed"
  );
});

test("이름 접두사가 비슷할 뿐인 고객 IAM 리소스는 SketchCatch 소유로 오판하지 않는다", () => {
  for (const { resourceType, config } of [
    {
      resourceType: "IAM_ROLE" as const,
      config: { roleName: "SketchCatchTerraformCustomerArchive" }
    },
    {
      resourceType: "IAM_ROLE" as const,
      config: { roleName: "SketchCatchCodeBuilder" }
    },
    {
      resourceType: "IAM_POLICY" as const,
      config: { policyName: "SketchCatchImportCustomerData" }
    }
  ]) {
    assert.equal(
      classifyReverseEngineeringManagement(resource(resourceType, config)),
      "needs_mapping"
    );
  }
});

test("실제 import access Stack 이름은 대소문자와 무관하게 SketchCatch 관리로 분류한다", () => {
  for (const stackName of [
    "sketchcatch-import-cf4c4732fd3b8f8a-policy",
    "SKETCHCATCH-IMPORT-CF4C4732FD3B8F8A-MANAGER"
  ]) {
    assert.equal(
      classifyReverseEngineeringManagement(
        resource("UNKNOWN", { stackName }, "AWS::CloudFormation::Stack")
      ),
      "sketchcatch_managed"
    );
  }
});

test("AWS reader 형태의 CloudFormation ownership tag가 있으면 관리하지 않는다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", {
        tags: [
          {
            key: "aws:cloudformation:stack-id",
            value: "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/customer/stack-id"
          },
          { key: "aws:cloudformation:stack-name", value: "customer" }
        ]
      })
    ),
    "reference"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", {
        tags: [{ Key: "aws:cloudformation:logical-id", Value: "CustomerBucket" }]
      })
    ),
    "reference"
  );
});

test("SketchCatch ownership tag와 marker는 Resource 종류와 무관하게 보호한다", () => {
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("ECS_TASK_DEFINITION", {
        tags: [
          { key: "ManagedBy", value: "SketchCatch" },
          { key: "SketchCatchProject", value: "project-123" }
        ]
      })
    ),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(resource("UNKNOWN", { managedBy: "SketchCatch" })),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", { tags: [{ Key: "ManagedBy", Value: "SketchCatch" }] })
    ),
    "sketchcatch_managed"
  );
});

test("SketchCatch ownership 값은 정확히 일치할 때만 신뢰한다", () => {
  for (const value of ["sketchcatch", "SketchCatch ", "Terraform"]) {
    assert.equal(
      classifyReverseEngineeringManagement(
        resource("S3", { tags: [{ key: "ManagedBy", value }] })
      ),
      "managed"
    );
  }
  assert.equal(
    classifyReverseEngineeringManagement(
      resource("S3", { tags: [{ key: "SketchCatchProject", value: "project-123" }] })
    ),
    "managed"
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
