import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import { projectDraftQuerySchema, saveProjectDraftBodySchema } from "./project-draft-schemas.js";

const validDiagram: DiagramJson = {
  nodes: [
    {
      id: "node-1",
      type: "aws_instance",
      kind: "resource",
      position: { x: 120, y: 80 },
      size: { width: 168, height: 96 },
      label: "EC2 Instance",
      iconUrl: "/icons/ec2.svg",
      locked: false,
      zIndex: 1,
      style: {
        textColor: "#172033",
        borderColor: "#2f6db3",
        borderStyle: "solid"
      },
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_instance",
        resourceName: "ec2_instance",
        fileName: "main",
        values: {
          instanceType: "t3.micro"
        }
      }
    }
  ],
  edges: [
    {
      id: "edge-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      type: "smoothstep",
      style: {
        color: "#506176",
        lineStyle: "solid",
        width: "medium",
        animated: false
      }
    }
  ],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

const sourceExactPresentation = {
  geometryPolicy: "source-exact" as const,
  sourceViewBox: {
    x: -120.5,
    y: 48.25,
    width: 1920,
    height: 1080
  },
  initialViewportPending: true
};

const authoredEdgeRoute = {
  svgPath: "M 60 60 C 160 60 160 240 300 240",
  sourcePoint: { x: 60, y: 60 },
  targetPoint: { x: 300, y: 240 },
  waypoints: [
    { x: 160, y: 60 },
    { x: 160, y: 240 }
  ],
  labelPosition: { x: 170, y: 142 },
  arrowDirection: "source-to-target" as const,
  arrowAngle: 37.5
};

test("project draft query accepts no required parameters", () => {
  assert.equal(projectDraftQuerySchema.safeParse({}).success, true);
});

test("save project draft body accepts full DiagramJson", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: validDiagram
  });

  assert.equal(parsed.diagramJson.nodes[0]?.parameters?.values.instanceType, "t3.micro");
  assert.equal(parsed.diagramJson.viewport.zoom, 1);
});

test("save project draft body preserves legacy DiagramJson byte-equivalently", () => {
  const payload = {
    diagramJson: {
      ...validDiagram,
      variables: [
        {
          id: "variable-1",
          name: "environment",
          type: "string",
          value: "production",
          bindings: [{ nodeId: "node-1", parameterKey: "tags.Environment" }],
          source: "user" as const
        }
      ]
    }
  };
  const parsed = saveProjectDraftBodySchema.parse(payload);

  assert.equal(JSON.stringify(parsed), JSON.stringify(payload));
});

test("save project draft body preserves source-exact presentation and authored edge routes", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      ...validDiagram,
      presentation: sourceExactPresentation,
      edges: [
        {
          ...validDiagram.edges[0]!,
          zIndex: 12,
          route: authoredEdgeRoute
        }
      ]
    }
  });

  assert.deepEqual(parsed.diagramJson.presentation, sourceExactPresentation);
  assert.deepEqual(parsed.diagramJson.edges[0]?.route, authoredEdgeRoute);
  assert.equal(parsed.diagramJson.edges[0]?.zIndex, 12);
});

test("save project draft body rejects non-finite source viewBox coordinates", () => {
  const result = saveProjectDraftBodySchema.safeParse({
    diagramJson: {
      ...validDiagram,
      presentation: {
        ...sourceExactPresentation,
        sourceViewBox: {
          ...sourceExactPresentation.sourceViewBox,
          x: Number.POSITIVE_INFINITY
        }
      }
    }
  });

  assert.equal(result.success, false);
});

test("save project draft body rejects non-finite authored route data", () => {
  const result = saveProjectDraftBodySchema.safeParse({
    diagramJson: {
      ...validDiagram,
      edges: [
        {
          ...validDiagram.edges[0]!,
          route: {
            ...authoredEdgeRoute,
            waypoints: [{ x: Number.NaN, y: 60 }]
          }
        }
      ]
    }
  });

  assert.equal(result.success, false);
});

test("save project draft body preserves Terraform virtual files", () => {
  const terraformFiles = [
    { fileName: "main.tf", terraformCode: "resource \"aws_vpc\" \"main\" {}" },
    { fileName: "variables.tf", terraformCode: "variable \"cidr\" { type = string }" }
  ];
  const parsed = saveProjectDraftBodySchema.parse({ diagramJson: validDiagram, terraformFiles });

  assert.deepEqual(parsed.terraformFiles, terraformFiles);
});

test("save project draft body preserves diagram edge line style", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      ...validDiagram,
      edges: [
        {
          ...validDiagram.edges[0]!,
          style: {
            color: "#476582",
            lineStyle: "dashed",
            width: "medium"
          }
        }
      ]
    }
  });

  assert.equal(parsed.diagramJson.edges[0]?.style?.lineStyle, "dashed");
});

test("save project draft body preserves parameter-reference edge metadata", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      ...validDiagram,
      edges: [
        {
          ...validDiagram.edges[0]!,
          metadata: {
            managedBy: "parameter-reference",
            parameterPath: "loadBalancerArn"
          }
        }
      ]
    }
  });

  assert.deepEqual(parsed.diagramJson.edges[0]?.metadata, {
    managedBy: "parameter-reference",
    parameterPath: "loadBalancerArn"
  });
});

