import type {
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramPoint,
  DiagramVariable
} from "@sketchcatch/types";
import { isAreaNode } from "../diagram-editor/area-nodes";
import {
  ARCHITECTURE_BOARD_MODULE_PATTERN_EXTRACTOR_VERSION,
  type ArchitectureBoardModulePattern,
  type ArchitectureBoardModulePatternLens
} from "./architecture-board-knowledge-contract";

export type ArchitectureBoardModulePatternSourceDiagram = {
  readonly id: string;
  readonly diagram: DiagramJson;
};

export type ArchitectureBoardModulePatternSeed = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly lenses: readonly ArchitectureBoardModulePatternLens[];
  readonly requiredResourceTypeGroups: readonly (readonly string[])[];
  readonly includedResourceTypes: readonly string[];
  readonly traverseContainmentRelationships?: boolean;
};

export type ArchitectureBoardModulePatternCandidate = {
  readonly sourceTemplateId: string;
  readonly structuralFingerprint: string;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
  readonly variables: readonly DiagramVariable[];
  readonly dependencyResourceCount: number;
};

const MODULE_PATTERN_SEEDS: readonly ArchitectureBoardModulePatternSeed[] = [
  {
    id: "network-foundation",
    title: "Network Foundation",
    description: "격리 네트워크, Subnet, 인터넷 경로를 함께 구성합니다.",
    lenses: [
      { kind: "functional", key: "network", label: "네트워크" },
      { kind: "purpose", key: "isolated-network-foundation", label: "격리 네트워크 기반" }
    ],
    requiredResourceTypeGroups: [["aws_vpc"], ["aws_subnet"]],
    traverseContainmentRelationships: true,
    includedResourceTypes: [
      "aws_eip",
      "aws_flow_log",
      "aws_internet_gateway",
      "aws_nat_gateway",
      "aws_network_acl",
      "aws_route_table",
      "aws_route_table_association",
      "aws_subnet",
      "aws_vpc"
    ]
  },
  {
    id: "static-web-delivery",
    title: "Static Web Delivery",
    description: "객체 스토리지 원본을 CDN으로 안전하게 전달합니다.",
    lenses: [
      { kind: "functional", key: "traffic", label: "트래픽" },
      { kind: "functional", key: "storage", label: "스토리지" },
      { kind: "purpose", key: "static-web-delivery", label: "정적 웹 배포" }
    ],
    requiredResourceTypeGroups: [["aws_cloudfront_distribution"], ["aws_s3_bucket"]],
    includedResourceTypes: [
      "aws_cloudfront_distribution",
      "aws_cloudfront_origin_access_control",
      "aws_cloudfront_origin_access_identity",
      "aws_route53_record",
      "aws_route53_zone",
      "aws_s3_bucket",
      "aws_s3_bucket_acl",
      "aws_s3_bucket_policy",
      "aws_s3_bucket_public_access_block",
      "aws_s3_bucket_versioning",
      "aws_s3_bucket_website_configuration"
    ]
  },
  {
    id: "serverless-api",
    title: "Serverless API",
    description: "API endpoint, 함수 실행, 데이터 저장 관계를 구성합니다.",
    lenses: [
      { kind: "functional", key: "compute", label: "컴퓨트" },
      { kind: "purpose", key: "backend-api", label: "백엔드 API" }
    ],
    requiredResourceTypeGroups: [
      ["aws_api_gateway_rest_api", "aws_apigatewayv2_api"],
      ["aws_lambda_function"]
    ],
    includedResourceTypes: [
      "aws_api_gateway_authorizer",
      "aws_api_gateway_deployment",
      "aws_api_gateway_integration",
      "aws_api_gateway_integration_response",
      "aws_api_gateway_method",
      "aws_api_gateway_method_response",
      "aws_api_gateway_resource",
      "aws_api_gateway_rest_api",
      "aws_api_gateway_stage",
      "aws_apigatewayv2_api",
      "aws_cloudwatch_log_group",
      "aws_docdb_cluster",
      "aws_dynamodb_global_table",
      "aws_dynamodb_table",
      "aws_lambda_function",
      "aws_lambda_permission",
      "aws_sqs_queue"
    ]
  },
  {
    id: "container-runtime",
    title: "Container Runtime",
    description: "Container cluster, task definition, service 실행 관계를 구성합니다.",
    lenses: [
      { kind: "functional", key: "compute", label: "컴퓨트" },
      { kind: "purpose", key: "container-operations", label: "컨테이너 운영" }
    ],
    requiredResourceTypeGroups: [
      ["aws_ecs_cluster"],
      ["aws_ecs_task_definition"],
      ["aws_ecs_service"]
    ],
    includedResourceTypes: [
      "aws_cloudwatch_log_group",
      "aws_ecr_repository",
      "aws_ecs_cluster",
      "aws_ecs_service",
      "aws_ecs_task_definition",
      "aws_iam_role",
      "aws_iam_role_policy_attachment",
      "aws_lb",
      "aws_lb_listener",
      "aws_lb_target_group",
      "aws_security_group"
    ]
  },
  {
    id: "load-balanced-compute",
    title: "Load Balanced Compute",
    description: "Load balancer와 확장 가능한 compute target의 흐름을 구성합니다.",
    lenses: [
      { kind: "functional", key: "traffic", label: "트래픽" },
      { kind: "functional", key: "compute", label: "컴퓨트" },
      { kind: "purpose", key: "high-availability-web", label: "고가용성 웹 계층" }
    ],
    requiredResourceTypeGroups: [
      ["aws_elb", "aws_lb"],
      ["aws_autoscaling_group", "aws_ecs_service", "aws_instance"]
    ],
    includedResourceTypes: [
      "aws_autoscaling_group",
      "aws_elb",
      "aws_instance",
      "aws_launch_configuration",
      "aws_launch_template",
      "aws_lb",
      "aws_lb_listener",
      "aws_lb_target_group",
      "aws_lb_target_group_attachment",
      "aws_security_group"
    ]
  },
  {
    id: "relational-data-layer",
    title: "Relational Data Layer",
    description: "Database, subnet group, 보안 경계를 하나의 데이터 계층으로 구성합니다.",
    lenses: [
      { kind: "functional", key: "database", label: "데이터베이스" },
      { kind: "purpose", key: "relational-data-layer", label: "관계형 데이터 계층" }
    ],
    requiredResourceTypeGroups: [["aws_db_instance", "aws_docdb_cluster", "aws_rds_cluster"]],
    includedResourceTypes: [
      "aws_db_instance",
      "aws_db_parameter_group",
      "aws_db_subnet_group",
      "aws_docdb_cluster",
      "aws_rds_cluster",
      "aws_secretsmanager_secret",
      "aws_security_group",
      "aws_subnet",
      "aws_vpc"
    ]
  },
  {
    id: "secure-object-storage",
    title: "Secure Object Storage",
    description: "Object storage의 접근 차단, 암호화, versioning 관계를 구성합니다.",
    lenses: [
      { kind: "functional", key: "storage", label: "스토리지" },
      { kind: "functional", key: "security", label: "보안" },
      { kind: "purpose", key: "protected-object-storage", label: "보호된 객체 스토리지" }
    ],
    requiredResourceTypeGroups: [
      ["aws_s3_bucket"],
      [
        "aws_s3_bucket_acl",
        "aws_s3_bucket_policy",
        "aws_s3_bucket_public_access_block",
        "aws_s3_bucket_server_side_encryption_configuration",
        "aws_s3_bucket_versioning"
      ]
    ],
    includedResourceTypes: [
      "aws_iam_role",
      "aws_s3_bucket",
      "aws_s3_bucket_acl",
      "aws_s3_bucket_lifecycle_configuration",
      "aws_s3_bucket_logging",
      "aws_s3_bucket_notification",
      "aws_s3_bucket_policy",
      "aws_s3_bucket_public_access_block",
      "aws_s3_bucket_replication_configuration",
      "aws_s3_bucket_server_side_encryption_configuration",
      "aws_s3_bucket_versioning",
      "aws_sns_topic"
    ]
  },
  {
    id: "identity-access-boundary",
    title: "Identity Access Boundary",
    description: "Identity, group, policy attachment 관계로 접근 경계를 구성합니다.",
    lenses: [
      { kind: "functional", key: "security", label: "보안" },
      { kind: "purpose", key: "access-control", label: "접근 권한 관리" }
    ],
    requiredResourceTypeGroups: [["aws_iam_group"], ["aws_iam_user"]],
    includedResourceTypes: [
      "aws_iam_group",
      "aws_iam_group_policy_attachment",
      "aws_iam_policy",
      "aws_iam_user",
      "aws_iam_user_group_membership",
      "aws_iam_user_login_profile"
    ]
  },
  {
    id: "operations-monitoring",
    title: "Operations Monitoring",
    description: "Metric alarm, scaling signal, log 또는 budget 관측 구성을 묶습니다.",
    lenses: [
      { kind: "functional", key: "operations", label: "운영" },
      { kind: "purpose", key: "operational-observability", label: "운영 모니터링" }
    ],
    requiredResourceTypeGroups: [["aws_cloudwatch_metric_alarm"]],
    includedResourceTypes: [
      "aws_autoscaling_policy",
      "aws_budgets_budget",
      "aws_cloudwatch_log_group",
      "aws_cloudwatch_metric_alarm"
    ]
  },
  {
    id: "container-image-delivery",
    title: "Container Image Delivery",
    description: "Container image 저장소와 task 실행 정의를 연결해 배포 입력을 구성합니다.",
    lenses: [
      { kind: "functional", key: "delivery", label: "딜리버리" },
      { kind: "purpose", key: "container-image-delivery", label: "컨테이너 이미지 배포" }
    ],
    requiredResourceTypeGroups: [["aws_ecr_repository"], ["aws_ecs_task_definition"]],
    includedResourceTypes: [
      "aws_cloudwatch_log_group",
      "aws_ecr_repository",
      "aws_ecs_task_definition"
    ]
  }
];

