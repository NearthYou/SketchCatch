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
  evaluateAutomaticDiagramLayout,
  layoutAutomaticDiagram,
  type AutomaticDiagramLayoutQuality
} from "../workspace/automatic-diagram-layout";
import {
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson
} from "../workspace/workspace-ai-diagram-adapter";
import { architectureBoardKnowledge } from "./architecture-board-knowledge";
import type { ArchitectureBoardKnowledgeCase } from "./architecture-board-knowledge-contract";
import { extractArchitectureBoardKnowledgeCase } from "./architecture-board-knowledge-metrics";

export const ARCHITECTURE_BOARD_COMPILER_VERSION = "architecture-board-compiler/v1";

export type {
  ArchitectureBoardCompilationChange,
  ArchitectureBoardCompilationDiagnostic,
  ArchitectureBoardCompilationInput,
  ArchitectureBoardCompilationProposal,
  ArchitectureBoardCompilationQuality,
  ArchitectureBoardCompilationTrigger
} from "@sketchcatch/types";

type Candidate = {
  readonly id: string;
  readonly diagram: DiagramJson;
  readonly evaluation: CandidateEvaluation;
};

type CandidateEvaluation = {
  readonly score: number;
  readonly structuralPenalty: number;
  readonly visual: AutomaticDiagramLayoutQuality;
  readonly knowledge: ArchitectureBoardKnowledgeCase;
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
  const referenceCases = findReferenceTemplateCases(baseDiagram);
  const originalDiagram =
    currentDiagram &&
    currentArchitecture &&
    sameArchitectureShape(currentArchitecture, architecture)
      ? currentDiagram
      : baseDiagram;
  const originalCandidate: Candidate = {
    id: "original",
    diagram: originalDiagram,
    evaluation: evaluateCandidate(originalDiagram, referenceCases)
  };
  const compiledLayout = layoutAutomaticDiagram({
    edges: architecture.edges,
    nodes: baseDiagram.nodes
  });
  const compiledDiagram = withRoutedEdges(baseDiagram, compiledLayout.nodes);
  const compiledCandidate: Candidate = {
    id: `compiled:${compiledLayout.candidateId}`,
    diagram: compiledDiagram,
    evaluation: evaluateCandidate(compiledDiagram, referenceCases)
  };
  const candidate = selectCandidate(originalCandidate, compiledCandidate, architecture);
  const changes = compareCompilationChanges(comparisonDiagram, candidate.diagram, architecture);
  const diagnostics = createDiagnostics(architecture, candidate.diagram);
  const semanticDiagnosticPenalty = diagnostics.reduce(
    (total, diagnostic) => total + diagnostic.penalty,
    0
  );

  return {
    architecture,
    diagram: cloneDiagram(candidate.diagram),
    changes,
    diagnostics,
    quality: {
      before: toCompilationQuality(evaluateCandidate(comparisonDiagram, referenceCases), 0),
      after: toCompilationQuality(candidate.evaluation, semanticDiagnosticPenalty),
      compilationDistance: changes.reduce((total, change) => total + change.cost, 0)
    },
    provenance: {
      compilerVersion: ARCHITECTURE_BOARD_COMPILER_VERSION,
      candidateId: candidate.id,
      referenceTemplateIds: referenceCases.map(({ id }) => id)
    }
  };
}

function selectCandidate(
  original: Candidate,
  compiled: Candidate,
  architecture: ArchitectureJson
): Candidate {
  if (original.diagram.presentation?.geometryPolicy === "source-exact") {
    return original;
  }

  if (architecture.nodes.length > 0 && compiled.diagram.nodes.length === 0) {
    return original;
  }

  const changes = compareCompilationChanges(original.diagram, compiled.diagram, architecture);
  const distance = changes.reduce((total, change) => total + change.cost, 0);
  return compiled.evaluation.score + distance < original.evaluation.score ? compiled : original;
}

function evaluateDiagram(diagram: DiagramJson): AutomaticDiagramLayoutQuality {
  return evaluateAutomaticDiagramLayout({
    edges: diagram.edges.map(toLayoutEdge),
    nodes: diagram.nodes
  });
}

function evaluateCandidate(
  diagram: DiagramJson,
  referenceCases: readonly ArchitectureBoardKnowledgeCase[]
): CandidateEvaluation {
  const visual = evaluateDiagram(diagram);
  const knowledge = extractArchitectureBoardKnowledgeCase("candidate", diagram);
  const structuralPenalty = calculateKnowledgeStructuralPenalty(knowledge, referenceCases);

  return {
    score: visual.score + structuralPenalty,
    structuralPenalty,
    visual,
    knowledge
  };
}

