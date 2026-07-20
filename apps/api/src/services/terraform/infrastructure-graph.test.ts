import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildTemplateDiagramJson,
  templateDefinitions,
  type DiagramNode
} from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";
import { generateTerraformFromDiagramJson } from "./terraform-preview.js";

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
            cidrBlock: "10.0.0.0/16",
            diagramRenderAsResource: true,
            parentAreaNodeId: "aws-cloud",
            templateResourceId: "vpc",
            terraformBlockType: "resource"
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

test("Reverse Engineering provenance와 관찰 정보는 Terraform argument로 내보내지 않는다", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "imported-bucket",
        type: "aws_s3_bucket",
        kind: "resource",
        label: "existing bucket",
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket",
          resourceName: "existing_bucket",
          fileName: "storage",
          values: {
            bucket: "existing-bucket",
            providerResourceId: "existing-bucket",
            providerResourceType: "AWS::S3::Bucket",
            reverseEngineeringSourceScanId: "scan-1",
            reverseEngineeringDraftId: "draft-1",
            reverseEngineeringSourceKind: "saved_scan",
            reverseEngineeringManagement: "managed",
            reverseEngineeringObservedConfig: { createdAt: "2026-07-20" },
            terraformFileName: "storage"
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes[0]?.config, { bucket: "existing-bucket" });
});

test("Template presentation nodes and edges stay outside the Terraform infrastructure graph", () => {
  // Terraform planning must see the same deployable graph that existed before Design presentation was added.
  for (const definition of templateDefinitions) {
    const graph = buildInfrastructureGraphFromDiagramJson(
      buildTemplateDiagramJson(definition.id, {
        projectSlug: "terraform",
        shortId: "presentation"
      })
    );

    assert.equal(graph.nodes.length, definition.resources.length, `${definition.id} resources`);
    assert.equal(
      graph.edges.length,
      definition.relationships.length,
      `${definition.id} relationships`
    );
    assert.equal(
      graph.nodes.some((node) => node.id.includes("-presentation-")),
      false,
      definition.id
    );
    assert.equal(
      graph.edges.some((edge) => edge.id.includes("-presentation-")),
      false,
      definition.id
    );
  }
});