test("save project draft body rejects unsupported parameter-reference edge metadata", () => {
  const result = saveProjectDraftBodySchema.safeParse({
    diagramJson: {
      ...validDiagram,
      edges: [
        {
          ...validDiagram.edges[0]!,
          metadata: {
            managedBy: "manual",
            parameterPath: "loadBalancerArn"
          }
        }
      ]
    }
  });

  assert.equal(result.success, false);
});

test("save project draft body preserves diagram node border style", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      ...validDiagram,
      nodes: [
        {
          ...validDiagram.nodes[0]!,
          style: {
            borderStyle: "dashed"
          }
        }
      ]
    }
  });

  assert.equal(parsed.diagramJson.nodes[0]?.style?.borderStyle, "dashed");
});

test("save project draft body rejects invalid diagram node border style", () => {
  const result = saveProjectDraftBodySchema.safeParse({
    diagramJson: {
      ...validDiagram,
      nodes: [
        {
          ...validDiagram.nodes[0]!,
          style: {
            borderStyle: "double"
          }
        }
      ]
    }
  });

  assert.equal(result.success, false);
});

test("save project draft body preserves diagram node metadata", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      ...validDiagram,
      nodes: [
        {
          ...validDiagram.nodes[0]!,
          metadata: {
            parentAreaNodeId: "area-1"
          }
        }
      ]
    }
  });

  assert.deepEqual(parsed.diagramJson.nodes[0]?.metadata, {
    parentAreaNodeId: "area-1"
  });
});

test("save project draft body preserves Template presentation metadata", () => {
  // Saved Template Boards need both the authored area flag and exact Design Catalog identity after reload.
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      ...validDiagram,
      nodes: [
        {
          ...validDiagram.nodes[0]!,
          kind: "design",
          parameters: undefined,
          metadata: {
            presentationArea: true,
            presentationCatalogItemId: "aws-region"
          }
        }
      ]
    }
  });

  assert.deepEqual(parsed.diagramJson.nodes[0]?.metadata, {
    presentationArea: true,
    presentationCatalogItemId: "aws-region"
  });
});

test("save project draft body accepts reverse engineering node metadata", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      ...validDiagram,
      nodes: [
        {
          ...validDiagram.nodes[0]!,
          metadata: {
            reverseEngineering: {
              source: "aws_scan",
              protectedValueKeys: ["providerResourceId", "region"],
              editableValueKeys: ["displayName", "description"]
            }
          }
        }
      ]
    }
  });

  assert.deepEqual(parsed.diagramJson.nodes[0]?.metadata?.reverseEngineering, {
    source: "aws_scan",
    protectedValueKeys: ["providerResourceId", "region"],
    editableValueKeys: ["displayName", "description"]
  });
});

test("save project draft body rejects legacy awsRegion metadata", () => {
  const result = saveProjectDraftBodySchema.safeParse({
    diagramJson: {
      ...validDiagram,
      nodes: [
        {
          ...validDiagram.nodes[0]!,
          metadata: {
            awsRegion: "ap-northeast-2"
          }
        }
      ]
    }
  });

  assert.equal(result.success, false);
});

test("save project draft body accepts Region and AZ values in parameters", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      ...validDiagram,
      nodes: [
        {
          ...validDiagram.nodes[0]!,
          id: "region-1",
          type: "aws_region",
          label: "Region",
          parameters: {
            resourceType: "aws_region",
            resourceName: "ap_northeast_2",
            fileName: "main",
            values: {
              awsRegion: "ap-northeast-2"
            }
          }
        },
        {
          ...validDiagram.nodes[0]!,
          id: "az-1",
          type: "aws_availability_zone",
          label: "AZ",
          metadata: {
            parentAreaNodeId: "region-1"
          },
          parameters: {
            resourceType: "aws_availability_zone",
            resourceName: "ap_northeast_2a",
            fileName: "main",
            values: {
              awsAvailabilityZone: "ap-northeast-2a"
            }
          }
        }
      ]
    }
  });

  assert.equal(parsed.diagramJson.nodes[0]?.parameters?.values["awsRegion"], "ap-northeast-2");
  assert.equal(
    parsed.diagramJson.nodes[1]?.parameters?.values["awsAvailabilityZone"],
    "ap-northeast-2a"
  );
  assert.deepEqual(parsed.diagramJson.nodes[1]?.metadata, {
    parentAreaNodeId: "region-1"
  });
});

test("save project draft body accepts an empty board DiagramJson", () => {
  const parsed = saveProjectDraftBodySchema.parse({
    diagramJson: {
      nodes: [],
      edges: [],
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      }
    }
  });

  assert.deepEqual(parsed.diagramJson.nodes, []);
  assert.deepEqual(parsed.diagramJson.edges, []);
  assert.equal(parsed.diagramJson.viewport.zoom, 1);
});

test("save project draft body rejects architecture-only json without viewport", () => {
  const result = saveProjectDraftBodySchema.safeParse({
    diagramJson: {
      nodes: [],
      edges: []
    }
  });

  assert.equal(result.success, false);
});
