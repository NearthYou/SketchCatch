import type {
  BrainboardSourceEdge,
  BrainboardSourcePoint,
  BrainboardSourceResourceAddressMapping,
  BrainboardSourceSize,
  BrainboardSourceValue,
  BrainboardSourceViewport,
  BrainboardTemplateOrigin,
  BrainboardTemplateSource,
  BrainboardTerraformFile
} from "../source-types.js";
import { validateBrainboardTemplateSource } from "../validate-source.js";
import type { BrainboardTemplateId } from "../ids.js";

export type BrainboardCapturedNode = {
  readonly sourceNodeId: string;
  readonly domOrder: number;
  readonly label: string;
  readonly position: BrainboardSourcePoint;
  readonly size: BrainboardSourceSize;
  readonly parentSourceNodeId: string | null;
  readonly zIndex: number;
  readonly rawTransform: string;
  readonly rotation: number;
  readonly rawResourceType: string;
};

export type BrainboardResourceNodeBinding = {
  readonly kind: "resource";
  readonly address: string;
  readonly fileName: string;
  readonly addressMapping: BrainboardSourceResourceAddressMapping;
};

export type BrainboardPresentationNodeBinding = {
  readonly kind: "presentation";
  readonly catalogId: string | null;
  readonly aliasOf: string | null;
  readonly style: Readonly<Record<string, BrainboardSourceValue>> | null;
};

export type BrainboardSourceNodeBinding =
  | BrainboardResourceNodeBinding
  | BrainboardPresentationNodeBinding;

export type CapturedBrainboardTemplateDefinition = {
  readonly id: BrainboardTemplateId;
  readonly origin: BrainboardTemplateOrigin;
  readonly captureStatus: "captured";
  readonly title: string;
  readonly description: string | null;
  readonly provider: "aws";
  readonly viewport: BrainboardSourceViewport;
  readonly nodes: readonly BrainboardCapturedNode[];
  readonly edges: readonly BrainboardSourceEdge[];
  readonly terraform: {
    readonly files: readonly BrainboardTerraformFile[];
    readonly resourceAddresses: readonly string[];
  };
  readonly bindings: Readonly<Record<string, BrainboardSourceNodeBinding>>;
};

/**
 * Attaches only reviewed source-node identities to already-normalized immutable capture data.
 * Every node is keyed by sourceNodeId; array-position pairing is intentionally impossible.
 */
