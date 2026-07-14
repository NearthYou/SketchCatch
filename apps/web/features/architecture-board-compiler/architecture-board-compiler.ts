import type { ArchitectureJson, DiagramEdge, DiagramJson, DiagramNode } from "@sketchcatch/types";
import { cloneDiagram } from "../diagram-editor/diagram-utils";
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

export type ArchitectureBoardCompilationTrigger =
  | "ai-draft"
  | "board-auto-organize"
  | "reverse-engineering"
  | "template-review";

export type ArchitectureBoardCompilationInput = {
  readonly architecture: ArchitectureJson;
  readonly currentDiagram?: DiagramJson | undefined;
  readonly trigger: ArchitectureBoardCompilationTrigger;
};

export type ArchitectureBoardCompilationChange = {
  readonly category: "resource" | "relationship" | "configuration" | "containment" | "geometry";
  readonly operation: "add" | "delete" | "update";
  readonly subjectId: string;
  readonly summary: string;
  readonly distance: number;
};

export type ArchitectureBoardCompilationDiagnostic = {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly subjectId?: string | undefined;
  readonly message: string;
};

export type ArchitectureBoardCompilationQuality = AutomaticDiagramLayoutQuality;

export type ArchitectureBoardCompilationProposal = {
  readonly architecture: ArchitectureJson;
  readonly diagram: DiagramJson;
  readonly changes: readonly ArchitectureBoardCompilationChange[];
  readonly diagnostics: readonly ArchitectureBoardCompilationDiagnostic[];
  readonly quality: {
    readonly before: ArchitectureBoardCompilationQuality;
    readonly after: ArchitectureBoardCompilationQuality;
    readonly compilationDistance: number;
  };
  readonly provenance: {
    readonly compilerVersion: typeof ARCHITECTURE_BOARD_COMPILER_VERSION;
    readonly candidateId: string;
    readonly referenceTemplateIds: readonly string[];
  };
};

type Candidate = {
  readonly id: string;
  readonly diagram: DiagramJson;
  readonly quality: ArchitectureBoardCompilationQuality;
};

export function compileArchitectureBoard(
  input: ArchitectureBoardCompilationInput
): ArchitectureBoardCompilationProposal {
  const architecture = cloneArchitecture(input.architecture);
  const currentDiagram = input.currentDiagram ? cloneDiagram(input.currentDiagram) : undefined;
  const baseDiagram = convertArchitectureJsonToDiagramJson(architecture, {
    preserveLayoutFrom: input.trigger === "board-auto-organize" ? undefined : currentDiagram
  });
  const currentArchitecture = currentDiagram
    ? convertDiagramJsonToArchitectureJson(currentDiagram)
    : undefined;
  const comparisonDiagram = currentDiagram ?? baseDiagram;
  const originalDiagram =
    currentDiagram && currentArchitecture && sameArchitectureShape(currentArchitecture, architecture)
      ? currentDiagram
      : baseDiagram;
  const originalCandidate: Candidate = {
    id: "original",
    diagram: originalDiagram,
    quality: evaluateDiagram(originalDiagram)
  };
  const compiledLayout = layoutAutomaticDiagram({
    edges: architecture.edges,
    nodes: baseDiagram.nodes
  });
  const compiledDiagram = withRoutedEdges(baseDiagram, compiledLayout.nodes);
  const compiledCandidate: Candidate = {
    id: `compiled:${compiledLayout.candidateId}`,
    diagram: compiledDiagram,
    quality: evaluateDiagram(compiledDiagram)
  };
  const candidate = selectCandidate(originalCandidate, compiledCandidate, architecture);
  const changes = compareCompilationChanges(comparisonDiagram, candidate.diagram, architecture);
  const diagnostics = createDiagnostics(architecture, candidate.diagram);

  return {
    architecture,
    diagram: cloneDiagram(candidate.diagram),
    changes,
    diagnostics,
    quality: {
      before: evaluateDiagram(comparisonDiagram),
      after: candidate.quality,
      compilationDistance: changes.reduce((total, change) => total + change.distance, 0)
    },
    provenance: {
      compilerVersion: ARCHITECTURE_BOARD_COMPILER_VERSION,
      candidateId: candidate.id,
      referenceTemplateIds: findReferenceTemplateIds(candidate.diagram)
    }
  };
}

function selectCandidate(original: Candidate, compiled: Candidate, architecture: ArchitectureJson): Candidate {
  if (original.diagram.presentation?.geometryPolicy === "source-exact") {
    return original;
  }

  if (architecture.nodes.length > 0 && compiled.diagram.nodes.length === 0) {
    return original;
  }

  const changes = compareCompilationChanges(original.diagram, compiled.diagram, architecture);
  const distance = changes.reduce((total, change) => total + change.distance, 0);
  return compiled.quality.score + distance < original.quality.score ? compiled : original;
}

function evaluateDiagram(diagram: DiagramJson): ArchitectureBoardCompilationQuality {
  return evaluateAutomaticDiagramLayout({
    edges: diagram.edges.map(toLayoutEdge),
    nodes: diagram.nodes
  });
}

function toLayoutEdge(edge: DiagramEdge): { id: string; sourceId: string; targetId: string; label?: string } {
  return {
    id: edge.id,
    sourceId: edge.sourceNodeId,
    targetId: edge.targetNodeId,
    ...(edge.label === undefined ? {} : { label: edge.label })
  };
}

