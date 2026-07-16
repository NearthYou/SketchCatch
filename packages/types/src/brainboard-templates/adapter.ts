import type {
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramNodeStyle,
  TerraformSyncFileInput
} from "../index.ts";
import type {
  BrainboardSourceNode,
  BrainboardSourcePresentationNode,
  BrainboardSourceValue,
  BrainboardTemplateSource
} from "./source-types.ts";
import { validateBrainboardTemplateSource } from "./validate-source.ts";
import { normalizeBrainboardWorkspaceTerraform } from "./workspace-terraform-normalization.ts";

export type AdaptedBrainboardTemplate = {
  readonly diagramJson: DiagramJson;
  readonly terraformFiles: TerraformSyncFileInput[];
};

export function adaptBrainboardTemplateSource(
  source: BrainboardTemplateSource
): AdaptedBrainboardTemplate {
  assertValidSource(source);
  const resourceAddressBySourceNodeId = new Map(
    source.nodes
      .filter((node) => node.kind === "resource")
      .map((node) => [node.sourceNodeId, formatResourceAddress(node)] as const)
  );

  return {
    diagramJson: {
      nodes: [...source.nodes]
        .sort((left, right) => left.domOrder - right.domOrder)
        .map((node) => adaptNode(node, resourceAddressBySourceNodeId)),
      edges: [...source.edges]
        .sort((left, right) => left.domOrder - right.domOrder)
        .map(
          (edge): DiagramEdge => ({
            id: edge.sourceEdgeId,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            sourceHandleId: edge.sourcePort,
            targetHandleId: edge.targetPort,
            zIndex: edge.zIndex,
            route: {
              svgPath: edge.svgPath,
              sourcePoint: { ...edge.sourcePoint },
              targetPoint: { ...edge.targetPoint },
              waypoints: edge.waypoints.map((point) => ({ ...point })),
              arrowDirection: edge.arrowDirection,
              arrowAngle: edge.arrowAngle
            }
          })
        ),
      viewport: { x: 0, y: 0, zoom: 1 },
      presentation: {
        geometryPolicy: "source-exact",
        sourceViewBox: { ...source.viewport },
        initialViewportPending: true
      }
    },
    terraformFiles: source.terraform.files
      .filter(({ includeInWorkspace }) => includeInWorkspace)
      .map((file) => ({
        fileName: file.fileName,
        terraformCode: normalizeBrainboardWorkspaceTerraform({
          templateId: source.id,
          fileName: file.fileName,
          code: file.workspaceSeed?.code ?? file.code
        })
      }))
  };
}

function assertValidSource(source: BrainboardTemplateSource): void {
  const validation = validateBrainboardTemplateSource(source);

  if (validation.valid) {
    return;
  }

  throw new Error(
    validation.errors.map(({ code, message, path }) => `${code} at ${path}: ${message}`).join("\n")
  );
}

function adaptNode(
  node: BrainboardSourceNode,
  resourceAddressBySourceNodeId: ReadonlyMap<string, string>
): DiagramNode {
  const metadata = {
    ...(node.parentSourceNodeId === null ? {} : { parentAreaNodeId: node.parentSourceNodeId }),
    ...(node.kind === "presentation" && node.catalogId !== null
      ? { presentationCatalogItemId: node.catalogId }
      : {})
  };
  const common = {
    id: node.sourceNodeId,
    label: node.label,
    locked: false,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    position: { ...node.position },
    rotation: node.rotation,
    size: { ...node.size },
    zIndex: node.zIndex
  } as const;

  if (node.kind === "presentation") {
    const style = adaptPresentationStyle(node);

    return {
      ...common,
      kind: "design",
      type: node.rawResourceType,
      ...(style === undefined ? {} : { style })
    };
  }

  return {
    ...common,
    kind: "resource",
    type: node.terraformResourceType,
    parameters: {
      terraformBlockType: node.terraformBlockType,
      ...(node.valuesResolution === "source-file-authoritative/unresolved"
        ? { terraformSourceAuthority: "workspace-seed" as const }
        : {}),
      resourceType: node.terraformResourceType,
      resourceName: node.resourceName,
      fileName: node.fileName,
      values:
        node.valuesResolution === "resolved"
          ? cloneSourceRecord(node.values, resourceAddressBySourceNodeId)
          : {}
    }
  };
}

