import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson, DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson
} from "./workspace-ai-diagram-adapter";

test("convertArchitectureJsonToDiagramJson creates board nodes and hides containment arrows from an Architecture Draft", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 120,
        positionY: 80,
        config: {
          cidrBlock: "10.0.0.0/16",
          terraformResourceName: "main"
        }
      },
      {
        id: "ec2-backend",
        type: "EC2",
        label: "Backend Server",
        positionX: 360,
        positionY: 220,
        config: {
          instanceType: "t3.micro"
        }
      }
    ],
    edges: [
      {
        id: "edge-vpc-ec2",
        sourceId: "vpc-main",
        targetId: "ec2-backend",
        label: "contains"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      iconUrl: node.iconUrl,
      id: node.id,
      kind: node.kind,
      label: node.label,
      parameters: node.parameters,
      position: node.position,
      size: node.size,
      style: node.style,
      type: node.type
    })),
    [
      {
        iconUrl:
          "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-Virtual-Private-Cloud_64.svg",
        id: "vpc-main",
        kind: "resource",
        label: "Main VPC",
        parameters: {
          fileName: "main",
          resourceName: "main",
          resourceType: "aws_vpc",
          terraformBlockType: "resource",
          values: {
            cidrBlock: "10.0.0.0/16",
            terraformResourceName: "main"
          }
        },
        position: { x: 120, y: 80 },
        size: { width: 400, height: 300 },
        style: {
          borderColor: "#2f6db3",
          textColor: "#172033"
        },
        type: "aws_vpc"
      },
      {
        iconUrl: "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg",
        id: "ec2-backend",
        kind: "resource",
        label: "Backend Server",
        parameters: {
          fileName: "main",
          resourceName: "ec2_backend",
          resourceType: "aws_instance",
          terraformBlockType: "resource",
          values: {
            instanceType: "t3.micro"
          }
        },
        position: { x: 360, y: 220 },
        size: { width: 112, height: 112 },
        style: {
          borderColor: "#2f6db3",
          textColor: "#172033"
        },
        type: "aws_instance"
      }
    ]
  );
  assert.deepEqual(diagramJson.edges, []);
  assert.deepEqual(diagramJson.viewport, { x: 0, y: 0, zoom: 1 });
});

test("convertArchitectureJsonToDiagramJson keeps non-containment edges as arrows", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "ec2-backend",
        type: "EC2",
        label: "Backend Server",
        positionX: 160,
        positionY: 220,
        config: {}
      },
      {
        id: "rds-primary",
        type: "RDS",
        label: "Database",
        positionX: 420,
        positionY: 220,
        config: {}
      }
    ],
    edges: [
      {
        id: "backend-to-database",
        sourceId: "ec2-backend",
        targetId: "rds-primary",
        label: "reads/writes"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(diagramJson.edges, [
    {
      id: "backend-to-database",
      label: "reads/writes",
      sourceHandleId: "handle-right",
      sourceNodeId: "ec2-backend",
      targetHandleId: "handle-left",
      targetNodeId: "rds-primary",
      type: "smoothstep",
      style: {
        animated: false,
        color: "#506176",
        width: "medium"
      }
    }
  ]);
});

test("convertArchitectureJsonToDiagramJson marks VPC and Subnet containment for board area nodes", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc-main",
        type: "VPC",
        label: "Main VPC",
        positionX: 80,
        positionY: 80,
        config: { cidrBlock: "10.0.0.0/16" }
      },
      {
        id: "subnet-app",
        type: "SUBNET",
        label: "App Subnet",
        positionX: 140,
        positionY: 150,
        config: { cidrBlock: "10.0.1.0/24", vpcId: "vpc-main" }
      },
      {
        id: "sg-app",
        type: "SECURITY_GROUP",
        label: "App Security Group",
        positionX: 210,
        positionY: 190,
        config: { vpcId: "vpc-main" }
      },
      {
        id: "ec2-api",
        type: "EC2",
        label: "API Server",
        positionX: 300,
        positionY: 190,
        config: { subnetId: "subnet-app", securityGroupIds: ["sg-app"] }
      }
    ],
    edges: [
      {
        id: "subnet-to-ec2",
        sourceId: "subnet-app",
        targetId: "ec2-api",
        label: "hosts"
      },
      {
        id: "sg-to-ec2",
        sourceId: "sg-app",
        targetId: "ec2-api",
        label: "allows traffic"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({ id: node.id, parentAreaNodeId: node.metadata?.parentAreaNodeId })),
    [
      { id: "vpc-main", parentAreaNodeId: undefined },
      { id: "subnet-app", parentAreaNodeId: "vpc-main" },
      { id: "sg-app", parentAreaNodeId: "subnet-app" },
      { id: "ec2-api", parentAreaNodeId: "sg-app" }
    ]
  );

  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  assertContainsNode(nodeById.get("vpc-main"), nodeById.get("subnet-app"));
  assertContainsNode(nodeById.get("subnet-app"), nodeById.get("sg-app"));
  assertContainsNode(nodeById.get("sg-app"), nodeById.get("ec2-api"));
  assert.deepEqual(diagramJson.edges, []);
});

