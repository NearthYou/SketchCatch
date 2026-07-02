import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DiagramJson,
  DiagramNode,
  TerraformDiagramChangeProposal
} from "../../../../packages/types/src";
import {
  applyTerraformSyncProposals,
  getTerraformSyncProposalId,
  splitTerraformSyncProposalsByApproval
} from "./terraform-sync-proposals";

test("applyTerraformSyncProposals applies only approved create proposals without creating edges", () => {
  const diagramJson = makeDiagramJson();
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_s3_bucket",
        resourceName: "logs"
      },
      sourceFileName: "storage.tf",
      line: 1,
      parameters: {
        resourceType: "aws_s3_bucket",
        resourceName: "logs",
        fileName: "storage.tf",
        values: {
          tags: {
            Name: "logs"
          }
        }
      }
    }
  ];

  const result = applyTerraformSyncProposals(
    diagramJson,
    proposals,
    [getTerraformSyncProposalId(proposals[0]!, 0)]
  );

  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[1]?.type, "aws_s3_bucket");
  assert.equal(result.nodes[1]?.parameters?.resourceName, "logs");
  assert.deepEqual(result.edges, diagramJson.edges);
});

test("applyTerraformSyncProposals removes approved delete proposal nodes and connected edges", () => {
  const diagramJson = makeDiagramJson({
    nodes: [makeNode("vpc-1", "aws_vpc", "main"), makeNode("subnet-1", "aws_subnet", "public")],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "vpc-1",
        targetNodeId: "subnet-1"
      }
    ]
  });
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "delete_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_subnet",
        resourceName: "public"
      },
      nodeId: "subnet-1",
      resourceAddress: "aws_subnet.public"
    }
  ];

  const result = applyTerraformSyncProposals(
    diagramJson,
    proposals,
    [getTerraformSyncProposalId(proposals[0]!, 0)]
  );

  assert.deepEqual(result.nodes.map((node) => node.id), ["vpc-1"]);
  assert.deepEqual(result.edges, []);
});

test("applyTerraformSyncProposals renames approved nodes", () => {
  const diagramJson = makeDiagramJson();
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "rename_candidate",
      from: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main"
      },
      to: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "network"
      },
      nodeId: "vpc-1",
      resourceAddress: "aws_vpc.main"
    }
  ];

  const result = applyTerraformSyncProposals(
    diagramJson,
    proposals,
    [getTerraformSyncProposalId(proposals[0]!, 0)]
  );

  assert.equal(result.nodes[0]?.label, "network");
  assert.equal(result.nodes[0]?.parameters?.resourceName, "network");
});

test("applyTerraformSyncProposals ignores unapproved proposals", () => {
  const diagramJson = makeDiagramJson();
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "delete_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main"
      },
      nodeId: "vpc-1",
      resourceAddress: "aws_vpc.main"
    }
  ];

  assert.deepEqual(applyTerraformSyncProposals(diagramJson, proposals, []), diagramJson);
});

test("splitTerraformSyncProposalsByApproval keeps unapproved proposals pending", () => {
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_s3_bucket",
        resourceName: "logs"
      },
      parameters: {
        resourceType: "aws_s3_bucket",
        resourceName: "logs",
        values: {}
      }
    },
    {
      kind: "delete_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main"
      },
      nodeId: "vpc-1",
      resourceAddress: "aws_vpc.main"
    }
  ];
  const result = splitTerraformSyncProposalsByApproval(
    proposals,
    [getTerraformSyncProposalId(proposals[0]!, 0)]
  );

  assert.deepEqual(result.approvedProposals, [proposals[0]]);
  assert.deepEqual(result.remainingProposals, [proposals[1]]);
});

function makeDiagramJson(
  overrides: Partial<Pick<DiagramJson, "nodes" | "edges">> = {}
): DiagramJson {
  return {
    nodes: [makeNode("vpc-1", "aws_vpc", "main")],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides
  };
}

function makeNode(id: string, resourceType: string, resourceName: string): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    label: resourceName,
    position: { x: 0, y: 0 },
    size: { width: 160, height: 96 },
    locked: false,
    zIndex: 0,
    parameters: {
      resourceType,
      resourceName,
      fileName: "main",
      values: {}
    }
  };
}
