import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import { createDeploymentBaseline } from "./deployment-baseline";

const diagram: DiagramJson = {
  edges: [],
  nodes: [
    {
      id: "vpc-1",
      kind: "resource",
      label: "VPC",
      nodeType: "AWS_VPC",
      parameters: {
        fileName: "main.tf",
        resourceName: "main",
        resourceType: "aws_vpc",
        values: { cidrBlock: "10.0.0.0/16" }
      },
      position: { x: 0, y: 0 }
    }
  ],
  version: "1.0"
};

test("stale Terraform cannot become a deployment baseline", () => {
  const baseline = createDeploymentBaseline(diagram, {
    architectureDiagnostics: [],
    code: "resource \"aws_vpc\" \"main\" {}",
    diagnostics: [],
    files: [{ code: "resource \"aws_vpc\" \"main\" {}", fileName: "main.tf" }],
    previewState: "stale"
  });

  assert.equal(baseline, null);
});

test("current Terraform creates an isolated deployment baseline", () => {
  const baseline = createDeploymentBaseline(diagram, {
    architectureDiagnostics: [],
    code: "resource \"aws_vpc\" \"main\" {}",
    diagnostics: [],
    files: [{ code: "resource \"aws_vpc\" \"main\" {}", fileName: "main.tf" }],
    previewState: "current"
  });

  assert.ok(baseline);
  diagram.nodes[0]!.label = "Changed after baseline";
  assert.equal(baseline.diagram.nodes[0]?.label, "VPC");
  assert.deepEqual(baseline.terraformFiles, [
    { code: "resource \"aws_vpc\" \"main\" {}", fileName: "main.tf" }
  ]);
});
