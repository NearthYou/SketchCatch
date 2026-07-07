import type {
  ArchitectureJson,
  DiscoveredResource,
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

// AWS 스캔 결과를 사용자가 고를 수 있는 보드 후보 여러 개로 나눕니다.
export function createReverseEngineeringBoardCandidates(
  result: ReverseEngineeringScanResult
): readonly ReverseEngineeringBoardCandidate[] {
  const candidates = [
    ...createVpcCandidates(result),
    ...createS3Candidates(result),
    createFullScanCandidate(result)
  ];
  const seenIds = new Set<string>();

  return candidates.filter((candidate) => {
    if (seenIds.has(candidate.id) || candidate.nodeCount === 0) {
      return false;
    }

    seenIds.add(candidate.id);
    return true;
  });
}

// 사용자가 고른 후보만 미리보기와 적용에 쓰이도록 scan result를 좁힙니다.
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

// VPC는 보통 Subnet, EC2, RDS를 안에 담는 큰 박스라서 독립 후보로 만듭니다.
function createVpcCandidates(result: ReverseEngineeringScanResult): ReverseEngineeringBoardCandidate[] {
  const resources = result.discoveredResources.filter((resource) => resource.resourceType === "VPC");

  return resources.flatMap((resource) => {
    const providerResourceIds = collectContainedProviderResourceIds(resource, result.discoveredResources);
    const architectureJson = pickArchitectureByProviderResourceIds(result.architectureJson, providerResourceIds);

    if (architectureJson.nodes.length <= 1) {
      return [];
    }

    return [
      createCandidate({
        architectureJson,
        description: "VPC 안에 들어있는 리소스를 한 묶음으로 보여줍니다.",
        id: `candidate-vpc-${toCandidateIdPart(resource.providerResourceId)}`,
        title: `${resource.displayName} 중심 구조`
      })
    ];
  });
}

// S3는 VPC 밖에 단독으로 있는 경우가 많아서 별도 후보로 보여줍니다.
function createS3Candidates(result: ReverseEngineeringScanResult): ReverseEngineeringBoardCandidate[] {
  const resources = result.discoveredResources.filter((resource) => resource.resourceType === "S3");

  return resources.flatMap((resource) => {
    const architectureJson = pickArchitectureByProviderResourceIds(result.architectureJson, [
      resource.providerResourceId
    ]);

    if (architectureJson.nodes.length === 0) {
      return [];
    }

    return [
      createCandidate({
        architectureJson,
        description: "S3처럼 독립적으로 쓰이는 리소스를 따로 보여줍니다.",
        id: `candidate-s3-${toCandidateIdPart(resource.providerResourceId)}`,
        title: `${resource.displayName} 단독 구조`
      })
    ];
  });
}

// 어떤 기준으로도 나누기 어렵거나, 사용자가 전체를 보고 싶을 때 쓰는 기본 후보입니다.
function createFullScanCandidate(result: ReverseEngineeringScanResult): ReverseEngineeringBoardCandidate {
  return createCandidate({
    architectureJson: result.architectureJson,
    description: "이번 스캔에서 찾은 리소스를 모두 보여줍니다.",
    id: "candidate-full-scan",
    title: "전체 스캔 결과"
  });
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

// contains 관계를 따라가며 VPC 안에 들어가는 하위 리소스까지 모두 모읍니다.
function collectContainedProviderResourceIds(
  rootResource: DiscoveredResource,
  resources: readonly DiscoveredResource[]
): readonly string[] {
  const resourceByLookupId = createResourceLookup(resources);
  const visitedResourceIds = new Set<string>();
  const providerResourceIds = new Set<string>();
  const visitQueue: DiscoveredResource[] = [rootResource];

  while (visitQueue.length > 0) {
    const currentResource = visitQueue.shift();

    if (!currentResource || visitedResourceIds.has(currentResource.id)) {
      continue;
    }

    visitedResourceIds.add(currentResource.id);
    providerResourceIds.add(currentResource.providerResourceId);

    for (const relationship of currentResource.relationships ?? []) {
      if (relationship.type !== "contains") {
        continue;
      }

      const targetResource = resourceByLookupId.get(relationship.targetResourceId);
      if (targetResource) {
        visitQueue.push(targetResource);
      }
    }
  }

  return [...providerResourceIds];
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

// 후보에 포함된 AWS 원본 id에 해당하는 보드 노드와 선만 남깁니다.
function pickArchitectureByProviderResourceIds(
  architectureJson: ArchitectureJson,
  providerResourceIds: readonly string[]
): ArchitectureJson {
  const providerResourceIdSet = new Set(providerResourceIds);
  const nodes = architectureJson.nodes.filter((node) =>
    providerResourceIdSet.has(getNodeProviderResourceId(node))
  );
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: architectureJson.edges.filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
    )
  };
}

// ArchitectureJson 노드에서 AWS 원본 id만 안전하게 꺼냅니다.
function getNodeProviderResourceId(node: ResourceNode): string {
  const providerResourceId = node.config["providerResourceId"];
  return typeof providerResourceId === "string" ? providerResourceId : "";
}

// AWS id에는 slash나 colon이 들어갈 수 있어서 HTML id로 쓰기 쉬운 형태로 바꿉니다.
function toCandidateIdPart(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}