function withRoutedEdges(base: DiagramJson, nodes: readonly DiagramNode[]): DiagramJson {
  const movedNodeIds = new Set(
    nodes.filter((node) => {
      const previous = base.nodes.find((candidate) => candidate.id === node.id);
      return previous && !sameValue(previous.position, node.position);
    }).map((node) => node.id)
  );

  return {
    ...cloneDiagram(base),
    nodes: nodes.map((node) => structuredClone(node)),
    edges: base.edges.map((edge) =>
      movedNodeIds.has(edge.sourceNodeId) || movedNodeIds.has(edge.targetNodeId)
        ? { ...structuredClone(edge), route: undefined }
        : structuredClone(edge)
    )
  };
}

function compareCompilationChanges(
  before: DiagramJson,
  after: DiagramJson,
  desiredArchitecture: ArchitectureJson
): ArchitectureBoardCompilationChange[] {
  const changes: ArchitectureBoardCompilationChange[] = [];
  const beforeArchitecture = convertDiagramJsonToArchitectureJson(before);
  const beforeArchitectureNodeById = new Map(beforeArchitecture.nodes.map((node) => [node.id, node]));
  const desiredNodeById = new Map(desiredArchitecture.nodes.map((node) => [node.id, node]));
  const beforeNodeById = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodeById = new Map(after.nodes.map((node) => [node.id, node]));

  for (const id of sortedUnion(beforeNodeById.keys(), afterNodeById.keys())) {
    const previous = beforeNodeById.get(id);
    const next = afterNodeById.get(id);
    if (!previous && next) {
      changes.push(change("resource", "add", id, `Resource ${id} 추가`, 100));
      continue;
    }
    if (previous && !next) {
      changes.push(change("resource", "delete", id, `Resource ${id} 삭제`, 140));
      continue;
    }
    if (!previous || !next) continue;
    if (!sameValue(previous.position, next.position)) {
      changes.push(change("geometry", "update", id, `Resource ${id} 위치 변경`, 1));
    }
    if (!sameValue(previous.size, next.size)) {
      changes.push(change("geometry", "update", id, `Resource ${id} 크기 변경`, 4));
    }
    if (previous.zIndex !== next.zIndex) {
      changes.push(change("geometry", "update", id, `Resource ${id} z-index 변경`, 2));
    }
    if (previous.metadata?.parentAreaNodeId !== next.metadata?.parentAreaNodeId) {
      changes.push(change("containment", "update", id, `Resource ${id} 소속 변경`, 12));
    }
  }

  for (const id of sortedUnion(beforeArchitectureNodeById.keys(), desiredNodeById.keys())) {
    const previous = beforeArchitectureNodeById.get(id);
    const next = desiredNodeById.get(id);
    if (previous && next && !sameValue(previous.config, next.config)) {
      changes.push(change("configuration", "update", id, `Resource ${id} 설정 변경`, 35));
    }
  }

  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  for (const id of sortedUnion(beforeEdges.keys(), afterEdges.keys())) {
    const previous = beforeEdges.get(id);
    const next = afterEdges.get(id);
    if (!previous && next) {
      changes.push(change("relationship", "add", id, `관계 ${id} 추가`, 20));
    } else if (previous && !next) {
      changes.push(change("relationship", "delete", id, `관계 ${id} 삭제`, 20));
    } else if (previous && next && !sameValue(previous, next)) {
      changes.push(change("relationship", "update", id, `관계 ${id} 경로 또는 속성 변경`, 8));
    }
  }

  return changes.sort((left, right) =>
    left.category.localeCompare(right.category) || left.subjectId.localeCompare(right.subjectId)
  );
}

function createDiagnostics(
  architecture: ArchitectureJson,
  diagram: DiagramJson
): ArchitectureBoardCompilationDiagnostic[] {
  const diagnostics: ArchitectureBoardCompilationDiagnostic[] = [];
  const nodeIds = new Set<string>();
  for (const node of architecture.nodes) {
    if (nodeIds.has(node.id)) {
      diagnostics.push({
        code: "compiler.duplicate_resource_id",
        severity: "error",
        subjectId: node.id,
        message: `중복 Resource id ${node.id}를 확인하세요.`
      });
    }
    nodeIds.add(node.id);
  }
  for (const edge of architecture.edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      diagnostics.push({
        code: "compiler.dangling_relationship",
        severity: "error",
        subjectId: edge.id,
        message: `관계 ${edge.id}의 시작 또는 대상 Resource가 없습니다.`
      });
    }
  }
  if (architecture.nodes.length > 0 && diagram.nodes.length === 0) {
    diagnostics.push({
      code: "compiler.empty_candidate_rejected",
      severity: "error",
      message: "Resource가 있는 Architecture를 빈 Board로 바꾸는 후보를 거부했습니다."
    });
  }
  return diagnostics.sort((left, right) => left.code.localeCompare(right.code));
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
  category: ArchitectureBoardCompilationChange["category"],
  operation: ArchitectureBoardCompilationChange["operation"],
  subjectId: string,
  summary: string,
  distance: number
): ArchitectureBoardCompilationChange {
  return { category, operation, subjectId, summary, distance };
}

function sortedUnion(left: Iterable<string>, right: Iterable<string>): string[] {
  return [...new Set([...left, ...right])].sort();
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
      .map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId
      }))
      .sort((first, second) => first.id.localeCompare(second.id))
  });

  return sameValue(normalize(left), normalize(right));
}

function cloneArchitecture(architecture: ArchitectureJson): ArchitectureJson {
  return structuredClone(architecture);
}
