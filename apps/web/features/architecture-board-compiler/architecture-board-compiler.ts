import type {
  ArchitectureBoardCompilationChange,
  ArchitectureBoardCompilationChangeAction,
  ArchitectureBoardCompilationChangeKind,
  ArchitectureBoardCompilationDiagnostic,
  ArchitectureBoardCompilationInput,
  ArchitectureBoardCompilationProposal,
  ArchitectureBoardCompilationQuality,
  ArchitectureJson,
  DiagramEdge,
  DiagramJson,
  DiagramNode
} from "@sketchcatch/types";
import { cloneDiagram } from "../diagram-editor/diagram-utils";
import {
  getObstacleSafeEdgeHandles,
  getObstacleSafeOrthogonalRouteSegments
} from "../diagram-editor/obstacle-safe-edge-routing";
import {
  evaluateAutomaticDiagramLayout,
  layoutAutomaticDiagram,
  type AutomaticDiagramLayoutQuality
} from "../workspace/automatic-diagram-layout";
import {
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson
} from "../workspace/workspace-ai-diagram-adapter";
import { architectureBoardKnowledge } from "./architecture-board-knowledge";

export const ARCHITECTURE_BOARD_COMPILER_VERSION = "architecture-board-compiler/v1";

export type {
  ArchitectureBoardCompilationChange,
  ArchitectureBoardCompilationDiagnostic,
  ArchitectureBoardCompilationInput,
  ArchitectureBoardCompilationProposal,
  ArchitectureBoardCompilationQuality,
  ArchitectureBoardCompilationTrigger
} from "@sketchcatch/types";

/**
 * These costs intentionally encode the public policy order documented for the compiler:
 * position < size < visual presentation/containment < relationship < configuration
 * < resource add < resource delete.  Routing and z-index are visual details, so they
 * remain below a containment decision.
 */
const COMPILATION_DISTANCE_COST = {
  position: 1,
  zIndex: 2,
  size: 4,
  edgeRouting: 6,
  presentation: 8,
  containment: 12,
  relationship: 20,
  configuration: 35,
  resourceIdentity: 70,
  resourceAdd: 100,
  resourceRemove: 140
} as const;

const AREA_RESOURCE_TYPES = new Set([
  "aws_region",
  "aws_availability_zone",
  "aws_vpc",
  "aws_subnet",
  "aws_autoscaling_group"
]);

const PRESENTATION_AREA_RESOURCE_TYPES = new Set([
  "aws_autoscaling_group",
  "aws_eks_cluster",
  "aws_ecs_cluster",
  "aws_rds_cluster",
  "aws_db_subnet_group",
  "aws_elasticache_subnet_group",
  "kubernetes_namespace"
]);

const CONTAINMENT_LABELS = new Set(["contains", "hosts"]);
const CONFIG_KEYS_WITH_PRESENTATION_MEANING = new Set([
  "parentAreaNodeId",
  "presentationArea",
  "diagramWidth",
  "diagramHeight",
  "diagramKind",
  "diagramType",
  "diagramIconUrl",
  "diagramTextColor",
  "diagramBorderColor",
  "diagramBorderStyle"
]);

type Candidate = {
  readonly architecture: ArchitectureJson;
  readonly changes: readonly ArchitectureBoardCompilationChange[];
  readonly diagnostics: readonly ArchitectureBoardCompilationDiagnostic[];
  readonly diagram: DiagramJson;
  readonly distance: number;
  readonly id: string;
  readonly quality: ArchitectureBoardCompilationQuality;
};

type StructuralQuality = {
  readonly metrics: Record<string, number>;
  readonly penalty: number;
};

export function compileArchitectureBoard(
  input: ArchitectureBoardCompilationInput
): ArchitectureBoardCompilationProposal {
  const requestedArchitecture = cloneArchitecture(input.architecture);
  const currentDiagram = input.currentDiagram ? cloneDiagram(input.currentDiagram) : undefined;
  const currentArchitecture = currentDiagram
    ? convertDiagramJsonToArchitectureJson(currentDiagram)
    : undefined;
  const baseDiagram = convertArchitectureJsonToDiagramJson(requestedArchitecture, {
    preserveLayoutFrom: input.trigger === "board-auto-organize" ? undefined : currentDiagram
  });
  const originalDiagram =
    currentDiagram && currentArchitecture && sameArchitectureShape(currentArchitecture, requestedArchitecture)
      ? currentDiagram
      : baseDiagram;
  const comparisonArchitecture = currentArchitecture ?? requestedArchitecture;
  const comparisonDiagram = currentDiagram ?? baseDiagram;

  // Source fixtures are evidence, not a mutable compiler input.  Returning a proposal
  // remains useful for diagnostics/quality, but this branch never materializes a variant.
  if (
    comparisonDiagram.presentation?.geometryPolicy === "source-exact" &&
    input.trigger !== "template-review"
  ) {
    const diagnostics = createDiagnostics(
      requestedArchitecture,
      requestedArchitecture,
      comparisonDiagram,
      []
    );
    const quality = createCompilationQuality(
      evaluateDiagram(comparisonDiagram),
      evaluateStructuralQuality(requestedArchitecture),
      diagnostics,
      0,
      comparisonDiagram
    );

    return {
      architecture: requestedArchitecture,
      changes: [],
      diagnostics,
      diagram: cloneDiagram(comparisonDiagram),
      quality: { before: quality, after: quality, compilationDistance: 0 },
      provenance: {
        compilerVersion: ARCHITECTURE_BOARD_COMPILER_VERSION,
        candidateId: "source-exact",
        referenceTemplateIds: [...findReferenceTemplateIds(comparisonDiagram)]
      }
    };
  }

  const originalCandidate = createCandidate(
    "original",
    requestedArchitecture,
    originalDiagram,
    comparisonArchitecture,
    comparisonDiagram,
    requestedArchitecture
  );
  const presentationArchitecture = inferPresentationArchitecture(requestedArchitecture);
  const presentationCandidate = createMaterializedCandidate(
    "presentation",
    presentationArchitecture,
    comparisonArchitecture,
    comparisonDiagram,
    requestedArchitecture
  );
  const semanticArchitecture = createSemanticArchitecture(presentationArchitecture);
  const semanticCandidate = createMaterializedCandidate(
    "semantic",
    semanticArchitecture,
    comparisonArchitecture,
    comparisonDiagram,
    requestedArchitecture
  );
  const selectableCandidates =
    comparisonDiagram.presentation?.geometryPolicy === "source-exact" &&
    input.trigger === "template-review"
      ? [presentationCandidate, semanticCandidate]
      : [originalCandidate, presentationCandidate, semanticCandidate];
  const selected = selectableCandidates.sort(
    (left, right) => left.quality.score - right.quality.score || left.id.localeCompare(right.id)
  )[0];

  if (!selected) {
    throw new Error("Architecture Board Compiler requires an original candidate.");
  }

  const beforeDiagnostics = createDiagnostics(
    requestedArchitecture,
    comparisonArchitecture,
    comparisonDiagram,
    []
  );
  const beforeQuality = createCompilationQuality(
    evaluateDiagram(comparisonDiagram),
    evaluateStructuralQuality(comparisonArchitecture),
    beforeDiagnostics,
    0,
    comparisonDiagram
  );

  return {
    architecture: cloneArchitecture(selected.architecture),
    changes: selected.changes.map((entry) => structuredClone(entry)),
    diagnostics: selected.diagnostics.map((entry) => structuredClone(entry)),
    diagram: cloneDiagram(selected.diagram),
    quality: {
      before: beforeQuality,
      after: selected.quality,
      compilationDistance: selected.distance
    },
    provenance: {
      compilerVersion: ARCHITECTURE_BOARD_COMPILER_VERSION,
      candidateId: selected.id,
      referenceTemplateIds: [...findReferenceTemplateIds(selected.diagram)]
    }
  };
}

