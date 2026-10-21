import {
  isReverseEngineeringInfrastructureFrameNode,
  REVERSE_ENGINEERING_INFRASTRUCTURE_FRAME_ID_PREFIX,
  type ArchitectureJson,
  type DiagramNode
} from "@sketchcatch/types";

export { isReverseEngineeringInfrastructureFrameNode };

type InfrastructureFrameGroupBy =
  NonNullable<
    NonNullable<DiagramNode["metadata"]>["reverseEngineeringInfrastructureFrame"]
  >["groupBy"];

type InfrastructureFrameGroup = {
  readonly groupBy: InfrastructureFrameGroupBy;
  readonly groupKey: string;
  readonly label: string;
  readonly memberNodeIds: readonly string[];
};

const FRAME_HORIZONTAL_PADDING = 40;
const FRAME_TITLE_PADDING = 64;
const FRAME_BOTTOM_PADDING = 40;
const FRAME_MEMBER_GAP = 24;
const TAG_PRIORITY = [
  { groupBy: "project", key: "Project", label: "프로젝트" },
  { groupBy: "service", key: "Service", label: "서비스" },
  { groupBy: "environment", key: "Environment", label: "환경" }
] as const;

/** gg: AWS 태그와 실제 관계만 사용해 Terraform 의미가 없는 표시 프레임을 만듭니다. */
export function createReverseEngineeringInfrastructureFrames(
  architecture: ArchitectureJson,
  resourceNodes: readonly DiagramNode[]
): DiagramNode[] {
  const resourceNodeById = new Map(
    resourceNodes
      .filter((node) => node.kind === "resource")
      .map((node) => [node.id, node])
  );
  const groups = createInfrastructureFrameGroups(architecture).filter((group) =>
    group.memberNodeIds.some((nodeId) => resourceNodeById.has(nodeId))
  );

  return groups.flatMap((group) => {
    const members = group.memberNodeIds.flatMap((nodeId) => {
      const node = resourceNodeById.get(nodeId);
      return node ? [node] : [];
    });

    return members.length === 0 ? [] : [createInfrastructureFrameNode(group, members)];
  });
}

/** gg: append에서 새로 붙는 실제 멤버만 감싸도록 표시 프레임 geometry와 소속을 다시 맞춥니다. */
export function fitReverseEngineeringInfrastructureFrameToMembers(
  frame: DiagramNode,
  members: readonly DiagramNode[],
  frameId = frame.id
): DiagramNode {
  const marker = frame.metadata?.reverseEngineeringInfrastructureFrame;
  if (!marker || members.length === 0) {
    return structuredClone(frame);
  }

  return {
    ...structuredClone(frame),
    id: frameId,
    ...createInfrastructureFrameGeometry(members),
    metadata: {
      ...structuredClone(frame.metadata),
      reverseEngineeringInfrastructureFrame: {
        ...structuredClone(marker),
        memberNodeIds: members.map((node) => node.id).sort()
      }
    }
  };
}

