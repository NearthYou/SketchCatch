import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "./index.js";
import { createTerraformProviderFiles } from "./terraform-provider-files.js";

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

// Provider fixtures isolate visual kind from optional Terraform identity.
function makeNode(
  id: string,
  kind: DiagramNode["kind"],
  type: string,
  withParameters = false
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
            values: {}
          }
        }
      : {})
  };
}
