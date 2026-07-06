import type { ReverseEngineeringScanResult } from "@sketchcatch/types";

export type ReverseEngineeringDraftNodeUpdate = {
  readonly description?: string;
  readonly label?: string;
  readonly positionX?: number;
  readonly positionY?: number;
};

// 사용자가 적용 전 후보 설계에서 바꿀 수 있는 안전한 값만 반영합니다.
export function updateReverseEngineeringDraftNode(
  result: ReverseEngineeringScanResult,
  nodeId: string,
  update: ReverseEngineeringDraftNodeUpdate
): ReverseEngineeringScanResult {
  const architectureJson = {
    ...result.architectureJson,
    nodes: result.architectureJson.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      return {
        ...node,
        ...(update.label !== undefined ? { label: update.label } : {}),
        ...(update.positionX !== undefined ? { positionX: update.positionX } : {}),
        ...(update.positionY !== undefined ? { positionY: update.positionY } : {}),
        config: {
          ...node.config,
          ...(update.description !== undefined ? { description: update.description } : {})
        }
      };
    })
  };

  return {
    ...result,
    architectureJson,
    discoveredResources: result.discoveredResources,
    reverseEngineeringDraft: {
      ...result.reverseEngineeringDraft,
      architectureJson
    }
  };
}