function createMaterializedCandidate(
  id: string,
  architecture: ArchitectureJson,
  beforeArchitecture: ArchitectureJson,
  beforeDiagram: DiagramJson,
  sourceArchitecture: ArchitectureJson
): Candidate {
  const materialized = applyCompilerPresentationMetadata(
    convertArchitectureJsonToDiagramJson(architecture),
    architecture
  );
  const layout = layoutAutomaticDiagram({
    edges: architecture.edges,
    nodes: materialized.nodes
  });
  const diagram = routeAndLayerDiagram({
    ...cloneDiagram(materialized),
    nodes: layout.nodes.map((node) => structuredClone(node))
  });

  return createCandidate(
    `compiled:${id}:${layout.candidateId}`,
    architecture,
    diagram,
    beforeArchitecture,
    beforeDiagram,
    sourceArchitecture
  );
}

function createCandidate(
  id: string,
  architecture: ArchitectureJson,
  diagram: DiagramJson,
  beforeArchitecture: ArchitectureJson,
  beforeDiagram: DiagramJson,
  sourceArchitecture: ArchitectureJson
): Candidate {
  const changes = compareCompilationChanges(
    beforeArchitecture,
    beforeDiagram,
    architecture,
    diagram
  );
  const diagnostics = createDiagnostics(sourceArchitecture, architecture, diagram, changes);
  const distance = changes.reduce((total, entry) => total + entry.cost, 0);
  const quality = createCompilationQuality(
    evaluateDiagram(diagram),
    evaluateStructuralQuality(architecture),
    diagnostics,
    distance,
    diagram
  );

  return {
    architecture: cloneArchitecture(architecture),
    changes,
    diagnostics,
    diagram: cloneDiagram(diagram),
    distance,
    id,
    quality
  };
}

function createCompilationQuality(
  visual: AutomaticDiagramLayoutQuality,
  structural: StructuralQuality,
  diagnostics: readonly ArchitectureBoardCompilationDiagnostic[],
  compilationDistance: number,
  diagram: DiagramJson
): ArchitectureBoardCompilationQuality {
  const semanticDiagnosticPenalty = diagnostics.reduce((total, diagnostic) => total + diagnostic.penalty, 0);

  return {
    // A candidate is selected by this complete, ordered cost.  Distance is separately
    // exposed to the UI so a user can see why a semantically broader proposal won.
    score: visual.score + structural.penalty + semanticDiagnosticPenalty + compilationDistance,
    visualPenalty: visual.score,
    structuralPenalty: structural.penalty,
    semanticDiagnosticPenalty,
    metrics: {
      ...visual,
      ...structural.metrics,
      ...getKnowledgeReferenceMetrics(diagram),
      compilationDistance
    }
  };
}

function getKnowledgeReferenceMetrics(diagram: DiagramJson): Record<string, number> {
  const referenceId = findReferenceTemplateIds(diagram)[0];
  const reference = architectureBoardKnowledge.cases.find((entry) => entry.id === referenceId);

  return {
    knowledgeViewportAspectRatio: reference?.viewportAspectRatio ?? 0,
    knowledgeContainmentDepth: reference?.maxContainmentDepth ?? 0,
    knowledgeSiblingGap: reference?.meanSiblingGap ?? 0,
    knowledgeEdgeLength: reference?.meanEdgeLength ?? 0
  };
}

/**
 * Presentation is deliberately a separate candidate: it only adds visual frames and
 * persisted non-SG parent intent.  The semantic candidate extends it with graph repair
 * and relationship/config changes, so the distance model can prefer the smaller proposal.
 */
function inferPresentationArchitecture(source: ArchitectureJson): ArchitectureJson {
  const architecture = cloneArchitecture(source);
  const nodesById = new Map(architecture.nodes.map((node) => [node.id, node]));
  const declaredParents = new Map(
    architecture.nodes.map((node) => [node.id, readDeclaredParentId(node)])
  );
  const inferredParents = inferNonSecurityGroupParents(architecture, nodesById, declaredParents);
  const childCountByParentId = new Map<string, number>();

  for (const parentId of inferredParents.values()) {
    if (parentId) {
      childCountByParentId.set(parentId, (childCountByParentId.get(parentId) ?? 0) + 1);
    }
  }

  return {
    ...architecture,
    nodes: architecture.nodes.map((node) => {
      const inferredParentId = inferredParents.get(node.id);
      const normalizedExistingParent = normalizeParentId(readDeclaredParentId(node));
      const shouldReplaceParent =
        normalizedExistingParent !== inferredParentId &&
        (isSecurityGroupParent(normalizedExistingParent, nodesById) ||
          !normalizedExistingParent ||
          !nodesById.has(normalizedExistingParent));
      const shouldAddPresentationArea =
        childCountByParentId.has(node.id) && isPresentationAreaCandidate(node);
      const config = {
        ...node.config,
        ...(shouldReplaceParent && inferredParentId
          ? { parentAreaNodeId: inferredParentId }
          : shouldReplaceParent && normalizedExistingParent
            ? { parentAreaNodeId: undefined }
            : {}),
        ...(shouldAddPresentationArea ? { presentationArea: true } : {})
      };
      const compactConfig = removeUndefinedEntries(config);

      return sameValue(compactConfig, node.config) ? node : { ...node, config: compactConfig };
    })
  };
}

