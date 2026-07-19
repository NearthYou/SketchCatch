import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "./index.js";
import {
  createTerraformProviderFiles,
  isTerraformDeployableNode
} from "./terraform-provider-files.js";

test("createTerraformProviderFiles ignores Design nodes with Terraform-like AWS types", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode("design-region", "design", "aws_region"),
      makeNode("design-vpc", "design", "aws_vpc", true)
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  assert.deepEqual(createTerraformProviderFiles(diagramJson), []);
});

test("createTerraformProviderFiles keeps a resource-kind visual Area deployable", () => {
  const diagramJson: DiagramJson = {
    nodes: [makeNode("resource-vpc", "resource", "aws_vpc", true)],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const providerCode = createTerraformProviderFiles(diagramJson)[0]?.terraformCode ?? "";

  assert.match(providerCode, /source\s*= "hashicorp\/aws"/);
});

test("Terraform deployment boundaries exclude reference-only and unsupported Resource nodes", () => {
  const referenceOnlyNode = makeNode(
    "reference-instance",
    "resource",
    "aws_instance",
    true,
    { sketchcatchReferenceTerraform: true }
  );
  const unsupportedNode = makeNode(
    "unsupported-resource",
    "resource",
    "aws_not_a_supported_resource",
    true
  );
  const diagramJson: DiagramJson = {
    nodes: [referenceOnlyNode, unsupportedNode],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  assert.equal(isTerraformDeployableNode(referenceOnlyNode), false);
  assert.equal(isTerraformDeployableNode(unsupportedNode), false);
  assert.deepEqual(createTerraformProviderFiles(diagramJson), []);
});

test("createTerraformProviderFiles includes the random provider for generated runtime secrets", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      makeNode("runtime-secret-material", "resource", "random_password", true),
      makeNode("runtime-secret", "resource", "aws_secretsmanager_secret", true)
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const providerCode = createTerraformProviderFiles(diagramJson)[0]?.terraformCode ?? "";

  assert.match(providerCode, /source\s*= "hashicorp\/aws"/);
  assert.match(providerCode, /source\s*= "hashicorp\/random"/);
  assert.doesNotMatch(providerCode, /provider "random"/);
});

// Provider fixtures isolate visual kind from optional Terraform identity.
function makeNode(
  id: string,
  kind: DiagramNode["kind"],
  type: string,
  withParameters = false,
  values: Record<string, unknown> = {}
): DiagramNode {
  return {
    id,
    kind,
    label: id,
    locked: false,
    position: { x: 0, y: 0 },
    size: { height: 320, width: 480 },
    type,
    zIndex: 0,
    ...(withParameters
      ? {
          parameters: {
            fileName: "main.tf",
            resourceName: id.replaceAll("-", "_"),
            resourceType: type,
            terraformBlockType: "resource" as const,
            values
          }
        }
      : {})
  };
}