test("convertArchitectureJsonToDiagramJson maps server and storage draft resources to Terraform nodes", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "internet-gateway",
        type: "INTERNET_GATEWAY",
        label: "Internet Gateway",
        positionX: 80,
        positionY: 80,
        config: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "route-table",
        type: "ROUTE_TABLE",
        label: "Route Table",
        positionX: 220,
        positionY: 80,
        config: {
          route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "aws_internet_gateway.internet_gateway.id" }],
          vpcId: "aws_vpc.vpc.id"
        }
      },
      {
        id: "route-table-association",
        type: "ROUTE_TABLE_ASSOCIATION",
        label: "Route Table Association",
        positionX: 360,
        positionY: 80,
        config: {
          routeTableId: "aws_route_table.route_table.id",
          subnetId: "aws_subnet.subnet.id"
        }
      },
      {
        id: "ami",
        type: "AMI",
        label: "Amazon Linux AMI",
        positionX: 500,
        positionY: 80,
        config: {
          mostRecent: true,
          nameRegex: "^al2023-ami-2023.*-x86_64$",
          owners: ["amazon"]
        }
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      id: node.id,
      resourceName: node.parameters?.resourceName,
      resourceType: node.parameters?.resourceType,
      terraformBlockType: node.parameters?.terraformBlockType,
      values: node.parameters?.values
    })),
    [
      {
        id: "internet-gateway",
        resourceName: "internet_gateway",
        resourceType: "aws_internet_gateway",
        terraformBlockType: "resource",
        values: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "route-table",
        resourceName: "route_table",
        resourceType: "aws_route_table",
        terraformBlockType: "resource",
        values: {
          route: [{ cidrBlock: "0.0.0.0/0", gatewayId: "aws_internet_gateway.internet_gateway.id" }],
          vpcId: "aws_vpc.vpc.id"
        }
      },
      {
        id: "route-table-association",
        resourceName: "route_table_association",
        resourceType: "aws_route_table_association",
        terraformBlockType: "resource",
        values: {
          routeTableId: "aws_route_table.route_table.id",
          subnetId: "aws_subnet.subnet.id"
        }
      },
      {
        id: "ami",
        resourceName: "ami",
        resourceType: "aws_ami",
        terraformBlockType: "data",
        values: {
          mostRecent: true,
          nameRegex: "^al2023-ami-2023.*-x86_64$",
          owners: ["amazon"]
        }
      }
    ]
  );
});