function createSemanticArchitecture(source: ArchitectureJson): ArchitectureJson {
  const deduplicated = normalizeDuplicateResourceIds(source);
  const normalizedConfig = normalizeTerraformConfiguration(deduplicated);
  const normalizedEdges = removeDanglingRelationships(normalizedConfig);
  const withRelationships = inferTerraformReferenceRelationships(normalizedEdges);

  // Reference normalization can reveal a parent reference that was hidden by legacy
  // interpolation syntax, so run the cheap presentation inference once more.
  return inferPresentationArchitecture(withRelationships);
}

function normalizeDuplicateResourceIds(source: ArchitectureJson): ArchitectureJson {
  const occupiedIds = new Set(source.nodes.map((node) => node.id));
  const occurrences = new Map<string, number>();

  return {
    ...cloneArchitecture(source),
    nodes: source.nodes.map((node) => {
      const occurrence = (occurrences.get(node.id) ?? 0) + 1;
      occurrences.set(node.id, occurrence);
      if (occurrence === 1) return structuredClone(node);

      let nextId = `${node.id}__${occurrence}`;
      let suffix = occurrence;
      while (occupiedIds.has(nextId)) {
        suffix += 1;
        nextId = `${node.id}__${suffix}`;
      }
      occupiedIds.add(nextId);
      return { ...structuredClone(node), id: nextId };
    })
  };
}

function normalizeTerraformConfiguration(source: ArchitectureJson): ArchitectureJson {
  return {
    ...cloneArchitecture(source),
    nodes: source.nodes.map((node) => {
      const config = normalizeTerraformConfigurationValue(node.config) as Record<string, unknown>;
      return sameValue(config, node.config) ? structuredClone(node) : { ...structuredClone(node), config };
    })
  };
}

function normalizeTerraformConfigurationValue(value: unknown): unknown {
  if (typeof value === "string") {
    const interpolation = value.match(/^\$\{\s*(.+?)\s*\}$/u);
    return interpolation?.[1] ?? value;
  }
  if (Array.isArray(value)) {
    const next = value.map(normalizeTerraformConfigurationValue);
    return sameValue(next, value) ? value : next;
  }
  if (!isRecord(value)) return value;

  const next = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeTerraformConfigurationValue(entry)])
  );
  return sameValue(next, value) ? value : next;
}