export function extractArchitectureBoardModulePatterns(
  sources: readonly ArchitectureBoardModulePatternSourceDiagram[]
): readonly ArchitectureBoardModulePattern[] {
  return MODULE_PATTERN_SEEDS.map((seed) => {
    const candidates = sources.flatMap((source) =>
      extractArchitectureBoardModulePatternCandidates(seed, source)
    );

    if (candidates.length === 0) {
      throw new Error(`No Template candidate matched Module pattern seed: ${seed.id}`);
    }

    const selectedGroup = selectArchitectureBoardModulePatternStructuralGroup(candidates);
    const representative = selectArchitectureBoardModulePatternGeometryMedoid(selectedGroup);
    const normalized = normalizeCandidate(representative);

    const pattern: ArchitectureBoardModulePattern = {
      id: seed.id,
      title: seed.title,
      description: seed.description,
      lenses: seed.lenses.map((lens) => ({ ...lens })),
      structuralFingerprint: representative.structuralFingerprint,
      nodes: normalized.nodes,
      edges: normalized.edges,
      variables: normalized.variables,
      provenance: {
        extractorVersion: ARCHITECTURE_BOARD_MODULE_PATTERN_EXTRACTOR_VERSION,
        representativeTemplateId: representative.sourceTemplateId,
        sourceTemplateIds: [
          ...new Set(selectedGroup.map(({ sourceTemplateId }) => sourceTemplateId))
        ].sort()
      }
    };
    return pattern;
  }).sort((left, right) => left.id.localeCompare(right.id));
}

