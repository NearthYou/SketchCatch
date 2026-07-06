import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReverseEngineeringScanResult } from "@sketchcatch/types";
import { updateReverseEngineeringDraftNode } from "./reverse-engineering-draft-edits";

test("updateReverseEngineeringDraftNode changes only the editable draft architecture values", () => {
  const result = createScanResult();

  const updated = updateReverseEngineeringDraftNode(result, "resource-vpc-1234", {
    description: "사용자가 붙인 설명",
    label: "사용자 VPC 이름",
    positionX: 360,
    positionY: 240
  });

  assert.equal(updated.architectureJson.nodes[0]?.label, "사용자 VPC 이름");
  assert.equal(updated.architectureJson.nodes[0]?.positionX, 360);
  assert.equal(updated.architectureJson.nodes[0]?.positionY, 240);
  assert.equal(updated.architectureJson.nodes[0]?.config["description"], "사용자가 붙인 설명");
  assert.equal(
    updated.reverseEngineeringDraft.architectureJson.nodes[0]?.label,
    "사용자 VPC 이름"
  );
  assert.equal(updated.discoveredResources[0]?.displayName, "AWS 원본 VPC 이름");
  assert.equal(updated.discoveredResources[0]?.providerResourceId, "vpc-1234");
});

function createScanResult(): ReverseEngineeringScanResult {
  return {
    scan: {
      id: "scan-1",
      projectId: "project-1",
      awsConnectionId: "aws-connection-1",
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["VPC"],
      status: "completed",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:01:00.000Z",
      startedAt: "2026-07-05T00:00:00.000Z",
      completedAt: "2026-07-05T00:01:00.000Z",
      cancelRequestedAt: null,
      deletedAt: null,
      errorSummary: null
    },
    discoveredResources: [
      {
        id: "resource-vpc-1234",
        provider: "aws",
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: "vpc-1234",
        region: "ap-northeast-2",
        displayName: "AWS 원본 VPC 이름",
        resourceType: "VPC",
        config: { cidrBlock: "10.0.0.0/16" },
        relationships: []
      }
    ],
    reverseEngineeringDraft: {
      id: "draft-scan-1",
      scanId: "scan-1",
      architectureJson: {
        nodes: [
          {
            id: "resource-vpc-1234",
            type: "VPC",
            label: "AWS 원본 VPC 이름",
            positionX: 120,
            positionY: 100,
            config: {
              cidrBlock: "10.0.0.0/16",
              providerResourceId: "vpc-1234",
              providerResourceType: "AWS::EC2::VPC"
            }
          }
        ],
        edges: []
      },
      protectedValueKeys: ["providerResourceId", "providerResourceType"],
      editableValueKeys: ["displayName", "description"],
      createdAt: "2026-07-05T00:01:00.000Z"
    },
    architectureJson: {
      nodes: [
        {
          id: "resource-vpc-1234",
          type: "VPC",
          label: "AWS 원본 VPC 이름",
          positionX: 120,
          positionY: 100,
          config: {
            cidrBlock: "10.0.0.0/16",
            providerResourceId: "vpc-1234",
            providerResourceType: "AWS::EC2::VPC"
          }
        }
      ],
      edges: []
    },
    findings: [],
    analysisExclusions: [],
    importSuggestions: [],
    scanErrors: []
  };
}