function removeDanglingRelationships(source: ArchitectureJson): ArchitectureJson {
  const nodeIds = new Set(source.nodes.map((node) => node.id));
  const edges = source.edges.filter(
    (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
  );

  return edges.length === source.edges.length ? cloneArchitecture(source) : { ...cloneArchitecture(source), edges };
}

function inferTerraformReferenceRelationships(source: ArchitectureJson): ArchitectureJson {
  const nodesById = new Map(source.nodes.map((node) => [node.id, node]));
  const relationshipKeys = new Set(
    source.edges.map((edge) => `${edge.sourceId}\u0000${edge.targetId}`)
  );
  const occupiedIds = new Set(source.edges.map((edge) => edge.id));
  const inferred = source.nodes
    .flatMap((node) =>
      [...getReferencedNodeIds(node, nodesById)]
        .filter((targetId) => targetId !== node.id)
        .sort()
        .flatMap((targetId) => {
          const key = `${node.id}\u0000${targetId}`;
          if (relationshipKeys.has(key)) return [];
          relationshipKeys.add(key);
          const id = createUniqueId(`compiler:${node.id}:references:${targetId}`, occupiedIds);
          return [{ id, sourceId: node.id, targetId, label: "references" }];
        })
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  return inferred.length === 0
    ? cloneArchitecture(source)
    : {
        ...cloneArchitecture(source),
        edges: [...source.edges.map((edge) => structuredClone(edge)), ...inferred]
      };
}

function inferNonSecurityGroupParents(
  architecture: ArchitectureJson,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>,
  declaredParents: ReadonlyMap<string, string | undefined>
): Map<string, string | undefined> {
  const parentByNodeId = new Map(declaredParents);
  const edgeParentsByChildId = new Map<string, string[]>();

  for (const edge of architecture.edges) {
    const source = nodesById.get(edge.sourceId);
    if (!source || !isContainmentEdge(edge) || !isNonSecurityGroupAreaNode(source)) continue;
    const parentIds = edgeParentsByChildId.get(edge.targetId) ?? [];
    parentIds.push(source.id);
    edgeParentsByChildId.set(edge.targetId, parentIds);
  }

  for (const node of [...architecture.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    const existingParentId = normalizeParentId(declaredParents.get(node.id));
    if (
      existingParentId &&
      nodesById.has(existingParentId) &&
      !isSecurityGroupParent(existingParentId, nodesById) &&
      !wouldCreateContainmentCycle(node.id, existingParentId, parentByNodeId)
    ) {
      parentByNodeId.set(node.id, existingParentId);
      continue;
    }

    const candidates = [
      ...(edgeParentsByChildId.get(node.id) ?? []),
      ...getReferencedNodeIds(node, nodesById)
    ]
      .filter((candidateId) => candidateId !== node.id)
      .filter((candidateId) => {
        const candidate = nodesById.get(candidateId);
        return Boolean(candidate && isNonSecurityGroupAreaNode(candidate));
      })
      .sort((left, right) => compareContainmentParents(left, right, nodesById));
    const nextParentId = candidates.find(
      (candidateId) => !wouldCreateContainmentCycle(node.id, candidateId, parentByNodeId)
    );

    parentByNodeId.set(node.id, nextParentId);
  }

  return parentByNodeId;
}

function compareContainmentParents(
  leftId: string,
  rightId: string,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): number {
  const left = nodesById.get(leftId);
  const right = nodesById.get(rightId);
  return (
    containmentSpecificity(right) - containmentSpecificity(left) ||
    leftId.localeCompare(rightId)
  );
}

function containmentSpecificity(node: ArchitectureJson["nodes"][number] | undefined): number {
  const type = getTerraformResourceType(node);
  if (type === "aws_subnet") return 6;
  if (type === "aws_availability_zone") return 5;
  if (type === "aws_autoscaling_group") return 4;
  if (type === "aws_eks_cluster" || type === "aws_ecs_cluster") return 4;
  if (type === "aws_vpc") return 3;
  if (type === "aws_region") return 2;
  return 1;
}

function wouldCreateContainmentCycle(
  nodeId: string,
  parentId: string,
  parentByNodeId: ReadonlyMap<string, string | undefined>
): boolean {
  const visited = new Set<string>([nodeId]);
  let currentId: string | undefined = parentId;

  while (currentId) {
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = parentByNodeId.get(currentId);
  }

  return false;
}

function getReferencedNodeIds(
  node: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): Set<string> {
  const directIds = new Set<string>();
  const referenceIndex = createTerraformReferenceIndex(nodesById);

  for (const value of collectConfigStringValues(node.config)) {
    const normalized = normalizeTerraformReference(value);
    if (nodesById.has(normalized)) {
      directIds.add(normalized);
    }
    for (const match of normalized.matchAll(/(?:data\.)?(aws_[a-z0-9_]+)\.([a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9_]+)?/gu)) {
      const type = match[1];
      const resourceName = match[2];
      if (!type || !resourceName) continue;
      const referencedId = referenceIndex.get(`${type}.${resourceName}`);
      if (referencedId) directIds.add(referencedId);
    }
  }

  return directIds;
}

function createTerraformReferenceIndex(
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): Map<string, string> {
  const references = new Map<string, string>();

  for (const node of [...nodesById.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const resourceType = getTerraformResourceType(node);
    if (!resourceType.startsWith("aws_") && !resourceType.startsWith("kubernetes_")) continue;
    for (const name of getTerraformReferenceNames(node)) {
      const key = `${resourceType}.${name}`;
      if (!references.has(key)) references.set(key, node.id);
    }
  }

  return references;
}

function getTerraformReferenceNames(node: ArchitectureJson["nodes"][number]): string[] {
  const configuredName = readString(node.config["terraformResourceName"]);
  return [...new Set([node.id, configuredName, toTerraformName(node.id), toTerraformName(node.label ?? "")])]
    .filter((value): value is string => Boolean(value && value.length > 0));
}

function collectConfigStringValues(value: unknown, key?: string): string[] {
  if (typeof value === "string") {
    return key && CONFIG_KEYS_WITH_PRESENTATION_MEANING.has(key) ? [] : [value];
  }
  if (Array.isArray(value)) return value.flatMap((entry) => collectConfigStringValues(entry));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([entryKey, entry]) => collectConfigStringValues(entry, entryKey));
}

function normalizeTerraformReference(value: string): string {
  const interpolation = value.trim().match(/^\$\{\s*(.+?)\s*\}$/u);
  return interpolation?.[1] ?? value.trim();
}

function isContainmentEdge(edge: ArchitectureJson["edges"][number]): boolean {
  return Boolean(edge.label && CONTAINMENT_LABELS.has(edge.label.trim().toLowerCase()));
}

function readDeclaredParentId(node: ArchitectureJson["nodes"][number]): string | undefined {
  return normalizeParentId(node.config["parentAreaNodeId"]);
}

function normalizeParentId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isSecurityGroupParent(
  parentId: string | undefined,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): boolean {
  return parentId ? isSecurityGroupNode(nodesById.get(parentId)) : false;
}

function isSecurityGroupNode(node: ArchitectureJson["nodes"][number] | undefined): boolean {
  return getTerraformResourceType(node) === "aws_security_group" || node?.type === "SECURITY_GROUP";
}

function isNonSecurityGroupAreaNode(node: ArchitectureJson["nodes"][number]): boolean {
  return (
    !isSecurityGroupNode(node) &&
    (isPresentationAreaNode(node) || isPresentationAreaCandidate(node))
  );
}

function isPresentationAreaCandidate(node: ArchitectureJson["nodes"][number]): boolean {
  return PRESENTATION_AREA_RESOURCE_TYPES.has(getTerraformResourceType(node));
}

function isPresentationAreaNode(node: ArchitectureJson["nodes"][number] | undefined): boolean {
  if (!node) return false;
  return (
    node.config["presentationArea"] === true ||
    AREA_RESOURCE_TYPES.has(getTerraformResourceType(node)) ||
    node.type === "VPC" ||
    node.type === "SUBNET" ||
    node.type === "AUTO_SCALING_GROUP"
  );
}

function getTerraformResourceType(node: ArchitectureJson["nodes"][number] | undefined): string {
  const configured = node?.config["terraformResourceType"];
  return typeof configured === "string" && configured.trim().length > 0
    ? configured
    : node?.type.toLowerCase() === "vpc"
      ? "aws_vpc"
      : node?.type.toLowerCase() === "subnet"
        ? "aws_subnet"
        : node?.type.toLowerCase() === "security_group"
          ? "aws_security_group"
          : node?.type.toLowerCase() === "auto_scaling_group"
            ? "aws_autoscaling_group"
            : "";
}

function applyCompilerPresentationMetadata(
  diagram: DiagramJson,
  architecture: ArchitectureJson
): DiagramJson {
  const architectureNodeById = new Map(architecture.nodes.map((node) => [node.id, node]));
  const nodes = diagram.nodes.map((node) => {
    const architectureNode = architectureNodeById.get(node.id);
    if (architectureNode?.config["presentationArea"] !== true) return structuredClone(node);
    return {
      ...structuredClone(node),
      metadata: {
        ...node.metadata,
        presentationArea: true
      }
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // A Terraform reference to a newly inferred parent is useful in ArchitectureJson,
  // but rendering it through the Area frame makes a noisy self-containment edge.
  return {
    ...cloneDiagram(diagram),
    nodes,
    edges: diagram.edges.filter((edge) => {
      const target = nodeById.get(edge.targetNodeId);
      return !(
        target &&
        isDiagramPresentationArea(target) &&
        hasDiagramAreaAncestor(nodeById.get(edge.sourceNodeId), target.id, nodeById)
      );
    })
  };
}

function hasDiagramAreaAncestor(
  node: DiagramNode | undefined,
  ancestorId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  const visited = new Set<string>();
  let parentId = node?.metadata?.parentAreaNodeId;
  while (parentId && !visited.has(parentId)) {
    if (parentId === ancestorId) return true;
    visited.add(parentId);
    parentId = nodeById.get(parentId)?.metadata?.parentAreaNodeId;
  }
  return false;
}

function routeAndLayerDiagram(diagram: DiagramJson): DiagramJson {
  const layeredNodes = applyCompilerLayerOrder(diagram.nodes);
  const nodeById = new Map(layeredNodes.map((node) => [node.id, node]));

  return {
    ...cloneDiagram(diagram),
    nodes: layeredNodes,
    edges: diagram.edges.map((edge) => {
      const source = nodeById.get(edge.sourceNodeId);
      const target = nodeById.get(edge.targetNodeId);
      if (!source || !target) return structuredClone(edge);

      const handles = getObstacleSafeEdgeHandles(source, target, layeredNodes);
      const segments = getObstacleSafeOrthogonalRouteSegments(source, target, handles);
      const points = segments.length === 0
        ? []
        : [segments[0]!.from, ...segments.map((segment) => segment.to)];
      const sourcePoint = points[0] ?? { x: source.position.x, y: source.position.y };
      const targetPoint = points.at(-1) ?? { x: target.position.x, y: target.position.y };
      const route = {
        arrowDirection: "source-to-target" as const,
        labelPosition: getPolylineHalfwayPoint(points),
        sourcePoint,
        svgPath: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
        targetPoint,
        waypoints: points.slice(1, -1)
      };

      return {
        ...structuredClone(edge),
        ...handles,
        route,
        zIndex: 50
      };
    })
  };
}

function applyCompilerLayerOrder(nodes: readonly DiagramNode[]): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const depth = getDiagramAreaDepth(node, nodeById);
    const area = isDiagramPresentationArea(node);
    return {
      ...structuredClone(node),
      zIndex: area ? 1 + depth : 100 + depth
    };
  });
}

function getDiagramAreaDepth(node: DiagramNode, nodeById: ReadonlyMap<string, DiagramNode>): number {
  let depth = 0;
  let parentId = node.metadata?.parentAreaNodeId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    depth += 1;
    parentId = nodeById.get(parentId)?.metadata?.parentAreaNodeId;
  }
  return depth;
}

function isDiagramPresentationArea(node: DiagramNode): boolean {
  return (
    node.kind === "design" ||
    node.metadata?.presentationArea === true ||
    AREA_RESOURCE_TYPES.has(node.parameters?.resourceType ?? node.type) ||
    (node.parameters?.resourceType ?? node.type) === "aws_security_group"
  );
}

function getPolylineHalfwayPoint(
  points: readonly { readonly x: number; readonly y: number }[]
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  const segments = points.slice(1).map((point, index) => {
    const start = points[index] ?? points[0]!;
    return { start, end: point, length: Math.hypot(point.x - start.x, point.y - start.y) };
  });
  const halfway = segments.reduce((total, segment) => total + segment.length, 0) / 2;
  let covered = 0;
  for (const segment of segments) {
    if (segment.length === 0) continue;
    if (covered + segment.length >= halfway) {
      const ratio = (halfway - covered) / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio
      };
    }
    covered += segment.length;
  }
  return structuredClone(points[0]!);
}

function evaluateDiagram(diagram: DiagramJson): AutomaticDiagramLayoutQuality {
  return evaluateAutomaticDiagramLayout({
    edges: diagram.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      ...(edge.label === undefined ? {} : { label: edge.label })
    })),
    nodes: diagram.nodes
  });
}

