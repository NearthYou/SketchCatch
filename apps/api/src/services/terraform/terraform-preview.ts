import type { AwsRegionCode, DiagramJson, DiagramNode } from "@sketchcatch/types";
import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";

const awsRegionCodes: ReadonlySet<AwsRegionCode> = new Set([
  "ap-northeast-2",
  "ap-northeast-1",
  "ap-southeast-1",
  "us-east-1",
  "us-west-2",
  "eu-west-1",
  "eu-central-1"
]);
const legacyRegionDesignNodeTypes = new Set(["design_region", "sketchcatch_region"]);
const regionResourceNodeTypes = new Set(["aws_region"]);

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

  return [
    providerRegion ? renderAwsProviderBlock(providerRegion) : "",
    terraformBlocks
  ].filter(Boolean).join("\n\n");
}

function getAwsProviderRegion(diagramJson: DiagramJson): AwsRegionCode | null {
  const regions = diagramJson.nodes
    .filter(isRegionAreaNode)
    .map(getRegionFromAreaNode)
    .filter((region): region is AwsRegionCode => region !== null);
  const uniqueRegions = new Set(regions);

  if (uniqueRegions.size > 1) {
    throw new TerraformPreviewValidationError(
      "Multiple AWS Region area resources select different regions. Terraform Preview currently supports one AWS provider region."
    );
  }

  return regions[0] ?? null;
}

function isRegionAreaNode(node: DiagramNode): boolean {
  return (
    (node.kind === "design" && legacyRegionDesignNodeTypes.has(node.type)) ||
    (node.kind === "resource" && regionResourceNodeTypes.has(getResourceNodeType(node)))
  );
}

function getRegionFromAreaNode(node: DiagramNode): AwsRegionCode | null {
  const value =
    node.parameters?.values.awsRegion ??
    node.parameters?.values.region ??
    node.metadata?.awsRegion;

  return isAwsRegionCode(value) ? value : null;
}

function isAwsRegionCode(value: unknown): value is AwsRegionCode {
  return typeof value === "string" && awsRegionCodes.has(value as AwsRegionCode);
}

function getResourceNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

function renderAwsProviderBlock(region: AwsRegionCode): string {
  return `provider "aws" {
  region = "${region}"
}`;
}
