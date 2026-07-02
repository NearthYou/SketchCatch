import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import { generateTerraformFromDiagramJson } from "./diagram-to-terraform.js";

test("generates Terraform code from resource nodes", () => {
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
            enableDnsHostnames: true,
            tags: {
              Name: "main-vpc"
            }
          }
        }
      }),
      makeNode({
        id: "node-2",
        type: "aws_subnet",
        kind: "resource",
        label: "public_subnet",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            vpcId: "aws_vpc.main.id",
            cidrBlock: "10.0.1.0/24",
            availabilityZone: "ap-northeast-2a",
            mapPublicIpOnLaunch: true,
            tags: {
              Name: "public-subnet",
              "kubernetes.io/cluster/main": "owned"
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
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = {
    Name = "main-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = {
    Name = "public-subnet"
    "kubernetes.io/cluster/main" = "owned"
  }
}`
  );
});

test("generates stable Terraform code repeatedly from the same DiagramJson", () => {
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
          values: {
            cidrBlock: "10.0.0.0/16",
            tags: {
              Name: "main"
            }
          }
        }
      }),
      makeNode({
        id: "node-2",
        type: "aws_instance",
        kind: "resource",
        label: "web",
        parameters: {
          resourceType: "aws_instance",
          resourceName: "web",
          fileName: "compute",
          values: {
            ami: "ami-1234567890abcdef0",
            instanceType: "t3.micro"
          }
        }
      }),
      makeNode({
        id: "node-3",
        type: "aws_s3_bucket",
        kind: "resource",
        label: "logs",
        parameters: {
          resourceType: "aws_s3_bucket",
          resourceName: "logs",
          fileName: "storage",
          values: {
            tags: {
              Name: "logs"
            }
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 240,
      y: -80,
      zoom: 0.75
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    generateTerraformFromDiagramJson(diagramJson)
  );
});

test("renders invalid resource nodes so Terraform Preview does not disappear after parameter edits", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "design-1",
        type: "memo",
        kind: "design",
        label: "memo"
      }),
      makeNode({
        id: "missing-parameters",
        type: "aws_vpc",
        kind: "resource",
        label: "missing"
      }),
      makeNode({
        id: "invalid-resource",
        type: "aws_vpc",
        kind: "resource",
        label: "invalid",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "invalid",
          fileName: "main",
          values: {
            cidrBlock: "10.0.0.0/16"
          },
          invalid: true
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_vpc" "invalid" {
  cidr_block = "10.0.0.0/16"
}`
  );
});

