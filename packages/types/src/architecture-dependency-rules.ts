import type {
  ArchitectureDiagnostic,
  ArchitectureValidationMode,
  DiagramNode,
  DiagramJson
} from "./index.js";

type DependencyCheck =
  | {
      readonly kind: "required-parameter";
      readonly parameterPath: string;
    }
  | {
      readonly kind: "resource-reference";
      readonly parameterPath: string;
      readonly targetTerraformTypes: readonly string[];
      readonly allowAwsAmiId?: boolean | undefined;
    }
  | {
      readonly kind: "containing-area-reference";
      readonly parameterPath: string;
      readonly areaTerraformType: string;
    }
  | {
      readonly kind: "referenced-target-parent-reference";
      readonly parameterPath: string;
      readonly targetTerraformType: string;
      readonly parentParameterPath: string;
      readonly parentTerraformType: string;
    };

type ArchitectureDependencyRule = {
  readonly id: string;
  readonly summary: string;
  readonly message: string;
  readonly parameterPath?: string | undefined;
  readonly targetTerraformType: string;
  readonly check: DependencyCheck;
};

type ResolvedArchitectureGraph = {
  readonly nodeById: ReadonlyMap<string, DiagramNode>;
  readonly nodeByTerraformIdentity: ReadonlyMap<string, DiagramNode>;
};

type TerraformReference = {
  readonly resourceName: string;
  readonly resourceType: string;
  readonly terraformBlockType: "data" | "resource";
};

const AWS_AMI_ID_PATTERN = /^ami-[a-zA-Z0-9]+$/;

export const awsArchitectureDependencyRulePackV1: readonly ArchitectureDependencyRule[] = [
  {
    id: "architecture.aws.vpc.cidr_missing",
    summary: "VPC 구성 미완료",
    message: "VPC를 사용하려면 CIDR block을 입력하세요.",
    parameterPath: "cidrBlock",
    targetTerraformType: "aws_vpc",
    check: {
      kind: "required-parameter",
      parameterPath: "cidrBlock"
    }
  },
  {
    id: "architecture.aws.subnet.vpc_reference_missing",
    summary: "Subnet 구성 미완료",
    message: "Subnet을 사용하려면 VPC를 선택하거나 참조하세요.",
    parameterPath: "vpcId",
    targetTerraformType: "aws_subnet",
    check: {
      kind: "resource-reference",
      parameterPath: "vpcId",
      targetTerraformTypes: ["aws_vpc"]
    }
  },
  {
    id: "architecture.aws.subnet.vpc_context_missing",
    summary: "Subnet 배치 확인 필요",
    message: "Subnet을 선택한 VPC 영역 안에 배치하세요.",
    parameterPath: "vpcId",
    targetTerraformType: "aws_subnet",
    check: {
      kind: "containing-area-reference",
      parameterPath: "vpcId",
      areaTerraformType: "aws_vpc"
    }
  },
  {
    id: "architecture.aws.ec2.ami_reference_missing",
    summary: "EC2 구성 미완료",
    message: "EC2를 실행하려면 AMI를 선택하거나 참조하세요.",
    parameterPath: "ami",
    targetTerraformType: "aws_instance",
    check: {
      kind: "resource-reference",
      parameterPath: "ami",
      targetTerraformTypes: ["aws_ami"],
      allowAwsAmiId: true
    }
  },
  {
    id: "architecture.aws.ec2.subnet_context_missing",
    summary: "EC2 구성 미완료",
    message: "EC2를 재현 가능한 네트워크에 배치하려면 VPC 안의 Subnet을 선택하세요.",
    parameterPath: "subnetId",
    targetTerraformType: "aws_instance",
    check: {
      kind: "containing-area-reference",
      parameterPath: "subnetId",
      areaTerraformType: "aws_subnet"
    }
  },
  {
    id: "architecture.aws.ec2.vpc_chain_missing",
    summary: "EC2 네트워크 연결 확인 필요",
    message: "선택한 Subnet이 VPC에 연결되어 있는지 확인하세요.",
    parameterPath: "subnetId",
    targetTerraformType: "aws_instance",
    check: {
      kind: "referenced-target-parent-reference",
      parameterPath: "subnetId",
      targetTerraformType: "aws_subnet",
      parentParameterPath: "vpcId",
      parentTerraformType: "aws_vpc"
    }
  }
];

export function evaluateArchitectureDependencies(
  diagramJson: DiagramJson,
  mode: ArchitectureValidationMode
): ArchitectureDiagnostic[] {
  const graph = resolveArchitectureGraph(diagramJson);
  const diagnostics = createContainmentDiagnostics(diagramJson.nodes, graph);

  for (const node of diagramJson.nodes) {
    const resourceType = node.parameters?.resourceType;

    if (!resourceType || (mode === "contextual" && !hasContextualValidationTrigger(node))) {
      continue;
    }

    for (const rule of awsArchitectureDependencyRulePackV1) {
      if (rule.targetTerraformType !== resourceType || isRuleSatisfied(rule, node, graph)) {
        continue;
      }

      diagnostics.push(createRuleDiagnostic(rule, node));
    }
  }

  return diagnostics.sort(compareDiagnostics);
}

