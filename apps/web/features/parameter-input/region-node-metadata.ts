import type {
  AwsRegionCode,
  DiagramNode,
  DiagramNodeParameters
} from "../../../../packages/types/src";

import { defaultAwsRegion, isAwsRegionCode } from "./aws-region-options";
import {
  defaultAwsAvailabilityZone,
  isAwsAvailabilityZoneCode
} from "./aws-availability-zone-options";

const regionNodeTypes = new Set(["sketchcatch_region", "design_region"]);
const availabilityZoneNodeTypes = new Set(["sketchcatch_az", "design_az"]);
type LegacyRegionMetadata = {
  awsRegion?: unknown;
};

export function isRegionAreaNode(node: DiagramNode): boolean {
  return isRegionResourceNode(node) || (node.kind === "design" && regionNodeTypes.has(node.type));
}

export function isAvailabilityZoneAreaNode(node: DiagramNode): boolean {
  return isAvailabilityZoneResourceNode(node) || (
    node.kind === "design" && availabilityZoneNodeTypes.has(node.type)
  );
}

export function isRegionResourceNode(node: DiagramNode): boolean {
  return node.kind === "resource" && getResourceNodeType(node) === "aws_region";
}

export function isAvailabilityZoneResourceNode(node: DiagramNode): boolean {
  return node.kind === "resource" && getResourceNodeType(node) === "aws_availability_zone";
}

export function getRegionNodeAwsRegion(node: DiagramNode): AwsRegionCode {
  const awsRegion = node.parameters?.values["awsRegion"];
  const legacyAwsRegion = (node.metadata as LegacyRegionMetadata | undefined)?.awsRegion;

  if (isAwsRegionCode(awsRegion)) {
    return awsRegion;
  }

  return isAwsRegionCode(legacyAwsRegion) ? legacyAwsRegion : defaultAwsRegion;
}

export function getAvailabilityZoneNodeValue(node: DiagramNode): string {
  const awsAvailabilityZone = node.parameters?.values["awsAvailabilityZone"];

  return isAwsAvailabilityZoneCode(awsAvailabilityZone)
    ? awsAvailabilityZone
    : defaultAwsAvailabilityZone;
}

export function updateRegionNodeParameters(
  parameters: DiagramNodeParameters,
  awsRegion: AwsRegionCode
): DiagramNodeParameters {
  return {
    ...parameters,
    values: {
      ...parameters.values,
      awsRegion
    }
  };
}

export function updateAvailabilityZoneNodeParameters(
  parameters: DiagramNodeParameters,
  awsAvailabilityZone: string
): DiagramNodeParameters {
  return {
    ...parameters,
    values: {
      ...parameters.values,
      awsAvailabilityZone
    }
  };
}

function getResourceNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}
