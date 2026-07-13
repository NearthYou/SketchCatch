import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode, ResourceItem } from "../../../../packages/types/src";
import {
  applyNodeParametersUpdateWithAutoTagSync,
  clearActiveResourceDragPayload,
  cloneDiagram,
  createDiagramEdge,
  createDiagramNodeFromPayload,
  createPastedNodes,
  getActiveResourceDragPayload,
  writeResourceDragPayload
} from "./diagram-utils";

const resourceItem: ResourceItem = {
  id: "aws-vpc",
  name: "VPC",
  cloudProvider: "aws",
  area: "network",
  category: "Network",
  iconUrl: "/vpc.svg",
  enabled: true,
  nodeDefaults: {
    type: "aws_vpc",
    label: "VPC",
    size: {
      width: 168,
      height: 96
    }
  }
};

test("cloneDiagram deeply clones source-exact presentation, authored routes, and variables", () => {
  const source: DiagramJson = {
    nodes: [],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "source-node",
        targetNodeId: "target-node",
        sourceHandleId: "handle-right",
        targetHandleId: "handle-left",
        zIndex: 8,
        route: {
          svgPath: "M 40 60 L 160 60 L 160 240 L 300 240",
          sourcePoint: { x: 40, y: 60 },
          targetPoint: { x: 300, y: 240 },
          waypoints: [
            { x: 160, y: 60 },
            { x: 160, y: 240 }
          ],
          labelPosition: { x: 170, y: 146 },
          arrowDirection: "source-to-target",
          arrowAngle: 90
        }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    variables: [
      {
        id: "variable-1",
        name: "allowedCidrs",
        type: "list(string)",
        value: {
          entries: ["10.0.0.0/8"]
        },
        bindings: [{ nodeId: "source-node", parameterKey: "cidrBlocks" }],
        source: "user"
      }
    ],
    presentation: {
      geometryPolicy: "source-exact",
      sourceViewBox: { x: -120, y: -80, width: 1440, height: 900 },
      initialViewportPending: true
    }
  };

  const cloned = cloneDiagram(source);

  assert.deepEqual(cloned, source);
  assert.deepEqual(cloned.edges[0], source.edges[0]);
  assert.notEqual(cloned.presentation, source.presentation);
  assert.notEqual(cloned.presentation?.sourceViewBox, source.presentation?.sourceViewBox);
  assert.notEqual(cloned.edges[0]?.route, source.edges[0]?.route);
  assert.notEqual(cloned.edges[0]?.route?.sourcePoint, source.edges[0]?.route?.sourcePoint);
  assert.notEqual(cloned.edges[0]?.route?.targetPoint, source.edges[0]?.route?.targetPoint);
  assert.notEqual(cloned.edges[0]?.route?.waypoints, source.edges[0]?.route?.waypoints);
  assert.notEqual(cloned.edges[0]?.route?.waypoints[0], source.edges[0]?.route?.waypoints[0]);
  assert.notEqual(cloned.edges[0]?.route?.labelPosition, source.edges[0]?.route?.labelPosition);
  assert.notEqual(cloned.variables, source.variables);
  assert.notEqual(cloned.variables?.[0]?.bindings, source.variables?.[0]?.bindings);
  assert.notEqual(cloned.variables?.[0]?.value, source.variables?.[0]?.value);

  cloned.presentation!.sourceViewBox!.x = 999;
  cloned.edges[0]!.route!.sourcePoint.x = 999;
  cloned.edges[0]!.route!.waypoints[0]!.y = 999;
  cloned.edges[0]!.route!.labelPosition!.x = 999;
  cloned.variables![0]!.bindings[0]!.nodeId = "mutated-node";
  ((cloned.variables![0]!.value as { entries: string[] }).entries)[0] = "0.0.0.0/0";

  assert.equal(source.presentation?.sourceViewBox?.x, -120);
  assert.equal(source.edges[0]?.route?.sourcePoint.x, 40);
  assert.equal(source.edges[0]?.route?.waypoints[0]?.y, 60);
  assert.equal(source.edges[0]?.route?.labelPosition?.x, 170);
  assert.equal(source.variables?.[0]?.bindings[0]?.nodeId, "source-node");
  assert.deepEqual(source.variables?.[0]?.value, { entries: ["10.0.0.0/8"] });
});

test("active resource drag payload is available when dragover dataTransfer reads are empty", () => {
  const dragStartDataTransfer = createFakeDataTransfer();
  const dragOverDataTransfer = createFakeDataTransfer();

  const payload = writeResourceDragPayload(dragStartDataTransfer, resourceItem);

  assert.deepEqual(getActiveResourceDragPayload(dragOverDataTransfer), payload);

  clearActiveResourceDragPayload();

  assert.equal(getActiveResourceDragPayload(dragOverDataTransfer), null);
});

