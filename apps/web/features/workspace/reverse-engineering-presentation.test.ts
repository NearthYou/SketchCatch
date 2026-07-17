import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  getReverseEngineeringServiceLabel,
  presentReverseEngineeringResource,
  summarizeReverseEngineeringScan
} from "./reverse-engineering-presentation";

type LegacyReverseEngineeringScanResult = Omit<
  ReverseEngineeringScanResult,
  "reverseEngineeringDraft"
>;

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
    resourceTypes: ["ALL"],
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
  assert.equal(presentation.statusLabel, "지원됨");
  assert.equal(presentation.displayName, "Production VPC");
});

test("지원하는 AWS Resource 유형마다 사람이 읽을 수 있는 서비스 이름을 제공한다", () => {
  assert.deepEqual(
    Object.fromEntries(
      [
        "AWS::EC2::VPC",
        "AWS::EC2::Subnet",
        "AWS::EC2::InternetGateway",
        "AWS::EC2::RouteTable",
        "AWS::EC2::SecurityGroup",
        "AWS::EC2::Instance",
        "AWS::RDS::DBInstance",
        "AWS::S3::Bucket"
      ].map((providerResourceType) => [
        providerResourceType,
        getReverseEngineeringServiceLabel(providerResourceType)
      ])
    ),
    {
      "AWS::EC2::VPC": "VPC",
      "AWS::EC2::Subnet": "서브넷",
      "AWS::EC2::InternetGateway": "인터넷 게이트웨이",
      "AWS::EC2::RouteTable": "라우팅 테이블",
      "AWS::EC2::SecurityGroup": "보안 그룹",
      "AWS::EC2::Instance": "EC2 인스턴스",
      "AWS::RDS::DBInstance": "RDS 데이터베이스",
      "AWS::S3::Bucket": "S3 버킷"
    }
  );
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
    statusLabel: "확인 필요",
    statusDescription: "관계를 확인한 뒤 수동으로 반영할 수 있습니다.",
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

test("스캔 요약은 발견, Board, 확인 전용, 읽지 못한 서비스 수를 분리한다", () => {
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