export function extractArchitectureBoardModulePatternCandidates(
  seed: ArchitectureBoardModulePatternSeed,
  source: ArchitectureBoardModulePatternSourceDiagram
): readonly ArchitectureBoardModulePatternCandidate[] {
  const nodeById = new Map(source.diagram.nodes.map((node) => [node.id, node]));
  const includedTypes = new Set(seed.includedResourceTypes);
  const eligibleIds = new Set(
    source.diagram.nodes
      .filter((node) => node.kind === "resource" && includedTypes.has(resourceTypeOf(node)))
      .map(({ id }) => id)
  );

  return discoverRootedOccurrences(eligibleIds, seed, source.diagram, nodeById)
    .sort((left, right) => compareComponents(left, right, source.diagram, nodeById))
    .map((component) => {
      const selectedIds = new Set(component);
      addCandidateDependencies(selectedIds, source.diagram, nodeById, source.id);

      const nodes = source.diagram.nodes
        .filter(({ id }) => selectedIds.has(id))
        .map(cloneValue)
        .sort((left, right) => left.id.localeCompare(right.id));
      const fittedNodes = refitSelectedPresentationAncestors(nodes, source.diagram.nodes);
      const edges = source.diagram.edges
        .filter(
          ({ sourceNodeId, targetNodeId }) =>
            selectedIds.has(sourceNodeId) && selectedIds.has(targetNodeId)
        )
        .map(cloneValue)
        .sort((left, right) => left.id.localeCompare(right.id));
      const variables = (source.diagram.variables ?? [])
        .filter((variable) => variable.bindings.some(({ nodeId }) => selectedIds.has(nodeId)))
        .map(cloneValue)
        .sort((left, right) => left.id.localeCompare(right.id));

      return {
        sourceTemplateId: source.id,
        structuralFingerprint: createArchitectureBoardModulePatternStructuralFingerprint(
          fittedNodes,
          edges
        ),
        nodes: fittedNodes,
        edges,
        variables,
        dependencyResourceCount: nodes.filter(
          (node) => node.kind === "resource" && !component.has(node.id)
        ).length
      };
    })
    .filter((candidate) => !duplicatesWholeDeployableGraph(candidate, source.diagram));
}

function duplicatesWholeDeployableGraph(
  candidate: ArchitectureBoardModulePatternCandidate,
  source: DiagramJson
): boolean {
  const sourceResourceIds = new Set(
    source.nodes.filter(({ kind }) => kind === "resource").map(({ id }) => id)
  );
  const candidateResourceIds = new Set(
    candidate.nodes.filter(({ kind }) => kind === "resource").map(({ id }) => id)
  );
  if (
    candidateResourceIds.size !== sourceResourceIds.size ||
    [...sourceResourceIds].some((id) => !candidateResourceIds.has(id))
  ) {
    return false;
  }

  const sourceResourceEdgeIds = new Set(
    source.edges
      .filter(
        ({ sourceNodeId, targetNodeId }) =>
          sourceResourceIds.has(sourceNodeId) && sourceResourceIds.has(targetNodeId)
      )
      .map(({ id }) => id)
  );
  const candidateResourceEdgeIds = new Set(
    candidate.edges
      .filter(
        ({ sourceNodeId, targetNodeId }) =>
          candidateResourceIds.has(sourceNodeId) && candidateResourceIds.has(targetNodeId)
      )
      .map(({ id }) => id)
  );
  return (
    candidateResourceEdgeIds.size === sourceResourceEdgeIds.size &&
    [...sourceResourceEdgeIds].every((id) => candidateResourceEdgeIds.has(id))
  );
}

