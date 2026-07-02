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

test("createDiagramNodeFromPayload creates Terraform Preview skeleton values for supported resources", () => {
  const cases = [
    {
      resourceType: "aws_vpc",
      label: "VPC",
      expectedValues: {
        cidrBlock: "10.0.0.0/16",
        enableDnsSupport: true,
        enableDnsHostnames: true,
        tags: {
          Name: "vpc"
        }
      }
    },
    {
      resourceType: "aws_subnet",
      label: "Subnet",
      expectedValues: {
        cidrBlock: "10.0.1.0/24",
        mapPublicIpOnLaunch: true,
        tags: {
          Name: "subnet"
        }
      }
    },
    {
      resourceType: "aws_security_group",
      label: "Security Group",
      expectedValues: {
        name: "security_group",
        description: "Managed by SketchCatch",
        egress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            cidrBlocks: ["0.0.0.0/0"]
          }
        ],
        tags: {
          Name: "security_group"
        }
      }
    },
    {
      resourceType: "aws_instance",
      label: "EC2 Instance",
      expectedValues: {
        instanceType: "t3.micro",
        tags: {
          Name: "ec2_instance"
        }
      }
    },
    {
      resourceType: "aws_s3_bucket",
      label: "S3 Bucket",
      expectedValues: {
        tags: {
          Name: "s3_bucket"
        }
      }
    }
  ];

  for (const { resourceType, label, expectedValues } of cases) {
    const node = createDiagramNodeFromPayload(
      makeResourceDragPayload(makeResourceItem({ resourceType, label })),
      { x: 0, y: 0 },
      1
    );

    assert.deepEqual(node.parameters?.values, expectedValues);
  }
});

test("createDiagramNodeFromPayload leaves excluded and unsupported resource values empty", () => {
  const ami = createDiagramNodeFromPayload(
    makeResourceDragPayload(
      makeResourceItem({
        resourceType: "aws_ami",
        label: "AMI",
        terraformBlockType: "data"
      })
    ),
    { x: 0, y: 0 },
    1
  );
  const internetGateway = createDiagramNodeFromPayload(
    makeResourceDragPayload(makeResourceItem({ resourceType: "aws_internet_gateway", label: "Internet Gateway" })),
    { x: 0, y: 0 },
    1
  );

  assert.deepEqual(ami.parameters?.values, {});
  assert.deepEqual(internetGateway.parameters?.values, {});
});

test("createDiagramNodeFromPayload does not attach parameters to design nodes", () => {
  const node = createDiagramNodeFromPayload(
    makeResourceDragPayload(makeResourceItem({ resourceType: "design_region", label: "Region", id: "design-region" })),
    { x: 0, y: 0 },
    1
  );

  assert.equal(node.parameters, undefined);
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
  resourceType
}: {
  id: string;
  metadata?: DiagramNode["metadata"];
  resourceName: string;
  resourceType: string;
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
      values: {}
    }
  };
}
