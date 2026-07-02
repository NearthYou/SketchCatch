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
import { resourceCatalog } from "../resource-settings/catalog";

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
  assert.equal(result.nodes[1]?.iconUrl, getCatalogResource("aws_s3_bucket").iconUrl);
  assert.deepEqual(result.nodes[1]?.size, getCatalogResource("aws_s3_bucket").nodeDefaults.size);
  assert.equal(result.nodes[1]?.parameters?.resourceName, "logs");
  assert.deepEqual(result.edges, diagramJson.edges);
});

test("applyTerraformSyncProposals uses data source catalog icons for approved data create proposals", () => {
  const diagramJson = makeDiagramJson();
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "data",
        resourceType: "aws_ami",
        resourceName: "ubuntu"
      },
      parameters: {
        terraformBlockType: "data",
        resourceType: "aws_ami",
        resourceName: "ubuntu",
        fileName: "compute.tf",
        values: {}
      }
    }
  ];

  const result = applyTerraformSyncProposals(
    diagramJson,
    proposals,
    [getTerraformSyncProposalId(proposals[0]!, 0)]
  );
  const createdNode = result.nodes[1];
  const catalogResource = getCatalogResource("aws_ami", "data");

  assert.equal(createdNode?.parameters?.terraformBlockType, "data");
  assert.equal(createdNode?.iconUrl, catalogResource.iconUrl);
  assert.deepEqual(createdNode?.size, catalogResource.nodeDefaults.size);
});

test("applyTerraformSyncProposals deep clones created node defaults and parameter values", () => {
  const diagramJson = makeDiagramJson();
  const proposal: Extract<TerraformDiagramChangeProposal, { kind: "create_candidate" }> = {
    kind: "create_candidate",
    identity: {
      terraformBlockType: "resource",
      resourceType: "aws_s3_bucket",
      resourceName: "logs"
    },
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
  };
  const proposals: TerraformDiagramChangeProposal[] = [proposal];
  const catalogResource = getCatalogResource("aws_s3_bucket");

  const result = applyTerraformSyncProposals(
    diagramJson,
    proposals,
    [getTerraformSyncProposalId(proposal, 0)]
  );
  const createdNode = result.nodes[1];

  assert.ok(createdNode);
  assert.notEqual(createdNode.size, catalogResource.nodeDefaults.size);
  assert.notEqual(createdNode.parameters?.values, proposal.parameters.values);
  assert.notEqual(createdNode.parameters?.values.tags, proposal.parameters.values.tags);

  createdNode.size.width = 999;
  (createdNode.parameters?.values.tags as Record<string, unknown>).Name = "mutated";

  assert.deepEqual(catalogResource.nodeDefaults.size, { width: 112, height: 112 });
  assert.deepEqual(proposal.parameters.values, {
    tags: {
      Name: "logs"
    }
  });
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
      sourceFileName: "network.tf",
      line: 1,
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
  assert.equal(result.nodes[0]?.parameters?.fileName, "network.tf");
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
        fileName: "storage.tf",
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

function getCatalogResource(resourceType: string, terraformBlockType = "resource") {
  const resource = resourceCatalog.find((item) => {
    const catalogTerraformBlockType = item.nodeDefaults.terraformBlockType ?? "resource";

    return item.nodeDefaults.type === resourceType && catalogTerraformBlockType === terraformBlockType;
  });

  assert.ok(resource, `Missing catalog resource: ${resourceType}`);

  return resource;
}