function refitSelectedPresentationAncestors(
  selectedNodes: readonly DiagramNode[],
  sourceNodes: readonly DiagramNode[]
): DiagramNode[] {
  const sourceNodeById = new Map(sourceNodes.map((node) => [node.id, node]));
  const nextNodeById = new Map(selectedNodes.map((node) => [node.id, cloneValue(node)]));
  const areas = selectedNodes
    .filter(isAreaNode)
    .sort(
      (left, right) =>
        presentationDepth(right, sourceNodeById) - presentationDepth(left, sourceNodeById) ||
        left.id.localeCompare(right.id)
    );

  for (const area of areas) {
    const currentArea = nextNodeById.get(area.id);
    const sourceArea = sourceNodeById.get(area.id);
    if (!currentArea || !sourceArea) continue;
    const selectedChildren = [...nextNodeById.values()].filter(
      ({ metadata }) => metadata?.parentAreaNodeId === area.id
    );
    const sourceChildren = sourceNodes.filter(
      ({ metadata }) => metadata?.parentAreaNodeId === area.id
    );
    if (selectedChildren.length === 0 || sourceChildren.length === 0) continue;

    const sourceRight = sourceArea.position.x + sourceArea.size.width;
    const sourceBottom = sourceArea.position.y + sourceArea.size.height;
    const leftInset = minNonNegative(
      sourceChildren.map((child) => child.position.x - sourceArea.position.x)
    );
    const topInset = minNonNegative(
      sourceChildren.map((child) => child.position.y - sourceArea.position.y)
    );
    const rightInset = minNonNegative(
      sourceChildren.map((child) => sourceRight - child.position.x - child.size.width)
    );
    const bottomInset = minNonNegative(
      sourceChildren.map((child) => sourceBottom - child.position.y - child.size.height)
    );
    const left = Math.min(...selectedChildren.map(({ position }) => position.x)) - leftInset;
    const top = Math.min(...selectedChildren.map(({ position }) => position.y)) - topInset;
    const right =
      Math.max(...selectedChildren.map(({ position, size }) => position.x + size.width)) +
      rightInset;
    const bottom =
      Math.max(...selectedChildren.map(({ position, size }) => position.y + size.height)) +
      bottomInset;
    nextNodeById.set(area.id, {
      ...currentArea,
      position: { x: normalizeNumber(left), y: normalizeNumber(top) },
      size: {
        width: normalizeNumber(right - left),
        height: normalizeNumber(bottom - top)
      }
    });
  }

  return selectedNodes.map((node) => nextNodeById.get(node.id) ?? cloneValue(node));
}

function presentationDepth(node: DiagramNode, nodeById: ReadonlyMap<string, DiagramNode>): number {
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

function minNonNegative(values: readonly number[]): number {
  const nonNegative = values.filter((value) => value >= 0);
  return nonNegative.length === 0 ? 0 : Math.min(...nonNegative);
}

function addParentChain(
  nodeId: string,
  eligibleIds: Set<string>,
  nodeById: ReadonlyMap<string, DiagramNode>,
  sourceTemplateId: string
): void {
  const visited = new Set<string>();
  let parentId = nodeById.get(nodeId)?.metadata?.parentAreaNodeId;

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodeById.get(parentId);
    if (!parent) {
      throw new Error(`Template ${sourceTemplateId} has unresolved parent Area ${parentId}.`);
    }
    eligibleIds.add(parentId);
    parentId = parent.metadata?.parentAreaNodeId;
  }
}

function discoverRootedOccurrences(
  eligibleIds: ReadonlySet<string>,
  seed: ArchitectureBoardModulePatternSeed,
  diagram: DiagramJson,
  nodeById: ReadonlyMap<string, DiagramNode>
): Set<string>[] {
  const adjacency = new Map([...eligibleIds].map((id) => [id, new Set<string>()]));
  const connect = (source: string, target: string): void => {
    if (!eligibleIds.has(source) || !eligibleIds.has(target)) return;
    adjacency.get(source)?.add(target);
  };
  const connectBothWays = (left: string, right: string): void => {
    if (!eligibleIds.has(left) || !eligibleIds.has(right)) return;
    adjacency.get(left)?.add(right);
    adjacency.get(right)?.add(left);
  };

  for (const edge of diagram.edges) {
    if (!seed.traverseContainmentRelationships && isContainmentRelationship(edge)) continue;
    connect(edge.sourceNodeId, edge.targetNodeId);
  }
  const nodeIdByTerraformAddress = createNodeIdByTerraformAddress(nodeById.values());
  for (const nodeId of eligibleIds) {
    const node = nodeById.get(nodeId);
    for (const address of extractTerraformResourceAddresses(node?.parameters?.values)) {
      const dependencyId = nodeIdByTerraformAddress.get(address);
      if (dependencyId) connect(nodeId, dependencyId);
    }
  }
  for (const variable of diagram.variables ?? []) {
    const boundIds = variable.bindings
      .map(({ nodeId }) => nodeId)
      .filter((nodeId) => eligibleIds.has(nodeId));
    for (const left of boundIds) {
      for (const right of boundIds) connectBothWays(left, right);
    }
  }

  const occurrences = [...eligibleIds]
    .sort()
    .map((start) => {
      const occurrence = new Set<string>();
      const remaining = new Set(eligibleIds);
      const pending = [start];
      while (pending.length > 0) {
        const current = pending.pop()!;
        if (!remaining.delete(current)) continue;
        occurrence.add(current);
        pending.push(...[...(adjacency.get(current) ?? [])].sort().reverse());
      }
      return occurrence;
    })
    .filter((ids) => matchesRequiredResourceTypes(ids, seed, nodeById));
  return [
    ...new Map(
      occurrences.map((occurrence) => [[...occurrence].sort().join("|"), occurrence] as const)
    ).values()
  ];
}