/** gg: 명시적 태그를 먼저 쓰고 VPC, 연결 관계, 공통 그룹 순서로 한 번만 소속시킵니다. */
function createInfrastructureFrameGroups(
  architecture: ArchitectureJson
): InfrastructureFrameGroup[] {
  const groupById = new Map<string, InfrastructureFrameGroup>();
  const groupIdByNodeId = new Map<string, string>();

  for (const node of [...architecture.nodes].sort(compareNodeId)) {
    const taggedGroup = findTaggedGroup(node.config);
    if (taggedGroup) {
      addNodeToGroup(taggedGroup, node.id, groupById, groupIdByNodeId);
    }
  }

  const vpcNodes = architecture.nodes
    .filter(isVpcArchitectureNode)
    .sort(compareNodeId);
  const vpcNodeIds = new Set(vpcNodes.map((node) => node.id));
  const vpcGroupIdByAlias = new Map<string, string>();

  for (const vpcNode of vpcNodes) {
    const existingGroupId = groupIdByNodeId.get(vpcNode.id);
    const groupId = existingGroupId ?? createGroupId({
      groupBy: "vpc",
      groupKey: readNonEmptyString(vpcNode.config["providerResourceId"]) ?? vpcNode.id
    });
    if (!existingGroupId) {
      addNodeToGroup(
        {
          groupBy: "vpc",
          groupKey: readNonEmptyString(vpcNode.config["providerResourceId"]) ?? vpcNode.id,
          label: `VPC · ${vpcNode.label ?? vpcNode.id}`
        },
        vpcNode.id,
        groupById,
        groupIdByNodeId
      );
    }

    for (const alias of createVpcAliases(vpcNode)) {
      vpcGroupIdByAlias.set(alias, groupId);
    }
  }

  for (const node of [...architecture.nodes].sort(compareNodeId)) {
    if (groupIdByNodeId.has(node.id)) {
      continue;
    }

    const vpcReference = findVpcReference(node.config);
    const vpcGroupId = vpcReference ? vpcGroupIdByAlias.get(vpcReference) : undefined;
    if (vpcGroupId) {
      addNodeToExistingGroup(vpcGroupId, node.id, groupById, groupIdByNodeId);
    }
  }

  for (const edge of architecture.edges) {
    if (!isContainmentEdge(edge.label) || groupIdByNodeId.has(edge.targetId)) {
      continue;
    }

    const sourceGroupId = groupIdByNodeId.get(edge.sourceId);
    if (sourceGroupId && vpcNodeIds.has(edge.sourceId)) {
      addNodeToExistingGroup(sourceGroupId, edge.targetId, groupById, groupIdByNodeId);
    }
  }

  propagateConnectedNodeGroups(
    architecture,
    groupById,
    groupIdByNodeId
  );

  const remainingNodeIds = architecture.nodes
    .map((node) => node.id)
    .filter((nodeId) => !groupIdByNodeId.has(nodeId))
    .sort();
  const remainingNodeIdSet = new Set(remainingNodeIds);
  const neighborIdsByNodeId = new Map<string, Set<string>>();

  for (const edge of architecture.edges) {
    if (!remainingNodeIdSet.has(edge.sourceId) || !remainingNodeIdSet.has(edge.targetId)) {
      continue;
    }

    addNeighbor(neighborIdsByNodeId, edge.sourceId, edge.targetId);
    addNeighbor(neighborIdsByNodeId, edge.targetId, edge.sourceId);
  }

  const visitedNodeIds = new Set<string>();
  for (const nodeId of remainingNodeIds) {
    if (visitedNodeIds.has(nodeId)) {
      continue;
    }

    const componentNodeIds = collectConnectedNodeIds(
      nodeId,
      neighborIdsByNodeId,
      visitedNodeIds
    );
    if (componentNodeIds.length < 2) {
      continue;
    }

    const group = {
      groupBy: "relationship",
      groupKey: componentNodeIds.join("|"),
      label: "함께 연결된 리소스"
    } as const;
    for (const componentNodeId of componentNodeIds) {
      addNodeToGroup(group, componentNodeId, groupById, groupIdByNodeId);
    }
  }

  const commonNodeIds = architecture.nodes
    .map((node) => node.id)
    .filter((nodeId) => !groupIdByNodeId.has(nodeId))
    .sort();
  for (const nodeId of commonNodeIds) {
    addNodeToGroup(
      { groupBy: "common", groupKey: "common", label: "공통 리소스" },
      nodeId,
      groupById,
      groupIdByNodeId
    );
  }

  return [...groupById.values()]
    .map((group) => ({
      ...group,
      memberNodeIds: [...group.memberNodeIds].sort()
    }))
    .sort((left, right) => createGroupId(left).localeCompare(createGroupId(right)));
}

