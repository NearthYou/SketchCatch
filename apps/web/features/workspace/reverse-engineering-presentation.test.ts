import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiscoveredResource,
  ResourceType,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import {
  getReverseEngineeringServiceLabel,
  presentReverseEngineeringScanErrors,
  presentReverseEngineeringResource,
  summarizeReverseEngineeringScan
} from "./reverse-engineering-presentation";
import {
  createReverseEngineeringFinalRegressionFixture,
  TASK9_REVIEW_ONLY_RESOURCE_IDS,
  TASK9_SUPPORTED_RESOURCE_IDS
} from "./reverse-engineering-final-regression.fixture";

type LegacyReverseEngineeringScanResult = Omit<
  ReverseEngineeringScanResult,
  "reverseEngineeringDraft" | "scan"
> & {
  scan: Omit<ReverseEngineeringScanResult["scan"], "resourceTypes"> & {
    resourceTypes: ResourceType[];
  };
};

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

const legacySavedScanResult = {
  scan: {
    id: "scan-legacy",
    projectId: "project-legacy",
    awsConnectionId: "aws-connection-legacy",
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["VPC", "LAMBDA", "IAM_ROLE"],
    status: "completed",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:01:00.000Z",
    startedAt: "2026-07-16T00:00:00.000Z",
    completedAt: "2026-07-16T00:01:00.000Z",
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  },
  architectureJson: {
    nodes: [
      { id: "vpc-legacy", type: "VPC", label: "Production VPC", positionX: 0, positionY: 0, config: {} },
      {
        id: "lambda-legacy",
        type: "LAMBDA",
        label: "legacy-orders-handler",
        positionX: 240,
        positionY: 0,
        config: {}
      }
    ],
    edges: [
      {
        id: "edge-lambda-legacy-vpc-legacy",
        sourceId: "vpc-legacy",
        targetId: "lambda-legacy"
      }
    ]
  },
  discoveredResources: [
    {
      id: "vpc-legacy",
      provider: "aws",
      providerResourceType: "AWS::EC2::VPC",
      providerResourceId: "vpc-0123456789abcdef0",
      region: "ap-northeast-2",
      displayName: "Production VPC",
      resourceType: "VPC",
      config: {}
    },
    {
      id: "lambda-legacy",
      provider: "aws",
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId:
        "arn:aws:lambda:ap-northeast-2:123456789012:function:legacy-orders-handler",
      displayName:
        "arn:aws:lambda:ap-northeast-2:123456789012:function:legacy-orders-handler",
      region: "ap-northeast-2",
      resourceType: "LAMBDA",
      config: {},
      analysisExcluded: true,
      relationships: [{ type: "connects_to", targetResourceId: "vpc-legacy" }]
    },
    {
      id: "iam-role-legacy",
      provider: "aws",
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/legacy-read-only",
      displayName: "legacy-read-only",
      region: "ap-northeast-2",
      resourceType: "UNKNOWN",
      config: {}
    }
  ],
  findings: [
    {
      id: "finding-legacy",
      category: "configuration",
      severity: "medium",
      resourceId: "lambda-legacy",
      title: "검토가 필요한 Lambda",
      description: "과거 scan의 분석 결과입니다.",
      recommendation: "관계를 확인하세요."
    }
  ],
  analysisExclusions: [
    {
      id: "analysis-exclusion-legacy",
      resourceId: "iam-role-legacy",
      reason: "unsupported_resource_type",
      message: "아직 정식 지원하지 않는 Resource입니다."
    }
  ],
  importSuggestions: [
    {
      id: "import-vpc-legacy",
      resourceId: "vpc-legacy",
      status: "ready",
      handoffReady: true,
      terraformAddress: "aws_vpc.production",
      importCommand: "terraform import aws_vpc.production vpc-0123456789abcdef0",
      terraformBlockDraft: 'resource "aws_vpc" "production" {}'
    },
    {
      id: "import-iam-role-legacy",
      resourceId: "iam-role-legacy",
      status: "unsupported_resource_type",
      handoffReady: false,
      reason: "아직 정식 ResourceType으로 매핑되지 않았습니다."
    }
  ],
  scanErrors: [
    {
      id: "legacy-scan-error",
      resourceType: "S3",
      stage: "provider_api",
      reason: "permission_denied",
      message: "Denied",
      retryable: false
    }
  ]
} satisfies LegacyReverseEngineeringScanResult;