export function defineCapturedBrainboardTemplate(
  definition: CapturedBrainboardTemplateDefinition
): BrainboardTemplateSource {
  const nodeIds = new Set(definition.nodes.map(({ sourceNodeId }) => sourceNodeId));
  for (const bindingId of Object.keys(definition.bindings)) {
    assertBinding(nodeIds.has(bindingId), definition.id, `Binding has no source node: ${bindingId}`);
  }

  const nodes = definition.nodes.map((node) => {
    const binding = definition.bindings[node.sourceNodeId];
    assertBinding(binding !== undefined, definition.id, `Missing binding for ${node.sourceNodeId}`);
    const common = {
      sourceNodeId: node.sourceNodeId,
      domOrder: node.domOrder,
      label: node.label,
      position: node.position,
      size: node.size,
      parentSourceNodeId: node.parentSourceNodeId,
      zIndex: node.zIndex,
      rawTransform: node.rawTransform,
      rotation: node.rotation
    } as const;

    if (binding.kind === "presentation") {
      assertBinding(
        binding.aliasOf === null || binding.catalogId !== null,
        definition.id,
        `Alias ${node.sourceNodeId} requires a catalogId`
      );
      return {
        ...common,
        kind: "presentation" as const,
        rawResourceType: node.rawResourceType,
        catalogId: binding.catalogId,
        aliasOf: binding.aliasOf,
        style: binding.style
      };
    }

    const identity = parseTerraformAddress(binding.address);
    assertBinding(identity !== null, definition.id, `Invalid address ${binding.address}`);
    assertBinding(
      identity.terraformResourceType === node.rawResourceType,
      definition.id,
      `Address ${binding.address} does not match raw type ${node.rawResourceType}`
    );
    assertBinding(
      definition.terraform.files.some(({ fileName }) => fileName === binding.fileName),
      definition.id,
      `Address ${binding.address} references missing file ${binding.fileName}`
    );
    return {
      ...common,
      kind: "resource" as const,
      terraformBlockType: identity.terraformBlockType,
      terraformResourceType: identity.terraformResourceType,
      resourceName: identity.resourceName,
      fileName: binding.fileName,
      addressMapping: binding.addressMapping,
      valuesResolution: "source-file-authoritative/unresolved" as const
    };
  });

  const resourceAddresses = nodes
    .filter((node) => node.kind === "resource")
    .map((node) => formatResourceAddress(node));
  validateAddressMappingEvidence(nodes, definition.id);
  assertBinding(
    sameStringSet(resourceAddresses, definition.terraform.resourceAddresses),
    definition.id,
    "Resource bindings must cover every captured Terraform address exactly once"
  );
  for (const node of nodes) {
    if (node.kind === "presentation" && node.aliasOf !== null) {
      assertBinding(
        definition.terraform.resourceAddresses.includes(node.aliasOf),
        definition.id,
        `Alias ${node.sourceNodeId} references unknown address ${node.aliasOf}`
      );
    }
  }

  const source: BrainboardTemplateSource = {
    id: definition.id,
    origin: definition.origin,
    captureStatus: definition.captureStatus,
    title: definition.title,
    description: definition.description,
    provider: definition.provider,
    viewport: definition.viewport,
    nodes,
    edges: definition.edges,
    terraform: definition.terraform
  };
  const validation = validateBrainboardTemplateSource(source);
  assertBinding(
    validation.valid,
    definition.id,
    validation.errors.map(({ code, path }) => `${code} at ${path}`).join(", ")
  );
  return source;
}

function parseTerraformAddress(address: string): {
  readonly terraformBlockType: "resource" | "data";
  readonly terraformResourceType: string;
  readonly resourceName: string;
} | null {
  const parts = address.split(".");
  if (parts[0] === "data" && parts.length === 3 && parts[1] && parts[2]) {
    return {
      terraformBlockType: "data",
      terraformResourceType: parts[1],
      resourceName: parts[2]
    };
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return {
      terraformBlockType: "resource",
      terraformResourceType: parts[0],
      resourceName: parts[1]
    };
  }
  return null;
}

function formatResourceAddress(node: {
  readonly terraformBlockType: "resource" | "data";
  readonly terraformResourceType: string;
  readonly resourceName: string;
}): string {
  return `${node.terraformBlockType === "data" ? "data." : ""}${node.terraformResourceType}.${node.resourceName}`;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value))
  );
}

function validateAddressMappingEvidence(
  nodes: readonly BrainboardTemplateSource["nodes"][number][],
  templateId: BrainboardTemplateId
): void {
  const resourcesByType = new Map<string, Extract<(typeof nodes)[number], { kind: "resource" }>[]>();
  for (const node of nodes) {
    if (node.kind !== "resource") continue;
    if (node.addressMapping === "exact-title") {
      assertBinding(
        node.label === node.resourceName,
        templateId,
        `Exact-title mapping ${node.sourceNodeId} does not match ${node.resourceName}`
      );
    }
    const resources = resourcesByType.get(node.terraformResourceType) ?? [];
    resources.push(node);
    resourcesByType.set(node.terraformResourceType, resources);
  }
  for (const [resourceType, resources] of resourcesByType) {
    const residuals = resources.filter(({ addressMapping }) => addressMapping !== "exact-title");
    const singles = residuals.filter(({ addressMapping }) => addressMapping === "single-residual");
    if (singles.length > 0) {
      assertBinding(
        singles.length === 1 && residuals.length === 1,
        templateId,
        `Single-residual mapping for ${resourceType} is not the sole address left after exact titles`
      );
    }
  }
}

function assertBinding(
  condition: unknown,
  templateId: BrainboardTemplateId,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(`Invalid Brainboard source binding for ${templateId}: ${message}`);
  }
}
