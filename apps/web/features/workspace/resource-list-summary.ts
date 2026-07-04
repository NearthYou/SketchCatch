import type { DiagramNode } from "@sketchcatch/types";
import { isDesignAreaNode } from "../diagram-editor/area-nodes";
import {
  getActiveOptionalDefinitions,
  getRequiredDefinitions,
  getValidationDefinitions,
  isEmptyParameterValue,
  mergeNodeParameters,
  validateParameters
} from "../parameter-input/validation";
import type { ParameterCatalog, ParameterCatalogDefinition } from "../parameter-input/catalog";
import { getAwsAvailabilityZoneLabel } from "../parameter-input/availability-zone-options";
import {
  getAvailabilityZoneNodeAwsAvailabilityZone,
  isAvailabilityZoneDesignNode
} from "../parameter-input/availability-zone-node-metadata";
import { getAwsRegionLabel } from "../parameter-input/aws-region-options";
import {
  getRegionNodeAwsRegion,
  isRegionDesignNode
} from "../parameter-input/region-node-metadata";

export type ResourceListSummaryRowKind = "metadata" | "optional" | "reference" | "required";

export type ResourceListSummaryRow = {
  readonly key: string;
  readonly kind: ResourceListSummaryRowKind;
  readonly label: string;
  readonly value: string;
};

export type ResourceListItemSummary = {
  readonly displayName: string;
  readonly iconUrl?: string | undefined;
  readonly node: DiagramNode;
  readonly nodeId: string;
  readonly rows: readonly ResourceListSummaryRow[];
  readonly status: "invalid" | "ready";
  readonly terraformAddress?: string | undefined;
  readonly typeLabel: string;
};

export function buildResourceListItems(
  nodes: readonly DiagramNode[],
  catalog: ParameterCatalog
): ResourceListItemSummary[] {
  return nodes
    .filter(isResourceListNode)
    .map((node) => buildResourceListItem(node, nodes, catalog));
}

function buildResourceListItem(
  node: DiagramNode,
  nodes: readonly DiagramNode[],
  catalog: ParameterCatalog
): ResourceListItemSummary {
  if (isAreaSummaryNode(node)) {
    return buildAreaListItem(node);
  }

  if (node.kind === "resource" || node.parameters?.resourceType) {
    return buildTerraformResourceListItem(node, nodes, catalog);
  }

  return buildAreaListItem(node);
}

function buildAreaListItem(node: DiagramNode): ResourceListItemSummary {
  return {
    displayName: getAreaDisplayName(node),
    iconUrl: node.iconUrl,
    node,
    nodeId: node.id,
    rows: buildAreaRows(node),
    status: "ready",
    typeLabel: getAreaTypeLabel(node)
  };
}

function buildTerraformResourceListItem(
  node: DiagramNode,
  nodes: readonly DiagramNode[],
  catalog: ParameterCatalog
): ResourceListItemSummary {
  const parameters = mergeNodeParameters(node, catalog);
  const definitions = catalog.resources[parameters.resourceType] ?? [];
  const validationDefinitions = getValidationDefinitions(definitions, parameters.values);
  const validation = validateParameters(parameters, validationDefinitions, nodes, node.id, catalog);

  return {
    displayName: getTerraformResourceDisplayName(node, parameters.resourceType),
    iconUrl: node.iconUrl,
    node,
    nodeId: node.id,
    rows: buildTerraformResourceRows(parameters.values, definitions),
    status: parameters.invalid || validation.invalid ? "invalid" : "ready",
    terraformAddress: getTerraformAddress(
      parameters.terraformBlockType,
      parameters.resourceType,
      node.parameters?.resourceName
    ),
    typeLabel: parameters.resourceType
  };
}

function getTerraformResourceDisplayName(node: DiagramNode, resourceType: string): string {
  const resourceName = node.parameters?.resourceName?.trim() ?? "";
  return resourceName || node.label || resourceType;
}