function evaluateStructuralQuality(architecture: ArchitectureJson): StructuralQuality {
  const nodesById = new Map(architecture.nodes.map((node) => [node.id, node]));
  const parentById = new Map(architecture.nodes.map((node) => [node.id, readDeclaredParentId(node)]));
  let invalidParentCount = 0;
  let securityGroupParentCount = 0;
  let containmentMismatchCount = 0;
  let terraformReferenceContainmentMismatchCount = 0;

  for (const node of architecture.nodes) {
    const parentId = parentById.get(node.id);
    if (!parentId) continue;
    if (!nodesById.has(parentId) || wouldCreateContainmentCycle(node.id, parentId, parentById)) {
      invalidParentCount += 1;
    }
    if (isSecurityGroupParent(parentId, nodesById)) {
      securityGroupParentCount += 1;
    }
  }

  for (const edge of architecture.edges) {
    const source = nodesById.get(edge.sourceId);
    if (!source || !isContainmentEdge(edge) || !isNonSecurityGroupAreaNode(source)) continue;
    if (!hasDeclaredAncestor(edge.targetId, source.id, parentById)) containmentMismatchCount += 1;
  }

  for (const node of architecture.nodes) {
    for (const targetId of getReferencedNodeIds(node, nodesById)) {
      const target = nodesById.get(targetId);
      if (!target || !isNonSecurityGroupAreaNode(target) || targetId === node.id) continue;
      if (!hasDeclaredAncestor(node.id, targetId, parentById)) {
        terraformReferenceContainmentMismatchCount += 1;
      }
    }
  }

  const penalty =
    invalidParentCount * 1_000 +
    securityGroupParentCount * 750 +
    containmentMismatchCount * 260 +
    terraformReferenceContainmentMismatchCount * 180;

  return {
    penalty,
    metrics: {
      containmentMismatchCount,
      invalidParentCount,
      securityGroupParentCount,
      terraformReferenceContainmentMismatchCount
    }
  };
}

function hasDeclaredAncestor(
  nodeId: string,
  ancestorId: string,
  parentById: ReadonlyMap<string, string | undefined>
): boolean {
  const visited = new Set<string>();
  let currentId = parentById.get(nodeId);
  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId) return true;
    visited.add(currentId);
    currentId = parentById.get(currentId);
  }
  return false;
}