function addCandidateDependencies(
  selectedIds: Set<string>,
  diagram: DiagramJson,
  nodeById: ReadonlyMap<string, DiagramNode>,
  sourceTemplateId: string
): void {
  const nodeIdByTerraformAddress = createNodeIdByTerraformAddress(nodeById.values());
  let changed = true;

  while (changed) {
    changed = false;
    const sizeBeforeParents = selectedIds.size;
    for (const nodeId of [...selectedIds]) {
      addParentChain(nodeId, selectedIds, nodeById, sourceTemplateId);
    }
    if (selectedIds.size !== sizeBeforeParents) changed = true;
    for (const nodeId of [...selectedIds]) {
      const node = nodeById.get(nodeId);
      for (const address of extractTerraformResourceAddresses(node?.parameters?.values)) {
        const dependencyId = nodeIdByTerraformAddress.get(address);
        if (!dependencyId) {
          throw new Error(
            `Template ${sourceTemplateId} has unresolved Terraform reference ${address}.`
          );
        }
        if (!selectedIds.has(dependencyId)) {
          selectedIds.add(dependencyId);
          changed = true;
        }
      }
    }
    for (const variable of diagram.variables ?? []) {
      if (!variable.bindings.some(({ nodeId }) => selectedIds.has(nodeId))) continue;
      for (const binding of variable.bindings) {
        if (!nodeById.has(binding.nodeId)) {
          throw new Error(
            `Template ${sourceTemplateId} variable ${variable.id} has unresolved binding ${binding.nodeId}.`
          );
        }
        if (!selectedIds.has(binding.nodeId)) {
          selectedIds.add(binding.nodeId);
          changed = true;
        }
      }
    }
  }
}

function createNodeIdByTerraformAddress(nodes: Iterable<DiagramNode>): ReadonlyMap<string, string> {
  return new Map(
    [...nodes].flatMap((node) => {
      const parameters = node.parameters;
      return parameters
        ? [
            [
              `${parameters.terraformBlockType === "data" ? "data." : ""}${parameters.resourceType}.${parameters.resourceName}`,
              node.id
            ] as const
          ]
        : [];
    })
  );
}

function extractTerraformResourceAddresses(value: unknown): string[] {
  if (typeof value === "string") {
    return [...value.matchAll(/(?:data\.)?(?:aws|kubernetes)_[a-z0-9_]+\.[a-z0-9_]+/g)].map(
      ([address]) => address
    );
  }
  if (Array.isArray(value)) return value.flatMap(extractTerraformResourceAddresses);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(extractTerraformResourceAddresses);
  }
  return [];
}

function isContainmentRelationship(edge: DiagramEdge): boolean {
  return edge.label?.trim().toLowerCase() === "contains";
}

function matchesRequiredResourceTypes(
  nodeIds: ReadonlySet<string>,
  seed: ArchitectureBoardModulePatternSeed,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  const types = new Set(
    [...nodeIds]
      .map((id) => nodeById.get(id))
      .filter((node): node is DiagramNode => node?.kind === "resource")
      .map(resourceTypeOf)
  );
  return seed.requiredResourceTypeGroups.every((group) => group.some((type) => types.has(type)));
}

function compareComponents(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
  diagram: DiagramJson,
  nodeById: ReadonlyMap<string, DiagramNode>
): number {
  const resourceCount = (ids: ReadonlySet<string>): number =>
    [...ids].filter((id) => nodeById.get(id)?.kind === "resource").length;
  const edgeCount = (ids: ReadonlySet<string>): number =>
    diagram.edges.filter(
      ({ sourceNodeId, targetNodeId }) => ids.has(sourceNodeId) && ids.has(targetNodeId)
    ).length;
  return (
    edgeCount(right) - edgeCount(left) ||
    resourceCount(right) - resourceCount(left) ||
    [...left]
      .sort()
      .join("|")
      .localeCompare([...right].sort().join("|"))
  );
}

export function createArchitectureBoardModulePatternStructuralFingerprint(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[]
): string {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const structuralRoles = createNodeStructuralRoles(nodes, edges);
  const nodeSignatures = nodes.map((node) => structuralRoleKey(node, structuralRoles)).sort();
  const edgeSignatures = edges
    .map((edge) => {
      const source = nodeById.get(edge.sourceNodeId);
      const target = nodeById.get(edge.targetNodeId);
      if (!source || !target) {
        throw new Error(`Module pattern edge ${edge.id} has an unresolved endpoint.`);
      }
      return `${structuralRoleKey(source, structuralRoles)}>${edgeStructuralSignature(
        edge
      )}>${structuralRoleKey(target, structuralRoles)}`;
    })
    .sort();
  const parentSignatures = nodes
    .flatMap((node) => {
      const parentId = node.metadata?.parentAreaNodeId;
      const parent = parentId ? nodeById.get(parentId) : undefined;
      if (parentId && !parent) {
        throw new Error(`Module pattern node ${node.id} has an unresolved parent Area.`);
      }
      return parent
        ? [
            `${structuralRoleKey(node, structuralRoles)}>${structuralRoleKey(
              parent,
              structuralRoles
            )}`
          ]
        : [];
    })
    .sort();
  return fnv1a(
    stableSerialize({ edges: edgeSignatures, nodes: nodeSignatures, parents: parentSignatures })
  );
}

