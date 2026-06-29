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
  return isAwsRegionCode(node.metadata?.awsRegion)
    ? node.metadata.awsRegion
    : defaultAwsRegion;
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