function compareCompilationChanges(
  beforeArchitecture: ArchitectureJson,
  beforeDiagram: DiagramJson,
  afterArchitecture: ArchitectureJson,
  afterDiagram: DiagramJson
): ArchitectureBoardCompilationChange[] {
  const changes: ArchitectureBoardCompilationChange[] = [];
  const beforeNodes = new Map(beforeArchitecture.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(afterArchitecture.nodes.map((node) => [node.id, node]));
  const renamedNodeIds = findCompilerNormalizedDuplicateIds(beforeArchitecture, afterArchitecture);

  for (const id of sortedUnion(beforeNodes.keys(), afterNodes.keys())) {
    const before = beforeNodes.get(id);
    const after = afterNodes.get(id);
    if (!before && after) {
      if (renamedNodeIds.has(id)) continue;
      changes.push(change("resource", "add", [id], `Resource ${id} 추가`, COMPILATION_DISTANCE_COST.resourceAdd, null, after));
      continue;
    }
    if (before && !after) {
      changes.push(change("resource", "remove", [id], `Resource ${id} 삭제`, COMPILATION_DISTANCE_COST.resourceRemove, before, null));
      continue;
    }
    if (!before || !after) continue;
    if (before.type !== after.type || before.label !== after.label) {
      changes.push(change("resource", "modify", [id], `Resource ${id} 정체성 변경`, COMPILATION_DISTANCE_COST.resourceIdentity, { type: before.type, label: before.label }, { type: after.type, label: after.label }));
    }
    const beforeConfig = stripPresentationConfiguration(before.config);
    const afterConfig = stripPresentationConfiguration(after.config);
    if (!sameValue(beforeConfig, afterConfig)) {
      changes.push(change("configuration", "modify", [id], `Resource ${id} 설정 정규화`, COMPILATION_DISTANCE_COST.configuration, beforeConfig, afterConfig));
    }
    const beforeParentId = readDeclaredParentId(before) ?? null;
    const afterParentId = readDeclaredParentId(after) ?? null;
    if (beforeParentId !== afterParentId) {
      changes.push(
        change(
          "containment",
          "modify",
          [id, ...(afterParentId ? [afterParentId] : [])],
          `Resource ${id} 소속 결정 변경`,
          COMPILATION_DISTANCE_COST.containment,
          beforeParentId,
          afterParentId
        )
      );
    }
  }

  for (const rename of renamedNodeIds.values()) {
    changes.push(change("resource", "modify", [rename.beforeId, rename.afterId], `중복 Resource id ${rename.beforeId} 정규화`, COMPILATION_DISTANCE_COST.resourceIdentity, rename.before, rename.after, rename.afterId));
  }

  compareArchitectureRelationships(beforeArchitecture, afterArchitecture, changes);
  compareDiagramPresentationAndGeometry(beforeDiagram, afterDiagram, changes);
  compareDiagramRoutes(beforeDiagram, afterDiagram, changes);

  return changes.sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
  );
}

function findCompilerNormalizedDuplicateIds(
  beforeArchitecture: ArchitectureJson,
  afterArchitecture: ArchitectureJson
): Map<string, { readonly after: ArchitectureJson["nodes"][number]; readonly afterId: string; readonly before: ArchitectureJson["nodes"][number]; readonly beforeId: string }> {
  const beforeById = new Map<string, ArchitectureJson["nodes"][number][]>();
  for (const node of beforeArchitecture.nodes) {
    const entries = beforeById.get(node.id) ?? [];
    entries.push(node);
    beforeById.set(node.id, entries);
  }
  const renamed = new Map<string, { readonly after: ArchitectureJson["nodes"][number]; readonly afterId: string; readonly before: ArchitectureJson["nodes"][number]; readonly beforeId: string }>();
  for (const after of afterArchitecture.nodes) {
    const match = after.id.match(/^(.*)__([2-9][0-9]*)$/u);
    const baseId = match?.[1];
    const occurrence = Number(match?.[2]);
    const originals = baseId ? beforeById.get(baseId) : undefined;
    const before = Number.isFinite(occurrence) ? originals?.[occurrence - 1] : undefined;
    if (!before || !baseId) continue;
    renamed.set(after.id, { after, afterId: after.id, before, beforeId: baseId });
  }
  return renamed;
}

function compareArchitectureRelationships(
  before: ArchitectureJson,
  after: ArchitectureJson,
  changes: ArchitectureBoardCompilationChange[]
): void {
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  for (const id of sortedUnion(beforeEdges.keys(), afterEdges.keys())) {
    const previous = beforeEdges.get(id);
    const next = afterEdges.get(id);
    if (!previous && next) {
      changes.push(change("relationship", "add", [next.sourceId, next.targetId], `관계 ${id} 추가`, COMPILATION_DISTANCE_COST.relationship, null, next, id));
    } else if (previous && !next) {
      changes.push(change("relationship", "remove", [previous.sourceId, previous.targetId], `관계 ${id} 삭제`, COMPILATION_DISTANCE_COST.relationship, previous, null, id));
    } else if (previous && next && !sameValue(previous, next)) {
      changes.push(change("relationship", "modify", [next.sourceId, next.targetId], `관계 ${id} 변경`, COMPILATION_DISTANCE_COST.relationship, previous, next, id));
    }
  }
}

function compareDiagramPresentationAndGeometry(
  before: DiagramJson,
  after: DiagramJson,
  changes: ArchitectureBoardCompilationChange[]
): void {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));

  for (const id of sortedUnion(beforeNodes.keys(), afterNodes.keys())) {
    const previous = beforeNodes.get(id);
    const next = afterNodes.get(id);
    if (!previous && next && next.kind === "design") {
      changes.push(change("presentation", "add", [id], `표현 Area ${id} 추가`, COMPILATION_DISTANCE_COST.presentation, null, next));
      continue;
    }
    if (previous && !next && previous.kind === "design") {
      changes.push(change("presentation", "remove", [id], `표현 Area ${id} 삭제`, COMPILATION_DISTANCE_COST.presentation, previous, null));
      continue;
    }
    if (!previous || !next) continue;
    const beforeParent = previous.metadata?.parentAreaNodeId ?? null;
    const afterParent = next.metadata?.parentAreaNodeId ?? null;
    if (
      beforeParent !== afterParent &&
      !changes.some(
        (change) => change.kind === "containment" && change.targetIds.includes(id)
      )
    ) {
      changes.push(change("containment", "modify", [id, ...(afterParent ? [afterParent] : [])], `Resource ${id} 소속 변경`, COMPILATION_DISTANCE_COST.containment, beforeParent, afterParent));
    }
    const beforePresentation = getDiagramPresentationState(previous);
    const afterPresentation = getDiagramPresentationState(next);
    if (!sameValue(beforePresentation, afterPresentation)) {
      changes.push(change("presentation", "modify", [id], `Resource ${id} 표현 Area 변경`, COMPILATION_DISTANCE_COST.presentation, beforePresentation, afterPresentation));
    }
    if (!sameValue(previous.position, next.position)) {
      changes.push(change("geometry", "modify", [id], `Resource ${id} 위치 변경`, COMPILATION_DISTANCE_COST.position, previous.position, next.position));
    }
    if (!sameValue(previous.size, next.size)) {
      changes.push(change("geometry", "modify", [id], `Resource ${id} 크기 변경`, COMPILATION_DISTANCE_COST.size, previous.size, next.size));
    }
    if (previous.zIndex !== next.zIndex) {
      changes.push(change("geometry", "modify", [id], `Resource ${id} z-index 변경`, COMPILATION_DISTANCE_COST.zIndex, previous.zIndex, next.zIndex));
    }
  }
}