export function selectArchitectureBoardModulePatternStructuralGroup(
  candidates: readonly ArchitectureBoardModulePatternCandidate[]
): readonly ArchitectureBoardModulePatternCandidate[] {
  const groupsByFingerprint = new Map<string, ArchitectureBoardModulePatternCandidate[][]>();
  for (const candidate of candidates) {
    const groups = groupsByFingerprint.get(candidate.structuralFingerprint) ?? [];
    const exactGroup = groups.find((group) =>
      areArchitectureBoardModulePatternStructuresEquivalent(
        group[0]!.nodes,
        group[0]!.edges,
        candidate.nodes,
        candidate.edges
      )
    );
    if (exactGroup) exactGroup.push(candidate);
    else groups.push([candidate]);
    groupsByFingerprint.set(candidate.structuralFingerprint, groups);
  }

  return [...groupsByFingerprint.values()].flat().sort((left, right) => {
    const leftDependencies = Math.min(
      ...left.map(({ dependencyResourceCount }) => dependencyResourceCount)
    );
    const rightDependencies = Math.min(
      ...right.map(({ dependencyResourceCount }) => dependencyResourceCount)
    );
    const leftEdges = Math.max(...left.map(({ edges }) => edges.length));
    const rightEdges = Math.max(...right.map(({ edges }) => edges.length));
    const leftNodes = Math.max(...left.map(({ nodes }) => nodes.length));
    const rightNodes = Math.max(...right.map(({ nodes }) => nodes.length));
    return (
      right.length - left.length ||
      leftDependencies - rightDependencies ||
      rightEdges - leftEdges ||
      rightNodes - leftNodes ||
      left[0]!.structuralFingerprint.localeCompare(right[0]!.structuralFingerprint) ||
      left[0]!.sourceTemplateId.localeCompare(right[0]!.sourceTemplateId)
    );
  })[0]!;
}

export function areArchitectureBoardModulePatternStructuresEquivalent(
  leftNodes: readonly DiagramNode[],
  leftEdges: readonly DiagramEdge[],
  rightNodes: readonly DiagramNode[],
  rightEdges: readonly DiagramEdge[]
): boolean {
  if (leftNodes.length !== rightNodes.length || leftEdges.length !== rightEdges.length) {
    return false;
  }
  const left = createExactStructuralGraph(leftNodes, leftEdges);
  const right = createExactStructuralGraph(rightNodes, rightEdges);
  const rightNodeIdsBySignature = new Map<string, string[]>();
  for (const node of rightNodes) {
    const signature = right.localSignatureByNodeId.get(node.id)!;
    const ids = rightNodeIdsBySignature.get(signature) ?? [];
    ids.push(node.id);
    rightNodeIdsBySignature.set(signature, ids);
  }
  const leftOrder = [...leftNodes]
    .sort((leftNode, rightNode) => {
      const leftCandidates =
        rightNodeIdsBySignature.get(left.localSignatureByNodeId.get(leftNode.id)!)?.length ?? 0;
      const rightCandidates =
        rightNodeIdsBySignature.get(left.localSignatureByNodeId.get(rightNode.id)!)?.length ?? 0;
      return (
        leftCandidates - rightCandidates ||
        left.relationCountByNodeId.get(rightNode.id)! -
          left.relationCountByNodeId.get(leftNode.id)! ||
        leftNode.id.localeCompare(rightNode.id)
      );
    })
    .map(({ id }) => id);
  if (
    leftOrder.some(
      (nodeId) => !rightNodeIdsBySignature.has(left.localSignatureByNodeId.get(nodeId)!)
    )
  ) {
    return false;
  }

  const mapping = new Map<string, string>();
  const usedRightIds = new Set<string>();
  const matchNext = (index: number): boolean => {
    if (index === leftOrder.length) return true;
    const leftId = leftOrder[index]!;
    const candidates = rightNodeIdsBySignature.get(left.localSignatureByNodeId.get(leftId)!) ?? [];
    for (const rightId of candidates) {
      if (usedRightIds.has(rightId)) continue;
      if (getExactRelations(left, leftId, leftId) !== getExactRelations(right, rightId, rightId)) {
        continue;
      }
      const conflicts = [...mapping].some(
        ([mappedLeftId, mappedRightId]) =>
          getExactRelations(left, leftId, mappedLeftId) !==
            getExactRelations(right, rightId, mappedRightId) ||
          getExactRelations(left, mappedLeftId, leftId) !==
            getExactRelations(right, mappedRightId, rightId)
      );
      if (conflicts) continue;
      mapping.set(leftId, rightId);
      usedRightIds.add(rightId);
      if (matchNext(index + 1)) return true;
      mapping.delete(leftId);
      usedRightIds.delete(rightId);
    }
    return false;
  };
  return matchNext(0);
}

