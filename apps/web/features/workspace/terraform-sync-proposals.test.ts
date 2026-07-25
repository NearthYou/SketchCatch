import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, TerraformDiagramChangeProposal } from "@sketchcatch/types";
import { applyAllTerraformSyncProposals } from "./terraform-sync-proposals";

const emptyDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("Terraform rename은 사용자 표시 이름을 유지하고 local name만 바꾼다", () => {
  const diagram: DiagramJson = {
    ...emptyDiagram,
    nodes: [
      {
        id: "eks-cluster-role",
        kind: "resource",
        label: "EKS Cluster IAM Role",
        locked: false,
        parameters: {
          fileName: "main",
          resourceName: "iam-cluster",
          resourceType: "aws_iam_role",
          terraformBlockType: "resource",
          values: {}
        },
        position: { x: 0, y: 0 },
        size: { width: 48, height: 48 },
        type: "aws_iam_role",
        zIndex: 0
      }
    ]
  };
  const proposal: TerraformDiagramChangeProposal = {
    kind: "rename_candidate",
    from: {
      resourceName: "iam-cluster",
      resourceType: "aws_iam_role",
      terraformBlockType: "resource"
    },
    to: {
      resourceName: "cluster-role",
      resourceType: "aws_iam_role",
      terraformBlockType: "resource"
    },
    nodeId: "eks-cluster-role",
    resourceAddress: "aws_iam_role.iam-cluster"
  };

  const result = applyAllTerraformSyncProposals(diagram, [proposal]);
  const [node] = result.nodes;

  assert.ok(node);
  assert.equal(node.label, "EKS Cluster IAM Role");
  assert.equal(node.parameters?.resourceName, "cluster-role");
});

test("Terraform create는 local name 대신 Resource 카탈로그 이름을 표시한다", () => {
  const proposal: TerraformDiagramChangeProposal = {
    kind: "create_candidate",
    identity: {
      resourceName: "default",
      resourceType: "aws_vpc",
      terraformBlockType: "resource"
    },
    parameters: {
      fileName: "main",
      resourceName: "default",
      resourceType: "aws_vpc",
      terraformBlockType: "resource",
      values: {}
    }
  };

  const result = applyAllTerraformSyncProposals(emptyDiagram, [proposal]);
  const [node] = result.nodes;

  assert.ok(node);
  assert.equal(node.label, "VPC");
  assert.equal(node.parameters?.resourceName, "default");
});
