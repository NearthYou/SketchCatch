import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { DiagramNode } from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";

test("buildInfrastructureGraphFromDiagramJson projects renderable resource nodes", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network",
          values: {
            cidrBlock: "10.0.0.0/16"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes, [
    {
      id: "vpc-1",
      label: "main",
      iac: {
        provider: "aws",
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main",
        fileName: "network"
      },
      config: {
        cidrBlock: "10.0.0.0/16"
      }
    }
  ]);
});

test("buildInfrastructureGraphFromDiagramJson keeps provider-specific Terraform resource identity", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "instance-1",
        type: "aws_instance",
        kind: "resource",
        label: "web",
        parameters: {
          resourceType: "aws_instance",
          resourceName: "web",
          fileName: "compute",
          values: {
            ami: "ami-1234567890abcdef0"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.equal(graph.nodes[0]?.iac.provider, "aws");
  assert.equal(graph.nodes[0]?.iac.terraformBlockType, "resource");
  assert.equal(graph.nodes[0]?.iac.resourceType, "aws_instance");
  assert.ok(!("type" in (graph.nodes[0] ?? {})));
});

test("buildInfrastructureGraphFromDiagramJson keeps invalid nodes for preview skeleton stability", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          invalid: true,
          values: {
            cidrBlock: "10.0.1.0/24"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0]?.iac.resourceType, "aws_subnet");
});

test("all shared resource definitions support Terraform Preview and Sync", () => {
  assert.equal(resourceDefinitions.length, 66);
  assert.deepEqual(
    resourceDefinitions.filter((definition) => !definition.capabilities.terraformPreview),
    []
  );
  assert.deepEqual(
    resourceDefinitions.filter((definition) => !definition.capabilities.terraformSync),
    []
  );
  assert.equal(
    resourceDefinitions.some(
      (definition) =>
        definition.terraform.resourceType === "aws_region" ||
        definition.terraform.resourceType === "aws_availability_zone"
    ),
    false
  );
});

test("buildInfrastructureGraphFromDiagramJson excludes design, parameterless, and unsupported nodes", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "memo-1",
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
        id: "unsupported-1",
        type: "aws_unknown_service",
        kind: "resource",
        label: "unknown",
        parameters: {
          resourceType: "aws_unknown_service",
          resourceName: "unknown",
          fileName: "main",
          values: {}
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes, []);
});

test("buildInfrastructureGraphFromDiagramJson excludes Region and AZ area resources from Terraform Preview", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "region-1",
        type: "aws_region",
        kind: "resource",
        label: "Region",
        parameters: {
          resourceType: "aws_region",
          resourceName: "ap_northeast_2",
          fileName: "main",
          values: {
            awsRegion: "ap-northeast-2"
          }
        }
      }),
      makeNode({
        id: "az-1",
        type: "aws_availability_zone",
        kind: "resource",
        label: "AZ",
        parameters: {
          resourceType: "aws_availability_zone",
          resourceName: "ap_northeast_2a",
          fileName: "main",
          values: {
            awsAvailabilityZone: "ap-northeast-2a"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes, []);
});

test("buildInfrastructureGraphFromDiagramJson inherits availability_zone from direct parent AZ for Subnet and EBS", () => {
  const subnetValues = {
    cidrBlock: "10.0.1.0/24"
  };
  const ebsValues = {
    size: 20
  };
  const diagramJson = {
    nodes: [
      makeNode({
        id: "az-1",
        type: "aws_availability_zone",
        kind: "resource",
        label: "AZ",
        parameters: {
          resourceType: "aws_availability_zone",
          resourceName: "ap_northeast_2a",
          fileName: "main",
          values: {
            awsAvailabilityZone: "ap-northeast-2a"
          }
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: subnetValues
        }
      }),
      makeNode({
        id: "ebs-1",
        type: "aws_ebs_volume",
        kind: "resource",
        label: "data",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_ebs_volume",
          resourceName: "data",
          fileName: "main",
          values: ebsValues
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const graph = buildInfrastructureGraphFromDiagramJson(diagramJson);

  assert.deepEqual(graph.nodes.map((node) => node.config), [
    {
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a"
    },
    {
      size: 20,
      availabilityZone: "ap-northeast-2a"
    }
  ]);
  assert.deepEqual(subnetValues, {
    cidrBlock: "10.0.1.0/24"
  });
  assert.deepEqual(ebsValues, {
    size: 20
  });
});

test("buildInfrastructureGraphFromDiagramJson ignores legacy AZ parents without values", () => {
  const availabilityZoneNode = makeNode({
    id: "az-1",
    type: "aws_availability_zone",
    kind: "resource",
    label: "AZ",
    parameters: {
      resourceType: "aws_availability_zone",
      resourceName: "ap_northeast_2a",
      fileName: "main",
      values: {}
    }
  });

  Object.assign(availabilityZoneNode.parameters ?? {}, { values: undefined });

  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      availabilityZoneNode,
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            cidrBlock: "10.0.1.0/24"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes[0]?.config, {
    cidrBlock: "10.0.1.0/24"
  });
});

test("buildInfrastructureGraphFromDiagramJson keeps child availabilityZone before parent AZ inheritance", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "az-1",
        type: "aws_availability_zone",
        kind: "resource",
        label: "AZ",
        parameters: {
          resourceType: "aws_availability_zone",
          resourceName: "ap_northeast_2a",
          fileName: "main",
          values: {
            awsAvailabilityZone: "ap-northeast-2a"
          }
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        metadata: {
          parentAreaNodeId: "az-1"
        },
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main",
          values: {
            cidrBlock: "10.0.1.0/24",
            availabilityZone: "ap-northeast-2c"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.equal(graph.nodes[0]?.config.availabilityZone, "ap-northeast-2c");
});

test("buildInfrastructureGraphFromDiagramJson keeps edges only between projected nodes", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "vpc-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "network",
          values: {}
        }
      }),
      makeNode({
        id: "subnet-1",
        type: "aws_subnet",
        kind: "resource",
        label: "public",
        parameters: {
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "network",
          values: {}
        }
      }),
      makeNode({
        id: "unsupported-1",
        type: "aws_unknown_service",
        kind: "resource",
        label: "unknown",
        parameters: {
          resourceType: "aws_unknown_service",
          resourceName: "unknown",
          fileName: "main",
          values: {}
        }
      })
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "vpc-1",
        targetNodeId: "subnet-1",
        label: "contains"
      },
      {
        id: "edge-2",
        sourceNodeId: "vpc-1",
        targetNodeId: "unsupported-1"
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.edges, [
    {
      id: "edge-1",
      sourceId: "vpc-1",
      targetId: "subnet-1",
      label: "contains"
    }
  ]);
});

test("Terraform preview support is read from shared resource definitions", () => {
  const infrastructureGraphSource = readTerraformServiceFile("infrastructure-graph.ts");
  const terraformSyncSource = readTerraformServiceFile("terraform-to-diagram.ts");

  assert.doesNotMatch(infrastructureGraphSource, /PREVIEW_SUPPORTED_BLOCKS/);
  assert.doesNotMatch(infrastructureGraphSource, /RESOURCE_TYPE_BY_TERRAFORM_TYPE/);
  assert.doesNotMatch(terraformSyncSource, /PROPOSAL_SUPPORTED_BLOCKS/);
  assert.doesNotMatch(infrastructureGraphSource, /resourceDefinition\.resourceType/);
  assert.match(infrastructureGraphSource, /getResourceDefinitionByTerraform/);
  assert.match(terraformSyncSource, /getResourceDefinitionByTerraform/);
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

function readTerraformServiceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