function getDiagramPresentationState(node: DiagramNode): unknown {
  return {
    kind: node.kind,
    presentationArea: node.metadata?.presentationArea ?? false,
    style: node.style ?? null,
    type: node.type
  };
}

function compareDiagramRoutes(
  before: DiagramJson,
  after: DiagramJson,
  changes: ArchitectureBoardCompilationChange[]
): void {
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  for (const id of sortedUnion(beforeEdges.keys(), afterEdges.keys())) {
    const previous = beforeEdges.get(id);
    const next = afterEdges.get(id);
    if (!previous || !next) continue;
    const beforeRoute = routeState(previous);
    const afterRoute = routeState(next);
    if (!sameValue(beforeRoute, afterRoute)) {
      changes.push(change("edge-routing", "modify", [previous.sourceNodeId, previous.targetNodeId], `관계 ${id} 경로 변경`, COMPILATION_DISTANCE_COST.edgeRouting, beforeRoute, afterRoute, id));
    }
  }
}

function routeState(edge: DiagramEdge): unknown {
  return {
    route: edge.route ?? null,
    sourceHandleId: edge.sourceHandleId ?? null,
    style: edge.style ?? null,
    targetHandleId: edge.targetHandleId ?? null,
    type: edge.type ?? null,
    zIndex: edge.zIndex ?? null
  };
}

function stripPresentationConfiguration(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !CONFIG_KEYS_WITH_PRESENTATION_MEANING.has(key))
  );
}

function createDiagnostics(
  sourceArchitecture: ArchitectureJson,
  candidateArchitecture: ArchitectureJson,
  candidateDiagram: DiagramJson,
  changes: readonly ArchitectureBoardCompilationChange[]
): ArchitectureBoardCompilationDiagnostic[] {
  const diagnostics: ArchitectureBoardCompilationDiagnostic[] = [];
  const sourceDuplicateIds = findDuplicateIds(sourceArchitecture.nodes.map((node) => node.id));
  const candidateDuplicateIds = findDuplicateIds(candidateArchitecture.nodes.map((node) => node.id));
  const candidateNodeIds = new Set(candidateArchitecture.nodes.map((node) => node.id));
  const sourceDanglingEdges = sourceArchitecture.edges.filter(
    (edge) => !sourceArchitecture.nodes.some((node) => node.id === edge.sourceId) || !sourceArchitecture.nodes.some((node) => node.id === edge.targetId)
  );
  const candidateDanglingEdges = candidateArchitecture.edges.filter(
    (edge) => !candidateNodeIds.has(edge.sourceId) || !candidateNodeIds.has(edge.targetId)
  );

  for (const id of sourceDuplicateIds) {
    const relatedChangeIds = changes
      .filter((change) => change.targetIds.includes(id) || change.summary.includes(`id ${id}`))
      .map((change) => change.id);
    const normalized = !candidateDuplicateIds.has(id);
    diagnostics.push({
      code: normalized ? "compiler.duplicate_resource_id_normalized" : "compiler.duplicate_resource_id",
      level: normalized ? "info" : "warning",
      summary: normalized ? "중복 Resource id 정규화 제안" : "중복 Resource id",
      message: normalized
        ? `중복 Resource id ${id}를 결정론적 suffix로 분리했습니다.`
        : `중복 Resource id ${id}를 확인하세요. Compiler는 이 후보에서 그대로 보존했습니다.`,
      relatedChangeIds,
      relatedResourceIds: [id],
      penalty: normalized ? 0 : 350
    });
  }

  for (const edge of sourceDanglingEdges) {
    const removed = !candidateArchitecture.edges.some((candidate) => candidate.id === edge.id);
    diagnostics.push({
      code: "compiler.dangling_relationship",
      level: removed ? "info" : "warning",
      summary: removed ? "연결 대상 없는 관계 제거 제안" : "연결 대상이 없는 관계",
      message: removed
        ? `관계 ${edge.id}는 존재하지 않는 Resource를 가리켜 제거 후보로 만들었습니다.`
        : `관계 ${edge.id}의 시작 또는 대상 Resource가 없습니다.`,
      relatedChangeIds: changes.filter((change) => change.id.endsWith(`:${edge.id}`)).map((change) => change.id),
      relatedResourceIds: [edge.sourceId, edge.targetId],
      penalty: removed ? 0 : 300
    });
  }

  for (const edge of candidateDanglingEdges) {
    if (sourceDanglingEdges.some((source) => source.id === edge.id)) continue;
    diagnostics.push({
      code: "compiler.dangling_relationship",
      level: "warning",
      summary: "연결 대상이 없는 관계",
      message: `관계 ${edge.id}의 시작 또는 대상 Resource가 없습니다.`,
      relatedChangeIds: [],
      relatedResourceIds: [edge.sourceId, edge.targetId],
      penalty: 300
    });
  }

  const sourceNodesById = new Map(sourceArchitecture.nodes.map((node) => [node.id, node]));
  const candidateNodesById = new Map(candidateArchitecture.nodes.map((node) => [node.id, node]));
  const candidateRelationshipKeys = new Set(
    candidateArchitecture.edges.map((edge) => `${edge.sourceId}\u0000${edge.targetId}`)
  );
  for (const node of candidateArchitecture.nodes) {
    const parentId = readDeclaredParentId(node);
    if (parentId && isSecurityGroupParent(parentId, candidateNodesById)) {
      diagnostics.push({
        code: "compiler.security_group_containment",
        level: "warning",
        summary: "Security Group은 실제 소속 Area가 아님",
        message: `Resource ${node.id}의 Security Group parent ${parentId}는 시각 범위일 뿐 persisted containment가 아닙니다.`,
        relatedChangeIds: [],
        relatedResourceIds: [node.id, parentId],
        penalty: 750
      });
    }
    if (parentId && !candidateNodesById.has(parentId)) {
      diagnostics.push({
        code: "compiler.invalid_containment_parent",
        level: "warning",
        summary: "존재하지 않는 containment parent",
        message: `Resource ${node.id}의 parent ${parentId}를 찾지 못했습니다.`,
        relatedChangeIds: [],
        relatedResourceIds: [node.id, parentId],
        penalty: 1_000
      });
    }

    const sourceNode = sourceNodesById.get(node.id);
    if (sourceNode && readDeclaredParentId(sourceNode) !== parentId && parentId) {
      diagnostics.push({
        code: "compiler.inferred_containment",
        level: "info",
        summary: "비-Security Group containment 추론",
        message: `contains/hosts 관계 또는 Terraform 참조로 ${node.id}를 ${parentId}에 소속시켰습니다.`,
        relatedChangeIds: changes
          .filter((change) => change.kind === "containment" && change.targetIds.includes(node.id))
          .map((change) => change.id),
        relatedResourceIds: [node.id, parentId],
        penalty: 0
      });
    }
    if (
      sourceNode &&
      sourceNode.config["presentationArea"] !== true &&
      node.config["presentationArea"] === true
    ) {
      diagnostics.push({
        code: "compiler.presentation_area_inferred",
        level: "info",
        summary: "시각 Area 표현 제안",
        message: `Resource ${node.id}를 자식 Resource를 묶는 presentation Area로 표시합니다.`,
        relatedChangeIds: changes
          .filter((change) => change.kind === "presentation" && change.targetIds.includes(node.id))
          .map((change) => change.id),
        relatedResourceIds: [node.id],
        penalty: 0
      });
    }

    if (containsLegacyTerraformInterpolation(node.config)) {
      diagnostics.push({
        code: "compiler.legacy_terraform_reference",
        level: "warning",
        summary: "legacy Terraform interpolation",
        message: `Resource ${node.id}의 ${"${...}"} 참조를 modern Terraform reference로 정규화할 수 있습니다.`,
        relatedChangeIds: changes
          .filter((change) => change.kind === "configuration" && change.targetIds.includes(node.id))
          .map((change) => change.id),
        relatedResourceIds: [node.id],
        penalty: 120
      });
    }

    for (const targetId of getReferencedNodeIds(node, candidateNodesById)) {
      if (targetId === node.id || candidateRelationshipKeys.has(`${node.id}\u0000${targetId}`)) {
        continue;
      }
      diagnostics.push({
        code: "compiler.missing_terraform_relationship",
        level: "warning",
        summary: "Terraform 참조 관계 미표현",
        message: `Resource ${node.id}의 Terraform 참조 대상 ${targetId} 관계를 proposal로 추가할 수 있습니다.`,
        relatedChangeIds: [],
        relatedResourceIds: [node.id, targetId],
        penalty: 140
      });
    }
  }

  for (const change of changes.filter(
    (change) => change.kind === "relationship" && change.action === "add"
  )) {
    const edge = candidateArchitecture.edges.find((candidate) => change.id.endsWith(`:${candidate.id}`));
    if (edge?.label !== "references") continue;
    diagnostics.push({
      code: "compiler.inferred_terraform_relationship",
      level: "info",
      summary: "Terraform 참조 관계 추론",
      message: `${edge.sourceId}의 Terraform 설정 참조에서 ${edge.targetId} 관계를 추가했습니다.`,
      relatedChangeIds: [change.id],
      relatedResourceIds: [edge.sourceId, edge.targetId],
      penalty: 0
    });
  }

  for (const change of changes.filter((change) => change.kind === "configuration")) {
    diagnostics.push({
      code: "compiler.configuration_normalized",
      level: "info",
      summary: "Terraform 설정 정규화 제안",
      message: `${change.targetIds.join(", ")}의 legacy Terraform reference 또는 설정 표현을 정규화했습니다.`,
      relatedChangeIds: [change.id],
      relatedResourceIds: [...change.targetIds],
      penalty: 0
    });
  }

  // The diagram only affects visual quality, but a malformed empty result is still made
  // visible as a soft diagnostic.  It is never used as an exception or hard gate.
  if (candidateArchitecture.nodes.length > 0 && candidateDiagram.nodes.length === 0) {
    diagnostics.push({
      code: "compiler.empty_candidate",
      level: "warning",
      summary: "빈 Board 결과",
      message: "Resource가 있는 Architecture가 빈 Board로 materialize되었습니다. 이 proposal은 그대로 검토할 수 있습니다.",
      relatedChangeIds: [],
      relatedResourceIds: candidateArchitecture.nodes.map((node) => node.id),
      penalty: 10_000
    });
  }

  return diagnostics.sort(
    (left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message)
  );
}