function toCompilationQuality(
  evaluation: CandidateEvaluation,
  semanticDiagnosticPenalty: number
): ArchitectureBoardCompilationQuality {
  return {
    score: evaluation.score + semanticDiagnosticPenalty,
    visualPenalty: evaluation.visual.score,
    structuralPenalty: evaluation.structuralPenalty,
    semanticDiagnosticPenalty,
    metrics: {
      ...evaluation.visual,
      knowledgeMeanSiblingGap: evaluation.knowledge.meanSiblingGap,
      knowledgeMeanVerticalGap: evaluation.knowledge.meanVerticalGap,
      knowledgeMaxContainmentDepth: evaluation.knowledge.maxContainmentDepth,
      knowledgeHorizontalFlowRatio: evaluation.knowledge.horizontalFlowRatio,
      knowledgeSupportNodeRatio: evaluation.knowledge.supportNodeRatio,
      knowledgeViewportAspectRatio: evaluation.knowledge.viewportAspectRatio,
      knowledgeWhitespaceRatio: evaluation.knowledge.whitespaceRatio
    }
  };
}

function toLayoutEdge(edge: DiagramEdge): {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
} {
  return {
    id: edge.id,
    sourceId: edge.sourceNodeId,
    targetId: edge.targetNodeId,
    ...(edge.label === undefined ? {} : { label: edge.label })
  };
}

function withRoutedEdges(base: DiagramJson, nodes: readonly DiagramNode[]): DiagramJson {
  const movedNodeIds = new Set(
    nodes
      .filter((node) => {
        const previous = base.nodes.find((candidate) => candidate.id === node.id);
        return previous && !sameValue(previous.position, node.position);
      })
      .map((node) => node.id)
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
  const beforeArchitectureNodeById = new Map(
    beforeArchitecture.nodes.map((node) => [node.id, node])
  );
  const desiredNodeById = new Map(desiredArchitecture.nodes.map((node) => [node.id, node]));
  const beforeNodeById = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodeById = new Map(after.nodes.map((node) => [node.id, node]));

  for (const id of sortedUnion(beforeNodeById.keys(), afterNodeById.keys())) {
    const previous = beforeNodeById.get(id);
    const next = afterNodeById.get(id);
    if (!previous && next) {
      changes.push(change("resource", "add", id, `Resource ${id} 추가`, 100, null, next));
      continue;
    }
    if (previous && !next) {
      changes.push(change("resource", "remove", id, `Resource ${id} 삭제`, 140, previous, null));
      continue;
    }
    if (!previous || !next) continue;
    if (!sameValue(previous.position, next.position)) {
      changes.push(
        change(
          "geometry",
          "modify",
          id,
          `Resource ${id} 위치 변경`,
          1,
          previous.position,
          next.position
        )
      );
    }
    if (!sameValue(previous.size, next.size)) {
      changes.push(
        change("geometry", "modify", id, `Resource ${id} 크기 변경`, 4, previous.size, next.size)
      );
    }
    if (previous.zIndex !== next.zIndex) {
      changes.push(
        change(
          "geometry",
          "modify",
          id,
          `Resource ${id} z-index 변경`,
          2,
          previous.zIndex,
          next.zIndex
        )
      );
    }
    if (previous.metadata?.parentAreaNodeId !== next.metadata?.parentAreaNodeId) {
      changes.push(
        change(
          "containment",
          "modify",
          id,
          `Resource ${id} 소속 변경`,
          12,
          previous.metadata?.parentAreaNodeId ?? null,
          next.metadata?.parentAreaNodeId ?? null
        )
      );
    }
  }

  for (const id of sortedUnion(beforeArchitectureNodeById.keys(), desiredNodeById.keys())) {
    const previous = beforeArchitectureNodeById.get(id);
    const next = desiredNodeById.get(id);
    if (previous && next && !sameValue(previous.config, next.config)) {
      changes.push(
        change(
          "configuration",
          "modify",
          id,
          `Resource ${id} 설정 변경`,
          35,
          previous.config,
          next.config
        )
      );
    }
  }

  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  for (const id of sortedUnion(beforeEdges.keys(), afterEdges.keys())) {
    const previous = beforeEdges.get(id);
    const next = afterEdges.get(id);
    if (!previous && next) {
      changes.push(change("relationship", "add", id, `관계 ${id} 추가`, 20, null, next));
    } else if (previous && !next) {
      changes.push(change("relationship", "remove", id, `관계 ${id} 삭제`, 20, previous, null));
    } else if (previous && next && !sameValue(previous, next)) {
      changes.push(
        change("edge-routing", "modify", id, `관계 ${id} 경로 또는 속성 변경`, 8, previous, next)
      );
    }
  }

  return changes.sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
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
        level: "error",
        summary: "중복 Resource id",
        message: `중복 Resource id ${node.id}를 확인하세요.`,
        relatedChangeIds: [],
        relatedResourceIds: [node.id],
        penalty: 1_000
      });
    }
    nodeIds.add(node.id);
  }
  for (const edge of architecture.edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      diagnostics.push({
        code: "compiler.dangling_relationship",
        level: "error",
        summary: "연결 대상이 없는 관계",
        message: `관계 ${edge.id}의 시작 또는 대상 Resource가 없습니다.`,
        relatedChangeIds: [],
        relatedResourceIds: [edge.sourceId, edge.targetId],
        penalty: 1_000
      });
    }
  }
  if (architecture.nodes.length > 0 && diagram.nodes.length === 0) {
    diagnostics.push({
      code: "compiler.empty_candidate_rejected",
      level: "error",
      summary: "빈 Board 후보 거부",
      message: "Resource가 있는 Architecture를 빈 Board로 바꾸는 후보를 거부했습니다.",
      relatedChangeIds: [],
      relatedResourceIds: architecture.nodes.map((node) => node.id),
      penalty: 10_000
    });
  }
  return diagnostics.sort((left, right) => left.code.localeCompare(right.code));
}

