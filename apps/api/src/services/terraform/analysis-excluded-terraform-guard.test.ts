import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson, DiagramJson, TerraformBlockIdentity } from "@sketchcatch/types";
import { findAnalysisExcludedTerraformConflicts } from "./analysis-excluded-terraform-guard.js";

const excludedDiagram: DiagramJson = {
  nodes: [
    {
      id: "legacy-lambda",
      type: "aws_lambda_function",
      kind: "resource",
      label: "Legacy Lambda",
      position: { x: 0, y: 0 },
      size: { width: 120, height: 80 },
      locked: false,
      zIndex: 1,
      parameters: {
        resourceType: "aws_lambda_function",
        resourceName: "legacy_lambda",
        fileName: "compute.tf",
        values: { analysisExcluded: true }
      }
    },
    {
      id: "review-only-without-identity",
      type: "unknown_resource",
      kind: "resource",
      label: "Review only",
      position: { x: 160, y: 0 },
      size: { width: 120, height: 80 },
      locked: false,
      zIndex: 2,
      parameters: {
        resourceType: "",
        resourceName: "",
        fileName: "",
        values: { analysisExcluded: true }
      }
    }
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

const resource = (
  resourceType: string,
  resourceName: string,
  terraformBlockType: "resource" | "data" = "resource"
): TerraformBlockIdentity => ({ terraformBlockType, resourceType, resourceName });

test("findAnalysisExcludedTerraformConflicts matches an excluded Terraform resource by full identity", () => {
  assert.deepEqual(
    findAnalysisExcludedTerraformConflicts(excludedDiagram, [
      resource("aws_lambda_function", "legacy_lambda")
    ]),
    [
      {
        nodeId: "legacy-lambda",
        resourceAddress: "aws_lambda_function.legacy_lambda",
        excludedResourceAddress: "aws_lambda_function.legacy_lambda"
      }
    ]
  );
});

test("findAnalysisExcludedTerraformConflicts does not block a same-type resource with another name", () => {
  assert.deepEqual(
    findAnalysisExcludedTerraformConflicts(excludedDiagram, [
      resource("aws_lambda_function", "supported_lambda")
    ]),
    []
  );
});

test("findAnalysisExcludedTerraformConflicts does not globally block a review-only node without Terraform identity", () => {
  assert.deepEqual(
    findAnalysisExcludedTerraformConflicts(excludedDiagram, [resource("aws_vpc", "main")]),
    []
  );
});

test("findAnalysisExcludedTerraformConflicts fails closed by type when an excluded node has no Terraform name", () => {
  const diagram: DiagramJson = {
    ...excludedDiagram,
    nodes: [
      {
        ...excludedDiagram.nodes[0]!,
        parameters: {
          ...excludedDiagram.nodes[0]!.parameters!,
          resourceName: ""
        }
      }
    ]
  };

  assert.deepEqual(
    findAnalysisExcludedTerraformConflicts(diagram, [
      resource("aws_lambda_function", "any_name"),
      resource("aws_vpc", "main")
    ]),
    [
      {
        nodeId: "legacy-lambda",
        resourceAddress: "aws_lambda_function.any_name",
        excludedResourceAddress: "aws_lambda_function"
      }
    ]
  );
});

test("findAnalysisExcludedTerraformConflicts projects immutable Architecture identity before deployment", () => {
  const architecture: ArchitectureJson = {
    nodes: [
      {
        id: "legacy-lambda",
        type: "LAMBDA",
        label: "Legacy Lambda",
        positionX: 0,
        positionY: 0,
        config: {
          analysisExcluded: true,
          terraformResourceType: "aws_lambda_function",
          terraformResourceName: "legacy_lambda"
        }
      },
      {
        id: "supported-vpc",
        type: "VPC",
        label: "VPC",
        positionX: 120,
        positionY: 0,
        config: {}
      }
    ],
    edges: []
  };

  assert.deepEqual(
    findAnalysisExcludedTerraformConflicts(architecture, [
      resource("aws_lambda_function", "legacy_lambda"),
      resource("aws_vpc", "main")
    ]),
    [
      {
        nodeId: "legacy-lambda",
        resourceAddress: "aws_lambda_function.legacy_lambda",
        excludedResourceAddress: "aws_lambda_function.legacy_lambda"
      }
    ]
  );
});