test("createPastedNodes clears stale parent area metadata from copied nodes", () => {
  const childNode = makeResourceNode({
    id: "instance-1",
    resourceName: "web",
    resourceType: "aws_instance",
    metadata: {
      moduleSource: {
        moduleId: "network-basic",
        moduleVersion: "1.0.0",
        expandedAt: "2026-07-07T00:00:00.000Z"
      },
      parentAreaNodeId: "old-area-1"
    }
  });
  const pastedNode = createPastedNodes([childNode], [childNode])[0];

  assert.equal(pastedNode?.metadata?.parentAreaNodeId, undefined);
  assert.equal(pastedNode?.metadata?.moduleSource?.moduleId, "network-basic");
});

test("createDiagramEdge creates thin solid connection lines by default", () => {
  const edge = createDiagramEdge("api-1", "queue-1", undefined, undefined, []);

  assert.equal(edge?.style?.width, "thin");
  assert.equal(edge?.style?.lineStyle, "solid");
  assert.equal(edge?.style?.color, "#59687d");
});

test("createDiagramNodeFromPayload stores only VPC safety defaults for new nodes", () => {
  const node = createDiagramNodeFromPayload(
    makeResourceDragPayload(resourceItem),
    { x: 120, y: 80 },
    3
  );

  assert.equal(node.kind, "resource");
  assert.equal(node.type, "aws_vpc");
  assert.equal(node.label, "VPC");
  assert.equal(node.iconUrl, "/vpc.svg");
  assert.deepEqual(node.position, { x: 120, y: 80 });
  assert.equal(node.zIndex, 3);
  assert.equal(node.parameters?.terraformBlockType, undefined);
  assert.equal(node.parameters?.resourceType, "aws_vpc");
  assert.equal(node.parameters?.resourceName, "vpc");
  assert.equal(node.parameters?.fileName, "main");
  assert.deepEqual(node.parameters?.values, {
    enableDnsSupport: true,
    instanceTenancy: "default"
  });
});

test("createDiagramNodeFromPayload does not set desiredCapacity for new Auto Scaling Groups", () => {
  const node = createDiagramNodeFromPayload(
    makeResourceDragPayload(
      makeResourceItem({
        id: "aws-autoscaling-group",
        resourceType: "aws_autoscaling_group",
        label: "Auto Scaling Group"
      })
    ),
    { x: 0, y: 0 },
    1
  );

  assert.deepEqual(node.parameters?.values, {});
  assert.equal("desiredCapacity" in (node.parameters?.values ?? {}), false);
});

test("createDiagramNodeFromPayload does not apply RDS instance defaults to read replicas", () => {
  const node = createDiagramNodeFromPayload(
    makeResourceDragPayload(
      makeResourceItem({
        id: "aws-rds-read-replica",
        resourceType: "aws_db_instance",
        label: "RDS Read Replica"
      })
    ),
    { x: 0, y: 0 },
    1
  );

  assert.deepEqual(node.parameters?.values, {});
});

test("createDiagramNodeFromPayload appends a numeric suffix for duplicate resource icon names", () => {
  const existingNode = makeResourceNode({
    id: "vpc-1",
    resourceName: "vpc",
    resourceType: "aws_vpc"
  });
  const existingDuplicateNode = makeResourceNode({
    id: "vpc-2",
    resourceName: "vpc_2",
    resourceType: "aws_vpc"
  });
  const node = createDiagramNodeFromPayload(
    makeResourceDragPayload(resourceItem),
    { x: 0, y: 0 },
    1,
    [existingNode, existingDuplicateNode]
  );

  assert.equal(node.parameters?.resourceName, "vpc_3");
  assert.deepEqual(node.parameters?.values, {
    enableDnsSupport: true,
    instanceTenancy: "default"
  });
});

test("createDiagramNodeFromPayload appends numeric suffixes for duplicate ASG resource names", () => {
  const existingNodes = [
    makeResourceNode({
      id: "asg-1",
      resourceName: "auto_scaling_group",
      resourceType: "aws_autoscaling_group"
    }),
    makeResourceNode({
      id: "asg-2",
      resourceName: "auto_scaling_group_2",
      resourceType: "aws_autoscaling_group"
    })
  ];

  const node = createDiagramNodeFromPayload(
    makeResourceDragPayload(
      makeResourceItem({
        id: "aws-autoscaling-group",
        resourceType: "aws_autoscaling_group",
        label: "Auto Scaling Group",
        size: { width: 200, height: 130 }
      })
    ),
    { x: 0, y: 0 },
    1,
    existingNodes
  );

  assert.equal(node.kind, "resource");
  assert.equal(node.parameters?.resourceType, "aws_autoscaling_group");
  assert.equal(node.parameters?.resourceName, "auto_scaling_group_3");
  assert.deepEqual(node.size, { width: 200, height: 130 });
  assert.deepEqual(node.parameters?.values, {});
});