function findReferenceTemplateCases(
  diagram: DiagramJson
): readonly ArchitectureBoardKnowledgeCase[] {
  const types = new Set(diagram.nodes.map((node) => node.type));
  return architectureBoardKnowledge.cases
    .map((knowledgeCase) => ({
      knowledgeCase,
      score: jaccard(types, new Set(knowledgeCase.nodeTypes))
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.knowledgeCase.id.localeCompare(right.knowledgeCase.id)
    )
    .slice(0, 3)
    .map(({ knowledgeCase }) => knowledgeCase);
}

function calculateKnowledgeStructuralPenalty(
  candidate: ArchitectureBoardKnowledgeCase,
  references: readonly ArchitectureBoardKnowledgeCase[]
): number {
  if (references.length === 0) return 0;

  const target = {
    meanSiblingGap: mean(references.map((entry) => entry.meanSiblingGap)),
    meanVerticalGap: mean(references.map((entry) => entry.meanVerticalGap)),
    maxContainmentDepth: mean(references.map((entry) => entry.maxContainmentDepth)),
    horizontalFlowRatio: mean(references.map((entry) => entry.horizontalFlowRatio)),
    supportNodeRatio: mean(references.map((entry) => entry.supportNodeRatio)),
    viewportAspectRatio: mean(references.map((entry) => entry.viewportAspectRatio)),
    whitespaceRatio: mean(references.map((entry) => entry.whitespaceRatio))
  };

  return round(
    cappedRelativeError(candidate.meanSiblingGap, target.meanSiblingGap) * 12 +
      cappedRelativeError(candidate.meanVerticalGap, target.meanVerticalGap) * 8 +
      cappedRelativeError(candidate.maxContainmentDepth, target.maxContainmentDepth) * 14 +
      cappedRelativeError(candidate.horizontalFlowRatio, target.horizontalFlowRatio) * 10 +
      cappedRelativeError(candidate.supportNodeRatio, target.supportNodeRatio) * 6 +
      cappedRelativeError(candidate.viewportAspectRatio, target.viewportAspectRatio) * 18 +
      cappedRelativeError(candidate.whitespaceRatio, target.whitespaceRatio) * 12
  );
}

function cappedRelativeError(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1;
  return Math.min(3, Math.abs(actual - expected) / Math.abs(expected));
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  return [...left].filter((value) => right.has(value)).length / union.size;
}

function change(
  kind: ArchitectureBoardCompilationChangeKind,
  action: ArchitectureBoardCompilationChangeAction,
  subjectId: string,
  summary: string,
  cost: number,
  before: unknown = null,
  after: unknown = null
): ArchitectureBoardCompilationChange {
  return {
    id: `${kind}:${action}:${subjectId}`,
    kind,
    action,
    targetIds: [subjectId],
    before,
    after,
    summary,
    cost
  };
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
