import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import type { ParameterCatalog, ParameterCatalogDefinition } from "../parameter-input/catalog";
import { findInnermostReferenceDropTarget } from "./reference-drop-targets";

const catalog: ParameterCatalog = {
  provider: "aws",
  generatedAt: "2026-06-29T00:00:00.000Z",
  source: "reference-drop-target-test",
  resources: {
    aws_instance: [
      makeReferenceDefinition({
        name: "subnetId",
        terraformName: "subnet_id",
        referenceTargetTypes: ["aws_subnet"]
      })
    ],
    aws_internet_gateway: [
      makeReferenceDefinition({
        name: "vpcId",
        terraformName: "vpc_id",
        referenceTargetTypes: ["aws_vpc"]
      })
    ],
    aws_subnet: [
      makeReferenceDefinition({
        name: "vpcId",
        terraformName: "vpc_id",
        referenceTargetTypes: ["aws_vpc"]
      })
    ],
    aws_s3_bucket: []
  }
};

test("findInnermostReferenceDropTarget returns the smallest valid parent containing the child center", () => {
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceType: "aws_vpc",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 500 }
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceType: "aws_subnet",
    position: { x: 120, y: 120 },
    size: { width: 220, height: 180 }
  });
  const instance = makeResourceNode({
    id: "instance-1",
    resourceType: "aws_instance",
    position: { x: 180, y: 170 },
    size: { width: 96, height: 72 }
  });

  const target = findInnermostReferenceDropTarget(instance, [vpc, subnet, instance], catalog);

  assert.equal(target?.node.id, "subnet-1");
  assert.deepEqual(
    target?.definitions.map((definition) => definition.name),
    ["subnetId"]
  );
});

test("findInnermostReferenceDropTarget skips containing nodes that are not reference targets", () => {
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceType: "aws_vpc",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 500 }
  });
  const bucket = makeResourceNode({
    id: "bucket-1",
    resourceType: "aws_s3_bucket",
    position: { x: 80, y: 80 },
    size: { width: 280, height: 240 }
  });
  const internetGateway = makeResourceNode({
    id: "igw-1",
    resourceType: "aws_internet_gateway",
    position: { x: 160, y: 140 },
    size: { width: 96, height: 72 }
  });

  const target = findInnermostReferenceDropTarget(internetGateway, [vpc, bucket, internetGateway], catalog);

  assert.equal(target?.node.id, "vpc-1");
  assert.deepEqual(
    target?.definitions.map((definition) => definition.name),
    ["vpcId"]
  );
});

test("findInnermostReferenceDropTarget returns null when the child has no matching reference rule", () => {
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceType: "aws_vpc",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 500 }
  });
  const bucket = makeResourceNode({
    id: "bucket-1",
    resourceType: "aws_s3_bucket",
    position: { x: 120, y: 120 },
    size: { width: 96, height: 72 }
  });

  assert.equal(findInnermostReferenceDropTarget(bucket, [vpc, bucket], catalog), null);
});

function makeReferenceDefinition(
  definition: Pick<ParameterCatalogDefinition, "name" | "referenceTargetTypes" | "terraformName">
): ParameterCatalogDefinition {
  return {
    ...definition,
    label: definition.name,
    type: "string",
    required: true,
    optional: false,
    computed: false,
    sensitive: false,
    inputKind: "reference-picker"
  };
}

function makeResourceNode({
  id,
  position,
  resourceType,
  size
}: {
  id: string;
  position: DiagramNode["position"];
  resourceType: string;
  size: DiagramNode["size"];
}): DiagramNode {
  const resourceName = id.replaceAll("-", "_");

  return {
    id,
    type: resourceType,
    kind: "resource",
    position,
    size,
    label: resourceName,
    locked: false,
    zIndex: 1,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName,
      fileName: "main",
      values: {}
    }
  };
}
