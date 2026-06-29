import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import type { ParameterCatalog, ParameterCatalogDefinition } from "../parameter-input/catalog";
import {
  applyReferenceDropTarget,
  findInnermostReferenceDropTarget
} from "./reference-drop-targets";

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
    aws_lambda_function: [
      makeReferenceDefinition({
        name: "role",
        terraformName: "role",
        referenceTargetTypes: ["aws_iam_role"]
      })
    ],
    aws_internet_gateway: [
      makeReferenceDefinition({
        name: "vpcId",
        terraformName: "vpc_id",
        referenceTargetTypes: ["aws_vpc"]
      })
    ],
    aws_autoscaling_group: [
      makeReferenceDefinition({
        name: "vpcZoneIdentifier",
        terraformName: "vpc_zone_identifier",
        referenceTargetTypes: ["aws_subnet"],
        type: "list"
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

test("applyReferenceDropTarget sets empty child reference values from the parent resource", () => {
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceName: "main",
    resourceType: "aws_vpc",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 500 }
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceName: "public",
    resourceType: "aws_subnet",
    position: { x: 120, y: 120 },
    size: { width: 220, height: 180 }
  });
  const target = findInnermostReferenceDropTarget(subnet, [vpc, subnet], catalog);

  const result = applyReferenceDropTarget(subnet, target, catalog);

  assert.equal(result.parameters?.values.vpcId, "aws_vpc.main.id");
});

test("applyReferenceDropTarget preserves existing child reference values", () => {
  const vpc = makeResourceNode({
    id: "vpc-1",
    resourceName: "main",
    resourceType: "aws_vpc",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 500 }
  });
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceName: "public",
    resourceType: "aws_subnet",
    position: { x: 120, y: 120 },
    size: { width: 220, height: 180 },
    values: {
      vpcId: "aws_vpc.existing.id"
    }
  });
  const target = findInnermostReferenceDropTarget(subnet, [vpc, subnet], catalog);

  const result = applyReferenceDropTarget(subnet, target, catalog);

  assert.equal(result.parameters?.values.vpcId, "aws_vpc.existing.id");
});

test("applyReferenceDropTarget formats list references and derived reference attributes", () => {
  const subnet = makeResourceNode({
    id: "subnet-1",
    resourceName: "public",
    resourceType: "aws_subnet",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 500 }
  });
  const autoscalingGroup = makeResourceNode({
    id: "asg-1",
    resourceName: "web",
    resourceType: "aws_autoscaling_group",
    position: { x: 120, y: 120 },
    size: { width: 220, height: 180 }
  });
  const role = makeResourceNode({
    id: "role-1",
    resourceName: "runtime",
    resourceType: "aws_iam_role",
    position: { x: 700, y: 0 },
    size: { width: 500, height: 500 }
  });
  const lambda = makeResourceNode({
    id: "lambda-1",
    resourceName: "handler",
    resourceType: "aws_lambda_function",
    position: { x: 820, y: 120 },
    size: { width: 220, height: 180 }
  });

  const autoscalingGroupTarget = findInnermostReferenceDropTarget(
    autoscalingGroup,
    [subnet, autoscalingGroup],
    catalog
  );
  const lambdaTarget = findInnermostReferenceDropTarget(lambda, [role, lambda], catalog);

  assert.deepEqual(
    applyReferenceDropTarget(autoscalingGroup, autoscalingGroupTarget, catalog).parameters?.values
      .vpcZoneIdentifier,
    ["aws_subnet.public.id"]
  );
  assert.equal(
    applyReferenceDropTarget(lambda, lambdaTarget, catalog).parameters?.values.role,
    "aws_iam_role.runtime.arn"
  );
});

function makeReferenceDefinition(
  definition: Pick<ParameterCatalogDefinition, "name" | "referenceTargetTypes" | "terraformName"> &
    Partial<Pick<ParameterCatalogDefinition, "type">>
): ParameterCatalogDefinition {
  return {
    ...definition,
    label: definition.name,
    type: definition.type ?? "string",
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
  resourceName,
  resourceType,
  size,
  values
}: {
  id: string;
  position: DiagramNode["position"];
  resourceName?: string;
  resourceType: string;
  size: DiagramNode["size"];
  values?: Record<string, unknown>;
}): DiagramNode {
  const terraformResourceName = resourceName ?? id.replaceAll("-", "_");

  return {
    id,
    type: resourceType,
    kind: "resource",
    position,
    size,
    label: terraformResourceName,
    locked: false,
    zIndex: 1,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName: terraformResourceName,
      fileName: "main",
      values: values ?? {}
    }
  };
}