test("VPC는 지원됨 상태와 사람이 읽을 수 있는 서비스 이름으로 표시한다", () => {
  const presentation = presentReverseEngineeringResource(createResource());

  assert.equal(presentation.displayState, "supported");
  assert.equal(presentation.serviceLabel, "VPC");
  assert.equal(presentation.statusLabel, "배포 가능");
  assert.equal(presentation.displayName, "Production VPC");
});

test("지원 및 보드 표시 전용 AWS Resource 유형마다 사람이 읽을 수 있는 서비스 이름을 제공한다", () => {
  assert.deepEqual(
    Object.fromEntries(
      [
        "AWS::ApiGateway::RestApi",
        "AWS::CloudWatch::Alarm",
        "AWS::EC2::VPC",
        "AWS::EC2::Subnet",
        "AWS::EC2::Image",
        "AWS::EC2::InternetGateway",
        "AWS::EC2::RouteTable",
        "AWS::EC2::SecurityGroup",
        "AWS::EC2::Instance",
        "AWS::Events::Rule",
        "AWS::IAM::InstanceProfile",
        "AWS::IAM::Policy",
        "AWS::IAM::Role",
        "AWS::KMS::Key",
        "AWS::Lambda::Function",
        "AWS::Lambda::Permission",
        "AWS::Logs::LogGroup",
        "AWS::RDS::DBInstance",
        "AWS::S3::Bucket"
      ].map((providerResourceType) => [
        providerResourceType,
        getReverseEngineeringServiceLabel(providerResourceType)
      ])
    ),
    {
      "AWS::ApiGateway::RestApi": "API Gateway API",
      "AWS::CloudWatch::Alarm": "CloudWatch 알람",
      "AWS::EC2::VPC": "VPC",
      "AWS::EC2::Subnet": "서브넷",
      "AWS::EC2::Image": "AMI 이미지",
      "AWS::EC2::InternetGateway": "인터넷 게이트웨이",
      "AWS::EC2::RouteTable": "라우팅 테이블",
      "AWS::EC2::SecurityGroup": "보안 그룹",
      "AWS::EC2::Instance": "EC2 인스턴스",
      "AWS::Events::Rule": "EventBridge 규칙",
      "AWS::IAM::InstanceProfile": "IAM 인스턴스 프로필",
      "AWS::IAM::Policy": "IAM 정책",
      "AWS::IAM::Role": "IAM 역할",
      "AWS::KMS::Key": "KMS 암호화 키",
      "AWS::Lambda::Function": "Lambda 함수",
      "AWS::Lambda::Permission": "Lambda 호출 권한",
      "AWS::Logs::LogGroup": "CloudWatch 로그 그룹",
      "AWS::RDS::DBInstance": "RDS 데이터베이스",
      "AWS::S3::Bucket": "S3 버킷"
    }
  );
});

test("관계가 있는 보드 표시 전용 Lambda는 실제 타입과 사람이 붙인 이름을 유지한다", () => {
  const presentation = presentReverseEngineeringResource(
    createResource({
      displayName: "Order processing handler",
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:order-handler",
      relationships: [{ type: "depends_on", targetResourceId: "vpc-1" }],
      resourceType: "LAMBDA",
      analysisExcluded: true
    })
  );

  assert.equal(presentation.displayState, "review_only");
  assert.equal(presentation.serviceLabel, "Lambda 함수");
  assert.equal(presentation.statusLabel, "보드 표시만");
  assert.equal(presentation.displayName, "Order processing handler");
});

