import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DiagramJson,
  DiagramNode,
  TerraformDiagramChangeProposal
} from "../../../../packages/types/src";
import {
  applyAllTerraformSyncProposals,
  applyTerraformSyncProposals,
  getTerraformSyncProposalId,
  rewriteTerraformReferencesForSyncProposals
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

test("applyTerraformSyncProposals uses compact fallback metadata for unknown create proposals", () => {
  const diagramJson = makeDiagramJson();
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "custom_provider_widget",
        resourceName: "example"
      },
      parameters: {
        resourceType: "custom_provider_widget",
        resourceName: "example",
        fileName: "custom.tf",
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

  assert.equal(createdNode?.iconUrl, undefined);
  assert.deepEqual(createdNode?.size, { width: 48, height: 48 });
  assert.equal(createdNode?.parameters?.fileName, "custom.tf");
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

  assert.deepEqual(catalogResource.nodeDefaults.size, { width: 48, height: 48 });
  assert.deepEqual(proposal.parameters.values, {
    tags: {
      Name: "logs"
    }
  });
});

test("applyTerraformSyncProposals preserves API-provided nodeId metadata position and parameters", () => {
  const diagramJson = makeDiagramJson();
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_subnet",
        resourceName: "public"
      },
      nodeId: "terraform-subnet-public",
      metadata: {
        parentAreaNodeId: "az-1"
      },
      position: {
        x: 320,
        y: 240
      },
      parameters: {
        resourceType: "aws_subnet",
        resourceName: "public",
        fileName: "network.tf",
        values: {
          cidrBlock: "10.0.1.0/24",
          availabilityZone: "ap-northeast-2a"
        }
      }
    }
  ];

  const result = applyAllTerraformSyncProposals(diagramJson, proposals);
  const createdNode = result.nodes[1];

  assert.equal(createdNode?.id, "terraform-subnet-public");
  assert.deepEqual(createdNode?.metadata, {
    parentAreaNodeId: "az-1"
  });
  assert.deepEqual(createdNode?.position, {
    x: 320,
    y: 240
  });
  assert.deepEqual(createdNode?.parameters, {
    terraformBlockType: "resource",
    resourceType: "aws_subnet",
    resourceName: "public",
    fileName: "network.tf",
    values: {
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a"
    }
  });
});

test("applyTerraformSyncProposals places child create proposals inside parent area when position is absent", () => {
  const diagramJson = makeDiagramJson({
    nodes: [
      makeNode("az-1", "aws_availability_zone", "ap_northeast_2a", {
        position: { x: 200, y: 100 },
        size: { width: 220, height: 150 }
      })
    ]
  });
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_subnet",
        resourceName: "public"
      },
      nodeId: "subnet-public",
      metadata: {
        parentAreaNodeId: "az-1"
      },
      parameters: {
        resourceType: "aws_subnet",
        resourceName: "public",
        fileName: "network.tf",
        values: {}
      }
    }
  ];

  const result = applyAllTerraformSyncProposals(diagramJson, proposals);
  const parentNode = result.nodes.find((node) => node.id === "az-1");
  const childNode = result.nodes.find((node) => node.id === "subnet-public");

  assert.ok(parentNode);
  assert.ok(childNode);
  assert.equal(childNode.metadata?.parentAreaNodeId, "az-1");
  assert.deepEqual(childNode.position, { x: 224, y: 130 });
  assert.ok(childNode.position.x + childNode.size.width <= parentNode.position.x + parentNode.size.width);
  assert.ok(childNode.position.y + childNode.size.height <= parentNode.position.y + parentNode.size.height);
});

