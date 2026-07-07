import type {
  ArchitectureJson,
  DiscoveredResource,
  DiscoveredResourceRelationshipType,
  ResourceEdge,
  ResourceNode,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";

export type ReverseEngineeringBoardCandidate = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly architectureJson: ArchitectureJson;
  readonly resourceCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
};

const MAX_BOARD_CANDIDATE_COUNT = 3;

// AWS 스캔 결과 전체를 유지한 채 Resource를 묶는 해석만 다르게 만든 후보입니다.
export function createReverseEngineeringBoardCandidates(
  result: ReverseEngineeringScanResult
): readonly ReverseEngineeringBoardCandidate[] {
  const candidates = [
    createDependencyCandidate(result),
    ...createOptionalStructureCandidates(result)
  ].slice(0, MAX_BOARD_CANDIDATE_COUNT);
  const seenIds = new Set<string>();

  return candidates.filter((candidate) => {
    if (seenIds.has(candidate.id) || candidate.nodeCount === 0) {
      return false;
    }

    seenIds.add(candidate.id);
    return true;
  });
}

// 사용자가 고른 구조 해석을 미리보기와 적용에 쓰되, 발견한 Resource 목록은 그대로 유지합니다.
export function createReverseEngineeringCandidateResult(
  result: ReverseEngineeringScanResult,
  candidate: ReverseEngineeringBoardCandidate
): ReverseEngineeringScanResult {
  return {
    ...result,
    architectureJson: candidate.architectureJson,
    reverseEngineeringDraft: {
      ...result.reverseEngineeringDraft,
      architectureJson: candidate.architectureJson
    }
  };
}

// 배포 가능성에 가장 가까운 기본 해석입니다. 원본 관계선을 보존합니다.
function createDependencyCandidate(result: ReverseEngineeringScanResult): ReverseEngineeringBoardCandidate {
  return createCandidate({
    architectureJson: result.architectureJson,
    description: "VPC, Subnet, Security Group처럼 배포에 필요한 관계를 먼저 봅니다.",
    id: "candidate-structure-dependency",
    title: "배포 관계 기준 구조"
  });
}

function createOptionalStructureCandidates(
  result: ReverseEngineeringScanResult
): ReverseEngineeringBoardCandidate[] {
  if (result.discoveredResources.length === 0 || result.architectureJson.nodes.length <= 1) {
    return [];
  }

  return [
    createCandidate({
      architectureJson: createRelationshipArchitecture(result, "connects_to"),
      description: "ALB, EC2, RDS처럼 실제로 이어진 관계를 더 크게 봅니다.",
      id: "candidate-structure-connectivity",
      title: "연결 관계 기준 구조"
    }),
    createCandidate({
      architectureJson: createProviderTypeArchitecture(result.architectureJson),
      description: "Resource 종류와 provider 정보를 기준으로 전체 구성을 살펴봅니다.",
      id: "candidate-structure-provider",
      title: "Resource 종류 기준 구조"
    })
  ];
}

type CreateCandidateInput = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly architectureJson: ArchitectureJson;
};

// 후보 카드에서 바로 보여줄 개수 정보를 ArchitectureJson 기준으로 계산합니다.
function createCandidate(input: CreateCandidateInput): ReverseEngineeringBoardCandidate {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    architectureJson: input.architectureJson,
    resourceCount: input.architectureJson.nodes.length,
    nodeCount: input.architectureJson.nodes.length,
    edgeCount: input.architectureJson.edges.length
  };
}

// relationship target이 내부 id든 AWS 원본 id든 찾을 수 있게 검색표를 만듭니다.
function createResourceLookup(
  resources: readonly DiscoveredResource[]
): ReadonlyMap<string, DiscoveredResource> {
  const lookup = new Map<string, DiscoveredResource>();

  for (const resource of resources) {
    lookup.set(resource.id, resource);
    lookup.set(resource.providerResourceId, resource);
  }

  return lookup;
}

// AWS relationships를 보드 edge로 다시 만들어 전체 Resource 위의 연결 해석을 바꿉니다.
function createRelationshipArchitecture(
  result: ReverseEngineeringScanResult,
  preferredRelationshipType: DiscoveredResourceRelationshipType
): ArchitectureJson {
  const nodeByProviderResourceId = createNodeProviderResourceLookup(result.architectureJson.nodes);
  const resourceByLookupId = createResourceLookup(result.discoveredResources);
  const relationshipEdges = createRelationshipEdges({
    nodeByProviderResourceId,
    preferredRelationshipType,
    resourceByLookupId,
    resources: result.discoveredResources
  });

  return {
    nodes: result.architectureJson.nodes,
    edges: relationshipEdges.length > 0 ? [...relationshipEdges] : [...result.architectureJson.edges]
  };
}

type CreateRelationshipEdgesInput = {
  readonly nodeByProviderResourceId: ReadonlyMap<string, ResourceNode>;
  readonly preferredRelationshipType: DiscoveredResourceRelationshipType;
  readonly resourceByLookupId: ReadonlyMap<string, DiscoveredResource>;
  readonly resources: readonly DiscoveredResource[];
};

function createRelationshipEdges(input: CreateRelationshipEdgesInput): readonly ResourceEdge[] {
  const preferredEdges = collectRelationshipEdges(input, input.preferredRelationshipType);

  if (preferredEdges.length > 0) {
    return preferredEdges;
  }

  return collectRelationshipEdges(input);
}

function collectRelationshipEdges(
  input: CreateRelationshipEdgesInput,
  relationshipType?: DiscoveredResourceRelationshipType
): readonly ResourceEdge[] {
  const edges: ResourceEdge[] = [];
  const seenEdgeIds = new Set<string>();

  for (const resource of input.resources) {
    const sourceNode = input.nodeByProviderResourceId.get(resource.providerResourceId);
    if (!sourceNode) {
      continue;
    }

    for (const relationship of resource.relationships ?? []) {
      if (relationshipType && relationship.type !== relationshipType) {
        continue;
      }

      const targetResource = input.resourceByLookupId.get(relationship.targetResourceId);
      if (!targetResource) {
        continue;
      }

      const targetNode = input.nodeByProviderResourceId.get(targetResource.providerResourceId);
      if (!targetNode) {
        continue;
      }

      const edgeId = `candidate-edge-${relationship.type}-${sourceNode.id}-${targetNode.id}`;
      if (seenEdgeIds.has(edgeId)) {
        continue;
      }

      seenEdgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        label: relationship.label ?? relationship.type
      });
    }
  }

  return edges;
}

// 종류 기준 후보는 같은 Resource를 유지하되 관계선을 제거해서 목록 중심으로 보게 합니다.
function createProviderTypeArchitecture(architectureJson: ArchitectureJson): ArchitectureJson {
  return {
    nodes: architectureJson.nodes,
    edges: []
  };
}

function createNodeProviderResourceLookup(
  nodes: readonly ResourceNode[]
): ReadonlyMap<string, ResourceNode> {
  const lookup = new Map<string, ResourceNode>();

  for (const node of nodes) {
    const providerResourceId = getNodeProviderResourceId(node);
    if (providerResourceId) {
      lookup.set(providerResourceId, node);
    }
  }

  return lookup;
}

// ArchitectureJson 노드에서 AWS 원본 id만 안전하게 꺼냅니다.
function getNodeProviderResourceId(node: ResourceNode): string {
  const providerResourceId = node.config["providerResourceId"];
  return typeof providerResourceId === "string" ? providerResourceId : "";
}
