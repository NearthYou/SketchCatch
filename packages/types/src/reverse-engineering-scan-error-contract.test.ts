import assert from "node:assert/strict";
import test from "node:test";
import type {
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "./index.js";

test("Reverse Engineering partial failures can expose safe AWS API actions", () => {
  const scanError = {
    id: "scan-error-cloud-control",
    serviceKey: "cloud-control",
    affectedProviderResourceTypes: ["AWS::DynamoDB::Table"],
    failedAwsApiActions: ["cloudformation:GetResource"],
    resourceType: "UNKNOWN",
    stage: "provider_api",
    reason: "permission_denied",
    message: "일부 AWS 종류를 읽을 권한이 부족합니다.",
    retryable: false
  } satisfies ReverseEngineeringScanError;
  const coverage = {
    status: "partial",
    unavailableServices: [
      {
        serviceKey: "cloud-control",
        displayName: "Cloud Control",
        reason: "permission_required",
        remedy: "open_settings",
        failedAwsApiActions: ["cloudformation:GetResource"]
      }
    ]
  } satisfies ReverseEngineeringServiceCoverage;

  assert.deepEqual(scanError.failedAwsApiActions, ["cloudformation:GetResource"]);
  assert.deepEqual(coverage.unavailableServices[0]?.failedAwsApiActions, [
    "cloudformation:GetResource"
  ]);
});

test("Reverse Engineering scan error actions stay optional for old scan results", () => {
  const legacyScanError: ReverseEngineeringScanError = {
    id: "scan-error-ec2",
    resourceType: "VPC",
    stage: "provider_api",
    reason: "provider_error",
    message: "일부 AWS 종류를 읽지 못했습니다.",
    retryable: true
  };

  assert.equal(legacyScanError.failedAwsApiActions, undefined);
});
