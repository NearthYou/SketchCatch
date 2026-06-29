import type {
  AwsRegionCode,
  DiagramNode,
  DiagramNodeMetadata
} from "../../../../packages/types/src";

import { defaultAwsRegion, isAwsRegionCode } from "./aws-region-options";

const regionNodeTypes = new Set(["sketchcatch_region", "design_region"]);

export function isRegionDesignNode(node: DiagramNode): boolean {
  return node.kind === "design" && regionNodeTypes.has(node.type);
}

export function getRegionNodeAwsRegion(node: DiagramNode): AwsRegionCode {
  const awsRegion = node.metadata?.awsRegion;

  return isAwsRegionCode(awsRegion) ? awsRegion : defaultAwsRegion;
}

export function createRegionNodeMetadata(
  node: DiagramNode,
  awsRegion: AwsRegionCode
): DiagramNodeMetadata {
  return {
    ...node.metadata,
    awsRegion
  };
}