/** gg: 태그가 없는 Resource는 이미 정해진 인프라와 실제로 연결됐을 때 그 프레임에 붙입니다. */
function propagateConnectedNodeGroups(
  architecture: ArchitectureJson,
  groupById: Map<string, InfrastructureFrameGroup>,
  groupIdByNodeId: Map<string, string>
): void {
  const architectureNodeIds = new Set(architecture.nodes.map((node) => node.id));

  while (true) {
    const candidateGroupIdsByNodeId = new Map<string, Set<string>>();

    for (const edge of [...architecture.edges].sort((left, right) => left.id.localeCompare(right.id))) {
      const sourceGroupId = groupIdByNodeId.get(edge.sourceId);
      const targetGroupId = groupIdByNodeId.get(edge.targetId);

      if (
        sourceGroupId &&
        !targetGroupId &&
        architectureNodeIds.has(edge.targetId)
      ) {
        addGroupCandidate(candidateGroupIdsByNodeId, edge.targetId, sourceGroupId);
      }
      if (
        targetGroupId &&
        !sourceGroupId &&
        architectureNodeIds.has(edge.sourceId)
      ) {
        addGroupCandidate(candidateGroupIdsByNodeId, edge.sourceId, targetGroupId);
      }
    }

    if (candidateGroupIdsByNodeId.size === 0) {
      return;
    }

    for (const [nodeId, candidateGroupIds] of [...candidateGroupIdsByNodeId.entries()].sort(
      ([left], [right]) => left.localeCompare(right)
    )) {
      const groupId = [...candidateGroupIds].sort((left, right) =>
        compareGroupPriority(left, right, groupById)
      )[0];
      if (groupId) {
        addNodeToExistingGroup(groupId, nodeId, groupById, groupIdByNodeId);
      }
    }
  }
}

/** gg: 한 Resource가 여러 프레임과 연결되면 태그 우선순위와 안정적인 ID로 하나를 고릅니다. */
function compareGroupPriority(
  leftGroupId: string,
  rightGroupId: string,
  groupById: ReadonlyMap<string, InfrastructureFrameGroup>
): number {
  const rank: Readonly<Record<InfrastructureFrameGroupBy, number>> = {
    project: 0,
    service: 1,
    environment: 2,
    vpc: 3,
    relationship: 4,
    common: 5
  };
  const left = groupById.get(leftGroupId);
  const right = groupById.get(rightGroupId);

  return (
    (left ? rank[left.groupBy] : Number.MAX_SAFE_INTEGER) -
      (right ? rank[right.groupBy] : Number.MAX_SAFE_INTEGER) ||
    leftGroupId.localeCompare(rightGroupId)
  );
}

/** gg: 실제 연결에서 찾은 프레임 후보를 Resource별로 중복 없이 모읍니다. */
function addGroupCandidate(
  candidateGroupIdsByNodeId: Map<string, Set<string>>,
  nodeId: string,
  groupId: string
): void {
  const candidateGroupIds = candidateGroupIdsByNodeId.get(nodeId) ?? new Set<string>();
  candidateGroupIds.add(groupId);
  candidateGroupIdsByNodeId.set(nodeId, candidateGroupIds);
}

/** gg: 한 Resource에서 가장 높은 우선순위의 사용자 태그 하나만 읽습니다. */
function findTaggedGroup(
  config: Readonly<Record<string, unknown>>
): Omit<InfrastructureFrameGroup, "memberNodeIds"> | undefined {
  const tags = collectTags(config);

  for (const tag of TAG_PRIORITY) {
    const value = tags.get(tag.key.toLowerCase());
    if (value) {
      return {
        groupBy: tag.groupBy,
        groupKey: value.toLowerCase(),
        label: `${tag.label} · ${value}`
      };
    }
  }

  return undefined;
}

/** gg: AWS SDK마다 다른 tags 모양을 같은 대소문자 없는 Map으로 줄입니다. */
function collectTags(config: Readonly<Record<string, unknown>>): Map<string, string> {
  const tags = new Map<string, string>();
  const observed = isRecord(config["reverseEngineeringObservedConfig"])
    ? config["reverseEngineeringObservedConfig"]
    : undefined;

  for (const candidate of [config["tags"], observed?.["tags"]]) {
    collectTagsFromValue(candidate, tags);
  }

  return tags;
}

/** gg: object와 key/value 배열을 모두 받아 비어 있지 않은 태그만 남깁니다. */
function collectTagsFromValue(value: unknown, tags: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isRecord(entry)) {
        continue;
      }

      const key = readNonEmptyString(entry["key"]) ?? readNonEmptyString(entry["Key"]);
      const tagValue =
        readNonEmptyString(entry["value"]) ?? readNonEmptyString(entry["Value"]);
      if (key && tagValue && !tags.has(key.toLowerCase())) {
        tags.set(key.toLowerCase(), tagValue);
      }
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, candidate] of Object.entries(value)) {
    const tagValue = readNonEmptyString(candidate);
    if (tagValue && !tags.has(key.toLowerCase())) {
      tags.set(key.toLowerCase(), tagValue);
    }
  }
}