type ExactStructuralGraph = {
  readonly relationsBySourceAndTarget: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly localSignatureByNodeId: ReadonlyMap<string, string>;
  readonly relationCountByNodeId: ReadonlyMap<string, number>;
};

function createExactStructuralGraph(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[]
): ExactStructuralGraph {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const relationLabels = new Map<string, Map<string, string[]>>();
  const addRelation = (sourceId: string, targetId: string, label: string): void => {
    if (!nodeById.has(sourceId) || !nodeById.has(targetId)) {
      throw new Error(`Module pattern structure has an unresolved relation endpoint.`);
    }
    const targets = relationLabels.get(sourceId) ?? new Map<string, string[]>();
    const labels = targets.get(targetId) ?? [];
    labels.push(label);
    targets.set(targetId, labels);
    relationLabels.set(sourceId, targets);
  };
  for (const edge of edges) {
    addRelation(edge.sourceNodeId, edge.targetNodeId, `edge:${edgeStructuralSignature(edge)}`);
  }
  for (const node of nodes) {
    const parentId = node.metadata?.parentAreaNodeId;
    if (parentId) addRelation(node.id, parentId, "containment:parent");
  }
  const relationsBySourceAndTarget = new Map(
    [...relationLabels].map(([sourceId, targets]) => [
      sourceId,
      new Map([...targets].map(([targetId, labels]) => [targetId, stableSerialize(labels.sort())]))
    ])
  );
  const localSignatureByNodeId = new Map(
    nodes.map((node) => {
      const incoming: string[] = [];
      const outgoing: string[] = [];
      for (const [sourceId, targets] of relationsBySourceAndTarget) {
        for (const [targetId, labels] of targets) {
          if (sourceId === node.id) {
            outgoing.push(`${labels}:${nodeSignature(nodeById.get(targetId)!)}`);
          }
          if (targetId === node.id) {
            incoming.push(`${labels}:${nodeSignature(nodeById.get(sourceId)!)}`);
          }
        }
      }
      return [
        node.id,
        stableSerialize({
          incoming: incoming.sort(),
          node: nodeSignature(node),
          outgoing: outgoing.sort()
        })
      ] as const;
    })
  );
  const relationCountByNodeId = new Map(
    nodes.map((node) => {
      let count = 0;
      for (const [sourceId, targets] of relationsBySourceAndTarget) {
        for (const targetId of targets.keys()) {
          if (sourceId === node.id || targetId === node.id) count += 1;
        }
      }
      return [node.id, count] as const;
    })
  );
  return { relationsBySourceAndTarget, localSignatureByNodeId, relationCountByNodeId };
}

function getExactRelations(
  graph: ExactStructuralGraph,
  sourceId: string,
  targetId: string
): string {
  return graph.relationsBySourceAndTarget.get(sourceId)?.get(targetId) ?? "[]";
}

