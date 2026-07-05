import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  createReverseEngineeringBoardApplication,
  createReverseEngineeringBoardComparison
} from "./reverse-engineering-board-application";

test("createReverseEngineeringBoardComparison separates new scan resources from existing board resources", () => {
  const currentDiagram = createDiagram({
    nodes: [
      createDiagramNode({
        id: "existing-vpc",
        providerResourceId: "vpc-1234",
        resourceName: "main",
        resourceType: "aws_vpc"
      })
    ]
  });
  const result = createScanResult();

  const comparison = createReverseEngineeringBoardComparison({
    currentDiagram,
    result
  });

  assert.deepEqual(
    comparison.additions.map((item) => item.nodeId),
    ["resource-subnet-1234"]
  );
  assert.deepEqual(
    comparison.duplicates.map((item) => item.nodeId),
    ["resource-vpc-1234"]
  );
  assert.equal(comparison.manualReviews.length, 0);
});

test("createReverseEngineeringBoardComparison reports conservative change and deletion candidates", () => {
  const currentDiagram = createDiagram({
    nodes: [
      createDiagramNode({
        id: "existing-vpc",
        providerResourceId: "vpc-1234",
        resourceName: "main",
        resourceType: "aws_vpc",
        values: {
          cidrBlock: "10.1.0.0/16"
        }
      }),
      createDiagramNode({
        id: "old-security-group",
        providerResourceId: "sg-9999",
        resourceName: "old",
        resourceType: "aws_security_group"
      })
    ]
  });

  const comparison = createReverseEngineeringBoardComparison({
    currentDiagram,
    result: createScanResult()
  });

  assert.deepEqual(
    comparison.changes.map((item) => item.nodeId),
    ["resource-vpc-1234"]
  );
  assert.deepEqual(
    comparison.deletions.map((item) => item.nodeId),
    ["old-security-group"]
  );
});


test("createReverseEngineeringBoardApplication can open scan result as a new board", () => {
  const currentDiagram = createDiagram({
    nodes: [
      createDiagramNode({
        id: "existing-vpc",
        providerResourceId: "vpc-9999",
        resourceName: "old",
        resourceType: "aws_vpc"
      })
    ],
    viewport: { x: 20, y: 30, zoom: 0.8 }
  });

  const application = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    result: createScanResult()
  });

  assert.deepEqual(
    application.diagram.nodes.map((node) => node.id),
    ["resource-vpc-1234", "resource-subnet-1234"]
  );
  assert.deepEqual(application.diagram.viewport, { x: 0, y: 0, zoom: 1 });
  assert.deepEqual(application.diagram.nodes[0]?.metadata?.reverseEngineering?.protectedValueKeys, [
    "providerResourceId",
    "providerResourceType",
    "region",
    "accountId",
    "terraformResourceName",
    "terraformResourceType"
  ]);
  assert.deepEqual(application.diagram.nodes[0]?.metadata?.reverseEngineering?.editableValueKeys, [
    "displayName",
    "description"
  ]);
});

test("createReverseEngineeringBoardApplication appends only providerResourceId-safe new resources", () => {
  const currentDiagram = createDiagram({
    nodes: [
      createDiagramNode({
        id: "existing-vpc",
        providerResourceId: "vpc-1234",
        resourceName: "main",
        resourceType: "aws_vpc"
      })
    ],
    viewport: { x: 20, y: 30, zoom: 0.8 }
  });

  const application = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "append",
    result: createScanResult()
  });

  assert.deepEqual(
    application.diagram.nodes.map((node) => node.id),
    ["existing-vpc", "resource-subnet-1234"]
  );
  assert.deepEqual(application.diagram.edges, []);
  assert.deepEqual(application.diagram.viewport, currentDiagram.viewport);
});

test("createReverseEngineeringBoardApplication dims unsupported unknown resources", () => {
  const application = createReverseEngineeringBoardApplication({
    currentDiagram: createDiagram(),
    mode: "replace",
    result: createScanResult({
      nodes: [
        {
          id: "resource-unknown-alb",
          type: "UNKNOWN",
          label: "Unknown ALB",
          positionX: 120,
          positionY: 100,
          config: {
            analysisExcluded: true,
            providerResourceId: "arn:aws:elasticloadbalancing:ap-northeast-2:1234:loadbalancer/app/demo",
            providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer"
          }
        }
      ]
    })
  });

  assert.equal(application.diagram.nodes[0]?.style?.borderColor, "#94a3b8");
  assert.equal(application.diagram.nodes[0]?.style?.textColor, "#64748b");
});

function createScanResult(
  input: Partial<ReverseEngineeringScanResult["architectureJson"]> = {}
): ReverseEngineeringScanResult {
  return {
    scan: {
      id: "scan-1",
      projectId: "project-1",
      awsConnectionId: "aws-connection-1",
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["VPC", "SUBNET"],
      status: "completed",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:01:00.000Z",
      startedAt: "2026-07-05T00:00:00.000Z",
      completedAt: "2026-07-05T00:01:00.000Z",
      cancelRequestedAt: null,
      deletedAt: null,
      errorSummary: null
    },
    discoveredResources: [],
    architectureJson: {
      nodes: input.nodes ?? [
        {
          id: "resource-vpc-1234",
          type: "VPC",
          label: "Main VPC",
          positionX: 120,
          positionY: 100,
          config: {
            cidrBlock: "10.0.0.0/16",
            providerResourceId: "vpc-1234",
            providerResourceType: "AWS::EC2::VPC",
            terraformResourceName: "main"
          }
        },
        {
          id: "resource-subnet-1234",
          type: "SUBNET",
          label: "Public Subnet",
          positionX: 220,
          positionY: 180,
          config: {
            providerResourceId: "subnet-1234",
            providerResourceType: "AWS::EC2::Subnet",
            terraformResourceName: "public",
            vpcId: "vpc-1234"
          }
        }
      ],
      edges: input.edges ?? [
        {
          id: "edge-vpc-subnet",
          sourceId: "resource-vpc-1234",
          targetId: "resource-subnet-1234",
          label: "contains"
        }
      ]
    },
    findings: [],
    analysisExclusions: [],
    importSuggestions: [],
    scanErrors: []
  };
}

function createDiagram(input: Partial<DiagramJson> = {}): DiagramJson {
  return {
    edges: input.edges ?? [],
    nodes: input.nodes ?? [],
    viewport: input.viewport ?? { x: 0, y: 0, zoom: 1 }
  };
}

function createDiagramNode(input: {
  id: string;
  providerResourceId: string;
  resourceName: string;
  resourceType: string;
  values?: Record<string, unknown>;
}): DiagramJson["nodes"][number] {
  return {
    id: input.id,
    kind: "resource",
    label: input.id,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: input.resourceName,
      resourceType: input.resourceType,
      terraformBlockType: "resource",
      values: {
        providerResourceId: input.providerResourceId,
        ...input.values
      }
    },
    position: { x: 0, y: 0 },
    size: { width: 56, height: 56 },
    type: input.resourceType,
    zIndex: 1
  };
}