test("applyTerraformSyncProposals applies AZ proposal before same-batch child placement", () => {
  const proposals: TerraformDiagramChangeProposal[] = [
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_availability_zone",
        resourceName: "ap_northeast_2a"
      },
      nodeId: "terraform-az-ap-northeast-2a",
      parameters: {
        resourceType: "aws_availability_zone",
        resourceName: "ap_northeast_2a",
        fileName: "main.tf",
        values: {
          awsAvailabilityZone: "ap-northeast-2a"
        }
      }
    },
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_subnet",
        resourceName: "public"
      },
      nodeId: "subnet-public",
      metadata: {
        parentAreaNodeId: "terraform-az-ap-northeast-2a"
      },
      parameters: {
        resourceType: "aws_subnet",
        resourceName: "public",
        fileName: "network.tf",
        values: {}
      }
    }
  ];

  const result = applyAllTerraformSyncProposals(
    {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    proposals
  );
  const azNode = result.nodes.find((node) => node.id === "terraform-az-ap-northeast-2a");
  const childNode = result.nodes.find((node) => node.id === "subnet-public");

  assert.ok(azNode);
  assert.ok(childNode);
  assert.equal(childNode.metadata?.parentAreaNodeId, azNode.id);
  assert.ok(childNode.position.x >= azNode.position.x);
  assert.ok(childNode.position.y >= azNode.position.y);
  assert.ok(childNode.position.x + childNode.size.width <= azNode.position.x + azNode.size.width);
  assert.ok(childNode.position.y + childNode.size.height <= azNode.position.y + azNode.size.height);
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

test("rewriteTerraformReferencesForSyncProposals rewrites expressions across files only", () => {
  const proposals: TerraformDiagramChangeProposal[] = [
    makeRenameProposal("resource", "aws_subnet", "subnet", "private", "subnet-1")
  ];
  const files = [
    {
      fileName: "network.tf",
      code: `resource "aws_subnet" "private" {
}`
    },
    {
      fileName: "compute.tf",
      code: `resource "aws_instance" "web" {
  subnet_id = aws_subnet.subnet.id
  literal   = "aws_subnet.subnet.id"
  other     = aws_subnet.subnet_extra.id
  # aws_subnet.subnet.id
  // aws_subnet.subnet.id
  /* aws_subnet.subnet.id */
}`
    },
    {
      fileName: "terraform.tfvars",
      code: `subnet_reference = aws_subnet.subnet.id`
    }
  ];

  const rewritten = rewriteTerraformReferencesForSyncProposals(files, proposals);

  assert.equal(rewritten[0], files[0]);
  assert.notEqual(rewritten[1], files[1]);
  assert.equal(rewritten[2], files[2]);
  assert.match(rewritten[1]!.code, /subnet_id = aws_subnet\.private\.id/);
  assert.match(rewritten[1]!.code, /literal\s+= "aws_subnet\.subnet\.id"/);
  assert.match(rewritten[1]!.code, /other\s+= aws_subnet\.subnet_extra\.id/);
  assert.match(rewritten[1]!.code, /# aws_subnet\.subnet\.id/);
  assert.match(rewritten[1]!.code, /\/\/ aws_subnet\.subnet\.id/);
  assert.match(rewritten[1]!.code, /\/\* aws_subnet\.subnet\.id \*\//);
});

test("rewriteTerraformReferencesForSyncProposals rewrites direct resource references at identifier boundaries", () => {
  const proposals: TerraformDiagramChangeProposal[] = [
    makeRenameProposal("resource", "aws_subnet", "subnet", "private", "subnet-1")
  ];
  const files = [{
    fileName: "dependencies.tf",
    code: `depends_on = [aws_subnet.subnet]
resources  = [aws_subnet.subnet, aws_subnet.subnet ]
at_eof     = aws_subnet.subnet
long_name  = aws_subnet.subnet_extra
hyphenated = aws_subnet.subnet-old`
  }];

  const rewritten = rewriteTerraformReferencesForSyncProposals(files, proposals);

  assert.equal(
    rewritten[0]?.code,
    `depends_on = [aws_subnet.private]
resources  = [aws_subnet.private, aws_subnet.private ]
at_eof     = aws_subnet.private
long_name  = aws_subnet.subnet_extra
hyphenated = aws_subnet.subnet-old`
  );
});

test("rewriteTerraformReferencesForSyncProposals preserves heredocs and rewrites data references", () => {
  const proposals: TerraformDiagramChangeProposal[] = [
    makeRenameProposal("data", "aws_ami", "selected", "runtime", "ami-1")
  ];
  const files = [
    {
      fileName: "compute.tf",
      code: `resource "aws_instance" "web" {
  ami = data.aws_ami.selected.id
  user_data = <<-SCRIPT
    echo data.aws_ami.selected.id
  SCRIPT
}`
    }
  ];

  const rewritten = rewriteTerraformReferencesForSyncProposals(files, proposals);

  assert.match(rewritten[0]!.code, /ami = data\.aws_ami\.runtime\.id/);
  assert.match(rewritten[0]!.code, /echo data\.aws_ami\.selected\.id/);
});

test("rewriteTerraformReferencesForSyncProposals applies multiple renames deterministically", () => {
  const proposals: TerraformDiagramChangeProposal[] = [
    makeRenameProposal("resource", "aws_vpc", "main", "network", "vpc-1"),
    makeRenameProposal("resource", "aws_subnet", "public", "private", "subnet-1")
  ];
  const files = [
    {
      fileName: "network.tf",
      code: `vpc_id = aws_vpc.main.id
subnet_id = aws_subnet.public.id`
    }
  ];

  const rewritten = rewriteTerraformReferencesForSyncProposals(files, proposals);

  assert.equal(
    rewritten[0]!.code,
    `vpc_id = aws_vpc.network.id
subnet_id = aws_subnet.private.id`
  );
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

test("applyAllTerraformSyncProposals applies every structural change without a second prompt", () => {
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
  const result = applyAllTerraformSyncProposals(makeDiagramJson(), proposals);

  assert.deepEqual(
    result.nodes.map((node) => node.parameters?.resourceName),
    ["logs"]
  );
  assert.equal(result.nodes[0]?.type, "aws_s3_bucket");
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

function makeNode(
  id: string,
  resourceType: string,
  resourceName: string,
  overrides: Partial<Pick<DiagramNode, "position" | "size">> = {}
): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    label: resourceName,
    position: overrides.position ?? { x: 0, y: 0 },
    size: overrides.size ?? { width: 160, height: 96 },
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

function makeRenameProposal(
  terraformBlockType: "data" | "resource",
  resourceType: string,
  fromResourceName: string,
  toResourceName: string,
  nodeId: string
): TerraformDiagramChangeProposal {
  return {
    kind: "rename_candidate",
    from: {
      terraformBlockType,
      resourceType,
      resourceName: fromResourceName
    },
    to: {
      terraformBlockType,
      resourceType,
      resourceName: toResourceName
    },
    nodeId,
    resourceAddress:
      terraformBlockType === "data"
        ? `data.${resourceType}.${fromResourceName}`
        : `${resourceType}.${fromResourceName}`
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
