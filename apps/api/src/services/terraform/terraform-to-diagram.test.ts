import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import { syncTerraformToDiagramJson } from "./terraform-to-diagram.js";

test("updates values for a matching generated resource block", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main_vpc",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16",
            enableDnsSupport: true,
            tags: {
              Name: "main-vpc"
            }
          }
        }
      })
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "node-1",
        targetNodeId: "node-2"
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
  enable_dns_support = false
  tags = {
    Name = "renamed-vpc"
  }
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson.nodes[0]?.parameters?.values, {
    cidrBlock: "10.1.0.0/16",
    enableDnsSupport: false,
    tags: {
      Name: "renamed-vpc"
    }
  });
  assert.deepEqual(result.diagramJson.edges, diagramJson.edges);
  assert.deepEqual(result.diagramJson.viewport, diagramJson.viewport);
});

test("updates data block values", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "data-1",
        type: "aws_ami",
        kind: "resource",
        label: "ubuntu",
        parameters: {
          terraformBlockType: "data",
          resourceType: "aws_ami",
          resourceName: "ubuntu",
          fileName: "main",
          values: {
            mostRecent: true,
            owners: ["099720109477"],
            filter: [
              {
                name: "name",
                values: ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
              }
            ]
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
`data "aws_ami" "ubuntu" {
  most_recent = false
  owners = [
    "self",
  ]

  filter {
    name = "virtualization-type"
    values = [
      "hvm",
    ]
  }
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson.nodes[0]?.parameters?.values, {
    mostRecent: false,
    owners: ["self"],
    filter: [
      {
        name: "virtualization-type",
        values: ["hvm"]
      }
    ]
  });
});

test("updates values from CRLF Terraform input", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    [
      `resource "aws_vpc" "main" {`,
      `  cidr_block = "10.2.0.0/16"`,
      `}`
    ].join("\r\n")
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.diagramJson.nodes[0]?.parameters?.values.cidrBlock, "10.2.0.0/16");
});

test("ignores braces in Terraform comments while syncing values", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  # comment with { should not affect block depth
  cidr_block = "10.3.0.0/16" // comment with } should not close the block
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.diagramJson.nodes[0]?.parameters?.values.cidrBlock, "10.3.0.0/16");
});

test("returns create and delete proposals when Terraform and DiagramJson identities do not match", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "unknown" {
  cidr_block = "10.1.0.0/16"
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson, diagramJson);
  assert.deepEqual(result.proposals, [
    {
      kind: "create_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "unknown"
      },
      sourceFileName: "main.tf",
      line: 1,
      parameters: {
        resourceType: "aws_vpc",
        resourceName: "unknown",
        fileName: "main.tf",
        values: {
          cidrBlock: "10.1.0.0/16"
        }
      }
    },
    {
      kind: "delete_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main"
      },
      nodeId: "node-1",
      resourceAddress: "aws_vpc.main"
    }
  ]);
});

test("returns source metadata for Terraform-only blocks from multi-file sync input", () => {
  const result = syncTerraformToDiagramJson(
    {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    {
      terraformCode: "",
      terraformFiles: [
        {
          fileName: "network.tf",
          terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`
        }
      ]
    }
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.proposals?.[0]?.kind, "create_candidate");
  assert.equal(result.proposals?.[0]?.sourceFileName, "network.tf");
  assert.equal(result.proposals?.[0]?.line, 1);
});

test("rejects duplicate DiagramJson identities without mutating", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network",
          values: {}
        }
      }),
      makeNode({
        id: "node-2",
        type: "aws_vpc",
        kind: "resource",
        label: "main duplicate",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "other-file",
          values: {}
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.duplicate_diagram_identity");
  assert.equal(result.diagnostics[0]?.resourceAddress, "aws_vpc.main");
  assert.deepEqual(result.proposals, []);
});

test("returns rename proposals for deterministic same-type value matches", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "renamed" {
  cidr_block = "10.0.0.0/16"
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson, diagramJson);
  assert.deepEqual(result.proposals, [
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
        resourceName: "renamed"
      },
      sourceFileName: "main.tf",
      line: 1,
      nodeId: "node-1",
      resourceAddress: "aws_vpc.main"
    }
  ]);
});

test("returns rename proposals for normalized object value matches", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16",
            tags: {
              Owner: "platform",
              Name: "main"
            }
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "renamed" {
  tags = {
    Name = "main"
    Owner = "platform"
  }
  cidr_block = "10.0.0.0/16"
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson, diagramJson);
  assert.equal(result.proposals?.[0]?.kind, "rename_candidate");
});

test("does not return rename proposals for ambiguous same-type value matches", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main-a",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main_a",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16"
          }
        }
      }),
      makeNode({
        id: "node-2",
        type: "aws_vpc",
        kind: "resource",
        label: "main-b",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main_b",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "renamed_a" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_vpc" "renamed_b" {
  cidr_block = "10.0.0.0/16"
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson, diagramJson);
  assert.equal(result.proposals?.some((proposal) => proposal.kind === "rename_candidate"), false);
  assert.equal(result.proposals?.filter((proposal) => proposal.kind === "create_candidate").length, 2);
  assert.equal(result.proposals?.filter((proposal) => proposal.kind === "delete_candidate").length, 2);
});

test("returns delete proposals when Terraform code is intentionally empty", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(diagramJson, "");

  assert.equal(result.diagramJson, diagramJson);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.proposals, [
    {
      kind: "delete_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main"
      },
      nodeId: "node-1",
      resourceAddress: "aws_vpc.main"
    }
  ]);
});

test("accepts empty Terraform code when the diagram is already empty", () => {
  const result = syncTerraformToDiagramJson(
    {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    ""
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.proposals, []);
  assert.deepEqual(result.diagramJson.nodes, []);
});

test("keeps the input diagram when an unsupported expression is found", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = format("10.%d.0.0/16", 1)
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.unsupported_expression");
});

