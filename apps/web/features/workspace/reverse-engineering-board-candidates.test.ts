import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  createReverseEngineeringBoardCandidates,
  createReverseEngineeringCandidateResult
} from "./reverse-engineering-board-candidates";

test("createReverseEngineeringBoardCandidates makes separate VPC, S3, and full scan choices", () => {
  const candidates = createReverseEngineeringBoardCandidates(createScanResult());

  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["candidate-vpc-vpc-shop", "candidate-s3-bucket-assets", "candidate-full-scan"]
  );
  assert.deepEqual(candidates[0]?.architectureJson.nodes.map((node) => node.id), [
    "resource-vpc-shop",
    "resource-subnet-shop",
    "resource-ec2-shop"
  ]);
  assert.deepEqual(candidates[1]?.architectureJson.nodes.map((node) => node.id), [
    "resource-s3-assets"
  ]);
  assert.equal(candidates[2]?.architectureJson.nodes.length, 4);
});

test("createReverseEngineeringBoardCandidates falls back to one full scan choice when no group exists", () => {
  const result = createScanResult({
    discoveredResources: [],
    architectureJson: {
      nodes: [
        {
          id: "resource-unknown",
          type: "UNKNOWN",
          label: "Unknown",
          positionX: 0,
          positionY: 0,
          config: { providerResourceId: "unknown-1" }
        }
      ],
      edges: []
    }
  });

  const candidates = createReverseEngineeringBoardCandidates(result);

  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["candidate-full-scan"]
  );
  assert.equal(candidates[0]?.title, "전체 스캔 결과");
});

test("createReverseEngineeringCandidateResult narrows the scan result to the selected candidate", () => {
  const result = createScanResult();
  const candidates = createReverseEngineeringBoardCandidates(result);
  const candidate = candidates[0];
  assert.ok(candidate);

  const candidateResult = createReverseEngineeringCandidateResult(result, candidate);

  assert.deepEqual(candidateResult.architectureJson.nodes.map((node) => node.id), [
    "resource-vpc-shop",
    "resource-subnet-shop",
    "resource-ec2-shop"
  ]);
  assert.deepEqual(
    candidateResult.reverseEngineeringDraft.architectureJson.nodes.map((node) => node.id),
    ["resource-vpc-shop", "resource-subnet-shop", "resource-ec2-shop"]
  );
  assert.equal(candidateResult.discoveredResources.length, result.discoveredResources.length);
});

function createScanResult(
  input: Partial<Pick<ReverseEngineeringScanResult, "architectureJson" | "discoveredResources">> = {}
): ReverseEngineeringScanResult {
  const architectureJson = input.architectureJson ?? {
    nodes: [
      {
        id: "resource-vpc-shop",
        type: "VPC",
        label: "shop-vpc",
        positionX: 0,
        positionY: 0,
        config: {
          providerResourceId: "vpc-shop",
          providerResourceType: "AWS::EC2::VPC"
        }
      },
      {
        id: "resource-subnet-shop",
        type: "SUBNET",
        label: "shop-subnet",
        positionX: 120,
        positionY: 80,
        config: {
          providerResourceId: "subnet-shop",
          providerResourceType: "AWS::EC2::Subnet"
        }
      },
      {
        id: "resource-ec2-shop",
        type: "EC2",
        label: "shop-api",
        positionX: 240,
        positionY: 160,
        config: {
          providerResourceId: "i-shop",
          providerResourceType: "AWS::EC2::Instance"
        }
      },
      {
        id: "resource-s3-assets",
        type: "S3",
        label: "assets-bucket",
        positionX: 360,
        positionY: 0,
        config: {
          providerResourceId: "bucket-assets",
          providerResourceType: "AWS::S3::Bucket"
        }
      }
    ],
    edges: [
      {
        id: "edge-vpc-subnet",
        sourceId: "resource-vpc-shop",
        targetId: "resource-subnet-shop",
        label: "contains"
      },
      {
        id: "edge-subnet-ec2",
        sourceId: "resource-subnet-shop",
        targetId: "resource-ec2-shop",
        label: "contains"
      }
    ]
  };

  return {
    scan: {
      id: "scan-1",
      projectId: "project-1",
      awsConnectionId: "aws-connection-1",
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["ALL"],
      status: "completed",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:01:00.000Z",
      startedAt: "2026-07-05T00:00:00.000Z",
      completedAt: "2026-07-05T00:01:00.000Z",
      cancelRequestedAt: null,
      deletedAt: null,
      errorSummary: null
    },
    discoveredResources: input.discoveredResources ?? [
      {
        id: "discovered-vpc-shop",
        provider: "aws",
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: "vpc-shop",
        region: "ap-northeast-2",
        displayName: "shop-vpc",
        resourceType: "VPC",
        config: {},
        relationships: [{ type: "contains", targetResourceId: "subnet-shop" }]
      },
      {
        id: "discovered-subnet-shop",
        provider: "aws",
        providerResourceType: "AWS::EC2::Subnet",
        providerResourceId: "subnet-shop",
        region: "ap-northeast-2",
        displayName: "shop-subnet",
        resourceType: "SUBNET",
        config: {},
        relationships: [{ type: "contains", targetResourceId: "i-shop" }]
      },
      {
        id: "discovered-ec2-shop",
        provider: "aws",
        providerResourceType: "AWS::EC2::Instance",
        providerResourceId: "i-shop",
        region: "ap-northeast-2",
        displayName: "shop-api",
        resourceType: "EC2",
        config: {}
      },
      {
        id: "discovered-s3-assets",
        provider: "aws",
        providerResourceType: "AWS::S3::Bucket",
        providerResourceId: "bucket-assets",
        region: "ap-northeast-2",
        displayName: "assets-bucket",
        resourceType: "S3",
        config: {}
      }
    ],
    reverseEngineeringDraft: {
      id: "draft-scan-1",
      scanId: "scan-1",
      architectureJson,
      protectedValueKeys: ["providerResourceId", "providerResourceType"],
      editableValueKeys: ["displayName", "description"],
      createdAt: "2026-07-05T00:01:00.000Z"
    },
    architectureJson,
    findings: [],
    analysisExclusions: [],
    importSuggestions: [],
    scanErrors: []
  };
}
