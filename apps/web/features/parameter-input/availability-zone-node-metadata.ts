import type {
  AwsAvailabilityZoneCode,
  DiagramNode,
  DiagramNodeMetadata
} from "../../../../packages/types/src";

import {
  defaultAwsAvailabilityZone,
  isAwsAvailabilityZoneCode
} from "./availability-zone-options";

const availabilityZoneNodeTypes = new Set(["design_az", "sketchcatch_az"]);

export function isAvailabilityZoneDesignNode(node: DiagramNode): boolean {
  return node.kind === "design" && availabilityZoneNodeTypes.has(node.type);
}

export function getAvailabilityZoneNodeAwsAvailabilityZone(
  node: DiagramNode
): AwsAvailabilityZoneCode {
  const awsAvailabilityZone = node.metadata?.awsAvailabilityZone;

  return isAwsAvailabilityZoneCode(awsAvailabilityZone)
    ? awsAvailabilityZone
    : defaultAwsAvailabilityZone;
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