test("convertArchitectureJsonToDiagramJson lays out server and storage draft as nested cloud areas", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "vpc",
        type: "VPC",
        label: "VPC",
        positionX: 100,
        positionY: 300,
        config: { cidrBlock: "172.16.0.0/16" }
      },
      {
        id: "subnet",
        type: "SUBNET",
        label: "Subnet",
        positionX: 245,
        positionY: 650,
        config: { cidrBlock: "172.16.1.0/24", vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "security-group",
        type: "SECURITY_GROUP",
        label: "Security Group",
        positionX: 200,
        positionY: 520,
        config: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "ec2-instance",
        type: "EC2",
        label: "EC2 Instance",
        positionX: 330,
        positionY: 765,
        config: {
          ami: "data.aws_ami.ami.id",
          instanceType: "t3.micro",
          securityGroupIds: ["aws_security_group.security_group.id"],
          subnetId: "aws_subnet.subnet.id"
        }
      },
      {
        id: "internet-gateway",
        type: "INTERNET_GATEWAY",
        label: "Internet Gateway",
        positionX: 590,
        positionY: 365,
        config: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "route-table-association",
        type: "ROUTE_TABLE_ASSOCIATION",
        label: "Route Table Association",
        positionX: 700,
        positionY: 620,
        config: { routeTableId: "aws_route_table.route_table.id", subnetId: "aws_subnet.subnet.id" }
      },
      {
        id: "route-table",
        type: "ROUTE_TABLE",
        label: "Route Table",
        positionX: 940,
        positionY: 610,
        config: { vpcId: "aws_vpc.vpc.id" }
      },
      {
        id: "ami",
        type: "AMI",
        label: "Amazon Linux AMI",
        positionX: 120,
        positionY: 130,
        config: { owners: ["amazon"] }
      },
      {
        id: "s3-bucket",
        type: "S3",
        label: "S3 Bucket",
        positionX: 950,
        positionY: 130,
        config: {}
      }
    ],
    edges: []
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      parentAreaNodeId: node.metadata?.parentAreaNodeId,
      type: node.type
    })),
    [
      {
        id: "server-storage-region",
        kind: "design",
        parentAreaNodeId: undefined,
        type: "design_region"
      },
      {
        id: "server-storage-az",
        kind: "design",
        parentAreaNodeId: "vpc",
        type: "design_az"
      },
      {
        id: "vpc",
        kind: "resource",
        parentAreaNodeId: "server-storage-region",
        type: "aws_vpc"
      },
      {
        id: "subnet",
        kind: "resource",
        parentAreaNodeId: "server-storage-az",
        type: "aws_subnet"
      },
      {
        id: "security-group",
        kind: "resource",
        parentAreaNodeId: "subnet",
        type: "aws_security_group"
      },
      {
        id: "ec2-instance",
        kind: "resource",
        parentAreaNodeId: "security-group",
        type: "aws_instance"
      },
      {
        id: "internet-gateway",
        kind: "resource",
        parentAreaNodeId: "vpc",
        type: "aws_internet_gateway"
      },
      {
        id: "route-table-association",
        kind: "resource",
        parentAreaNodeId: "vpc",
        type: "aws_route_table_association"
      },
      {
        id: "route-table",
        kind: "resource",
        parentAreaNodeId: "vpc",
        type: "aws_route_table"
      },
      {
        id: "ami",
        kind: "resource",
        parentAreaNodeId: "server-storage-region",
        type: "aws_ami"
      },
      {
        id: "s3-bucket",
        kind: "resource",
        parentAreaNodeId: "server-storage-region",
        type: "aws_s3_bucket"
      }
    ]
  );

  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const regionNode = nodeById.get("server-storage-region");
  const vpcNode = nodeById.get("vpc");
  const azNode = nodeById.get("server-storage-az");
  const subnetNode = nodeById.get("subnet");
  const securityGroupNode = nodeById.get("security-group");
  const instanceNode = nodeById.get("ec2-instance");

  assertContainsNode(regionNode, vpcNode);
  assertContainsNode(vpcNode, azNode);
  assertContainsNode(azNode, subnetNode);
  assertContainsNode(subnetNode, securityGroupNode);
  assertContainsNode(securityGroupNode, instanceNode);
});

test("convertArchitectureJsonToDiagramJson keeps server-storage usage arrows visible", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "ami",
        type: "AMI",
        label: "Amazon Linux AMI",
        positionX: 120,
        positionY: 130,
        config: { owners: ["amazon"] }
      },
      {
        id: "ec2-instance",
        type: "EC2",
        label: "EC2 Instance",
        positionX: 330,
        positionY: 765,
        config: {
          ami: "data.aws_ami.ami.id",
          instanceType: "t3.micro"
        }
      },
      {
        id: "s3-bucket",
        type: "S3",
        label: "S3 Bucket",
        positionX: 950,
        positionY: 130,
        config: {}
      }
    ],
    edges: [
      {
        id: "ami-to-ec2-instance",
        sourceId: "ami",
        targetId: "ec2-instance",
        label: "launch image"
      },
      {
        id: "ec2-instance-to-s3-bucket",
        sourceId: "ec2-instance",
        targetId: "s3-bucket",
        label: "stores images"
      }
    ]
  };

  const diagramJson = convertArchitectureJsonToDiagramJson(architectureJson);

  assert.deepEqual(
    diagramJson.edges.map((edge) => ({
      id: edge.id,
      label: edge.label,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId
    })),
    [
      {
        id: "ami-to-ec2-instance",
        label: "launch image",
        sourceNodeId: "ami",
        targetNodeId: "ec2-instance"
      },
      {
        id: "ec2-instance-to-s3-bucket",
        label: "stores images",
        sourceNodeId: "ec2-instance",
        targetNodeId: "s3-bucket"
      }
    ]
  );
});