test("summary presentation edges stay outside the Terraform infrastructure graph", () => {
  const source = makeNode({
    id: "service",
    type: "aws_ecs_service",
    kind: "resource",
    label: "service",
    parameters: {
      resourceType: "aws_ecs_service",
      resourceName: "service",
      fileName: "compute",
      values: {}
    }
  });
  const target = makeNode({
    id: "database",
    type: "aws_db_instance",
    kind: "resource",
    label: "database",
    parameters: {
      resourceType: "aws_db_instance",
      resourceName: "database",
      fileName: "data",
      values: {}
    }
  });
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [source, target],
    edges: [
      { id: "dependency", sourceNodeId: source.id, targetNodeId: target.id },
      {
        id: "summary",
        sourceNodeId: source.id,
        targetNodeId: target.id,
        metadata: { presentationRole: "summary" }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(
    graph.edges.map((edge) => edge.id),
    ["dependency"]
  );
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

test("buildInfrastructureGraphFromDiagramJson omits ASG fleet visualization instances", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "asg-1",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "app fleet",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "app",
          fileName: "compute",
          values: {
            minSize: 2,
            desiredCapacity: 2,
            maxSize: 4
          }
        }
      }),
      makeNode({
        id: "instance-1",
        type: "aws_instance",
        kind: "resource",
        label: "fleet instance 1",
        parameters: {
          resourceType: "aws_instance",
          resourceName: "fleet_instance_1",
          fileName: "compute",
          values: {
            managedByAutoScalingGroup: "asg-1",
            sketchcatchReferenceTerraform: true
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(
    graph.nodes.map((node) => node.iac.resourceType),
    ["aws_autoscaling_group"]
  );
});

test("buildInfrastructureGraphFromDiagramJson fail-closes analysis-excluded resources", () => {
  const diagramJson = {
    nodes: [
      makeNode({
        id: "lambda-1",
        type: "aws_lambda_function",
        kind: "resource",
        label: "Legacy Lambda",
        parameters: {
          resourceType: "aws_lambda_function",
          resourceName: "legacy_lambda",
          fileName: "compute",
          values: {
            analysisExcluded: true,
            functionName: "legacy-lambda",
            handler: "index.handler",
            runtime: "nodejs22.x"
          }
        }
      }),
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
    edges: [
      {
        id: "legacy-lambda-connection",
        sourceNodeId: "lambda-1",
        targetNodeId: "vpc-1"
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const graph = buildInfrastructureGraphFromDiagramJson(diagramJson);

  assert.deepEqual(graph.nodes.map((node) => node.id), ["vpc-1"]);
  assert.deepEqual(graph.edges, []);
  assert.doesNotMatch(
    generateTerraformFromDiagramJson(diagramJson),
    /resource "aws_lambda_function" "legacy_lambda"/
  );
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

test("buildInfrastructureGraphFromDiagramJson omits invalid ASG desired capacity values while retaining zero", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "missing-desired-capacity",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "missing",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "missing",
          fileName: "compute",
          values: {
            minSize: 1,
            maxSize: 3
          }
        }
      }),
      makeNode({
        id: "null-desired-capacity",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "null",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "null",
          fileName: "compute",
          values: {
            minSize: 1,
            desiredCapacity: null,
            maxSize: 3
          }
        }
      }),
      makeNode({
        id: "blank-desired-capacity",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "blank",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "blank",
          fileName: "compute",
          values: {
            minSize: 1,
            desired_capacity: "",
            maxSize: 3
          }
        }
      }),
      makeNode({
        id: "text-desired-capacity",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "text",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "text",
          fileName: "compute",
          values: {
            minSize: 1,
            desiredCapacity: "2",
            maxSize: 3
          }
        }
      }),
      makeNode({
        id: "zero-desired-capacity",
        type: "aws_autoscaling_group",
        kind: "resource",
        label: "zero",
        parameters: {
          resourceType: "aws_autoscaling_group",
          resourceName: "zero",
          fileName: "compute",
          values: {
            minSize: 0,
            desiredCapacity: 0,
            maxSize: 3
          }
        }
      })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(
    graph.nodes.map((node) => node.config),
    [
      { minSize: 1, maxSize: 3 },
      { minSize: 1, maxSize: 3 },
      { minSize: 1, maxSize: 3 },
      { minSize: 1, maxSize: 3 },
      { minSize: 0, desiredCapacity: 0, maxSize: 3 }
    ]
  );
});

test("all shared resource definitions support Terraform Preview and Sync", () => {
  assert.ok(resourceDefinitions.length >= 66);
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

test("Board 자동 표시 프레임은 Terraform 모양의 값이 있어도 infrastructure graph에서 제외한다", () => {
  const graph = buildInfrastructureGraphFromDiagramJson({
    nodes: [
      makeNode({
        id: "board-auto-frame:group",
        type: "design_group",
        kind: "design",
        label: "자동 표시 영역",
        metadata: { presentationCatalogItemId: "design-group" },
        parameters: {
          resourceType: "aws_instance",
          resourceName: "must_not_render",
          fileName: "main.tf",
          values: { instance_type: "m7i.large" }
        }
      }),
      makeNode({
        id: "instance-1",
        type: "aws_instance",
        kind: "resource",
        label: "API Server",
        parameters: {
          resourceType: "aws_instance",
          resourceName: "api",
          fileName: "main.tf",
          values: { instance_type: "t3.micro" }
        }
      })
    ],
    edges: [
      {
        id: "frame-membership",
        sourceNodeId: "board-auto-frame:group",
        targetNodeId: "instance-1",
        label: "contains"
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.deepEqual(graph.nodes.map((node) => node.id), ["instance-1"]);
  assert.deepEqual(graph.edges, []);
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

  assert.deepEqual(
    graph.nodes.map((node) => node.config),
    [
      {
        cidrBlock: "10.0.1.0/24",
        availabilityZone: "ap-northeast-2a"
      },
      {
        size: 20,
        availabilityZone: "ap-northeast-2a"
      }
    ]
  );
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