function containsLegacyTerraformInterpolation(value: unknown): boolean {
  if (typeof value === "string") return /^\$\{\s*.+?\s*\}$/u.test(value);
  if (Array.isArray(value)) return value.some(containsLegacyTerraformInterpolation);
  return isRecord(value) && Object.values(value).some(containsLegacyTerraformInterpolation);
}

function findDuplicateIds(ids: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
}

function findReferenceTemplateIds(diagram: DiagramJson): readonly string[] {
  const types = new Set(diagram.nodes.map((node) => node.type));
  return architectureBoardKnowledge.cases
    .map((knowledgeCase) => ({
      id: knowledgeCase.id,
      score: jaccard(types, new Set(knowledgeCase.nodeTypes))
    }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 3)
    .map(({ id }) => id);
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  return [...left].filter((value) => right.has(value)).length / union.size;
}

function change(
  kind: ArchitectureBoardCompilationChangeKind,
  action: ArchitectureBoardCompilationChangeAction,
  targetIds: string[],
  summary: string,
  cost: number,
  before: unknown = null,
  after: unknown = null,
  idSubject = targetIds.join(",")
): ArchitectureBoardCompilationChange {
  return {
    id: `${kind}:${action}:${idSubject}`,
    kind,
    action,
    targetIds,
    before,
    after,
    summary,
    cost
  };
}

function createUniqueId(base: string, occupied: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (occupied.has(candidate)) {
    candidate = `${base}:${suffix}`;
    suffix += 1;
  }
  occupied.add(candidate);
  return candidate;
}

function sortedUnion(left: Iterable<string>, right: Iterable<string>): string[] {
  return [...new Set([...left, ...right])].sort();
}

function removeUndefinedEntries(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toTerraformName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return normalized.length > 0 ? normalized : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameArchitectureShape(left: ArchitectureJson, right: ArchitectureJson): boolean {
  const normalize = (architecture: ArchitectureJson) => ({
    nodes: architecture.nodes
      .map((node) => ({ id: node.id, type: node.type }))
      .sort((first, second) => first.id.localeCompare(second.id)),
    edges: architecture.edges
      .map((edge) => ({ id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId }))
      .sort((first, second) => first.id.localeCompare(second.id))
  });
  return sameValue(normalize(left), normalize(right));
}

function cloneArchitecture(architecture: ArchitectureJson): ArchitectureJson {
  return structuredClone(architecture);
}