export function createArchitectureRuleInputFingerprint(diagramJson: DiagramJson): string {
  return JSON.stringify({
    edges: diagramJson.edges,
    nodes: diagramJson.nodes.map((node) => ({
      id: node.id,
      metadata: node.metadata,
      parameters: node.parameters,
      type: node.type
    }))
  });
}

function resolveArchitectureGraph(diagramJson: DiagramJson): ResolvedArchitectureGraph {
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const nodeByTerraformIdentity = new Map<string, DiagramNode>();

  for (const node of diagramJson.nodes) {
    if (!node.parameters) {
      continue;
    }

    nodeByTerraformIdentity.set(
      createTerraformIdentity({
        resourceName: node.parameters.resourceName,
        resourceType: node.parameters.resourceType,
        terraformBlockType: node.parameters.terraformBlockType ?? "resource"
      }),
      node
    );
  }

  return { nodeById, nodeByTerraformIdentity };
}

function createContainmentDiagnostics(
  nodes: readonly DiagramNode[],
  graph: ResolvedArchitectureGraph
): ArchitectureDiagnostic[] {
  const diagnostics: ArchitectureDiagnostic[] = [];

  for (const node of nodes) {
    const containmentProblem = getContainmentProblem(node, graph);

    if (!containmentProblem) {
      continue;
    }

    diagnostics.push({
      source: "architecture-rule",
      code: containmentProblem === "missing" ? "architecture.graph.parent_missing" : "architecture.graph.parent_cycle",
      severity: "error",
      ruleId: "architecture.graph.parent_integrity",
      resourceNodeId: node.id,
      relatedNodeIds: [],
      summary: "영역 포함 관계 확인 필요",
      message:
        containmentProblem === "missing"
          ? "배치된 상위 영역을 찾을 수 없습니다. 리소스를 다시 배치하세요."
          : "영역 포함 관계가 순환합니다. 리소스 배치를 다시 확인하세요.",
      remediation: [
        {
          label: "보드에서 보기",
          action: "focus-resource"
        }
      ]
    });
  }

  return diagnostics;
}

function getContainmentProblem(
  node: DiagramNode,
  graph: ResolvedArchitectureGraph
): "cycle" | "missing" | null {
  let parentNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>([node.id]);

  while (parentNodeId) {
    if (visitedNodeIds.has(parentNodeId)) {
      return "cycle";
    }

    visitedNodeIds.add(parentNodeId);
    const parentNode = graph.nodeById.get(parentNodeId);

    if (!parentNode) {
      return "missing";
    }

    parentNodeId = parentNode.metadata?.parentAreaNodeId;
  }

  return null;
}

function hasContextualValidationTrigger(node: DiagramNode): boolean {
  return (
    node.metadata?.parentAreaNodeId !== undefined ||
    Object.values(node.parameters?.values ?? {}).some(isMeaningfulParameterValue)
  );
}

function isMeaningfulParameterValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
}

function isRuleSatisfied(
  rule: ArchitectureDependencyRule,
  node: DiagramNode,
  graph: ResolvedArchitectureGraph
): boolean {
  switch (rule.check.kind) {
    case "required-parameter":
      return isMeaningfulParameterValue(getParameterValue(node, rule.check.parameterPath));
    case "resource-reference":
      return hasResourceReference(node, rule.check, graph);
    case "containing-area-reference":
      return hasContainingAreaReference(node, rule.check, graph);
    case "referenced-target-parent-reference":
      return hasReferencedTargetParentReference(node, rule.check, graph);
  }
}

function hasResourceReference(
  node: DiagramNode,
  check: Extract<DependencyCheck, { kind: "resource-reference" }>,
  graph: ResolvedArchitectureGraph
): boolean {
  const value = getParameterValue(node, check.parameterPath);

  if (check.allowAwsAmiId && typeof value === "string" && AWS_AMI_ID_PATTERN.test(value)) {
    return true;
  }

  const targetNode = resolveParameterReferenceTarget(value, graph);
  return Boolean(
    targetNode &&
      check.targetTerraformTypes.includes(targetNode.parameters?.resourceType ?? "")
  );
}

function hasContainingAreaReference(
  node: DiagramNode,
  check: Extract<DependencyCheck, { kind: "containing-area-reference" }>,
  graph: ResolvedArchitectureGraph
): boolean {
  const targetNode = resolveParameterReferenceTarget(getParameterValue(node, check.parameterPath), graph);

  return Boolean(
    targetNode &&
      targetNode.parameters?.resourceType === check.areaTerraformType &&
      (
        hasAreaAncestor(node, targetNode.id, graph) ||
        isNodeFullyInsideArea(node, targetNode)
      )
  );
}

