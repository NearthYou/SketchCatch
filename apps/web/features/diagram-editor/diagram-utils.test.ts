import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode, ResourceItem } from "../../../../packages/types/src";
import {
  applyNodeParametersUpdateWithResourceLabel,
  clearActiveResourceDragPayload,
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

test("active resource drag payload is available when dragover dataTransfer reads are empty", () => {
  const dragStartDataTransfer = createFakeDataTransfer();
  const dragOverDataTransfer = createFakeDataTransfer();

  const payload = writeResourceDragPayload(dragStartDataTransfer, resourceItem);

  assert.deepEqual(getActiveResourceDragPayload(dragOverDataTransfer), payload);

  clearActiveResourceDragPayload();

  assert.equal(getActiveResourceDragPayload(dragOverDataTransfer), null);
});

test("createDiagramNodeFromPayload does not auto-fill Terraform parameter values for resource icons", () => {
  const cases = [
    {
      resourceType: "aws_vpc",
      label: "VPC"
    },
    {
      resourceType: "aws_subnet",
      label: "Subnet"
    },
    {
      resourceType: "aws_security_group",
      label: "Security Group"
    },
    {
      resourceType: "aws_instance",
      label: "EC2 Instance"
    },
    {
      resourceType: "aws_s3_bucket",
      label: "S3 Bucket"
    },
    {
      resourceType: "aws_ami",
      label: "AMI",
      terraformBlockType: "data" as const
    },
    {
      resourceType: "aws_internet_gateway",
      label: "Internet Gateway"
    }
  ];

  for (const { resourceType, label, terraformBlockType } of cases) {
    const node = createDiagramNodeFromPayload(
      makeResourceDragPayload(makeResourceItem({ resourceType, label, terraformBlockType })),
      { x: 0, y: 0 },
      1
    );

    assert.deepEqual(node.parameters?.values, {});
  }
});

test("createDiagramNodeFromPayload does not attach parameters to design nodes", () => {
  const node = createDiagramNodeFromPayload(
    makeResourceDragPayload(makeResourceItem({ resourceType: "design_region", label: "Region", id: "design-region" })),
    { x: 0, y: 0 },
    1
  );

  assert.equal(node.parameters, undefined);
  assert.equal(node.iconUrl, "/test.svg");
});

test("createPastedNodes clears stale parent area metadata from copied nodes", () => {
  const childNode = makeResourceNode({
    id: "instance-1",
    resourceName: "web",
    resourceType: "aws_instance",
    metadata: {
      awsRegion: "ap-northeast-2",
      parentAreaNodeId: "old-area-1"
    }
  });
  const pastedNode = createPastedNodes([childNode], [childNode])[0];

  assert.equal(pastedNode?.metadata?.parentAreaNodeId, undefined);
  assert.equal(pastedNode?.metadata?.awsRegion, "ap-northeast-2");
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
  assert.deepEqual(generatedTagCopy?.parameters?.values.tags, { Name: "web_copy" });
  assert.equal(customTagCopy?.parameters?.resourceName, "api_copy");
  assert.deepEqual(customTagCopy?.parameters?.values.tags, { Name: "Public API" });
});

test("applyNodeParametersUpdateWithResourceLabel updates the label from a changed resource name", () => {
  const node = makeResourceNode({
    id: "instance-1",
    resourceName: "web",
    resourceType: "aws_instance"
  });
  const parameters = node.parameters;

  assert(parameters);

  const result = applyNodeParametersUpdateWithResourceLabel(node, {
    ...parameters,
    resourceName: "api",
    values: {}
  });

  assert.equal(result.label, "api");
});

test("applyNodeParametersUpdateWithResourceLabel updates only auto-generated tag names", () => {
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

  const generatedTagResult = applyNodeParametersUpdateWithResourceLabel(node, {
    ...parameters,
    resourceName: "api",
    values: {
      tags: {
        Name: "web"
      }
    }
  });
  const customTagResult = applyNodeParametersUpdateWithResourceLabel(node, {
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

test("applyNodeParametersUpdateWithResourceLabel keeps legacy nodes safe without resourceName", () => {
  const node = makeResourceNode({
    id: "legacy-1",
    resourceName: "legacy",
    resourceType: "aws_instance"
  });
  const legacyParameters = {
    ...node.parameters,
    resourceName: undefined
  } as unknown as NonNullable<DiagramNode["parameters"]>;

  assert.doesNotThrow(() => applyNodeParametersUpdateWithResourceLabel(node, legacyParameters));
  assert.equal(applyNodeParametersUpdateWithResourceLabel(node, legacyParameters).label, "legacy");
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
  terraformBlockType
}: {
  id?: string;
  label: string;
  resourceType: string;
  terraformBlockType?: ResourceItem["nodeDefaults"]["terraformBlockType"];
}): ResourceItem {
  return {
    id: id ?? resourceType,
    name: label,
    cloudProvider: "aws",
    area: "network",
    category: "Test",
    iconUrl: "/test.svg",
    enabled: true,
    nodeDefaults: {
      ...(terraformBlockType ? { terraformBlockType } : {}),
      type: resourceType,
      label,
      size: {
        width: 168,
        height: 96
      }
    }
  };
}

function makeResourceNode({
  id,
  metadata,
  resourceName,
  resourceType,
  values
}: {
  id: string;
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
    label: resourceName,
    locked: false,
    zIndex: 1,
    ...(metadata ? { metadata } : {}),
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName,
      fileName: "main",
      values: values ?? {}
    }
  };
}