function adaptPresentationStyle(
  node: BrainboardSourcePresentationNode
): DiagramNodeStyle | undefined {
  if (node.style === null) {
    return undefined;
  }

  const supportedKeys = new Set(["borderColor", "borderStyle", "textColor"]);
  const unsupportedKey = Object.keys(node.style).find((key) => !supportedKeys.has(key));
  if (unsupportedKey !== undefined) {
    throw new Error(
      `brainboard.adapter.unsupported_presentation_style at node ${node.sourceNodeId}: ${unsupportedKey}`
    );
  }

  const borderColor = node.style["borderColor"];
  const borderStyle = node.style["borderStyle"];
  const textColor = node.style["textColor"];
  if (
    (borderColor !== undefined && typeof borderColor !== "string") ||
    (textColor !== undefined && typeof textColor !== "string") ||
    (borderStyle !== undefined &&
      borderStyle !== "solid" &&
      borderStyle !== "dashed" &&
      borderStyle !== "dotted")
  ) {
    throw new Error(
      `brainboard.adapter.unsupported_presentation_style at node ${node.sourceNodeId}: invalid value`
    );
  }

  return {
    ...(typeof borderColor === "string" ? { borderColor } : {}),
    ...(borderStyle === "solid" || borderStyle === "dashed" || borderStyle === "dotted"
      ? { borderStyle }
      : {}),
    ...(typeof textColor === "string" ? { textColor } : {})
  };
}

function cloneSourceRecord(
  value: Readonly<Record<string, BrainboardSourceValue>>,
  resourceAddressBySourceNodeId: ReadonlyMap<string, string>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      cloneSourceValue(entry, resourceAddressBySourceNodeId)
    ])
  );
}

function cloneSourceValue(
  value: BrainboardSourceValue,
  resourceAddressBySourceNodeId: ReadonlyMap<string, string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneSourceValue(entry, resourceAddressBySourceNodeId));
  }
  if (value !== null && typeof value === "object") {
    return cloneSourceRecord(
      value as Readonly<Record<string, BrainboardSourceValue>>,
      resourceAddressBySourceNodeId
    );
  }
  if (typeof value === "string") {
    return resolveSourceReference(value, resourceAddressBySourceNodeId);
  }
  return value;
}

function resolveSourceReference(
  value: string,
  resourceAddressBySourceNodeId: ReadonlyMap<string, string>
): string {
  if (value.startsWith("@address:")) {
    const sourceNodeId = value.slice("@address:".length);
    return requireSourceAddress(value, sourceNodeId, resourceAddressBySourceNodeId);
  }
  if (value.startsWith("@ref:")) {
    const reference = value.slice("@ref:".length);
    const sourceNodeId = [...resourceAddressBySourceNodeId.keys()]
      .sort((left, right) => right.length - left.length)
      .find((candidate) => reference.startsWith(`${candidate}.`));
    if (sourceNodeId === undefined) {
      throw unresolvedSourceReference(value);
    }
    const attribute = reference.slice(sourceNodeId.length + 1);
    if (attribute.length === 0) {
      throw unresolvedSourceReference(value);
    }
    return `${requireSourceAddress(value, sourceNodeId, resourceAddressBySourceNodeId)}.${attribute}`;
  }
  return value;
}

function requireSourceAddress(
  reference: string,
  sourceNodeId: string,
  resourceAddressBySourceNodeId: ReadonlyMap<string, string>
): string {
  const address = resourceAddressBySourceNodeId.get(sourceNodeId);
  if (address === undefined) {
    throw unresolvedSourceReference(reference);
  }
  return address;
}

function unresolvedSourceReference(reference: string): Error {
  return new Error(`brainboard.adapter.unresolved_source_reference: ${reference}`);
}

function formatResourceAddress(
  node: Extract<BrainboardSourceNode, { readonly kind: "resource" }>
): string {
  return `${node.terraformBlockType === "data" ? "data." : ""}${node.terraformResourceType}.${node.resourceName}`;
}