test("관계가 없는 보드 표시 전용 IAM Role은 실제 타입과 사람이 붙인 이름을 유지한다", () => {
  const presentation = presentReverseEngineeringResource(
    createResource({
      displayName: "Operations read-only role",
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/operations-read-only",
      relationships: [],
      resourceType: "IAM_ROLE",
      analysisExcluded: true
    })
  );

  assert.equal(presentation.displayState, "review_only");
  assert.equal(presentation.statusLabel, "보드 표시만");
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

test("displayName에 들어온 ARN은 사람 이름으로 바꾸고 원본 identity는 보존한다", () => {
  const providerResourceId = "arn:aws:lambda:ap-northeast-2:123456789012:function:order-handler";
  const presentation = presentReverseEngineeringResource(
    createResource({
      displayName: providerResourceId,
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId
    })
  );

  assert.equal(presentation.displayName, "order-handler");
  assert.equal(presentation.technicalIdentity, providerResourceId);
});

test("displayName에 들어온 내부 resource ID는 서비스 기반 기본 이름으로 바꾼다", () => {
  const providerResourceId = "resource-01JQFWQCHB9M7RG40V9DRY7TZE";
  const presentation = presentReverseEngineeringResource(
    createResource({
      displayName: providerResourceId,
      providerResourceId
    })
  );

  assert.equal(presentation.displayName, "이름 미확인 VPC");
  assert.equal(presentation.technicalIdentity, providerResourceId);
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

test("과거 저장 scan JSONB는 새 표시 필드 없이 안전하게 짧은 이름과 검토 상태를 계산한다", () => {
  const legacyLambda = legacySavedScanResult.discoveredResources.find(
    (resource) => resource.id === "lambda-legacy"
  );

  assert.ok(legacyLambda);

  const presentation = presentReverseEngineeringResource(legacyLambda);

  assert.deepEqual(presentation, {
    displayState: "review_only",
    displayName: "legacy-orders-handler",
    serviceLabel: "Lambda 함수",
    statusLabel: "보드 표시만",
    statusDescription:
      "보드에서 위치와 연결 관계를 확인할 수 있지만 Terraform 생성과 배포에는 자동으로 사용하지 않습니다.",
    regionLabel: "ap-northeast-2",
    technicalIdentity: "arn:aws:lambda:ap-northeast-2:123456789012:function:legacy-orders-handler"
  });
  assert.deepEqual(summarizeReverseEngineeringScan(legacySavedScanResult), {
    discoveredCount: 3,
    boardCount: 2,
    reviewOnlyCount: 2,
    unreadableServiceCount: 1
  });
});

test("스캔 요약은 발견, Board, 보드 표시 전용, 읽지 못한 서비스 수를 분리한다", () => {
  const summary = summarizeReverseEngineeringScan({
    architectureJson: {
      nodes: [{ id: "vpc-1", type: "VPC", label: "VPC", positionX: 0, positionY: 0, config: {} }],
      edges: []
    },
    discoveredResources: [
      createResource(),
      createResource({ id: "unknown-1", resourceType: "UNKNOWN" }),
      createResource({ id: "excluded-1", analysisExcluded: true })
    ],
    scanErrors: [
      {
        id: "error-vpc",
        resourceType: "VPC",
        stage: "provider_api",
        reason: "permission_denied",
        message: "Denied",
        retryable: false
      },
      {
        id: "error-s3",
        resourceType: "S3",
        stage: "provider_api",
        reason: "throttled",
        message: "Throttled",
        retryable: true
      }
    ]
  });

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
      {
        id: "error-vpc-1",
        resourceType: "VPC",
        stage: "provider_api",
        reason: "permission_denied",
        message: "Denied",
        retryable: false
      },
      {
        id: "error-vpc-2",
        resourceType: "VPC",
        stage: "provider_api",
        reason: "throttled",
        message: "Throttled",
        retryable: true
      },
      {
        id: "error-s3",
        resourceType: "S3",
        stage: "provider_api",
        reason: "permission_denied",
        message: "Denied",
        retryable: false
      }
    ]
  });

  assert.equal(summary.unreadableServiceCount, 2);
});

test("부분 실패는 실제 AWS 서비스별로 합치고 내부 오류 대신 짧은 해결 방법만 보여준다", () => {
  const errors = presentReverseEngineeringScanErrors([
    {
      id: "scan-error-service-ec2",
      resourceType: "VPC",
      stage: "provider_api",
      reason: "permission_denied",
      message:
        "AccessDeniedException: arn:aws:iam::123456789012:role/internal cannot call ec2:DescribeVpcs",
      retryable: false
    },
    {
      id: "scan-error-service-ec2",
      resourceType: "SUBNET",
      stage: "provider_api",
      reason: "permission_denied",
      message: "RequestId: internal-request-id",
      retryable: false
    },
    {
      id: "scan-error-service-s3",
      resourceType: "S3",
      stage: "provider_api",
      reason: "throttled",
      message: "SlowDown: internal provider message",
      retryable: true
    }
  ]);

  assert.deepEqual(errors, [
    {
      key: "ec2",
      serviceName: "EC2",
      remedy: "가져오기 권한을 추가한 뒤 다시 시도해 주세요."
    },
    {
      key: "s3",
      serviceName: "S3",
      remedy: "잠시 후 다시 시도해 주세요."
    }
  ]);
  assert.doesNotMatch(JSON.stringify(errors), /AccessDenied|arn:aws|DescribeVpcs|RequestId|provider_api/);
});

test("UNKNOWN reader도 안전한 serviceKey로 서로 다른 AWS 서비스를 구분한다", () => {
  const errors = presentReverseEngineeringScanErrors([
    {
      id: "legacy-unknown-reader",
      serviceKey: "iam",
      resourceType: "UNKNOWN",
      stage: "provider_api",
      reason: "permission_denied",
      message: "raw IAM error",
      retryable: false
    },
    {
      id: "legacy-unknown-reader",
      serviceKey: "resource-explorer",
      resourceType: "UNKNOWN",
      stage: "provider_api",
      reason: "permission_denied",
      message: "raw Resource Explorer error",
      retryable: false
    }
  ]);

  assert.deepEqual(
    errors.map(({ key, serviceName }) => ({ key, serviceName })),
    [
      { key: "iam", serviceName: "IAM" },
      { key: "resource-explorer", serviceName: "Resource Explorer" }
    ]
  );
  assert.doesNotMatch(JSON.stringify(errors), /raw IAM|raw Resource Explorer|provider_api/);
});

test("최종 혼합 회귀 fixture는 지원됨, 보드 표시 전용, 읽지 못한 서비스를 분리해 사람이 이해할 수 있게 표시한다", () => {
  const { awsConnection, result } = createReverseEngineeringFinalRegressionFixture();
  const presentationById = new Map(
    result.discoveredResources.map((resource) => [
      resource.id,
      presentReverseEngineeringResource(resource)
    ])
  );

  assert.deepEqual(
    TASK9_SUPPORTED_RESOURCE_IDS.map((resourceId) => [
      resourceId,
      presentationById.get(resourceId)?.displayState
    ]),
    TASK9_SUPPORTED_RESOURCE_IDS.map((resourceId) => [resourceId, "supported"])
  );
  assert.equal(awsConnection.status, "verified");
  assert.deepEqual(
    [
      "load-balancer-task9",
      "cloudfront-task9",
      "ecs-cluster-task9",
      "ecs-service-task9",
      "ecs-task-definition-task9"
    ].map((resourceId) => [resourceId, presentationById.get(resourceId)?.serviceLabel]),
    [
      ["load-balancer-task9", "애플리케이션 로드 밸런서(ALB)"],
      ["cloudfront-task9", "CloudFront 배포"],
      ["ecs-cluster-task9", "ECS 클러스터"],
      ["ecs-service-task9", "ECS 서비스"],
      ["ecs-task-definition-task9", "ECS 작업 정의"]
    ]
  );
  assert.deepEqual(
    TASK9_REVIEW_ONLY_RESOURCE_IDS.map((resourceId) => [
      resourceId,
      presentationById.get(resourceId)?.displayState
    ]),
    TASK9_REVIEW_ONLY_RESOURCE_IDS.map((resourceId) => [resourceId, "review_only"])
  );
  assert.deepEqual(
    TASK9_REVIEW_ONLY_RESOURCE_IDS.map((resourceId) => {
      const resource = result.discoveredResources.find((item) => item.id === resourceId);

      return [resourceId, resource?.resourceType, resource?.analysisExcluded];
    }),
    [
      ["lambda-task9", "LAMBDA", true],
      ["iam-role-task9", "IAM_ROLE", true]
    ]
  );
  assert.equal(presentationById.get("lambda-task9")?.statusLabel, "보드 표시만");
  assert.equal(presentationById.get("iam-role-task9")?.statusLabel, "보드 표시만");
  assert.equal(presentationById.get("ecs-service-task9")?.displayState, "supported");
  assert.deepEqual(
    result.scanErrors.map((error) => error.resourceType),
    ["ECS_SERVICE"]
  );
  assert.deepEqual(summarizeReverseEngineeringScan(result), {
    discoveredCount: 10,
    boardCount: 10,
    reviewOnlyCount: 2,
    unreadableServiceCount: 1
  });
});
