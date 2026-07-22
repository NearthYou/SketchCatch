import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import { resourceCatalog } from "../resource-settings/catalog";

const RESOURCE_ROLE_LABELS: Readonly<Record<string, string>> = {
  APPLICATION_AUTO_SCALING_POLICY: "자동 확장 기준",
  APPLICATION_AUTO_SCALING_TARGET: "자동 확장 범위",
  CLOUDFRONT: "웹 배포",
  CLOUDWATCH_LOG_GROUP: "로그",
  ECS_CLUSTER: "앱 실행 환경",
  ECS_SERVICE: "앱 서버",
  ECS_TASK_DEFINITION: "실행 서버",
  IAM_ROLE: "접근 권한",
  LOAD_BALANCER: "로드 밸런서",
  LOAD_BALANCER_LISTENER: "요청 연결",
  LOAD_BALANCER_TARGET_GROUP: "앱 트래픽 대상",
  S3: "웹 파일 저장소",
  SECURITY_GROUP: "보안 규칙",
  SUBNET: "서브넷",
  VPC: "네트워크",
  aws_appautoscaling_policy: "자동 확장 기준",
  aws_appautoscaling_target: "자동 확장 범위",
  aws_cloudfront_distribution: "웹 배포",
  aws_cloudwatch_log_group: "로그",
  aws_ecs_cluster: "앱 실행 환경",
  aws_ecs_service: "앱 서버",
  aws_ecs_task_definition: "실행 서버",
  aws_iam_role: "접근 권한",
  aws_iam_role_policy_attachment: "권한 연결",
  aws_internet_gateway: "인터넷 연결",
  aws_lb: "로드 밸런서",
  aws_lb_listener: "요청 연결",
  aws_lb_target_group: "앱 트래픽 대상",
  aws_s3_bucket: "웹 파일 저장소",
  aws_s3_bucket_policy: "파일 접근 정책",
  aws_security_group: "보안 규칙",
  aws_subnet: "서브넷",
  aws_route_table: "라우팅",
  aws_route_table_association: "라우팅 연결",
  aws_availability_zone: "가용 영역",
  aws_vpc: "네트워크"
};

const CATALOG_LABELS_BY_RESOURCE_TYPE: ReadonlyMap<string, string> = new Map(
  resourceCatalog.map((item) => [item.nodeDefaults.type, item.nodeDefaults.label])
);

/** Keeps technical identity in the node while returning only a concise name for Live Observation UI. */
export function getLiveObservationResourceDisplayName(node: DiagramNode): string {
  const label = node.label.trim();
  if (!isInternalResourceLabel(label, node)) return label;

  const resourceType = node.parameters?.resourceType ?? node.type;
  return (
    RESOURCE_ROLE_LABELS[resourceType] ??
    CATALOG_LABELS_BY_RESOURCE_TYPE.get(resourceType) ??
    humanizeResourceType(resourceType)
  );
}

/** Applies one deterministic presentation name per resource before any text, title, or aria rendering. */
export function presentLiveObservationDiagramResourceLabels(diagram: DiagramJson): DiagramJson {
  const namesByNodeId = createDisplayNamesByNodeId(diagram.nodes);

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      const label = namesByNodeId.get(node.id);
      return label && label !== node.label ? { ...node, label } : node;
    })
  };
}

function createDisplayNamesByNodeId(nodes: readonly DiagramNode[]): ReadonlyMap<string, string> {
  const namesByNodeId = new Map<string, string>();
  const internalNodesByBaseName = new Map<string, DiagramNode[]>();

  for (const node of nodes) {
    if (node.kind !== "resource" || !isInternalResourceLabel(node.label.trim(), node)) {
      namesByNodeId.set(node.id, node.label.trim() || "AWS 리소스");
      continue;
    }

    const baseName = getLiveObservationResourceDisplayName(node);
    const group = internalNodesByBaseName.get(baseName) ?? [];
    group.push(node);
    internalNodesByBaseName.set(baseName, group);
  }

  for (const [baseName, group] of internalNodesByBaseName) {
    const ordered = [...group].sort(
      (left, right) =>
        left.position.x - right.position.x ||
        left.position.y - right.position.y ||
        left.id.localeCompare(right.id, "en")
    );
    for (const [index, node] of ordered.entries()) {
      namesByNodeId.set(node.id, ordered.length > 1 ? `${baseName} ${index + 1}` : baseName);
    }
  }

  return namesByNodeId;
}

function isInternalResourceLabel(label: string, node: DiagramNode): boolean {
  if (!label) return true;
  if (label === node.id || label === node.parameters?.resourceName) return true;
  if (/^arn:/iu.test(label) || /^resource-/iu.test(label)) return true;
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/u.test(label)) return true;
  if (/\b(?:aws|azurerm|google)_[a-z0-9_]+\.[a-z0-9_-]+\b/iu.test(label)) return true;
  return /(?:^|_)fixed_template(?:_|$)/iu.test(label);
}

function humanizeResourceType(resourceType: string): string {
  const words = resourceType
    .replace(/^(?:aws|azurerm|google)_/u, "")
    .split("_")
    .filter(Boolean);
  if (words.length === 0) return "클라우드 리소스";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
