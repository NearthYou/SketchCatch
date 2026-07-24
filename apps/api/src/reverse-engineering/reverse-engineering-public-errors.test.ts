import assert from "node:assert/strict";
import test from "node:test";
import { toAwsConnectionTestError } from "../aws-connections/aws-connection-test-service.js";
import {
  classifyReverseEngineeringConnectionFailure,
  createReverseEngineeringPublicCoverage,
  sanitizeReverseEngineeringScanErrors
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

test("Cloud Control 조회 실패는 일반 AWS 인벤토리가 아니라 원래 서비스로 안내한다", () => {
  const scanErrors = [
    {
      id: "scan-error-service-cloud-control",
      serviceKey: "cloud-control",
      resourceType: "UNKNOWN" as const,
      stage: "provider_api" as const,
      reason: "permission_denied" as const,
      message: "AccessDenied private Cloud Control detail",
      retryable: false,
      affectedProviderResourceTypes: [
        "AWS::SQS::Queue",
        "arn:aws:sqs:ap-northeast-2:123456789012:private"
      ]
    },
    {
      id: "scan-error-service-cloud-control-second-type",
      serviceKey: "cloud-control",
      resourceType: "UNKNOWN" as const,
      stage: "provider_api" as const,
      reason: "provider_error" as const,
      message: "private DynamoDB reader failure",
      retryable: true,
      affectedProviderResourceTypes: ["AWS::DynamoDB::Table"]
    }
  ];

  const sanitized = sanitizeReverseEngineeringScanErrors(scanErrors);
  const coverage = createReverseEngineeringPublicCoverage(sanitized).coverage;

  assert.deepEqual(sanitized, [
    {
      id: "scan-error-service-cloud-control",
      serviceKey: "cloud-control",
      resourceType: "UNKNOWN",
      stage: "provider_api",
      reason: "permission_denied",
      message: "이 서비스를 읽을 권한이 부족합니다.",
      retryable: false,
      affectedProviderResourceTypes: ["AWS::DynamoDB::Table", "AWS::SQS::Queue"]
    }
  ]);
  assert.deepEqual(coverage.unavailableServices, [
    {
      serviceKey: "cloud-control",
      displayName: "Cloud Control",
      reason: "permission_required",
      remedy: "open_settings",
      affectedProviderResourceTypes: ["AWS::DynamoDB::Table", "AWS::SQS::Queue"]
    }
  ]);
  assert.doesNotMatch(JSON.stringify({ sanitized, coverage }), /arn:aws|private/iu);
});

test("확장 reader의 서비스 이름은 일반 AWS 인벤토리로 뭉개지지 않는다", () => {
  const scanErrors = [
    ["application-autoscaling", "Application Auto Scaling"],
    ["ecr", "ECR"],
    ["secretsmanager", "Secrets Manager"]
  ].map(([serviceKey]) => ({
    id: `scan-error-service-${serviceKey}`,
    serviceKey,
    resourceType: "UNKNOWN" as const,
    stage: "provider_api" as const,
    reason: "provider_error" as const,
    message: "private provider failure",
    retryable: true
  }));

  const coverage = createReverseEngineeringPublicCoverage(
    sanitizeReverseEngineeringScanErrors(scanErrors)
  ).coverage;

  assert.deepEqual(
    coverage.unavailableServices.map((service) => [service.serviceKey, service.displayName]),
    [
      ["application-autoscaling", "Application Auto Scaling"],
      ["ecr", "ECR"],
      ["secretsmanager", "Secrets Manager"]
    ]
  );
});

test("같은 서비스의 일시 오류 뒤 권한 오류가 오면 권한 보완 안내를 우선한다", () => {
  const scanErrors = [
    {
      id: "legacy-vpc",
      serviceKey: "ec2",
      resourceType: "VPC" as const,
      stage: "provider_api" as const,
      reason: "provider_error" as const,
      message: "temporary raw error",
      retryable: true
    },
    {
      id: "legacy-subnet",
      serviceKey: "ec2",
      resourceType: "SUBNET" as const,
      stage: "provider_api" as const,
      reason: "permission_denied" as const,
      message: "AccessDenied raw error",
      retryable: false
    }
  ];

  const coverage = createReverseEngineeringPublicCoverage(scanErrors).coverage;
  const sanitized = sanitizeReverseEngineeringScanErrors(scanErrors);

  assert.deepEqual(coverage.unavailableServices, [
    {
      serviceKey: "ec2",
      displayName: "EC2",
      reason: "permission_required",
      remedy: "open_settings"
    }
  ]);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0]?.reason, "permission_denied");
  assert.equal(sanitized[0]?.retryable, false);
});

test("서버의 AWS CLI SSO 로그인 만료만 재로그인 명령으로 안내한다", () => {
  const rawError = Object.assign(
    new Error("Could not load credentials from SSO /Users/private/.aws/sso/cache/token"),
    { name: "CredentialsProviderError" }
  );
  const safeConnectionError = toAwsConnectionTestError(rawError);
  const classification = classifyReverseEngineeringConnectionFailure(safeConnectionError);

  assert.equal(classification.internalCode, "caller_sso_session_expired");
  assert.equal(classification.publicReason, "retry");
  assert.match(classification.publicMessage, /AWS SSO 로그인이 만료/);
  assert.match(classification.publicMessage, /aws sso login/);
  assert.doesNotMatch(classification.publicMessage, /--profile/);
  assert.doesNotMatch(
    JSON.stringify(classification),
    /CredentialsProvider|profile|\/Users\/private|token/iu
  );
});

test("일반 AWS 자격 증명 만료에는 SSO 명령을 지어내지 않는다", () => {
  const classification = classifyReverseEngineeringConnectionFailure(
    Object.assign(new Error("AWS caller credentials are invalid or expired"), {
      name: "TokenProviderError"
    })
  );

  assert.equal(classification.internalCode, "caller_credentials_unavailable");
  assert.equal(classification.publicReason, "retry");
  assert.match(classification.publicMessage, /AWS 연결을 준비하지 못했습니다/);
  assert.doesNotMatch(classification.publicMessage, /aws sso login|--profile/iu);
});

test("오류 이름 안의 우연한 sso 문자열을 SSO 만료로 오인하지 않는다", () => {
  const classification = classifyReverseEngineeringConnectionFailure(
    Object.assign(new Error("Association lookup failed"), {
      name: "InvalidAssociationID.NotFound"
    })
  );

  assert.equal(classification.internalCode, "provider_unavailable");
  assert.doesNotMatch(classification.publicMessage, /aws sso login|SSO 로그인/iu);
});

test("고객 Role 연결 거부만 환경설정 확인으로 분류한다", () => {
  const classification = classifyReverseEngineeringConnectionFailure(
    new Error("AWS Role assume permission denied")
  );

  assert.equal(classification.internalCode, "target_role_unavailable");
  assert.equal(classification.publicReason, "open_settings");
  assert.match(classification.publicMessage, /AWS Role 연결/);
  assert.doesNotMatch(classification.publicMessage, /aws sso login|--profile/iu);
});

test("고객 Role의 region과 External ID 신뢰 설정 오류도 환경설정으로 안내한다", () => {
  const messages = [
    "AWS connection region must be ap-northeast-2",
    "AWS Role trust policy must require external ID",
    "AWS Role external ID requirement could not be verified"
  ];

  for (const message of messages) {
    const classification = classifyReverseEngineeringConnectionFailure(new Error(message));

    assert.equal(classification.internalCode, "target_role_unavailable", message);
    assert.equal(classification.publicReason, "open_settings", message);
    assert.match(classification.publicMessage, /AWS Role 연결/, message);
  }
});