test("keeps the input diagram when an invalid attribute value is found", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = @
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.unsupported_expression");
});

test("keeps the input diagram when an indexing expression is found", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            vpcId: "aws_vpc.main.id"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_subnet" "public" {
  vpc_id = var.subnet_ids[0]
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.unsupported_expression");
});

test("rejects trailing tokens after a parsed attribute value", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"abc
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.trailing_tokens");
});

test("rejects trailing tokens after a parsed list value", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "data-1",
        type: "aws_ami",
        kind: "resource",
        label: "ami",
        parameters: {
          terraformBlockType: "data",
          resourceType: "aws_ami",
          resourceName: "ami",
          fileName: "main",
          values: {
            owners: [""],
            filterName: "cxzv",
            filterValues: [""]
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `data "aws_ami" "ami" {
  owners = [
    "",
  ]
  filter_name = "cxzv"
  filter_values = [
    "",
  ]asdfasdf
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.trailing_tokens");
});

test("rejects duplicate block addresses", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
}

resource "aws_vpc" "main" {
  cidr_block = "10.2.0.0/16"
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.duplicate_address");
});

test("rejects duplicate block addresses across Terraform files", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    {
      terraformCode: "",
      terraformFiles: [
        {
          fileName: "network.tf",
          terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
}`
        },
        {
          fileName: "compute.tf",
          terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.2.0.0/16"
}`
        }
      ]
    }
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.duplicate_address");
  assert.equal(result.diagnostics[0]?.sourceFileName, "compute.tf");
  assert.equal(result.diagnostics[0]?.resourceAddress, "aws_vpc.main");
});

test("parses references as string values", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            vpcId: "aws_vpc.main.id"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.diagramJson.nodes[0]?.parameters?.values.vpcId, "aws_vpc.main.id");
});

test("syncs AWS nested blocks into camelCase array values", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "route-table-1",
        type: "aws_route_table",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_route_table",
          resourceName: "public",
          fileName: "network",
          values: {
            vpcId: "aws_vpc.main.id"
          }
        }
      }),
      makeNode({
        id: "security-group-1",
        type: "aws_security_group",
        kind: "resource",
        label: "web",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_security_group",
          resourceName: "web",
          fileName: "security",
          values: {
            name: "web",
            vpcId: "aws_vpc.main.id"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_security_group" "web" {
  name = "web"
  vpc_id = aws_vpc.main.id

  egress {
    to_port = 0
    from_port = 0
    protocol = "-1"
    cidr_blocks = [
      "0.0.0.0/0",
    ]
  }

  ingress {
    to_port = 80
    from_port = 80
    protocol = "tcp"
    cidr_blocks = [
      "0.0.0.0/0",
    ]
  }
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson.nodes[0]?.parameters?.values, {
    vpcId: "aws_vpc.main.id",
    route: [
      {
        cidrBlock: "0.0.0.0/0",
        gatewayId: "aws_internet_gateway.igw.id"
      }
    ]
  });
  assert.deepEqual(result.diagramJson.nodes[1]?.parameters?.values, {
    name: "web",
    vpcId: "aws_vpc.main.id",
    egress: [
      {
        toPort: 0,
        fromPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"]
      }
    ],
    ingress: [
      {
        toPort: 80,
        fromPort: 80,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"]
      }
    ]
  });
});

test("keeps the input diagram when an unsupported nested block is found", () => {
  const diagramJson = makeSingleVpcDiagramJson();

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"

  lifecycle {
    prevent_destroy = true
  }
}`
  );

  assert.equal(result.diagramJson, diagramJson);
  assert.equal(result.diagnostics[0]?.code, "terraform.sync.nested_block");
});

test("syncs route table association references into camelCase values", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "route-table-association-1",
        type: "aws_route_table_association",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_route_table_association",
          resourceName: "public",
          fileName: "network",
          values: {}
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_route_table_association" "public" {
  subnet_id = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson.nodes[0]?.parameters?.values, {
    subnetId: "aws_subnet.public.id",
    routeTableId: "aws_route_table.public.id"
  });
});

test("returns delete proposals for syncable diagram-only network resources", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network",
          values: {
            cidrBlock: "10.0.0.0/16"
          }
        }
      }),
      makeNode({
        id: "route-table-1",
        type: "aws_route_table",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_route_table",
          resourceName: "public",
          fileName: "network",
          values: {
            vpcId: "aws_vpc.main.id"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.diagramJson.nodes[0]?.parameters?.values.cidrBlock, "10.1.0.0/16");
  assert.deepEqual(result.proposals, [
    {
      kind: "delete_candidate",
      identity: {
        terraformBlockType: "resource",
        resourceType: "aws_route_table",
        resourceName: "public"
      },
      nodeId: "route-table-1",
      resourceAddress: "aws_route_table.public"
    }
  ]);
});

test("reports the block header line when a block is not closed", () => {
  const result = syncTerraformToDiagramJson(
    makeSingleVpcDiagramJson(),
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"`
  );

  assert.equal(result.diagnostics[0]?.code, "terraform.sync.block_header");
  assert.equal(result.diagnostics[0]?.line, 1);
  assert.equal(result.diagnostics[0]?.resourceAddress, "aws_vpc.main");
});

function makeSingleVpcDiagramJson(): DiagramJson {
  return {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main_vpc",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function makeNode(
  node: Omit<DiagramNode, "position" | "size" | "locked" | "zIndex"> &
    Partial<Pick<DiagramNode, "position" | "size" | "locked" | "zIndex">>
): DiagramNode {
  return {
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 160,
      height: 96
    },
    locked: false,
    zIndex: 0,
    ...node
  };
}