function buildTerraformResourceRows(
  values: Record<string, unknown>,
  definitions: readonly ParameterCatalogDefinition[]
): ResourceListSummaryRow[] {
  const rows: ResourceListSummaryRow[] = [];
  const usedKeys = new Set<string>();
  const summaryDefinitions = [
    ...getReferenceDefinitions(definitions, values),
    ...getRequiredDefinitions(definitions),
    ...getActiveOptionalDefinitions(definitions, values)
  ];

  for (const definition of summaryDefinitions) {
    const value = values[definition.name];

    if (usedKeys.has(definition.name) || isEmptyParameterValue(value)) {
      continue;
    }

    rows.push({
      key: definition.name,
      kind: getDefinitionRowKind(definition),
      label: definition.label || toSummaryLabel(definition.name),
      value: formatSummaryValue(value)
    });
    usedKeys.add(definition.name);
  }

  for (const [key, value] of Object.entries(values)) {
    if (usedKeys.has(key) || isEmptyParameterValue(value)) {
      continue;
    }

    rows.push({
      key,
      kind: "optional",
      label: toSummaryLabel(key),
      value: formatSummaryValue(value)
    });
  }

  return rows;
}

function getReferenceDefinitions(
  definitions: readonly ParameterCatalogDefinition[],
  values: Record<string, unknown>
): ParameterCatalogDefinition[] {
  return definitions.filter(
    (definition) =>
      isReferenceDefinition(definition) &&
      !isEmptyParameterValue(values[definition.name]) &&
      (definition.required || definition.optional)
  );
}

function getDefinitionRowKind(definition: ParameterCatalogDefinition): ResourceListSummaryRowKind {
  if (isReferenceDefinition(definition)) {
    return "reference";
  }

  return definition.required ? "required" : "optional";
}

function isReferenceDefinition(definition: ParameterCatalogDefinition): boolean {
  return Boolean(definition.referenceTargetTypes?.length) || definition.inputKind === "reference-picker";
}

function buildAreaRows(node: DiagramNode): ResourceListSummaryRow[] {
  if (isRegionDesignNode(node)) {
    return [
      {
        key: "awsRegion",
        kind: "metadata",
        label: "Region",
        value: getAwsRegionLabel(getRegionNodeAwsRegion(node))
      }
    ];
  }

  if (isAvailabilityZoneDesignNode(node)) {
    return [
      {
        key: "awsAvailabilityZone",
        kind: "metadata",
        label: "Availability Zone",
        value: getAwsAvailabilityZoneLabel(getAvailabilityZoneNodeAwsAvailabilityZone(node))
      }
    ];
  }

  return [];
}

function getTerraformAddress(
  terraformBlockType: string | undefined,
  resourceType: string,
  resourceName: string | undefined
): string | undefined {
  const trimmedResourceName = resourceName?.trim();

  if (!trimmedResourceName) {
    return undefined;
  }

  const blockPrefix = terraformBlockType === "data" ? "data." : "";

  return `${blockPrefix}${resourceType}.${trimmedResourceName}`;
}

function getAreaTypeLabel(node: DiagramNode): string {
  const areaType = getAreaNodeType(node);

  if (areaType.includes("region")) {
    return "Area / Region";
  }

  if (areaType.includes("availability_zone") || areaType.includes("az")) {
    return "Area / Availability Zone";
  }

  if (areaType.includes("group")) {
    return "Area / Group";
  }

  return "Area";
}

function isResourceListNode(node: DiagramNode): boolean {
  return node.kind === "resource" || isDesignAreaNode(node);
}

function isAreaSummaryNode(node: DiagramNode): boolean {
  return isRegionDesignNode(node) || isAvailabilityZoneDesignNode(node) || isDesignAreaNode(node);
}

function getAreaDisplayName(node: DiagramNode): string {
  return node.parameters?.resourceName?.trim() || node.label;
}

function getAreaNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

function toSummaryLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (firstLetter) => firstLetter.toUpperCase());
}

function formatSummaryValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => !isEmptyParameterValue(item))
      .map(formatSummaryValue)
      .join(", ");
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value)
      .filter((item) => !isEmptyParameterValue(item))
      .map(formatSummaryValue)
      .join(", ");
  }

  return "";
}