test("convertDiagramJsonToArchitectureJson keeps only valid resource nodes and connected edges", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeDiagramNode({
        id: "rds-primary",
        label: "Primary DB",
        parameters: {
          fileName: "main",
          resourceName: "primary",
          resourceType: "aws_db_instance",
          terraformBlockType: "resource",
          values: {
            engine: "postgres"
          }
        },
        type: "aws_db_instance"
      }),
      makeDiagramNode({
        id: "note-1",
        kind: "design",
        label: "설명 메모",
        parameters: undefined,
        type: "sketchcatch_note"
      }),
      makeDiagramNode({
        id: "invalid-ec2",
        label: "Invalid EC2",
        parameters: {
          fileName: "main",
          invalid: true,
          resourceName: "invalid",
          resourceType: "aws_instance",
          terraformBlockType: "resource",
          values: {}
        },
        type: "aws_instance"
      })
    ],
    edges: [
      {
        id: "dangling",
        sourceNodeId: "rds-primary",
        targetNodeId: "invalid-ec2"
      },
      {
        id: "self",
        sourceNodeId: "rds-primary",
        targetNodeId: "rds-primary"
      }
    ],
    viewport: { x: 24, y: 48, zoom: 0.8 }
  };

  const architectureJson = convertDiagramJsonToArchitectureJson(diagramJson);

  assert.deepEqual(architectureJson, {
    nodes: [
      {
        id: "rds-primary",
        type: "RDS",
        label: "Primary DB",
        positionX: 10,
        positionY: 20,
        config: {
          engine: "postgres",
          terraformResourceName: "primary",
          terraformResourceType: "aws_db_instance"
        }
      }
    ],
    edges: [
      {
        id: "self",
        sourceId: "rds-primary",
        targetId: "rds-primary",
        label: undefined
      }
    ]
  });
});

test("convertDiagramJsonToArchitectureJson keeps only AWS port range values in ingress config", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeSecurityGroupRuleNode({ cidrBlock: "0.0.0.0/0", fromPort: "22", id: "ssh-rule", label: "SSH Rule", resourceName: "ssh" }),
      makeSecurityGroupRuleNode({ cidrBlock: "10.0.0.0/16", fromPort: "70000", id: "invalid-port-rule", label: "Invalid Port Rule", resourceName: "invalid" })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const architectureJson = convertDiagramJsonToArchitectureJson(diagramJson);

  assert.deepEqual(
    architectureJson.nodes.map((node) => node.config["ingress"]),
    [[{ cidr: "0.0.0.0/0", port: 22 }], [{ cidr: "10.0.0.0/16" }]]
  );
});

// Security Group Rule fixture는 포트 범위 테스트가 ingress 값에만 집중하도록 둡니다.
function makeSecurityGroupRuleNode(node: {
  readonly cidrBlock: string;
  readonly fromPort: string;
  readonly id: string;
  readonly label: string;
  readonly resourceName: string;
}): DiagramJson["nodes"][number] {
  return makeDiagramNode({
    id: node.id,
    label: node.label,
    parameters: {
      fileName: "main",
      resourceName: node.resourceName,
      resourceType: "aws_security_group_rule",
      terraformBlockType: "resource",
      values: { cidrBlocks: [node.cidrBlock], fromPort: node.fromPort, type: "ingress" }
    },
    type: "aws_security_group_rule"
  });
}

function makeDiagramNode(
  node: Partial<DiagramJson["nodes"][number]> &
    Pick<DiagramJson["nodes"][number], "id" | "label" | "type">
): DiagramJson["nodes"][number] {
  return {
    id: node.id,
    kind: node.kind ?? "resource",
    label: node.label,
    locked: false,
    position: node.position ?? { x: 10, y: 20 },
    size: node.size ?? { width: 180, height: 96 },
    type: node.type,
    zIndex: node.zIndex ?? 1,
    ...(node.parameters !== undefined ? { parameters: node.parameters } : {})
  };
}

function assertContainsNode(parent: DiagramNode | undefined, child: DiagramNode | undefined): void {
  assert.ok(parent, "Expected parent node to exist");
  assert.ok(child, "Expected child node to exist");
  assert.ok(child.position.x >= parent.position.x, `${parent.id} should contain ${child.id} on the left edge`);
  assert.ok(child.position.y >= parent.position.y, `${parent.id} should contain ${child.id} on the top edge`);
  assert.ok(
    child.position.x + child.size.width <= parent.position.x + parent.size.width,
    `${parent.id} should contain ${child.id} on the right edge`
  );
  assert.ok(
    child.position.y + child.size.height <= parent.position.y + parent.size.height,
    `${parent.id} should contain ${child.id} on the bottom edge`
  );
}
