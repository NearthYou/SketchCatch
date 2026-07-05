import type {
  AwsRegionCode,
  DiagramNode,
  DiagramNodeMetadata
} from "../../../../packages/types/src";

import { defaultAwsRegion, isAwsRegionCode } from "./aws-region-options";

const regionNodeTypes = new Set(["sketchcatch_region", "design_region"]);
type LegacyRegionMetadata = DiagramNodeMetadata & {
  awsRegion?: unknown;
};

export function isRegionDesignNode(node: DiagramNode): boolean {
  return node.kind === "design" && regionNodeTypes.has(node.type);
}

export function getRegionNodeAwsRegion(node: DiagramNode): AwsRegionCode {
  const awsRegion = node.parameters?.values["awsRegion"];
  const legacyAwsRegion = (node.metadata as LegacyRegionMetadata | undefined)?.awsRegion;

  if (isAwsRegionCode(awsRegion)) {
    return awsRegion;
  }

  return isAwsRegionCode(legacyAwsRegion) ? legacyAwsRegion : defaultAwsRegion;
}

export function createRegionNodeMetadata(
  node: DiagramNode,
  awsRegion: AwsRegionCode
): DiagramNodeMetadata {
  void awsRegion;
  return {
    ...node.metadata
  };
}
