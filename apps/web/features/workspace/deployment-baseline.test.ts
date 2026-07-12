import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, TerraformSyncFileInput } from "@sketchcatch/types";
import {
  combineDeploymentBaselineTerraformFiles,
  createDeploymentBaseline
} from "./deployment-baseline";

function createDiagram(): DiagramJson {
  return {
    edges: [],
    nodes: [
      {
        id: "vpc",
        kind: "resource",
        label: "VPC",
        locked: false,
        position: { x: 40, y: 80 },
        size: { width: 120, height: 80 },
        type: "aws_vpc",
        zIndex: 1
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

const files: TerraformSyncFileInput[] = [
  { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "main" {}\n' }
];

test("deployment baseline rejects unsaved Terraform", () => {
  assert.throws(
    () =>
      createDeploymentBaseline({
        diagram: createDiagram(),
        terraformFiles: files,
        hasUnsavedTerraformChanges: true
      }),
    /TERRAFORM_NOT_CURRENT/
  );
});

test("deployment baseline clones Diagram and Terraform files", () => {
  const diagram = createDiagram();
  const mutableFiles = structuredClone(files);
  const baseline = createDeploymentBaseline({
    diagram,
    terraformFiles: mutableFiles,
    hasUnsavedTerraformChanges: false
  });

  diagram.nodes.length = 0;
  mutableFiles[0]!.terraformCode = "";

  assert.notEqual(baseline.diagram.nodes.length, 0);
  assert.notEqual(baseline.terraformFiles[0]?.terraformCode, "");
  assert.match(baseline.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("deployment baseline combines its cloned Terraform files for artifact upload", () => {
  assert.equal(
    combineDeploymentBaselineTerraformFiles([
      { fileName: "providers.tf", terraformCode: "terraform {}\n" },
      { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "main" {}\n' }
    ]),
    'terraform {}\n\nresource "aws_vpc" "main" {}'
  );
});
