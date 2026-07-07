import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode, ResourceItem } from "../../../../packages/types/src";
import {
  applyNodeParametersUpdateWithResourceLabel,
  clearActiveResourceDragPayload,
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
