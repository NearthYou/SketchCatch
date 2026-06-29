import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson, DiagramJson } from "@sketchcatch/types";
import {
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson
} from "./workspace-ai-diagram-adapter";

test("convertArchitectureJsonToDiagramJson creates board nodes and edges from an Architecture Draft", () => {
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
        size: { width: 112, height: 108 },
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
        size: { width: 112, height: 108 },
        style: {
          borderColor: "#2f6db3",
          textColor: "#172033"
        },
        type: "aws_instance"
      }
    ]
  );
  assert.deepEqual(diagramJson.edges, [
    {
      id: "edge-vpc-ec2",
      label: "contains",
      sourceNodeId: "vpc-main",
      targetNodeId: "ec2-backend",
      type: "smoothstep",
      style: {
        animated: false,
        color: "#506176",
        width: "medium"
      }
    }
  ]);
  assert.deepEqual(diagramJson.viewport, { x: 0, y: 0, zoom: 1 });
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
