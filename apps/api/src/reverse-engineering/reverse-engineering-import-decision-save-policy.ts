import { isDeepStrictEqual } from "node:util";
import type {
  DiagramJson,
  DiagramNode,
  ReverseEngineeringImportDecision
} from "@sketchcatch/types";

export class ReverseEngineeringImportDecisionMutationError extends Error {
  /** gg: 일반 저장에서 서버 승인 결정을 위조하거나 바꾸면 고정된 충돌 오류로 중단합니다. */
  constructor() {
    super("AWS 리소스 가져오기 선택이 달라졌습니다. 다시 가져와 선택을 확인해 주세요.");
    this.name = "ReverseEngineeringImportDecisionMutationError";
  }
}

/** gg: 일반 Board 저장은 서버가 확인한 import 결정을 만들거나 바꾸지 못하게 막습니다. */
export function assertPreservesServerConfirmedReverseEngineeringImportDecisions(
  currentDiagram: DiagramJson,
  nextDiagram: DiagramJson,
  allowedImportDecisionStampNodeIds: ReadonlySet<string> = new Set()
): void {
  const currentNodes = createDecisionAwareNodeMap(currentDiagram);
  const nextNodes = createDecisionAwareNodeMap(nextDiagram);

  for (const [nodeId, nextNode] of nextNodes) {
    const nextDecision = readImportDecision(nextNode);

    if (
      nextDecision &&
      !readImportDecision(currentNodes.get(nodeId)) &&
      !allowedImportDecisionStampNodeIds.has(nodeId)
    ) {
      throw new ReverseEngineeringImportDecisionMutationError();
    }
  }

  for (const [nodeId, currentNode] of currentNodes) {
    const currentDecision = readImportDecision(currentNode);

    if (!currentDecision) {
      continue;
    }

    const nextNode = nextNodes.get(nodeId);
    if (!nextNode) {
      continue;
    }

    if (
      !allowedImportDecisionStampNodeIds.has(nodeId) &&
      !isDeepStrictEqual(readImportDecision(nextNode), currentDecision)
    ) {
      throw new ReverseEngineeringImportDecisionMutationError();
    }
  }
}

/** gg: 결정이 붙은 node ID가 중복되면 어느 리소스의 승인인지 모호하므로 중단합니다. */
function createDecisionAwareNodeMap(diagram: DiagramJson): ReadonlyMap<string, DiagramNode> {
  const nodes = new Map<string, DiagramNode>();

  for (const node of diagram.nodes) {
    const existing = nodes.get(node.id);
    if (existing && (readImportDecision(existing) || readImportDecision(node))) {
      throw new ReverseEngineeringImportDecisionMutationError();
    }

    nodes.set(node.id, node);
  }

  return nodes;
}

/** gg: import 결정이 없는 과거 Board는 기존 저장 동작을 그대로 사용합니다. */
function readImportDecision(
  node: DiagramNode | undefined
): ReverseEngineeringImportDecision | undefined {
  return node?.metadata?.reverseEngineering?.importDecision;
}