/** gg: VPC Resource 자체와 provider/Terraform 이름을 같은 참조 후보로 만듭니다. */
function createVpcAliases(node: ArchitectureJson["nodes"][number]): string[] {
  const aliases = new Set<string>([node.id]);
  const providerResourceId = readNonEmptyString(node.config["providerResourceId"]);
  const terraformResourceName = readNonEmptyString(node.config["terraformResourceName"]);

  if (providerResourceId) {
    aliases.add(providerResourceId);
  }
  if (terraformResourceName) {
    aliases.add(terraformResourceName);
    aliases.add(`aws_vpc.${terraformResourceName}.id`);
    aliases.add(`aws_vpc.${terraformResourceName}.arn`);
  }

  return [...aliases];
}

/** gg: projected config와 관측 원본에서 직접 적힌 VPC ID만 찾습니다. */
function findVpcReference(config: Readonly<Record<string, unknown>>): string | undefined {
  const observed = isRecord(config["reverseEngineeringObservedConfig"])
    ? config["reverseEngineeringObservedConfig"]
    : undefined;

  for (const source of [config, observed]) {
    if (!source) {
      continue;
    }
    for (const key of ["vpcId", "vpc_id", "VpcId", "VPCId"]) {
      const value = readNonEmptyString(source[key]);
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

/** gg: VPC는 public type, provider type, Terraform type 중 하나가 맞으면 인식합니다. */
function isVpcArchitectureNode(node: ArchitectureJson["nodes"][number]): boolean {
  return (
    node.type === "VPC" ||
    node.config["providerResourceType"] === "AWS::EC2::VPC" ||
    node.config["terraformResourceType"] === "aws_vpc"
  );
}

/** gg: 실제 포함을 뜻하는 edge만 VPC 그룹 근거로 사용합니다. */
function isContainmentEdge(label: string | undefined): boolean {
  const normalized = label?.trim().toLowerCase();
  return normalized === "contains" || normalized === "hosts";
}

/** gg: 같은 그룹에 Resource를 한 번만 추가하고 기존 우선순위 소속은 바꾸지 않습니다. */
function addNodeToGroup(
  group: Omit<InfrastructureFrameGroup, "memberNodeIds">,
  nodeId: string,
  groupById: Map<string, InfrastructureFrameGroup>,
  groupIdByNodeId: Map<string, string>
): void {
  if (groupIdByNodeId.has(nodeId)) {
    return;
  }

  const groupId = createGroupId(group);
  const current = groupById.get(groupId);
  groupById.set(groupId, {
    ...group,
    memberNodeIds: [...(current?.memberNodeIds ?? []), nodeId]
  });
  groupIdByNodeId.set(nodeId, groupId);
}

/** gg: 이미 확정된 VPC 그룹에 직접 포함 Resource만 붙입니다. */
function addNodeToExistingGroup(
  groupId: string,
  nodeId: string,
  groupById: Map<string, InfrastructureFrameGroup>,
  groupIdByNodeId: Map<string, string>
): void {
  const group = groupById.get(groupId);
  if (!group || groupIdByNodeId.has(nodeId)) {
    return;
  }

  groupById.set(groupId, {
    ...group,
    memberNodeIds: [...group.memberNodeIds, nodeId]
  });
  groupIdByNodeId.set(nodeId, groupId);
}

/** gg: 연결 성분을 결정론적으로 찾아 실제 관계 기반 표시 그룹을 만듭니다. */
function collectConnectedNodeIds(
  startNodeId: string,
  neighborIdsByNodeId: ReadonlyMap<string, ReadonlySet<string>>,
  visitedNodeIds: Set<string>
): string[] {
  const queue = [startNodeId];
  const componentNodeIds: string[] = [];
  visitedNodeIds.add(startNodeId);

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }

    componentNodeIds.push(nodeId);
    for (const neighborId of [...(neighborIdsByNodeId.get(nodeId) ?? [])].sort()) {
      if (!visitedNodeIds.has(neighborId)) {
        visitedNodeIds.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  return componentNodeIds.sort();
}

/** gg: 양방향 연결 탐색용 인접 목록을 중복 없이 채웁니다. */
function addNeighbor(
  neighborIdsByNodeId: Map<string, Set<string>>,
  nodeId: string,
  neighborId: string
): void {
  const neighbors = neighborIdsByNodeId.get(nodeId) ?? new Set<string>();
  neighbors.add(neighborId);
  neighborIdsByNodeId.set(nodeId, neighbors);
}

/** gg: Resource 원본 좌표는 바꾸지 않고 모두 감싸는 고정 프레임 geometry를 계산합니다. */
function createInfrastructureFrameNode(
  group: InfrastructureFrameGroup,
  members: readonly DiagramNode[]
): DiagramNode {
  const geometry = createInfrastructureFrameGeometry(members);

  return {
    id: createGroupId(group),
    type: "design_group",
    kind: "design",
    ...geometry,
    label: group.label,
    locked: false,
    zIndex: Math.min(0, ...members.map((node) => node.zIndex - 1)),
    style: {
      borderColor: "#94a3b8",
      borderStyle: "dashed",
      textColor: "#334155"
    },
    metadata: {
      presentationCatalogItemId: "design-group",
      reverseEngineeringInfrastructureFrame: {
        source: "aws_scan",
        groupBy: group.groupBy,
        groupKey: group.groupKey,
        memberNodeIds: [...group.memberNodeIds].sort()
      }
    }
  };
}

/** gg: 표시 프레임의 공통 여백을 적용해 실제 멤버 전체를 감싸는 사각형을 계산합니다. */
function createInfrastructureFrameGeometry(
  members: readonly DiagramNode[]
): Pick<DiagramNode, "position" | "size"> {
  const left = Math.min(...members.map((node) => node.position.x));
  const top = Math.min(...members.map((node) => node.position.y));
  const right = Math.max(...members.map((node) => node.position.x + node.size.width));
  const bottom = Math.max(...members.map((node) => node.position.y + node.size.height));
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(members.length)));
  const rowCount = Math.ceil(members.length / columnCount);
  const maxMemberWidth = Math.max(...members.map((node) => node.size.width));
  const maxMemberHeight = Math.max(...members.map((node) => node.size.height));
  const minimumGridWidth =
    FRAME_HORIZONTAL_PADDING * 2 +
    maxMemberWidth * columnCount +
    FRAME_MEMBER_GAP * Math.max(0, columnCount - 1);
  const minimumGridHeight =
    FRAME_TITLE_PADDING +
    FRAME_BOTTOM_PADDING +
    maxMemberHeight * rowCount +
    FRAME_MEMBER_GAP * Math.max(0, rowCount - 1);

  return {
    position: {
      x: left - FRAME_HORIZONTAL_PADDING,
      y: top - FRAME_TITLE_PADDING
    },
    size: {
      width: Math.max(
        right - left + FRAME_HORIZONTAL_PADDING * 2,
        minimumGridWidth
      ),
      height: Math.max(
        bottom - top + FRAME_TITLE_PADDING + FRAME_BOTTOM_PADDING,
        minimumGridHeight
      )
    }
  };
}

/** gg: 표시 그룹의 종류와 근거를 짧고 안정적인 frame ID로 바꿉니다. */
function createGroupId(
  group: Pick<InfrastructureFrameGroup, "groupBy" | "groupKey">
): string {
  return `${REVERSE_ENGINEERING_INFRASTRUCTURE_FRAME_ID_PREFIX}${group.groupBy}:${createShortHash(
    group.groupKey
  )}`;
}

/** gg: 같은 AWS 원본은 다시 열어도 같은 frame ID를 갖도록 짧은 hash를 만듭니다. */
function createShortHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** gg: 그룹 생성 순서를 Architecture 배열 순서와 분리합니다. */
function compareNodeId(
  left: ArchitectureJson["nodes"][number],
  right: ArchitectureJson["nodes"][number]
): number {
  return left.id.localeCompare(right.id);
}

/** gg: 문자열 설정은 공백을 제거한 뒤 실제 값이 있을 때만 사용합니다. */
function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** gg: AWS SDK 응답 중 plain object만 안전하게 읽습니다. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
