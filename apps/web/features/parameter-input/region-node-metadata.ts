import type {
  AwsRegionCode,
  DiagramNode,
  DiagramNodeMetadata,
  DiagramNodeParameters
} from "../../../../packages/types/src";

import { defaultAwsRegion, isAwsRegionCode } from "./aws-region-options";

const legacyRegionDesignNodeTypes = new Set(["sketchcatch_region", "design_region"]);
const regionResourceNodeTypes = new Set(["aws_region"]);

export function isRegionDesignNode(node: DiagramNode): boolean {
  return (
    (node.kind === "design" && legacyRegionDesignNodeTypes.has(node.type)) ||
    (node.kind === "resource" && regionResourceNodeTypes.has(getResourceNodeType(node)))
  );
}

export function getRegionNodeAwsRegion(node: DiagramNode): AwsRegionCode {
  const awsRegion =
    node.parameters?.values.awsRegion ??
    node.parameters?.values.region ??
    node.metadata?.awsRegion;

  return isAwsRegionCode(awsRegion) ? awsRegion : defaultAwsRegion;
}

export function createRegionNodeParameters(
  node: DiagramNode,
  awsRegion: AwsRegionCode
): DiagramNodeParameters {
  const parameters = node.parameters ?? {
    resourceType: "aws_region",
    resourceName: "region",
    fileName: "main",
    values: {}
  };

  return {
    ...parameters,
    values: {
      ...parameters.values,
      awsRegion
    }
  };
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

function getResourceNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}