export function selectArchitectureBoardModulePatternGeometryMedoid(
  candidates: readonly ArchitectureBoardModulePatternCandidate[]
): ArchitectureBoardModulePatternCandidate {
  return [...candidates]
    .map((candidate) => ({
      candidate,
      distance: candidates.reduce((total, other) => total + geometryDistance(candidate, other), 0)
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.candidate.sourceTemplateId.localeCompare(right.candidate.sourceTemplateId)
    )[0]!.candidate;
}

function geometryDistance(
  left: ArchitectureBoardModulePatternCandidate,
  right: ArchitectureBoardModulePatternCandidate
): number {
  const leftVector = geometryVector(left.nodes, left.edges);
  const rightVector = geometryVector(right.nodes, right.edges);
  if (leftVector.length !== rightVector.length) return Number.POSITIVE_INFINITY;
  return leftVector.reduce(
    (total, value, index) => total + Math.abs(value - rightVector[index]!),
    0
  );
}

function geometryVector(nodes: readonly DiagramNode[], edges: readonly DiagramEdge[]): number[] {
  const bounds = diagramBounds(nodes);
  const structuralRoles = createNodeStructuralRoles(nodes, edges);
  return [...nodes]
    .sort(
      (left, right) =>
        structuralRoleKey(left, structuralRoles).localeCompare(
          structuralRoleKey(right, structuralRoles)
        ) ||
        left.position.x - right.position.x ||
        left.position.y - right.position.y ||
        left.id.localeCompare(right.id)
    )
    .flatMap((node) => [
      (node.position.x - bounds.x) / Math.max(1, bounds.width),
      (node.position.y - bounds.y) / Math.max(1, bounds.height),
      node.size.width / Math.max(1, bounds.width),
      node.size.height / Math.max(1, bounds.height)
    ]);
}

function createNodeStructuralRoles(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[]
): ReadonlyMap<string, string> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let roles = rankNodeDescriptors(nodes.map((node) => [node.id, nodeSignature(node)] as const));

  for (let iteration = 0; iteration < nodes.length; iteration += 1) {
    const descriptors = nodes.map((node) => {
      const incoming = edges
        .filter(({ targetNodeId }) => targetNodeId === node.id)
        .map((edge) => {
          if (!nodeById.has(edge.sourceNodeId)) {
            throw new Error(`Module pattern edge ${edge.id} has an unresolved source.`);
          }
          return `${edgeStructuralSignature(edge)}:${roles.get(edge.sourceNodeId)}`;
        })
        .sort();
      const outgoing = edges
        .filter(({ sourceNodeId }) => sourceNodeId === node.id)
        .map((edge) => {
          if (!nodeById.has(edge.targetNodeId)) {
            throw new Error(`Module pattern edge ${edge.id} has an unresolved target.`);
          }
          return `${edgeStructuralSignature(edge)}:${roles.get(edge.targetNodeId)}`;
        })
        .sort();
      const parentId = node.metadata?.parentAreaNodeId;
      if (parentId && !nodeById.has(parentId)) {
        throw new Error(`Module pattern node ${node.id} has an unresolved parent Area.`);
      }
      const children = nodes
        .filter((candidate) => candidate.metadata?.parentAreaNodeId === node.id)
        .map((child) => roles.get(child.id))
        .sort();
      return [
        node.id,
        stableSerialize({
          children,
          incoming,
          outgoing,
          parent: parentId ? roles.get(parentId) : null,
          self: roles.get(node.id)
        })
      ] as const;
    });
    const nextRoles = rankNodeDescriptors(descriptors);
    if (nodes.every((node) => nextRoles.get(node.id) === roles.get(node.id))) break;
    roles = nextRoles;
  }
  return roles;
}

function rankNodeDescriptors(
  descriptors: readonly (readonly [nodeId: string, descriptor: string])[]
): Map<string, string> {
  const rankByDescriptor = new Map(
    [...new Set(descriptors.map(([, descriptor]) => descriptor))]
      .sort()
      .map((descriptor, index) => [descriptor, `role-${index}`] as const)
  );
  return new Map(
    descriptors.map(([nodeId, descriptor]) => [nodeId, rankByDescriptor.get(descriptor)!])
  );
}

function structuralRoleKey(
  node: DiagramNode,
  structuralRoles: ReadonlyMap<string, string>
): string {
  return `${nodeSignature(node)}:${structuralRoles.get(node.id)}`;
}

function edgeStructuralSignature(edge: DiagramEdge): string {
  return stableSerialize({
    label: edge.label ?? null,
    managedBy: edge.metadata?.managedBy ?? null,
    parameterPath: edge.metadata?.parameterPath ?? null,
    presentationRole: edge.metadata?.presentationRole ?? null,
    type: edge.type ?? null
  });
}

function normalizeCandidate(candidate: ArchitectureBoardModulePatternCandidate): {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  variables: DiagramVariable[];
} {
  const originX = Math.min(...candidate.nodes.map(({ position }) => position.x));
  const originY = Math.min(...candidate.nodes.map(({ position }) => position.y));
  return {
    nodes: candidate.nodes.map((node) => ({
      ...cloneValue(node),
      position: translatePoint(node.position, originX, originY),
      size: {
        width: normalizeNumber(node.size.width),
        height: normalizeNumber(node.size.height)
      }
    })),
    edges: candidate.edges.map((edge) => ({
      ...cloneValue(edge),
      ...(edge.route
        ? {
            route: {
              ...cloneValue(edge.route),
              svgPath: translateSvgPath(edge.route.svgPath, originX, originY),
              sourcePoint: translatePoint(edge.route.sourcePoint, originX, originY),
              targetPoint: translatePoint(edge.route.targetPoint, originX, originY),
              waypoints: edge.route.waypoints.map((point) =>
                translatePoint(point, originX, originY)
              ),
              ...(edge.route.labelPosition
                ? {
                    labelPosition: translatePoint(edge.route.labelPosition, originX, originY)
                  }
                : {})
            }
          }
        : {})
    })),
    variables: candidate.variables.map(cloneValue)
  };
}

function translateSvgPath(svgPath: string, originX: number, originY: number): string {
  const commands = svgPath.match(/[A-Za-z]/g) ?? [];
  if (commands.some((command) => command !== "M" && command !== "L" && command !== "Q")) {
    throw new Error(`Unsupported Template edge route command: ${svgPath}`);
  }
  let coordinateIndex = 0;
  return svgPath.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, (raw) => {
    const offset = coordinateIndex % 2 === 0 ? originX : originY;
    coordinateIndex += 1;
    return String(normalizeNumber(Number(raw) - offset));
  });
}

function translatePoint(point: DiagramPoint, originX: number, originY: number): DiagramPoint {
  return {
    x: normalizeNumber(point.x - originX),
    y: normalizeNumber(point.y - originY)
  };
}

function diagramBounds(nodes: readonly DiagramNode[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const x = Math.min(...nodes.map(({ position }) => position.x));
  const y = Math.min(...nodes.map(({ position }) => position.y));
  const right = Math.max(...nodes.map((node) => node.position.x + node.size.width));
  const bottom = Math.max(...nodes.map((node) => node.position.y + node.size.height));
  return { x, y, width: right - x, height: bottom - y };
}

function nodeSignature(node: DiagramNode): string {
  return `${node.kind}:${resourceTypeOf(node)}`;
}

function resourceTypeOf(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

function normalizeNumber(value: number): number {
  const normalized = Math.round(value * 1_000) / 1_000;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