test("defaults missing terraformBlockType to resource", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "node-1",
        type: "aws_s3_bucket",
        kind: "resource",
        label: "logs",
        parameters: {
          resourceType: "aws_s3_bucket",
          resourceName: "logs",
          fileName: "main",
          values: {
            bucket: "sketchcatch-logs"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_s3_bucket" "logs" {
  bucket = "sketchcatch-logs"
}`
  );
});

test("renders data blocks", () => {
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
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
`data "aws_ami" "ubuntu" {
  most_recent = true
  owners = [
    "099720109477",
  ]
  filter {
    name = "name"
    values = [
      "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*",
    ]
  }
}`
  );
});

test("renders arrays, numbers, booleans, null, and references", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode({
        id: "sg-rule-1",
        type: "aws_security_group_rule",
        kind: "resource",
        label: "ssh",
        parameters: {
          resourceType: "aws_security_group_rule",
          resourceName: "ssh",
          fileName: "main",
          values: {
            vpcId: "var.vpc_id",
            subnetId: "module.vpc.subnet_id",
            amiId: "data.aws_ami.ubuntu.id",
            securityGroupId: "aws_security_group.web.id",
            endpoint: "api.example.com",
            type: "ingress",
            fromPort: 22,
            toPort: 22,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
            description: null,
            self: false
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  assert.equal(
    generateTerraformFromDiagramJson(diagramJson),
    `resource "aws_security_group_rule" "ssh" {
  vpc_id = var.vpc_id
  subnet_id = module.vpc.subnet_id
  ami_id = data.aws_ami.ubuntu.id
  security_group_id = aws_security_group.web.id
  endpoint = "api.example.com"
  type = "ingress"
  from_port = 22
  to_port = 22
  protocol = "tcp"
  cidr_blocks = [
    "0.0.0.0/0",
  ]
  description = null
  self = false
}`
  );
});

test("renders placement references with Terraform snake_case attribute names", () => {
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
            cidrBlock: "172.16.0.0/16"
          }
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "network",
          values: {
            vpcId: "aws_vpc.main.id",
            cidrBlock: "172.16.1.0/24"
          }
        }
      }),
      makeNode({
        id: "instance-1",
        type: "aws_instance",
        kind: "resource",
        label: "web",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: "web",
          fileName: "compute",
          values: {
            ami: "ami-1234567890abcdef0",
            instanceType: "t3.micro",
            subnetId: "aws_subnet.public.id"
          }
        }
      }),
      makeNode({
        id: "igw-1",
        type: "aws_internet_gateway",
        kind: "resource",
        label: "main_igw",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_internet_gateway",
          resourceName: "main",
          fileName: "network",
          values: {
            vpcId: "aws_vpc.main.id"
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
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(terraformCode, /resource "aws_subnet" "public" \{[\s\S]*vpc_id = aws_vpc\.main\.id/);
  assert.match(terraformCode, /resource "aws_instance" "web" \{[\s\S]*subnet_id = aws_subnet\.public\.id/);
  assert.match(terraformCode, /resource "aws_internet_gateway" "main" \{[\s\S]*vpc_id = aws_vpc\.main\.id/);
  assert.match(terraformCode, /resource "aws_route_table" "public" \{[\s\S]*vpc_id = aws_vpc\.main\.id/);
  assert.match(terraformCode, /resource "aws_security_group" "web" \{[\s\S]*vpc_id = aws_vpc\.main\.id/);
  assert.doesNotMatch(terraformCode, /vpcId|subnetId/);
});

test("renders AWS nested block lists as Terraform blocks with snake_case attributes", () => {
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
            vpcId: "aws_vpc.main.id",
            route: [
              {
                cidrBlock: "0.0.0.0/0",
                gatewayId: "aws_internet_gateway.igw.id"
              }
            ]
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
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(
    terraformCode,
    /resource "aws_route_table" "public" \{[\s\S]*route \{[\s\S]*cidr_block = "0\.0\.0\.0\/0"[\s\S]*gateway_id = aws_internet_gateway\.igw\.id[\s\S]*\}/
  );
  assert.match(
    terraformCode,
    /resource "aws_security_group" "web" \{[\s\S]*egress \{[\s\S]*to_port = 0[\s\S]*from_port = 0[\s\S]*protocol = "-1"[\s\S]*cidr_blocks = \[[\s\S]*"0\.0\.0\.0\/0",[\s\S]*\][\s\S]*\}/
  );
  assert.match(
    terraformCode,
    /resource "aws_security_group" "web" \{[\s\S]*ingress \{[\s\S]*to_port = 80[\s\S]*from_port = 80[\s\S]*protocol = "tcp"[\s\S]*cidr_blocks = \[[\s\S]*"0\.0\.0\.0\/0",[\s\S]*\][\s\S]*\}/
  );
  assert.doesNotMatch(terraformCode, /route = \[/);
  assert.doesNotMatch(terraformCode, /ingress = \[/);
  assert.doesNotMatch(terraformCode, /egress = \[/);
  assert.doesNotMatch(terraformCode, /cidrBlock|gatewayId|cidrBlocks|fromPort|toPort/);
});

test("normalizes compact security group ingress rules before rendering Terraform blocks", () => {
  const diagramJson: DiagramJson = {
    nodes: [
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
            vpcId: "aws_vpc.main.id",
            ingress: [
              {
                cidr: "0.0.0.0/0",
                port: 80
              }
            ]
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(
    terraformCode,
    /ingress \{[\s\S]*from_port = 80[\s\S]*to_port = 80[\s\S]*protocol = "tcp"[\s\S]*cidr_blocks = \[[\s\S]*"0\.0\.0\.0\/0",[\s\S]*\]/
  );
  assert.doesNotMatch(terraformCode, /\bcidr =|\bport =/);
});

test("renders route table association references with Terraform snake_case attribute names", () => {
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
          values: {
            subnetId: "aws_subnet.public.id",
            routeTableId: "aws_route_table.public.id"
          }
        }
      })
    ],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };

  const terraformCode = generateTerraformFromDiagramJson(diagramJson);

  assert.match(terraformCode, /resource "aws_route_table_association" "public" \{/);
  assert.match(terraformCode, /subnet_id = aws_subnet\.public\.id/);
  assert.match(terraformCode, /route_table_id = aws_route_table\.public\.id/);
  assert.doesNotMatch(terraformCode, /subnetId|routeTableId/);
});

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