test("createDiagramNodeFromPayload creates Region and AZ as resource area nodes", () => {
  const regionNode = createDiagramNodeFromPayload(
    makeResourceDragPayload(makeResourceItem({ id: "aws-region", resourceType: "aws_region", label: "Region" })),
    { x: 0, y: 0 },
    1
  );
  const availabilityZoneNode = createDiagramNodeFromPayload(
    makeResourceDragPayload(
      makeResourceItem({
        id: "aws-availability-zone",
        resourceType: "aws_availability_zone",
        label: "AZ"
      })
    ),
    { x: 0, y: 0 },
    1
  );

  assert.equal(regionNode.kind, "resource");
  assert.equal(regionNode.type, "aws_region");
  assert.equal(regionNode.parameters?.resourceType, "aws_region");
  assert.equal(regionNode.parameters?.resourceName, "ap_northeast_2");
  assert.deepEqual(regionNode.parameters?.values, {
    awsRegion: "ap-northeast-2"
  });

  assert.equal(availabilityZoneNode.kind, "resource");
  assert.equal(availabilityZoneNode.type, "aws_availability_zone");
  assert.equal(availabilityZoneNode.parameters?.resourceType, "aws_availability_zone");
  assert.equal(availabilityZoneNode.parameters?.resourceName, "ap_northeast_2a");
  assert.deepEqual(availabilityZoneNode.parameters?.values, {
    awsAvailabilityZone: "ap-northeast-2a"
  });
});

test("createDiagramNodeFromPayload does not attach parameters to design nodes", () => {
  const node = createDiagramNodeFromPayload(
    makeResourceDragPayload(makeResourceItem({ id: "design-group", resourceType: "design_group", label: "Group" })),
    { x: 120, y: 80 },
    3
  );

  assert.equal(node.kind, "design");
  assert.equal(node.type, "design_group");
  assert.equal(node.parameters, undefined);
});

test("createDiagramNodeFromPayload treats external actor flow items as design nodes", () => {
  const userClientNode = createDiagramNodeFromPayload(
    makeResourceDragPayload(
      makeResourceItem({
        id: "design-user-client",
        resourceType: "sketchcatch_user_client",
        label: "User / Client"
      })
    ),
    { x: 40, y: 80 },
    2
  );
  const internetNode = createDiagramNodeFromPayload(
    makeResourceDragPayload(
      makeResourceItem({
        id: "design-internet",
        resourceType: "sketchcatch_internet",
        label: "Internet"
      })
    ),
    { x: 180, y: 80 },
    3
  );

  assert.equal(userClientNode.kind, "design");
  assert.equal(userClientNode.type, "sketchcatch_user_client");
  assert.equal(userClientNode.iconUrl, "/resource.svg");
  assert.equal(userClientNode.parameters, undefined);
  assert.equal(internetNode.kind, "design");
  assert.equal(internetNode.type, "sketchcatch_internet");
  assert.equal(internetNode.iconUrl, "/resource.svg");
  assert.equal(internetNode.parameters, undefined);
});

test("createPastedNodes deep clones nested parameter values", () => {
  const node = makeResourceNode({
    id: "security-group-1",
    resourceName: "web",
    resourceType: "aws_security_group",
    values: {
      tags: {
        Name: "web"
      },
      egress: [
        {
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"]
        }
      ]
    }
  });

  const pastedNode = createPastedNodes([node], [node])[0];

  assert(pastedNode?.parameters);
  assert.notEqual(pastedNode.parameters.values.tags, node.parameters?.values.tags);
  assert.notEqual(pastedNode.parameters.values.egress, node.parameters?.values.egress);

  const pastedTags = pastedNode.parameters.values.tags as Record<string, unknown>;
  const pastedEgress = pastedNode.parameters.values.egress as Array<{ cidrBlocks: string[] }>;
  pastedTags.Name = "mutated";
  pastedEgress[0]?.cidrBlocks.splice(0, 1, "10.0.0.0/16");

  assert.deepEqual(node.parameters?.values.tags, { Name: "web" });
  assert.deepEqual(node.parameters?.values.egress, [
    {
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"]
    }
  ]);
});

