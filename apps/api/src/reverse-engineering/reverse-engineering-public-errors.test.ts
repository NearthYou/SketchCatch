import assert from "node:assert/strict";
import test from "node:test";
import { toAwsConnectionTestError } from "../aws-connections/aws-connection-test-service.js";
import {
  classifyReverseEngineeringConnectionFailure,
  createReverseEngineeringPublicCoverage
} from "./reverse-engineering-public-errors.js";

test("부분 실패는 AWS 서비스별 안전한 공개 범위로만 바꾼다", () => {
  const result = createReverseEngineeringPublicCoverage([
    {
      id: "scan-error-service-iam",
      serviceKey: "iam",
      resourceType: "UNKNOWN",
      stage: "provider_api",
      reason: "permission_denied",
      message:
        "AccessDenied arn:aws:iam::123456789012:role/private iam:ListRoles RequestId private-id",
      retryable: false
    },
    {
      id: "scan-error-resource-explorer",
      serviceKey: "resource-explorer-2",
      resourceType: "UNKNOWN",
      stage: "provider_api",
      reason: "provider_error",
      message: "SDK /Users/private/.aws/config Resource Explorer internal failure",
      retryable: true
    }
  ]);

  assert.deepEqual(result.coverage, {
    status: "partial",
    unavailableServices: [
      {
        serviceKey: "iam",
        displayName: "IAM",
        reason: "permission_required",
        remedy: "open_settings"
      },
      {
        serviceKey: "resource-explorer-2",
        displayName: "Resource Explorer",
        reason: "retry",
        remedy: "retry"
      }
    ]
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /AccessDenied|arn:aws|iam:ListRoles|RequestId|private-id|\/Users\/private|provider_api/iu
  );
});

test("같은 AWS 서비스의 여러 reader 실패는 공개 범위에서 한 번만 보인다", () => {
  const result = createReverseEngineeringPublicCoverage([
    {
      id: "legacy-vpc",
      serviceKey: "ec2",
      resourceType: "VPC",
      stage: "provider_api",
      reason: "permission_denied",
      message: "vpc raw",
      retryable: false
    },
    {
      id: "legacy-subnet",
      serviceKey: "ec2",
      resourceType: "SUBNET",
      stage: "provider_api",
      reason: "permission_denied",
      message: "subnet raw",
      retryable: false
    }
  ]);

  assert.equal(result.coverage.unavailableServices.length, 1);
  assert.equal(result.coverage.unavailableServices[0]?.displayName, "EC2");
});

test("서버의 SSO 또는 기본 AWS 자격 증명 실패를 고객 Role 권한 부족으로 표시하지 않는다", () => {
  const rawError = Object.assign(
    new Error("Could not load credentials from SSO /Users/private/.aws/sso/cache/token"),
    { name: "CredentialsProviderError" }
  );
  const safeConnectionError = toAwsConnectionTestError(rawError);
  const classification = classifyReverseEngineeringConnectionFailure(safeConnectionError);

  assert.equal(classification.internalCode, "caller_credentials_unavailable");
  assert.equal(classification.publicReason, "retry");
  assert.match(classification.publicMessage, /잠시 후 다시 시도/);
  assert.doesNotMatch(
    JSON.stringify(classification),
    /CredentialsProvider|SSO|profile|\/Users\/private|token/iu
  );
});

test("고객 Role 연결 거부만 환경설정 확인으로 분류한다", () => {
  const classification = classifyReverseEngineeringConnectionFailure(
    new Error("AWS Role assume permission denied")
  );

  assert.equal(classification.internalCode, "target_role_unavailable");
  assert.equal(classification.publicReason, "open_settings");
  assert.match(classification.publicMessage, /AWS Role 연결/);
});
