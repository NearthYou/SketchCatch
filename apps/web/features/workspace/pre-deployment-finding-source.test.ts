import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckFinding, DiagramJson } from "@sketchcatch/types";
import { getPreDeploymentFindingTerraformSourceLocation } from "./pre-deployment-finding-source";

test("getPreDeploymentFindingTerraformSourceLocation returns an explicit source location first", () => {
  const finding: CheckFinding = {
    id: "terraform-diagnostic",
    category: "configuration",
    severity: "high",
    sourceLocation: {
      fileName: "network.tf",
      line: 12,
      resourceAddress: "aws_security_group.sg_app"
    },
    title: "Terraform 코드 확인 필요",
    description: "Unsupported argument",
    recommendation: "Terraform 탭에서 수정하세요."
  };

  assert.deepEqual(
    getPreDeploymentFindingTerraformSourceLocation({
      diagramJson: createDiagramJson(),
      files: [],
      finding
    }),
    finding.sourceLocation
  );
});

test("getPreDeploymentFindingTerraformSourceLocation jumps open SSH findings to the public CIDR line", () => {
  const location = getPreDeploymentFindingTerraformSourceLocation({
    diagramJson: createDiagramJson(),
    files: [
      {
        fileName: "main.tf",
        code: `resource "aws_security_group" "sg_app" {
  vpc_id = aws_vpc.vpc_main.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}`
      }
    ],
    finding: {
      id: "security-open-ssh-sg-app",
      category: "security",
      severity: "high",
      resourceId: "sg-app",
      title: "SSH가 전체 인터넷에 열려 있습니다",
      description: "22번 포트가 0.0.0.0/0으로 열려 있습니다.",
      recommendation: "관리용 CIDR만 남기세요."
    }
  });

  assert.deepEqual(location, {
    fileName: "main.tf",
    line: 8,
    resourceAddress: "aws_security_group.sg_app",
    terraformBlockType: "resource",
    terraformBlockName: "sg_app"
  });
});

function createDiagramJson(): DiagramJson {
  return {
    edges: [],
    nodes: [
      {
        id: "sg-app",
        kind: "resource",
        label: "sg-app",
        locked: false,
        parameters: {
          fileName: "main",
          resourceName: "sg_app",
          resourceType: "aws_security_group",
          terraformBlockType: "resource",
          values: {}
        },
        position: { x: 0, y: 0 },
        size: { width: 180, height: 120 },
        type: "aws_security_group",
        zIndex: 0
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
