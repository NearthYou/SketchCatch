import type {
  AwsAvailabilityZoneCode,
  DiagramNode,
  DiagramNodeMetadata,
  DiagramNodeParameters
} from "../../../../packages/types/src";

import {
  defaultAwsAvailabilityZone,
  isAwsAvailabilityZoneCode
} from "./availability-zone-options";

const legacyAvailabilityZoneDesignNodeTypes = new Set(["design_az", "sketchcatch_az"]);
const availabilityZoneResourceNodeTypes = new Set(["aws_availability_zone"]);

export function isAvailabilityZoneDesignNode(node: DiagramNode): boolean {
  return (
    (node.kind === "design" && legacyAvailabilityZoneDesignNodeTypes.has(node.type)) ||
    (node.kind === "resource" && availabilityZoneResourceNodeTypes.has(getResourceNodeType(node)))
  );
}

export function getAvailabilityZoneNodeAwsAvailabilityZone(
  node: DiagramNode
): AwsAvailabilityZoneCode {
  const awsAvailabilityZone =
    node.parameters?.values.awsAvailabilityZone ??
    node.parameters?.values.availabilityZone ??
    node.metadata?.awsAvailabilityZone;

  return isAwsAvailabilityZoneCode(awsAvailabilityZone)
    ? awsAvailabilityZone
    : defaultAwsAvailabilityZone;
}

export function createAvailabilityZoneNodeParameters(
  node: DiagramNode,
  awsAvailabilityZone: AwsAvailabilityZoneCode
): DiagramNodeParameters {
  const parameters = node.parameters ?? {
    resourceType: "aws_availability_zone",
    resourceName: "availability_zone",
    fileName: "main",
    values: {}
  };

  return {
    ...parameters,
    values: {
      ...parameters.values,
      awsAvailabilityZone
    }
  };
}

export function createAvailabilityZoneNodeMetadata(
  node: DiagramNode,
  awsAvailabilityZone: AwsAvailabilityZoneCode
): DiagramNodeMetadata {
  return {
    ...node.metadata,
    awsAvailabilityZone
  };
}

function getResourceNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}
