import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ArchitectureJson,
  ReverseEngineeringScan,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";

test("Reverse Engineering shared result separates scan metadata from restored architecture", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "resource-vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 0,
        positionY: 0,
        config: {}
      },
      {
        id: "resource-unknown-alb",
        type: "UNKNOWN",
        label: "Unknown ALB",
        positionX: 320,
        positionY: 0,
        config: {
          providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
          providerResourceId: "arn:aws:elasticloadbalancing:ap-northeast-2:1234********:loadbalancer/app/demo"
        }
      }
    ],
    edges: []
  };

  const scan: ReverseEngineeringScan = {
    id: "scan-1",
    projectId: "project-1",
    awsConnectionId: "aws-connection-1",
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["VPC", "EC2", "UNKNOWN"],
    status: "completed",
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:01:00.000Z",
    startedAt: "2026-07-05T00:00:10.000Z",
    completedAt: "2026-07-05T00:01:00.000Z",
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };

  const result = {
    scan,
    discoveredResources: [
      {
        id: "resource-vpc-main",
        provider: "aws",
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: "vpc-1234",
        region: "ap-northeast-2",
        displayName: "Main VPC",
        resourceType: "VPC",
        config: {}
      },
      {
        id: "resource-unknown-alb",
        provider: "aws",
        providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        providerResourceId: "arn:aws:elasticloadbalancing:ap-northeast-2:1234********:loadbalancer/app/demo",
        region: "ap-northeast-2",
        displayName: "Unknown ALB",
        resourceType: "UNKNOWN",
        config: {},
        analysisExcluded: true,
        importSuggestionStatus: "unsupported_resource_type"
      }
    ],
    architectureJson,
    findings: [],
    analysisExclusions: [
      {
        id: "analysis-exclusion-alb",
        resourceId: "resource-unknown-alb",
        reason: "unsupported_resource_type",
        message: "아직 정식 지원하지 않는 Resource라 분석에서 제외됐습니다."
      }
    ],
    importSuggestions: [
      {
        id: "import-vpc-main",
        resourceId: "resource-vpc-main",
        status: "ready",
        terraformAddress: "aws_vpc.main",
        importCommand: "terraform import aws_vpc.main vpc-1234",
        terraformBlockDraft: 'resource "aws_vpc" "main" {}',
        handoffReady: true
      },
      {
        id: "import-unknown-alb",
        resourceId: "resource-unknown-alb",
        status: "unsupported_resource_type",
        reason: "아직 정식 ResourceType으로 매핑되지 않았습니다.",
        handoffReady: false
      }
    ],
    scanErrors: []
  } satisfies ReverseEngineeringScanResult;

  assert.equal(result.scan.status, "completed");
  assert.equal(result.discoveredResources[1]?.analysisExcluded, true);
  assert.equal(result.importSuggestions[1]?.status, "unsupported_resource_type");
});

test("Reverse Engineering scan logs expose masked user-facing progress only", () => {
  const logLine = {
    id: "scan-log-1",
    scanId: "scan-1",
    sequence: 1,
    stage: "provider_api",
    level: "INFO",
    message: "ap-northeast-2 region의 VPC를 조회하고 있습니다.",
    createdAt: "2026-07-05T00:00:15.000Z"
  } satisfies ReverseEngineeringScanLogLine;

  assert.equal(logLine.level, "INFO");
  assert.equal("rawMessage" in logLine, false);
});