function hasReferencedTargetParentReference(
  node: DiagramNode,
  check: Extract<DependencyCheck, { kind: "referenced-target-parent-reference" }>,
  graph: ResolvedArchitectureGraph
): boolean {
  const targetNode = resolveParameterReferenceTarget(getParameterValue(node, check.parameterPath), graph);

  if (targetNode?.parameters?.resourceType !== check.targetTerraformType) {
    return true;
  }

  const configuredParent = resolveParameterReferenceTarget(
    getParameterValue(targetNode, check.parentParameterPath),
    graph
  );

  return Boolean(
    configuredParent &&
      configuredParent.parameters?.resourceType === check.parentTerraformType &&
      (
        hasAreaAncestor(targetNode, configuredParent.id, graph) ||
        isNodeFullyInsideArea(targetNode, configuredParent)
      )
  );
}

function hasAreaAncestor(
  node: DiagramNode,
  ancestorNodeId: string,
  graph: ResolvedArchitectureGraph
): boolean {
  let parentNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>([node.id]);

  while (parentNodeId && !visitedNodeIds.has(parentNodeId)) {
    if (parentNodeId === ancestorNodeId) {
      return true;
    }

    visitedNodeIds.add(parentNodeId);
    parentNodeId = graph.nodeById.get(parentNodeId)?.metadata?.parentAreaNodeId;
  }

  return false;
}

function isNodeFullyInsideArea(node: DiagramNode, areaNode: DiagramNode): boolean {
  const nodeRight = node.position.x + node.size.width;
  const nodeBottom = node.position.y + node.size.height;
  const areaRight = areaNode.position.x + areaNode.size.width;
  const areaBottom = areaNode.position.y + areaNode.size.height;

  return (
    node.position.x >= areaNode.position.x &&
    node.position.y >= areaNode.position.y &&
    nodeRight <= areaRight &&
    nodeBottom <= areaBottom
  );
}

function getParameterValue(node: DiagramNode, parameterPath: string): unknown {
  return node.parameters?.values[parameterPath];
}

function resolveParameterReferenceTarget(
  value: unknown,
  graph: ResolvedArchitectureGraph
): DiagramNode | null {
  if (typeof value !== "string") {
    return null;
  }

  const reference = parseTerraformReference(value);
  return reference ? graph.nodeByTerraformIdentity.get(createTerraformIdentity(reference)) ?? null : null;
}

function parseTerraformReference(value: string): TerraformReference | null {
  const match = /^(data\.)?(aws_[A-Za-z0-9_]+)\.([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*$/.exec(
    value
  );

  if (!match?.[2] || !match[3]) {
    return null;
  }

  return {
    resourceName: match[3],
    resourceType: match[2],
    terraformBlockType: match[1] ? "data" : "resource"
  };
}

function createTerraformIdentity(reference: TerraformReference): string {
  return `${reference.terraformBlockType}:${reference.resourceType}:${reference.resourceName}`;
}

function createRuleDiagnostic(
  rule: ArchitectureDependencyRule,
  node: DiagramNode
): ArchitectureDiagnostic {
  return {
    source: "architecture-rule",
    code: rule.id,
    severity: "warning",
    ruleId: rule.id,
    resourceNodeId: node.id,
    relatedNodeIds: [],
    summary: rule.summary,
    message: rule.message,
    remediation: [
      {
        label: "보드에서 보기",
        action: "focus-resource",
        ...(rule.parameterPath ? { parameterPath: rule.parameterPath } : {})
      }
    ]
  };
}

function compareDiagnostics(left: ArchitectureDiagnostic, right: ArchitectureDiagnostic): number {
  const severityOrder = getDiagnosticSeverityOrder(left.severity) - getDiagnosticSeverityOrder(right.severity);

  if (severityOrder !== 0) {
    return severityOrder;
  }

  const resourceOrder = left.resourceNodeId.localeCompare(right.resourceNodeId);

  if (resourceOrder !== 0) {
    return resourceOrder;
  }

  const ruleOrder = getRuleOrder(left.code) - getRuleOrder(right.code);

  return ruleOrder !== 0 ? ruleOrder : left.code.localeCompare(right.code);
}

function getDiagnosticSeverityOrder(severity: ArchitectureDiagnostic["severity"]): number {
  if (severity === "error") {
    return 0;
  }

  return severity === "warning" ? 1 : 2;
}

function getRuleOrder(code: string): number {
  const ruleIndex = awsArchitectureDependencyRulePackV1.findIndex((rule) => rule.id === code);

  return ruleIndex === -1 ? Number.MAX_SAFE_INTEGER : ruleIndex;
}
