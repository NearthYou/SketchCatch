import type { AwsRegionCode, DiagramJson, DiagramNode } from "@sketchcatch/types";
import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";

const defaultAwsProviderRegion: AwsRegionCode = "ap-northeast-2";
const regionDesignNodeTypes = new Set(["design_region", "sketchcatch_region"]);

export class TerraformPreviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerraformPreviewValidationError";
  }
}

export function generateTerraformFromDiagramJson(diagramJson: DiagramJson): string {
  const providerRegion = getAwsProviderRegion(diagramJson);
  const graph = buildInfrastructureGraphFromDiagramJson(diagramJson);
  const terraformBlocks = renderTerraformFromInfrastructureGraph(graph);

  return [renderAwsProviderBlock(providerRegion), terraformBlocks].filter(Boolean).join("\n\n");
}

function getAwsProviderRegion(diagramJson: DiagramJson): AwsRegionCode {
  const regions = diagramJson.nodes
    .filter(isRegionDesignNode)
    .map((node) => node.metadata?.awsRegion ?? defaultAwsProviderRegion);
  const uniqueRegions = new Set(regions);

  if (uniqueRegions.size > 1) {
    throw new TerraformPreviewValidationError(
      "Multiple AWS Region design nodes select different regions. Terraform Preview currently supports one AWS provider region."
    );
  }

  return regions[0] ?? defaultAwsProviderRegion;
}

function isRegionDesignNode(node: DiagramNode): boolean {
  return node.kind === "design" && regionDesignNodeTypes.has(node.type);
}

function renderAwsProviderBlock(region: AwsRegionCode): string {
  return `provider "aws" {
  region = "${region}"
}`;
}