test("createPastedNodes updates only auto-generated tag names after resource name changes", () => {
  const generatedTagNode = makeResourceNode({
    id: "instance-1",
    label: "EC2 Instance",
    resourceName: "web",
    resourceType: "aws_instance",
    values: {
      tags: {
        Name: "web"
      }
    }
  });
  const customTagNode = makeResourceNode({
    id: "instance-2",
    label: "EC2 Instance",
    resourceName: "api",
    resourceType: "aws_instance",
    values: {
      tags: {
        Name: "Public API"
      }
    }
  });

  const [generatedTagCopy, customTagCopy] = createPastedNodes(
    [generatedTagNode, customTagNode],
    [generatedTagNode, customTagNode]
  );

  assert.equal(generatedTagCopy?.parameters?.resourceName, "web_copy");
  assert.equal(generatedTagCopy?.label, "EC2 Instance");
  assert.deepEqual(generatedTagCopy?.parameters?.values.tags, { Name: "web_copy" });
  assert.equal(customTagCopy?.parameters?.resourceName, "api_copy");
  assert.equal(customTagCopy?.label, "EC2 Instance");
  assert.deepEqual(customTagCopy?.parameters?.values.tags, { Name: "Public API" });
});

test("createPastedNodes preserves an AMI display label while uniquifying its Terraform name", () => {
  const ami = makeResourceNode({
    id: "ami-1",
    label: "AMI",
    resourceName: "ami",
    resourceType: "aws_ami"
  });

  const [copy] = createPastedNodes([ami], [ami]);

  assert.equal(copy?.label, "AMI");
  assert.equal(copy?.parameters?.resourceName, "ami_copy");
});

test("applyNodeParametersUpdateWithAutoTagSync preserves the friendly label on resource rename", () => {
  const node = makeResourceNode({
    id: "instance-1",
    label: "EC2 Instance",
    resourceName: "web",
    resourceType: "aws_instance"
  });
  const parameters = node.parameters;

  assert(parameters);

  const result = applyNodeParametersUpdateWithAutoTagSync(node, {
    ...parameters,
    resourceName: "api",
    values: {}
  });

  assert.equal(result.label, "EC2 Instance");
});

test("applyNodeParametersUpdateWithAutoTagSync updates only auto-generated tag names", () => {
  const node = makeResourceNode({
    id: "instance-1",
    resourceName: "web",
    resourceType: "aws_instance",
    values: {
      tags: {
        Name: "web"
      }
    }
  });
  const parameters = node.parameters;

  assert(parameters);

  const generatedTagResult = applyNodeParametersUpdateWithAutoTagSync(node, {
    ...parameters,
    resourceName: "api",
    values: {
      tags: {
        Name: "web"
      }
    }
  });
  const customTagResult = applyNodeParametersUpdateWithAutoTagSync(node, {
    ...parameters,
    resourceName: "api",
    values: {
      tags: {
        Name: "Public API"
      }
    }
  });

  assert.deepEqual(generatedTagResult.parameters?.values.tags, { Name: "api" });
  assert.deepEqual(customTagResult.parameters?.values.tags, { Name: "Public API" });
});

test("applyNodeParametersUpdateWithAutoTagSync keeps legacy nodes safe without resourceName", () => {
  const node = makeResourceNode({
    id: "legacy-1",
    label: "EC2 Instance",
    resourceName: "legacy",
    resourceType: "aws_instance"
  });
  const legacyParameters = {
    ...node.parameters,
    resourceName: undefined
  } as unknown as NonNullable<DiagramNode["parameters"]>;

  assert.doesNotThrow(() => applyNodeParametersUpdateWithAutoTagSync(node, legacyParameters));
  assert.equal(applyNodeParametersUpdateWithAutoTagSync(node, legacyParameters).label, "EC2 Instance");
});

function createFakeDataTransfer(): DataTransfer {
  const data = new Map<string, string>();

  return {
    effectAllowed: "uninitialized",
    dropEffect: "none",
    setData: (mimeType: string, value: string) => {
      data.set(mimeType, value);
    },
    getData: (mimeType: string) => data.get(mimeType) ?? ""
  } as DataTransfer;
}

function makeResourceNode({
  id,
  label,
  metadata,
  resourceName,
  resourceType,
  values = {}
}: {
  id: string;
  label?: string;
  metadata?: DiagramNode["metadata"];
  resourceName: string;
  resourceType: string;
  values?: Record<string, unknown>;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 96, height: 72 },
    label: label ?? resourceName,
    locked: false,
    zIndex: 1,
    ...(metadata ? { metadata } : {}),
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName,
      fileName: "main",
      values
    }
  };
}

function makeResourceDragPayload(item: ResourceItem) {
  return {
    source: "resource-settings-panel" as const,
    item
  };
}

function makeResourceItem({
  id,
  label,
  resourceType,
  size = { width: 168, height: 96 }
}: {
  id: string;
  label: string;
  resourceType: string;
  size?: ResourceItem["nodeDefaults"]["size"];
}): ResourceItem {
  return {
    id,
    name: label,
    cloudProvider: "aws",
    area: "network",
    category: "Network",
    iconUrl: "/resource.svg",
    enabled: true,
    nodeDefaults: {
      type: resourceType,
      label,
      size
    }
  };
}
