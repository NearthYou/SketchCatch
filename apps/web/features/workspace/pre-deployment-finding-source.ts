import type {
  CheckFinding,
  DiagramJson,
  DiagramNode,
  TerraformSourceLocation
} from "@sketchcatch/types";
import {
  findTerraformBlockForNode,
  parseTerraformFiles,
  type TerraformBlockLocation,
  type TerraformVirtualFile
} from "./terraform-panel-utils";

export function getPreDeploymentFindingTerraformSourceLocation({
  diagramJson,
  files,
  finding
}: {
  readonly diagramJson: DiagramJson;
  readonly files: readonly TerraformVirtualFile[];
  readonly finding: CheckFinding;
}): TerraformSourceLocation | null {
  if (finding.sourceLocation) {
    return finding.sourceLocation;
  }

  const blocks = parseTerraformFiles(files);
  const node = findDiagramNodeForFinding(diagramJson, finding);
  const block =
    findTerraformBlockForNode(blocks, node) ??
    findTerraformBlockByFindingResource(blocks, finding);

  if (!block) {
    return null;
  }

  return {
    fileName: block.fileName,
    line: getFindingTargetLine(block, finding),
    resourceAddress: block.address,
    terraformBlockType: block.blockType,
    terraformBlockName: block.name
  };
}

function findDiagramNodeForFinding(
  diagramJson: DiagramJson,
  finding: CheckFinding
): DiagramNode | null {
  const resourceId = finding.resourceId?.trim();

  if (!resourceId) {
    return null;
  }

  const normalizedResourceId = normalizeResourceKey(resourceId);

  return (
    diagramJson.nodes.find((node) => {
      const parameters = node.parameters;

      return (
        node.id === resourceId ||
        node.label === resourceId ||
        parameters?.resourceName === resourceId ||
        normalizeResourceKey(node.id) === normalizedResourceId ||
        normalizeResourceKey(node.label) === normalizedResourceId ||
        normalizeResourceKey(parameters?.resourceName ?? "") === normalizedResourceId
      );
    }) ?? null
  );
}

function findTerraformBlockByFindingResource(
  blocks: readonly TerraformBlockLocation[],
  finding: CheckFinding
): TerraformBlockLocation | null {
  const resourceId = finding.resourceId?.trim();

  if (!resourceId) {
    return null;
  }

  const normalizedResourceId = normalizeTerraformAddress(resourceId);

  return (
    blocks.find(
      (block) =>
        block.address === normalizedResourceId ||
        normalizeResourceKey(block.address) === normalizeResourceKey(normalizedResourceId) ||
        normalizeResourceKey(block.name) === normalizeResourceKey(resourceId)
    ) ?? null
  );
}

function getFindingTargetLine(
  block: TerraformBlockLocation,
  finding: CheckFinding
): number {
  const lines = block.code.split(/\r\n|\r|\n/);
  const searchText = `${finding.id} ${finding.title} ${finding.description} ${finding.recommendation}`.toLowerCase();
  const preferredPatterns = getPreferredLinePatterns(searchText);

  for (const pattern of preferredPatterns) {
    const lineIndex = lines.findIndex((line) => line.toLowerCase().includes(pattern));

    if (lineIndex >= 0) {
      return block.startLine + lineIndex;
    }
  }

  return block.startLine;
}

function getPreferredLinePatterns(searchText: string): string[] {
  if (searchText.includes("ssh") || searchText.includes("22")) {
    return ["0.0.0.0/0", "::/0", "cidr_blocks", "from_port", "ingress"];
  }

  if (searchText.includes("rds") || searchText.includes("비용")) {
    return ["instance_class", "allocated_storage", "backup_retention_period"];
  }

  if (searchText.includes("s3")) {
    return ["public", "acl", "policy"];
  }

  if (searchText.includes("iam")) {
    return ["policy", "action", "resource"];
  }

  return [];
}

function normalizeTerraformAddress(value: string): string {
  return value.replace(/^resource\./, "").replace(/^data\./, "data.").trim();
}

function normalizeResourceKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
