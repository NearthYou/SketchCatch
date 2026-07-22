import type {
  AiArchitectureDraftResult,
  ArchitectureJson,
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramNodeBorderStyle,
  DiagramNodeParameters,
  ResourceConfig,
  ResourceDragPayload,
  ResourceItem,
  ResourceType,
  TerraformBlockType
} from "@sketchcatch/types";
import {
  buildTemplateDiagramJson,
  getTemplateDefinitionById,
  TEMPLATE_IDS,
  type TemplateId
} from "@sketchcatch/types";
import {
  getDefaultResourceDefinitionByResourceType,
  getResourceDefinitionByTerraform
} from "@sketchcatch/types/resource-definitions";
import { isAreaNode, isContainmentAreaNode } from "../diagram-editor/area-nodes";
import { BOARD_DEFAULT_EDGE_COLOR } from "../diagram-editor/constants";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";
import {
  doesOrthogonalRouteCrossResource,
  getObstacleSafeEdgeHandles
} from "../diagram-editor/obstacle-safe-edge-routing";
import {
  normalizeDiagramResourceNodeGeometry,
  RESOURCE_NODE_DEFAULT_SIZE
} from "../diagram-editor/resource-node-geometry";
import {
  terraformParameterCatalog,
  type ParameterCatalogDefinition
} from "../parameter-input/catalog";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";
import { fitSecurityGroupScopesToTargets } from "../diagram-editor/security-group-scope";
import { resourceCatalog } from "../resource-settings/catalog";
import { layoutAutomaticDiagram } from "./automatic-diagram-layout";
import {
  getAutomaticDiagramSemanticRole,
  type AutomaticDiagramSemanticRole
} from "./automatic-diagram-layout-provider-mapping";
import { addServerStorageAreaNodes } from "./server-storage-board-layout";

const DEFAULT_VIEWPORT: DiagramJson["viewport"] = { x: 0, y: 0, zoom: 1 };
const DEFAULT_NODE_SIZE: DiagramNode["size"] = RESOURCE_NODE_DEFAULT_SIZE;
const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const UNKNOWN_TERRAFORM_RESOURCE_TYPE = "unknown_resource";
const DEFAULT_EDGE_STYLE: NonNullable<DiagramEdge["style"]> = {
  animated: false,
  color: BOARD_DEFAULT_EDGE_COLOR,
  lineStyle: "solid",
  width: "thin"
};
const ASYNC_EDGE_STYLE: NonNullable<DiagramEdge["style"]> = {
  animated: false,
  color: "#476582",
  lineStyle: "dashed",
  width: "medium"
};
const OPERATION_EDGE_STYLE: NonNullable<DiagramEdge["style"]> = {
  animated: false,
  color: "#8a5a00",
  lineStyle: "dashed",
  width: "thick"
};

export type ArchitectureDiagramConversionOptions = {
  readonly preserveLayoutFrom?: DiagramJson | undefined;
};

export type DiagramPlannerInput = {
  readonly architectureJson: ArchitectureJson;
  readonly previousDiagram?: DiagramJson | undefined;
};

type TemplateNodeLayoutRule = {
  readonly metadata: DiagramNode["metadata"];
  readonly position: DiagramNode["position"];
  readonly size: DiagramNode["size"];
  readonly zIndex: DiagramNode["zIndex"];
};

type TemplateEdgeLayoutRule = Pick<
  DiagramEdge,
  "metadata" | "sourceHandleId" | "targetHandleId" | "type"
>;

type TemplateLayoutRules = {
  readonly edgeRulesById: ReadonlyMap<string, TemplateEdgeLayoutRule>;
  readonly nodeRulesById: ReadonlyMap<string, TemplateNodeLayoutRule>;
  readonly presentationEdges: readonly DiagramEdge[];
  readonly presentationNodes: readonly DiagramNode[];
  readonly protectedNodeIds: ReadonlySet<string>;
};

export function getDiagramJsonForArchitectureDraft(
  draft: AiArchitectureDraftResult,
  options: ArchitectureDiagramConversionOptions = {}
): DiagramJson {
  return (
    draft.diagramJson ??
    createPlannedDiagramJson({
      architectureJson: draft.architectureJson,
      previousDiagram: options.preserveLayoutFrom
    })
  );
}

const DEPENDENCY_EDGE_STYLE: NonNullable<DiagramEdge["style"]> = {
  animated: false,
  color: "#6b7280",
  lineStyle: "solid",
  width: "thin"
};
const DANGER_EDGE_STYLE: NonNullable<DiagramEdge["style"]> = {
  animated: false,
  color: "#b42318",
  lineStyle: "dashed",
  width: "thick"
};
const EDGE_HANDLE_IDS = {
  bottom: "handle-bottom",
  left: "handle-left",
  right: "handle-right",
  top: "handle-top"
} as const;
const AREA_CHILD_PADDING = 36;
const RESOURCE_COLLISION_GAP = 16;
const RESOURCE_COLLISION_ROW_WIDTH = 720;
const MAX_AREA_FIT_PASSES = 8;
const ROOT_PARENT_AREA_ID = "__root__";
const READABLE_LAYOUT_MIN_GROUP_SIZE = 4;
const READABLE_LAYOUT_COLUMN_GAP = 192;
const READABLE_LAYOUT_ROW_GAP = 140;
const READABLE_LAYOUT_STACK_GAP = 104;
const REPOSITORY_MANAGED_SERVICES_AREA_ID = "repository-managed-services";
const REPOSITORY_SUPPORT_COLUMN_GAP = 168;
const REPOSITORY_SUPPORT_ROW_GAP = 260;
const REPOSITORY_SUPPORT_STACK_GAP = 84;
const REPOSITORY_TEMPLATE_SUPPORT_GAP = 840;
const REPOSITORY_EXTERNAL_ACTOR_GAP = 260;
const REPOSITORY_VPC_ORIGIN = { x: 820, y: 96 };
const REPOSITORY_SUBNET_SIZE = { width: 220, height: 56 };
const REPOSITORY_ACTIVE_PUBLIC_SUBNET_SIZE = { width: 364, height: 220 };
const REPOSITORY_ACTIVE_PRIVATE_SUBNET_SIZE = { width: 548, height: 228 };
const REPOSITORY_SUBNET_COLUMN_GAP = 392;
const REPOSITORY_SUBNET_ROW_GAP = 292;
const REPOSITORY_ALB_SCOPE_SIZE = { width: 264, height: 132 };
const REPOSITORY_TASK_SCOPE_SIZE = { width: 448, height: 136 };
type RepositoryEcsReferenceNodeLayout = {
  readonly parentAreaNodeId: string | null;
  readonly position: DiagramNode["position"];
  readonly size: DiagramNode["size"];
};
const REPOSITORY_ECS_REFERENCE_LAYOUT = {
  "repository-browser": {
    parentAreaNodeId: null,
    position: { x: 232, y: -224 },
    size: { width: 140, height: 80 }
  },
  "repository-github-actions": {
    parentAreaNodeId: null,
    position: { x: 24, y: 456 },
    size: { width: 160, height: 80 }
  },
  "repository-private-app-subnet-a": {
    parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
    position: { x: 516, y: 720 },
    size: { width: 478, height: 118 }
  },
  "repository-private-app-subnet-b": {
    parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
    position: { x: 1080, y: 720 },
    size: { width: 476, height: 118 }
  },
  "repository-nat-eip": {
    parentAreaNodeId: "fixed-template-ecs-fargate-container-app-subnet-a",
    position: { x: 708, y: 612 },
    size: { width: 48, height: 48 }
  },
  "repository-nat-gateway": {
    parentAreaNodeId: "fixed-template-ecs-fargate-container-app-subnet-a",
    position: { x: 828, y: 612 },
    size: { width: 48, height: 48 }
  },
  "repository-private-route-table": {
    parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
    position: { x: 1008, y: 528 },
    size: { width: 48, height: 48 }
  },
  "repository-private-route-association-a": {
    parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
    position: { x: 972, y: 756 },
    size: { width: 48, height: 48 }
  },
  "repository-private-route-association-b": {
    parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
    position: { x: 1056, y: 756 },
    size: { width: 48, height: 48 }
  },
  "repository-web-assets": {
    parentAreaNodeId: null,
    position: { x: 660, y: -264 },
    size: { width: 48, height: 48 }
  },
  "repository-web-public-access": {
    parentAreaNodeId: null,
    position: { x: 828, y: -264 },
    size: { width: 48, height: 48 }
  },
  "repository-web-bootstrap-index": {
    parentAreaNodeId: null,
    position: { x: 660, y: -180 },
    size: { width: 48, height: 48 }
  },
  "repository-cloudfront-oac": {
    parentAreaNodeId: null,
    position: { x: 496, y: -340 },
    size: { width: 48, height: 48 }
  },
  "repository-cloudfront": {
    parentAreaNodeId: null,
    position: { x: 496, y: -208 },
    size: { width: 48, height: 48 }
  },
  "repository-web-bucket-policy": {
    parentAreaNodeId: null,
    position: { x: 496, y: -52 },
    size: { width: 48, height: 48 }
  },
  "repository-ecr": {
    parentAreaNodeId: null,
    position: { x: 1908, y: 552 },
    size: { width: 48, height: 48 }
  },
  "repository-ecs-logs": {
    parentAreaNodeId: null,
    position: { x: 1932, y: 660 },
    size: { width: 48, height: 48 }
  },
  "repository-fargate-runtime": {
    parentAreaNodeId: null,
    position: { x: 1284, y: -144 },
    size: { width: 260, height: 96 }
  }
} as const satisfies Readonly<Record<string, RepositoryEcsReferenceNodeLayout>>;
const DENSE_DIAGRAM_SUPPORT_ROLES = new Set<AutomaticDiagramSemanticRole>([
  "delivery",
  "observability",
  "security",
  "support"
]);
const PRESENTATION_ENDPOINT_ROLES = new Set<AutomaticDiagramSemanticRole>([
  "actor",
  "entry",
  "compute",
  "data",
  "async",
  "delivery"
]);
const DENSE_PRESENTATION_EDGE_THRESHOLD = 10;
const PRESENTATION_PATH_MAX_DEPTH = 6;
const SUMMARY_PRESENTATION_EDGE_STYLE: NonNullable<DiagramEdge["style"]> = {
  animated: false,
  color: "#334155",
  lineStyle: "solid",
  width: "medium"
};
const EDGE_HANDLE_STUB_LENGTH = 20;
const EDGE_ROUTE_NODE_OVERLAP_PENALTY = 1_000_000;
const EDGE_ROUTE_SEGMENT_OVERLAP_PENALTY = 200_000;
const EDGE_ROUTE_SEGMENT_CROWDING_PENALTY = 10_000;
const EDGE_ROUTE_CROSSING_PENALTY = 5_000_000;
const EDGE_ROUTE_SHARED_HANDLE_PENALTY = 12_000_000;
const EDGE_ROUTE_OPPOSING_SHARED_HANDLE_PENALTY = 60_000_000;
const EDGE_ROUTE_CROWDING_DISTANCE = 28;
const EDGE_ROUTE_WRONG_DIRECTION_PENALTY = 10_000_000;
const EDGE_ROUTE_OBSERVABILITY_BRANCH_PENALTY = 30_000_000;
const RESOURCE_AREA_INSET_PADDING = 56;
const COMPACT_AREA_MIN_SIZES: Readonly<Record<string, DiagramNode["size"]>> = {
  aws_availability_zone: { width: 320, height: 220 },
  aws_region: { width: 560, height: 360 },
  aws_security_group: { width: 180, height: 120 },
  aws_subnet: { width: 180, height: 120 },
  aws_vpc: { width: 420, height: 280 }
};
const AREA_PARENT_EDGE_LABELS = new Set(["contains", "hosts"]);
const TERRAFORM_REFERENCE_ATTRIBUTE_SUFFIXES = ["id", "arn", "name", "execution_arn"] as const;
const RESOURCE_ITEMS_BY_DEFINITION_ID = new Map(
  resourceCatalog.map((resourceItem) => [resourceItem.id, resourceItem])
);
const PRESENTATION_ICON_CATALOG_ITEM_BY_TYPE = new Map<string, string>([
  ["client", "design-user-client"],
  ["design-user-client", "design-user-client"],
  ["github_actions", "design-source-repository"],
  ["sketchcatch_user_client", "design-user-client"],
  ["aws_ecs_task_definition", "aws-ecs-task-definition"]
]);
const DIAGRAM_ONLY_CONFIG_KEYS = new Set([
  "diagramBorderColor",
  "diagramBorderStyle",
  "diagramHeight",
  "diagramIconUrl",
  "diagramKind",
  "diagramTextColor",
  "diagramType",
  "diagramWidth"
]);
const RESOURCE_ITEMS_BY_TERRAFORM_TYPE = createResourceItemsByTerraformType(resourceCatalog);
const EDGE_STYLE_LABEL_PATTERNS: ReadonlyArray<{
  readonly patterns: readonly RegExp[];
  readonly style: NonNullable<DiagramEdge["style"]>;
}> = [
  {
    patterns: [/\b(delete|destroy|replace|destructive)\b/u],
    style: DANGER_EDGE_STYLE
  },
  {
    patterns: [/\b(terraform|plan|apply|deploy|deployment|ci\/?cd|pipeline|handoff|git)\b/u],
    style: OPERATION_EDGE_STYLE
  },
  {
    patterns: [
      /\b(attaches?|assumes?|encrypts?|grants?|image|launch|permission|policy|profile|role)\b/u,
      /\b(depends?(_on)?|dependency|requires?)\b/u
    ],
    style: DEPENDENCY_EDGE_STYLE
  },
  {
    patterns: [
      /\b(async|event|queue|stream|notification|pub\/?sub|publish|subscribe|sns|sqs|message|logs?|monitor(?:s|ing)?|metric|alarm)\b/u
    ],
    style: ASYNC_EDGE_STYLE
  }
];
const RESOURCE_NAME_CONVENTIONS: Readonly<
  Record<string, { readonly prefix: string; readonly aliases: readonly string[] }>
> = {
  aws_acm_certificate: { prefix: "cert", aliases: ["acm", "certificate", "cert"] },
  aws_ami: { prefix: "ami", aliases: ["ami", "image"] },
  aws_api_gateway_integration: {
    prefix: "api_integration",
    aliases: ["api", "gateway", "integration"]
  },
  aws_api_gateway_method: { prefix: "api_method", aliases: ["api", "gateway", "method"] },
  aws_api_gateway_resource: { prefix: "api_resource", aliases: ["api", "gateway", "resource"] },
  aws_api_gateway_rest_api: { prefix: "api", aliases: ["api", "gateway", "rest"] },
  aws_api_gateway_stage: { prefix: "api_stage", aliases: ["api", "gateway", "stage"] },
  aws_apigatewayv2_api: { prefix: "api", aliases: ["api", "gateway", "websocket"] },
  aws_autoscaling_group: {
    prefix: "asg",
    aliases: ["asg", "autoscaling", "auto", "scaling", "group"]
  },
  aws_availability_zone: { prefix: "az", aliases: ["az", "availability", "zone"] },
  aws_cloudfront_distribution: { prefix: "cdn", aliases: ["cdn", "cloudfront", "distribution"] },
  aws_cloudwatch_dashboard: { prefix: "dashboard", aliases: ["cloudwatch", "dashboard"] },
  aws_cloudwatch_log_group: { prefix: "logs", aliases: ["cloudwatch", "log", "logs", "group"] },
  aws_cloudwatch_metric_alarm: { prefix: "alarm", aliases: ["cloudwatch", "metric", "alarm"] },
  aws_cognito_user_pool: { prefix: "user_pool", aliases: ["cognito", "user", "pool"] },
  aws_cognito_user_pool_client: {
    prefix: "user_pool_client",
    aliases: ["cognito", "user", "pool", "client"]
  },
  aws_db_instance: { prefix: "db", aliases: ["rds", "db", "database", "instance"] },
  aws_db_subnet_group: { prefix: "db_subnet_group", aliases: ["db", "subnet", "group"] },
  aws_dynamodb_table: { prefix: "table", aliases: ["dynamodb", "table"] },
  aws_ebs_volume: { prefix: "volume", aliases: ["ebs", "volume"] },
  aws_ecr_repository: { prefix: "ecr", aliases: ["ecr", "repository", "repo"] },
  aws_ecs_cluster: { prefix: "ecs_cluster", aliases: ["ecs", "cluster"] },
  aws_ecs_service: { prefix: "ecs_service", aliases: ["ecs", "service"] },
  aws_ecs_task_definition: { prefix: "task", aliases: ["ecs", "task", "definition"] },
  aws_eks_cluster: { prefix: "eks_cluster", aliases: ["eks", "cluster"] },
  aws_elasticache_cluster: {
    prefix: "cache",
    aliases: ["elasticache", "redis", "cache", "cluster"]
  },
  aws_eip: { prefix: "eip", aliases: ["eip", "elastic", "ip"] },
  aws_iam_instance_profile: { prefix: "profile", aliases: ["iam", "instance", "profile"] },
  aws_iam_policy: { prefix: "policy", aliases: ["iam", "policy"] },
  aws_iam_role: { prefix: "role", aliases: ["iam", "role"] },
  aws_instance: { prefix: "compute", aliases: ["ec2", "instance", "server", "compute", "app"] },
  aws_internet_gateway: { prefix: "igw", aliases: ["internet", "gateway", "igw"] },
  aws_key_pair: { prefix: "key", aliases: ["key", "pair"] },
  aws_kms_key: { prefix: "key", aliases: ["kms", "key"] },
  aws_lambda_event_source_mapping: {
    prefix: "event_source",
    aliases: ["lambda", "event", "source", "mapping"]
  },
  aws_lambda_function: { prefix: "lambda", aliases: ["lambda", "function"] },
  aws_lambda_permission: { prefix: "lambda_permission", aliases: ["lambda", "permission"] },
  aws_launch_template: { prefix: "lt", aliases: ["launch", "template", "lt"] },
  aws_lb: { prefix: "alb", aliases: ["alb", "lb", "load", "balancer"] },
  aws_lb_listener: { prefix: "listener", aliases: ["lb", "listener"] },
  aws_lb_target_group: { prefix: "tg", aliases: ["target", "group", "tg"] },
  aws_nat_gateway: { prefix: "nat", aliases: ["nat", "gateway"] },
  aws_region: { prefix: "region", aliases: ["region"] },
  aws_route53_record: { prefix: "dns", aliases: ["route53", "dns", "record"] },
  aws_route_table: { prefix: "rt", aliases: ["route", "table", "rt"] },
  aws_route_table_association: { prefix: "rta", aliases: ["route", "table", "association", "rta"] },
  aws_s3_bucket: { prefix: "bucket", aliases: ["s3", "bucket"] },
  aws_secretsmanager_secret: { prefix: "secret", aliases: ["secretsmanager", "secret"] },
  aws_security_group: { prefix: "sg", aliases: ["security", "group", "sg"] },
  aws_security_group_rule: { prefix: "sg_rule", aliases: ["security", "group", "rule", "sg"] },
  aws_sfn_state_machine: {
    prefix: "state_machine",
    aliases: ["step", "functions", "state", "machine"]
  },
  aws_sns_topic: { prefix: "topic", aliases: ["sns", "topic"] },
  aws_sqs_queue: { prefix: "queue", aliases: ["sqs", "queue"] },
  aws_subnet: { prefix: "subnet", aliases: ["subnet"] },
  aws_vpc: { prefix: "vpc", aliases: ["vpc"] },
  aws_vpc_endpoint: { prefix: "endpoint", aliases: ["vpc", "endpoint"] },
  aws_wafv2_web_acl: { prefix: "waf", aliases: ["waf", "web", "acl"] }
};

export function createPlannedDiagramJson({
  architectureJson,
  previousDiagram
}: DiagramPlannerInput): DiagramJson {
  const templateLayoutRules = extractTemplateLayoutRules(architectureJson);
  const hasAuthoredTemplateLayout = templateLayoutRules.protectedNodeIds.size > 0;
  const usesRepositoryLayout = usesRepositoryGeneratedTemplateLayout(architectureJson);
  const preserveAuthoredTemplatePositions = hasAuthoredTemplateLayout || !usesRepositoryLayout;
  const nodeIds = new Set(architectureJson.nodes.map((node) => node.id));
  const convertedNodes = [
    ...architectureJson.nodes.map(convertArchitectureNodeToDiagramNode),
    ...templateLayoutRules.presentationNodes
  ];
  const preparedNodes = applyTemplateNodeLayoutRules(
    applyAreaParentMetadata(
      applyDiagramResourceNameConventions(
        addServerStorageAreaNodes(applyPresentationIconUrls(convertedNodes))
      ),
      architectureJson.edges
    ),
    templateLayoutRules.nodeRulesById
  );
  const preservedNodes = preserveExistingNodeLayouts(preparedNodes, previousDiagram);
  const preservedNodeIds = new Set(preservedNodes.map((node) => node.id));
  const protectedNodeIds = new Set([
    ...(previousDiagram?.nodes
      .filter((baseNode) => preservedNodeIds.has(baseNode.id))
      .map((node) => node.id) ?? []),
    ...(preserveAuthoredTemplatePositions
      ? architectureJson.nodes.filter(hasAuthoredTemplatePosition).map((node) => node.id)
      : []),
    ...templateLayoutRules.protectedNodeIds
  ]);
  const layoutInputNodes = preserveAuthoredTemplatePositions
    ? detachGeneratedNodesFromProtectedTemplateAreas(
        preservedNodes,
        templateLayoutRules.protectedNodeIds
      )
    : preservedNodes;
  const laidOutNodes = layoutAutomaticDiagram({
    edges: architectureJson.edges,
    nodes: layoutInputNodes,
    protectedNodeIds
  }).nodes;
  const fittedLaidOutNodes = preserveAuthoredTemplatePositions
    ? applyTemplateNodeLayoutRules(
        fitAreaNodesToChildren(fitSecurityGroupScopesToTargets(laidOutNodes)),
        templateLayoutRules.nodeRulesById
      )
    : fitAreaNodesToChildren(fitSecurityGroupScopesToTargets(laidOutNodes));
  const repositorySupportLaidOutNodes = usesRepositoryLayout
    ? preserveAuthoredTemplatePositions
      ? applyRepositoryGeneratedSupportLayout(
          flattenRepositoryManagedServicesArea(fittedLaidOutNodes),
          templateLayoutRules.protectedNodeIds
        )
      : applyRepositoryGeneratedReferenceLayout(fittedLaidOutNodes)
    : fittedLaidOutNodes;
  const templateSafeRepositorySupportNodes = preserveAuthoredTemplatePositions
    ? detachGeneratedNodesFromProtectedTemplateAreas(
        repositorySupportLaidOutNodes,
        templateLayoutRules.protectedNodeIds
      )
    : repositorySupportLaidOutNodes;
  const collisionResolvedNodes = preserveAuthoredTemplatePositions
    ? templateSafeRepositorySupportNodes
    : templateSafeRepositorySupportNodes;
  const nodes = applyTemplateNodeLayoutRules(
    applyDiagramLayerOrder(
      preserveExistingNodeLayouts(
        applyRepositoryEcsReferenceLayout(
          applyTemplateNodeLayoutRules(
            fitAreaNodesToChildren(collisionResolvedNodes),
            templateLayoutRules.nodeRulesById
          )
        ),
        previousDiagram
      )
    ),
    templateLayoutRules.nodeRulesById
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const architectureEdges = removeRepositoryGeneratedSupportEdges(
    reduceDenseDiagramEdgeLabels(
      createReadablePresentationEdges(
        convertArchitectureEdgesToDiagramEdges(
          architectureJson.edges.filter((edge) =>
            shouldRenderArchitectureEdge(edge, nodeIds, nodeById)
          ),
          nodeById
        ).map((edge) => ({
          ...edge,
          ...templateLayoutRules.edgeRulesById.get(edge.id)
        })),
        nodeById,
        new Set(templateLayoutRules.edgeRulesById.keys())
      ),
      nodeById
    ),
    nodeById,
    preserveAuthoredTemplatePositions
  );
  const edgeIds = new Set(architectureEdges.map((edge) => edge.id));

  return {
    edges: [
      ...architectureEdges,
      ...templateLayoutRules.presentationEdges
        .filter(
          (edge) =>
            !edgeIds.has(edge.id) &&
            nodeById.has(edge.sourceNodeId) &&
            nodeById.has(edge.targetNodeId)
        )
        .map((edge) => ({
          ...edge,
          metadata: { ...edge.metadata, presentationRole: "primary" as const }
        }))
    ],
    nodes,
    viewport: { ...DEFAULT_VIEWPORT }
  };
}

function applyPresentationIconUrls(nodes: readonly DiagramNode[]): DiagramNode[] {
  return nodes.map((node) => {
    if (node.iconUrl || node.kind !== "design") {
      return node;
    }

    const catalogItemId =
      typeof node.metadata?.presentationCatalogItemId === "string"
        ? node.metadata.presentationCatalogItemId
        : PRESENTATION_ICON_CATALOG_ITEM_BY_TYPE.get(node.type);
    const iconUrl = catalogItemId
      ? RESOURCE_ITEMS_BY_DEFINITION_ID.get(catalogItemId)?.iconUrl
      : undefined;

    return iconUrl ? { ...node, iconUrl } : node;
  });
}

export function materializeResourceCatalogDiagramVisuals(diagram: DiagramJson): DiagramJson {
  let didChange = false;
  const nodes = diagram.nodes.map((node) => {
    if (node.kind !== "resource" || !node.parameters) {
      return node;
    }

    const terraformResourceType = node.parameters.resourceType;
    const catalogNode = createResourceCatalogDiagramNode(
      mapTerraformResourceType(node.parameters),
      terraformResourceType,
      node.position,
      node.zIndex ?? 0
    );

    if (!catalogNode.iconUrl) {
      return node;
    }

    didChange = true;
    return {
      ...node,
      type: catalogNode.type,
      kind: catalogNode.kind,
      size: { ...catalogNode.size },
      iconUrl: catalogNode.iconUrl,
      style: catalogNode.style
    };
  });

  return didChange ? { ...diagram, nodes } : diagram;
}
export function convertArchitectureJsonToDiagramJson(
  architectureJson: ArchitectureJson,
  options: ArchitectureDiagramConversionOptions = {}
): DiagramJson {
  return createPlannedDiagramJson({
    architectureJson,
    previousDiagram: options.preserveLayoutFrom
  });
}

function extractTemplateLayoutRules(architectureJson: ArchitectureJson): TemplateLayoutRules {
  const edgeRulesById = new Map<string, TemplateEdgeLayoutRule>();
  const nodeRulesById = new Map<string, TemplateNodeLayoutRule>();
  const presentationEdges: DiagramEdge[] = [];
  const presentationNodes: DiagramNode[] = [];
  const protectedNodeIds = new Set<string>();

  const architectureNodesByTemplateId = new Map<
    TemplateId,
    Array<ArchitectureJson["nodes"][number]>
  >();
  const architectureEdgeByRelationshipKey = new Map<string, ArchitectureJson["edges"][number]>();

  for (const node of architectureJson.nodes) {
    const templateId = node.config["templateId"];
    if (!isTemplateId(templateId)) continue;

    const templateNodes = architectureNodesByTemplateId.get(templateId) ?? [];
    templateNodes.push(node);
    architectureNodesByTemplateId.set(templateId, templateNodes);
  }

  for (const edge of architectureJson.edges) {
    const relationshipKey = getArchitectureRelationshipKey(
      edge.sourceId,
      edge.targetId,
      edge.label
    );
    if (!architectureEdgeByRelationshipKey.has(relationshipKey)) {
      architectureEdgeByRelationshipKey.set(relationshipKey, edge);
    }
  }

  for (const [templateId, templateNodes] of architectureNodesByTemplateId) {
    const definition = getTemplateDefinitionById(templateId);
    const architectureNodeByResourceId = new Map(
      templateNodes.flatMap((node) =>
        typeof node.config["templateResourceId"] === "string"
          ? [[node.config["templateResourceId"], node] as const]
          : []
      )
    );

    const authoredDiagram = buildTemplateDiagramJson(templateId, {
      projectSlug: "diagram-planner",
      shortId: "layout"
    });
    const outputNodeIdByAuthoredNodeId = new Map<string, string>();

    for (const resource of definition.resources) {
      const architectureNode = architectureNodeByResourceId.get(resource.id);
      if (architectureNode) {
        outputNodeIdByAuthoredNodeId.set(
          getAuthoredTemplateEntityId(templateId, resource.id),
          architectureNode.id
        );
      }
    }

    const relevantPresentationNodeIds = collectRelevantTemplatePresentationNodeIds({
      architectureNodeByResourceId,
      authoredDiagram,
      templateId
    });

    for (const presentationNode of definition.presentationNodes) {
      const authoredNodeId = getAuthoredTemplateEntityId(
        templateId,
        `presentation-${presentationNode.id}`
      );

      if (relevantPresentationNodeIds.has(authoredNodeId)) {
        outputNodeIdByAuthoredNodeId.set(
          authoredNodeId,
          getPlannedTemplatePresentationNodeId(templateId, presentationNode.id)
        );
      }
    }

    const authoredNodeById = new Map(authoredDiagram.nodes.map((node) => [node.id, node]));

    for (const [authoredNodeId, outputNodeId] of outputNodeIdByAuthoredNodeId) {
      const authoredNode = authoredNodeById.get(authoredNodeId);
      if (!authoredNode) {
        continue;
      }

      const rule: TemplateNodeLayoutRule = {
        metadata: remapTemplateNodeMetadata(authoredNode.metadata, outputNodeIdByAuthoredNodeId),
        position: { ...authoredNode.position },
        size: { ...authoredNode.size },
        zIndex: authoredNode.zIndex
      };
      nodeRulesById.set(outputNodeId, rule);
      protectedNodeIds.add(outputNodeId);

      if (authoredNodeId.includes("-presentation-")) {
        presentationNodes.push({
          ...authoredNode,
          id: outputNodeId,
          metadata: rule.metadata,
          position: { ...rule.position },
          size: { ...rule.size }
        });
      }
    }

    const authoredEdgeById = new Map(authoredDiagram.edges.map((edge) => [edge.id, edge]));

    for (const relationship of definition.relationships) {
      const sourceNodeId = architectureNodeByResourceId.get(relationship.sourceResourceId)?.id;
      const targetNodeId = architectureNodeByResourceId.get(relationship.targetResourceId)?.id;
      const architectureEdge = architectureEdgeByRelationshipKey.get(
        getArchitectureRelationshipKey(sourceNodeId, targetNodeId, relationship.label)
      );
      const authoredEdge = authoredEdgeById.get(
        getAuthoredTemplateEntityId(templateId, relationship.id)
      );

      if (!architectureEdge || !authoredEdge) {
        continue;
      }

      edgeRulesById.set(architectureEdge.id, {
        ...(authoredEdge.metadata ? { metadata: { ...authoredEdge.metadata } } : {}),
        ...(authoredEdge.sourceHandleId ? { sourceHandleId: authoredEdge.sourceHandleId } : {}),
        ...(authoredEdge.targetHandleId ? { targetHandleId: authoredEdge.targetHandleId } : {}),
        ...(authoredEdge.type ? { type: authoredEdge.type } : {})
      });
    }

    for (const presentationEdge of definition.presentationEdges) {
      const authoredEdge = authoredEdgeById.get(
        getAuthoredTemplateEntityId(templateId, `presentation-${presentationEdge.id}`)
      );
      const remappedEdge = authoredEdge
        ? remapTemplatePresentationEdge(authoredEdge, outputNodeIdByAuthoredNodeId)
        : undefined;

      if (remappedEdge) {
        presentationEdges.push(remappedEdge);
      }
    }
  }

  return {
    edgeRulesById,
    nodeRulesById,
    presentationEdges,
    presentationNodes,
    protectedNodeIds
  };
}

function usesRepositoryGeneratedTemplateLayout(architectureJson: ArchitectureJson): boolean {
  return architectureJson.nodes.some((node) => node.id.startsWith("repository-"));
}

function collectRelevantTemplatePresentationNodeIds({
  architectureNodeByResourceId,
  authoredDiagram,
  templateId
}: {
  readonly architectureNodeByResourceId: ReadonlyMap<string, ArchitectureJson["nodes"][number]>;
  readonly authoredDiagram: DiagramJson;
  readonly templateId: TemplateId;
}): ReadonlySet<string> {
  const authoredNodeById = new Map(authoredDiagram.nodes.map((node) => [node.id, node]));
  const presentResourceNodeIds = new Set(
    [...architectureNodeByResourceId.keys()].map((resourceId) =>
      getAuthoredTemplateEntityId(templateId, resourceId)
    )
  );
  const presentationNodeIds = new Set(
    authoredDiagram.nodes.filter((node) => node.kind === "design").map((node) => node.id)
  );
  const relevantPresentationNodeIds = new Set<string>();

  for (const resourceNodeId of presentResourceNodeIds) {
    const parentAreaNodeId = authoredNodeById.get(resourceNodeId)?.metadata?.parentAreaNodeId;

    if (parentAreaNodeId && presentationNodeIds.has(parentAreaNodeId)) {
      relevantPresentationNodeIds.add(parentAreaNodeId);
    }
  }

  for (const edge of authoredDiagram.edges) {
    if (
      presentResourceNodeIds.has(edge.sourceNodeId) &&
      presentationNodeIds.has(edge.targetNodeId)
    ) {
      relevantPresentationNodeIds.add(edge.targetNodeId);
    }
    if (
      presentResourceNodeIds.has(edge.targetNodeId) &&
      presentationNodeIds.has(edge.sourceNodeId)
    ) {
      relevantPresentationNodeIds.add(edge.sourceNodeId);
    }
  }

  let addedParent = true;
  while (addedParent) {
    addedParent = false;

    for (const presentationNodeId of [...relevantPresentationNodeIds]) {
      const parentAreaNodeId = authoredNodeById.get(presentationNodeId)?.metadata?.parentAreaNodeId;

      if (
        parentAreaNodeId &&
        presentationNodeIds.has(parentAreaNodeId) &&
        !relevantPresentationNodeIds.has(parentAreaNodeId)
      ) {
        relevantPresentationNodeIds.add(parentAreaNodeId);
        addedParent = true;
      }
    }
  }

  return relevantPresentationNodeIds;
}

function applyTemplateNodeLayoutRules(
  nodes: readonly DiagramNode[],
  nodeRulesById: ReadonlyMap<string, TemplateNodeLayoutRule>
): DiagramNode[] {
  return nodes.map((node) => {
    const rule = nodeRulesById.get(node.id);
    if (!rule) {
      return node;
    }

    const { parentAreaNodeId: _parentAreaNodeId, ...baseMetadata } = node.metadata ?? {};
    const metadata = { ...baseMetadata, ...(rule.metadata ?? {}) };

    return {
      ...node,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      position: { ...rule.position },
      size: { ...rule.size },
      zIndex: rule.zIndex
    };
  });
}

function detachGeneratedNodesFromProtectedTemplateAreas(
  nodes: readonly DiagramNode[],
  protectedTemplateNodeIds: ReadonlySet<string>
): DiagramNode[] {
  return nodes.map((node) => {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (
      !parentAreaNodeId ||
      !protectedTemplateNodeIds.has(parentAreaNodeId) ||
      protectedTemplateNodeIds.has(node.id)
    ) {
      return node;
    }

    const metadata = { ...node.metadata };
    delete metadata.parentAreaNodeId;

    return {
      ...node,
      metadata
    };
  });
}

function remapTemplateNodeMetadata(
  metadata: DiagramNode["metadata"],
  outputNodeIdByAuthoredNodeId: ReadonlyMap<string, string>
): DiagramNode["metadata"] {
  if (!metadata) {
    return undefined;
  }

  const { parentAreaNodeId, ...rest } = metadata;
  const remappedParentAreaNodeId = parentAreaNodeId
    ? outputNodeIdByAuthoredNodeId.get(parentAreaNodeId)
    : undefined;
  const remappedMetadata = {
    ...rest,
    ...(remappedParentAreaNodeId ? { parentAreaNodeId: remappedParentAreaNodeId } : {})
  };

  return Object.keys(remappedMetadata).length > 0 ? remappedMetadata : undefined;
}

function remapTemplatePresentationEdge(
  edge: DiagramEdge,
  outputNodeIdByAuthoredNodeId: ReadonlyMap<string, string>
): DiagramEdge | undefined {
  const sourceNodeId = outputNodeIdByAuthoredNodeId.get(edge.sourceNodeId);
  const targetNodeId = outputNodeIdByAuthoredNodeId.get(edge.targetNodeId);

  if (!sourceNodeId || !targetNodeId) {
    return undefined;
  }

  return {
    ...edge,
    sourceNodeId,
    targetNodeId
  };
}

function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && (TEMPLATE_IDS as readonly string[]).includes(value);
}

function getAuthoredTemplateEntityId(templateId: TemplateId, entityId: string): string {
  return `template-${templateId}-${entityId}`;
}

function getPlannedTemplatePresentationNodeId(templateId: TemplateId, nodeId: string): string {
  return `fixed-template-${templateId}-presentation-${nodeId}`;
}

function getArchitectureRelationshipKey(
  sourceId: string | undefined,
  targetId: string | undefined,
  label: string | undefined
): string {
  return `${sourceId ?? ""}\u0000${targetId ?? ""}\u0000${label ?? ""}`;
}

function hasAuthoredTemplatePosition(node: ArchitectureJson["nodes"][number]): boolean {
  const templateResourceId = node.config?.["templateResourceId"];

  return typeof templateResourceId === "string" && templateResourceId.trim().length > 0;
}

function preserveExistingNodeLayouts(
  nodes: readonly DiagramNode[],
  baseDiagram: DiagramJson | undefined
): DiagramNode[] {
  if (!baseDiagram) {
    return [...nodes];
  }

  const baseNodeById = new Map(baseDiagram.nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const baseNode = baseNodeById.get(node.id);

    if (!baseNode) {
      return node;
    }

    return {
      ...node,
      locked: baseNode.locked,
      position: { ...baseNode.position },
      size: { ...baseNode.size }
    };
  });
}

// 현재 보드 상태를 gg 분석 API가 이해하는 ArchitectureJson으로 되돌립니다.
export function convertDiagramJsonToArchitectureJson(diagramJson: DiagramJson): ArchitectureJson {
  const nodes = diagramJson.nodes.flatMap((node) => {
    const parameters = getConvertibleResourceNodeParameters(node);

    if (!parameters) {
      return [];
    }

    return [
      {
        config: createArchitectureConfig(parameters),
        id: node.id,
        label: node.label,
        positionX: node.position.x,
        positionY: node.position.y,
        type: mapTerraformResourceType(parameters)
      }
    ];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    edges: diagramJson.edges
      .filter(
        (edge) =>
          edge.metadata?.presentationRole !== "summary" &&
          nodeIds.has(edge.sourceNodeId) &&
          nodeIds.has(edge.targetNodeId)
      )
      .map((edge) => ({
        id: edge.id,
        label: edge.label,
        sourceId: edge.sourceNodeId,
        targetId: edge.targetNodeId
      })),
    nodes
  };
}

function convertArchitectureNodeToDiagramNode(
  node: ArchitectureJson["nodes"][number],
  index: number
): DiagramNode {
  const presentationNode = createPresentationDiagramNode(node, index);

  if (presentationNode) {
    return presentationNode;
  }

  const config = node.config ?? {};
  const authoredTerraformResourceType = config["terraformResourceType"];
  const terraformResourceType =
    typeof authoredTerraformResourceType === "string" &&
    authoredTerraformResourceType.trim().length > 0
      ? authoredTerraformResourceType
      : mapResourceTypeToTerraform(node.type);
  const position = {
    x: node.positionX,
    y: node.positionY
  };
  const zIndex = index + 1;
  const baseNode = createResourceCatalogDiagramNode(
    node.type,
    terraformResourceType,
    position,
    zIndex
  );

  return {
    ...baseNode,
    id: node.id,
    label: node.label ?? baseNode.label,
    locked: false,
    metadata: readDiagramNodeMetadata(config) ?? baseNode.metadata,
    parameters: createDiagramNodeParameters(node, terraformResourceType, baseNode.parameters),
    position,
    size: readDiagramNodeSize(config) ?? baseNode.size,
    style: mergeDiagramNodeStyle(baseNode.style, readDiagramNodeStyle(config)),
    type: terraformResourceType,
    zIndex
  };
}

function mergeDiagramNodeStyle(
  baseStyle: DiagramNode["style"],
  overrideStyle: DiagramNode["style"]
): DiagramNode["style"] | undefined {
  const style = {
    ...(baseStyle ?? {}),
    ...(overrideStyle ?? {})
  };

  return Object.keys(style).length > 0 ? style : undefined;
}

function createPresentationDiagramNode(
  node: ArchitectureJson["nodes"][number],
  index: number
): DiagramNode | null {
  const config = node.config ?? {};
  const kind = config["diagramKind"];
  const nodeType = config["diagramType"];

  if (kind !== "design" || typeof nodeType !== "string" || nodeType.trim().length === 0) {
    return null;
  }

  const resourceNode = createPresentationResourceDiagramNode(node, nodeType, index);

  if (resourceNode) {
    return resourceNode;
  }

  return {
    id: node.id,
    iconUrl: readDiagramNodeIconUrl(config) ?? getPresentationDiagramNodeIconUrl(nodeType),
    kind: "design",
    label: node.label ?? node.id,
    locked: false,
    metadata: readDiagramNodeMetadata(config),
    position: {
      x: node.positionX,
      y: node.positionY
    },
    size: readDiagramNodeSize(config) ?? { width: 160, height: 96 },
    style: readDiagramNodeStyle(config),
    type: nodeType,
    zIndex: index + 1
  };
}

function readDiagramNodeSize(config: ResourceConfig | undefined): DiagramNode["size"] | null {
  const width = config?.["diagramWidth"];
  const height = config?.["diagramHeight"];

  return typeof width === "number" && typeof height === "number" && width > 0 && height > 0
    ? { width, height }
    : null;
}

function readDiagramNodeMetadata(config: ResourceConfig): DiagramNode["metadata"] | undefined {
  const parentAreaNodeId = config["parentAreaNodeId"];

  return typeof parentAreaNodeId === "string" && parentAreaNodeId.trim().length > 0
    ? { parentAreaNodeId }
    : undefined;
}

function readDiagramNodeIconUrl(config: ResourceConfig): string | undefined {
  const iconUrl = config["diagramIconUrl"];

  return typeof iconUrl === "string" && iconUrl.trim().length > 0 ? iconUrl : undefined;
}

function getPresentationDiagramNodeIconUrl(nodeType: string): string | undefined {
  const normalizedNodeType = nodeType.trim();
  const catalogItemId = PRESENTATION_ICON_CATALOG_ITEM_BY_TYPE.get(normalizedNodeType);

  return catalogItemId ? RESOURCE_ITEMS_BY_DEFINITION_ID.get(catalogItemId)?.iconUrl : undefined;
}

function readDiagramNodeStyle(config: ResourceConfig): DiagramNode["style"] | undefined {
  const textColor = config["diagramTextColor"];
  const borderColor = config["diagramBorderColor"];
  const borderStyle = readDiagramBorderStyle(config["diagramBorderStyle"]);
  const style: NonNullable<DiagramNode["style"]> = {
    ...(typeof textColor === "string" && textColor.trim().length > 0 ? { textColor } : {}),
    ...(typeof borderColor === "string" && borderColor.trim().length > 0 ? { borderColor } : {}),
    ...(borderStyle ? { borderStyle } : {})
  };

  return Object.keys(style).length > 0 ? style : undefined;
}

function readDiagramBorderStyle(value: unknown): DiagramNodeBorderStyle | undefined {
  return value === "solid" || value === "dashed" || value === "dotted" ? value : undefined;
}

// jh Resource catalog를 거쳐 수동 drag/drop 노드와 같은 iconUrl, size, 기본 style을 사용합니다.
function createResourceCatalogDiagramNode(
  resourceType: ResourceType,
  terraformResourceType: string,
  position: DiagramNode["position"],
  zIndex: number
): DiagramNode {
  const definitionId = getDefaultResourceDefinitionByResourceType(resourceType)?.id;
  const resourceItem =
    (definitionId ? RESOURCE_ITEMS_BY_DEFINITION_ID.get(definitionId) : undefined) ??
    RESOURCE_ITEMS_BY_TERRAFORM_TYPE.get(terraformResourceType);

  if (!resourceItem) {
    return createFallbackDiagramNode(terraformResourceType, position, zIndex);
  }

  const payload: ResourceDragPayload = {
    source: "resource-settings-panel",
    item: resourceItem
  };

  return createDiagramNodeFromPayload(payload, position, zIndex);
}

function createFallbackDiagramNode(
  terraformResourceType: string,
  position: DiagramNode["position"],
  zIndex: number
): DiagramNode {
  return {
    id: "",
    kind: "resource",
    label: terraformResourceType,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: "resource",
      resourceType: terraformResourceType,
      terraformBlockType: DEFAULT_TERRAFORM_BLOCK_TYPE,
      values: {}
    },
    position,
    size: { ...DEFAULT_NODE_SIZE },
    style: {
      borderColor: "#2f6db3",
      textColor: "#172033"
    },
    type: terraformResourceType,
    zIndex
  };
}

// 보드 노드 파라미터는 jh 기본값 위에 AI config를 얹어 Terraform Preview와 맞춥니다.
function createDiagramNodeParameters(
  node: ArchitectureJson["nodes"][number],
  terraformResourceType: string,
  baseParameters: DiagramNodeParameters | undefined
): DiagramNodeParameters {
  const config = node.config ?? {};
  const authoredTerraformBlockType = readTerraformBlockType(config["terraformBlockType"]);
  const authoredTerraformResourceType = config["terraformResourceType"];
  const usesCompanionTerraformType =
    typeof authoredTerraformResourceType === "string" &&
    authoredTerraformResourceType !== mapResourceTypeToTerraform(node.type);
  const shouldInheritBaseValues = node.type !== "RDS_READ_REPLICA" && !usesCompanionTerraformType;

  return {
    fileName: baseParameters?.fileName ?? "main",
    resourceName: getArchitectureResourceName(node, terraformResourceType),
    resourceType: terraformResourceType,
    terraformBlockType:
      authoredTerraformBlockType ??
      baseParameters?.terraformBlockType ??
      DEFAULT_TERRAFORM_BLOCK_TYPE,
    values: {
      ...(shouldInheritBaseValues ? (baseParameters?.values ?? {}) : {}),
      ...getTerraformParameterConfigValues(config, terraformResourceType)
    }
  };
}

function getTerraformParameterConfigValues(
  config: ResourceConfig,
  terraformResourceType: string
): ResourceConfig {
  const values: ResourceConfig = {};
  const definitionByName = new Map(
    (terraformParameterCatalog.resources[terraformResourceType] ?? []).map((definition) => [
      definition.name,
      definition
    ])
  );

  for (const [key, value] of Object.entries(config)) {
    if (!DIAGRAM_ONLY_CONFIG_KEYS.has(key) && isMeaningfulGeneratedParameterValue(value)) {
      values[key] = normalizeGeneratedParameterValue(value, definitionByName.get(key));
    }
  }

  return values;
}

function normalizeGeneratedParameterValue(
  value: unknown,
  definition: ParameterCatalogDefinition | undefined
): unknown {
  if (definition?.inputKind !== "nested-block" || !definition.children) {
    return value;
  }

  if (definition.type === "list" || definition.type === "set") {
    const blocks = Array.isArray(value) ? value : isRecord(value) ? [value] : value;

    return Array.isArray(blocks)
      ? blocks.map((block) => normalizeGeneratedNestedBlock(block, definition.children ?? []))
      : blocks;
  }

  return normalizeGeneratedNestedBlock(value, definition.children);
}

function normalizeGeneratedNestedBlock(
  value: unknown,
  children: readonly ParameterCatalogDefinition[]
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const childByName = new Map(children.map((child) => [child.name, child]));

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, childValue]) => isMeaningfulGeneratedParameterValue(childValue))
      .map(([key, childValue]) => [
        key,
        normalizeGeneratedParameterValue(childValue, childByName.get(key))
      ])
  );
}

function isMeaningfulGeneratedParameterValue(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    (typeof value !== "string" || value.trim().length > 0)
  );
}

function readTerraformBlockType(value: unknown): TerraformBlockType | undefined {
  return value === "resource" || value === "data" ? value : undefined;
}

function convertArchitectureEdgesToDiagramEdges(
  edges: readonly ArchitectureJson["edges"][number][],
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramEdge[] {
  const occupiedRoutes: OccupiedRoute[] = [];
  const routedEdges = new Map<string, DiagramEdge>();
  const routingItems = edges
    .map((edge, index) => ({ edge, index }))
    .sort(
      (leftItem, rightItem) =>
        getEdgeRoutingPriority(leftItem.edge.sourceId, leftItem.edge.targetId, nodeById) -
          getEdgeRoutingPriority(rightItem.edge.sourceId, rightItem.edge.targetId, nodeById) ||
        leftItem.index - rightItem.index
    );

  for (const { edge } of routingItems) {
    const diagramEdge = convertArchitectureEdgeToDiagramEdge(edge, nodeById, occupiedRoutes);
    addOccupiedRoute(diagramEdge, nodeById, occupiedRoutes);
    routedEdges.set(edge.id, diagramEdge);
  }

  return edges
    .map((edge) => routedEdges.get(edge.id))
    .filter((edge): edge is DiagramEdge => Boolean(edge));
}

function convertArchitectureEdgeToDiagramEdge(
  edge: ArchitectureJson["edges"][number],
  nodeById: ReadonlyMap<string, DiagramNode>,
  occupiedRoutes: readonly OccupiedRoute[]
): DiagramEdge {
  const handles =
    readAuthoredArchitectureEdgeHandles(edge) ??
    getDefaultEdgeHandles(
      nodeById.get(edge.sourceId),
      nodeById.get(edge.targetId),
      [...nodeById.values()],
      occupiedRoutes
    );

  return {
    id: edge.id,
    label: edge.label,
    sourceNodeId: edge.sourceId,
    sourceHandleId: handles.sourceHandleId,
    style:
      readAuthoredArchitectureEdgeStyle(edge) ??
      getDiagramEdgeStyleForArchitectureEdge(edge, nodeById),
    targetHandleId: handles.targetHandleId,
    targetNodeId: edge.targetId,
    type: readAuthoredArchitectureEdgeType(edge) ?? "smoothstep"
  };
}

type AuthoredArchitectureEdge = ArchitectureJson["edges"][number] & {
  readonly diagramColor?: unknown;
  readonly diagramLineStyle?: unknown;
  readonly diagramSourceHandleId?: unknown;
  readonly diagramTargetHandleId?: unknown;
  readonly diagramType?: unknown;
  readonly diagramWidth?: unknown;
};

function readAuthoredArchitectureEdgeHandles(
  edge: ArchitectureJson["edges"][number]
): Pick<DiagramEdge, "sourceHandleId" | "targetHandleId"> | undefined {
  const authoredEdge = edge as AuthoredArchitectureEdge;
  const sourceHandleId = authoredEdge.diagramSourceHandleId;
  const targetHandleId = authoredEdge.diagramTargetHandleId;

  return typeof sourceHandleId === "string" && typeof targetHandleId === "string"
    ? { sourceHandleId, targetHandleId }
    : undefined;
}

function createReadablePresentationEdges(
  edges: readonly DiagramEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>,
  authoredEdgeIds: ReadonlySet<string>
): DiagramEdge[] {
  if (edges.length < DENSE_PRESENTATION_EDGE_THRESHOLD) {
    return [...edges];
  }

  const roleByNodeId = new Map(
    [...nodeById].map(([nodeId, node]) => [nodeId, getAutomaticDiagramSemanticRole(node)])
  );
  const classifiedEdges = edges.map((edge) => {
    const sourceRole = roleByNodeId.get(edge.sourceNodeId) ?? "support";
    const targetRole = roleByNodeId.get(edge.targetNodeId) ?? "support";
    const forcedPresentationRole = edge.metadata?.presentationRole;
    const isPrimary = forcedPresentationRole
      ? forcedPresentationRole !== "detail"
      : authoredEdgeIds.has(edge.id) ||
        isDirectPresentationRelationship(
          nodeById.get(edge.sourceNodeId),
          nodeById.get(edge.targetNodeId),
          sourceRole,
          targetRole
        );

    return {
      ...edge,
      metadata: {
        ...edge.metadata,
        presentationRole: isPrimary ? ("primary" as const) : ("detail" as const)
      },
      ...(isPrimary && edge.style?.lineStyle === "solid" && edge.style.width === "thin"
        ? { style: { ...edge.style, width: "medium" as const } }
        : {})
    };
  });
  const summaryEdges = createCollapsedPresentationEdges(edges, nodeById, roleByNodeId).filter(
    (edge) => !hasVisiblePresentationPath(classifiedEdges, edge.sourceNodeId, edge.targetNodeId)
  );
  const runtimeDataEdge = createRuntimeDataPresentationEdge(
    [...classifiedEdges, ...summaryEdges],
    nodeById,
    roleByNodeId
  );

  return runtimeDataEdge
    ? [...classifiedEdges, ...summaryEdges, runtimeDataEdge]
    : [...classifiedEdges, ...summaryEdges];
}

function hasVisiblePresentationPath(
  edges: readonly DiagramEdge[],
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  const visibleTargetsBySourceId = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.metadata?.presentationRole === "detail") {
      continue;
    }

    const targets = visibleTargetsBySourceId.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    visibleTargetsBySourceId.set(edge.sourceNodeId, targets);
  }

  const visitedNodeIds = new Set([sourceNodeId]);
  const pendingNodeIds = [...(visibleTargetsBySourceId.get(sourceNodeId) ?? [])];

  while (pendingNodeIds.length > 0) {
    const currentNodeId = pendingNodeIds.shift();
    if (!currentNodeId) {
      continue;
    }
    if (currentNodeId === targetNodeId) {
      return true;
    }
    if (visitedNodeIds.has(currentNodeId)) {
      continue;
    }

    visitedNodeIds.add(currentNodeId);
    pendingNodeIds.push(...(visibleTargetsBySourceId.get(currentNodeId) ?? []));
  }

  return false;
}

function createCollapsedPresentationEdges(
  edges: readonly DiagramEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>,
  roleByNodeId: ReadonlyMap<string, AutomaticDiagramSemanticRole>
): DiagramEdge[] {
  const outgoingEdgesByNodeId = new Map<string, DiagramEdge[]>();
  const occupiedPairKeys = new Set<string>();

  for (const edge of edges) {
    const outgoingEdges = outgoingEdgesByNodeId.get(edge.sourceNodeId) ?? [];
    outgoingEdges.push(edge);
    outgoingEdgesByNodeId.set(edge.sourceNodeId, outgoingEdges);
    occupiedPairKeys.add(getPresentationPairKey(edge.sourceNodeId, edge.targetNodeId));
  }

  const summaries: DiagramEdge[] = [];
  const endpointNodes = [...nodeById.values()].filter((node) =>
    isPresentationEndpoint(node, roleByNodeId.get(node.id) ?? "support")
  );

  for (const sourceNode of endpointNodes) {
    const sourceRole = roleByNodeId.get(sourceNode.id) ?? "support";
    const visitedDetailNodeIds = new Set<string>();
    const pending = (outgoingEdgesByNodeId.get(sourceNode.id) ?? []).map((edge) => ({
      depth: 1,
      nodeId: edge.targetNodeId
    }));

    while (pending.length > 0) {
      const current = pending.shift();
      if (!current || current.depth > PRESENTATION_PATH_MAX_DEPTH) {
        continue;
      }

      const currentNode = nodeById.get(current.nodeId);
      const currentRole = roleByNodeId.get(current.nodeId) ?? "support";
      if (!currentNode || currentNode.id === sourceNode.id) {
        continue;
      }

      if (isPresentationEndpoint(currentNode, currentRole)) {
        const pairKey = getPresentationPairKey(sourceNode.id, currentNode.id);
        if (!occupiedPairKeys.has(pairKey) && isPresentationRolePair(sourceRole, currentRole)) {
          summaries.push(
            createSummaryPresentationEdge(
              sourceNode,
              currentNode,
              sourceRole,
              currentRole,
              nodeById
            )
          );
          occupiedPairKeys.add(pairKey);
        }
        continue;
      }

      if (
        isAreaNode(currentNode) ||
        currentRole === "network" ||
        visitedDetailNodeIds.has(currentNode.id)
      ) {
        continue;
      }

      visitedDetailNodeIds.add(currentNode.id);
      for (const nextEdge of outgoingEdgesByNodeId.get(currentNode.id) ?? []) {
        pending.push({ depth: current.depth + 1, nodeId: nextEdge.targetNodeId });
      }
    }
  }

  return summaries;
}

function createRuntimeDataPresentationEdge(
  visibleEdges: readonly DiagramEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>,
  roleByNodeId: ReadonlyMap<string, AutomaticDiagramSemanticRole>
): DiagramEdge | undefined {
  const computeNodes = [...nodeById.values()].filter(
    (node) =>
      !isAreaNode(node) &&
      roleByNodeId.get(node.id) === "compute" &&
      /(?:ecs_service|lambda_function|instance|autoscaling_group|kubernetes_deployment)\b/u.test(
        getDiagramNodeResourceType(node)
      )
  );
  const databaseNodes = [...nodeById.values()].filter(
    (node) =>
      !isAreaNode(node) &&
      roleByNodeId.get(node.id) === "data" &&
      /(?:db_instance|rds|dynamodb|sql_database|database)\b/u.test(getDiagramNodeResourceType(node))
  );

  if (computeNodes.length !== 1 || databaseNodes.length !== 1) {
    return undefined;
  }

  const sourceNode = computeNodes[0];
  const targetNode = databaseNodes[0];
  if (!sourceNode || !targetNode) {
    return undefined;
  }

  const alreadyVisible = visibleEdges.some(
    (edge) =>
      edge.metadata?.presentationRole !== "detail" &&
      edge.sourceNodeId === sourceNode.id &&
      edge.targetNodeId === targetNode.id
  );

  return alreadyVisible
    ? undefined
    : createSummaryPresentationEdge(sourceNode, targetNode, "compute", "data", nodeById);
}

function createSummaryPresentationEdge(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  sourceRole: AutomaticDiagramSemanticRole,
  targetRole: AutomaticDiagramSemanticRole,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramEdge {
  const handles = getDefaultEdgeHandles(sourceNode, targetNode, [...nodeById.values()], []);

  return {
    id: `summary-${sourceNode.id}-to-${targetNode.id}`,
    label: getSummaryPresentationEdgeLabel(sourceRole, targetRole),
    metadata: { presentationRole: "summary" },
    sourceHandleId: handles.sourceHandleId,
    sourceNodeId: sourceNode.id,
    style: { ...SUMMARY_PRESENTATION_EDGE_STYLE },
    targetHandleId: handles.targetHandleId,
    targetNodeId: targetNode.id,
    type: "smoothstep"
  };
}

function isDirectPresentationRelationship(
  sourceNode: DiagramNode | undefined,
  targetNode: DiagramNode | undefined,
  sourceRole: AutomaticDiagramSemanticRole,
  targetRole: AutomaticDiagramSemanticRole
): boolean {
  if (!sourceNode || !targetNode) {
    return false;
  }

  return (
    !isAreaNode(sourceNode) &&
    !isAreaNode(targetNode) &&
    isPresentationRolePair(sourceRole, targetRole)
  );
}

function isPresentationEndpoint(node: DiagramNode, role: AutomaticDiagramSemanticRole): boolean {
  return !isAreaNode(node) && PRESENTATION_ENDPOINT_ROLES.has(role);
}

function isPresentationRolePair(
  sourceRole: AutomaticDiagramSemanticRole,
  targetRole: AutomaticDiagramSemanticRole
): boolean {
  if (
    !PRESENTATION_ENDPOINT_ROLES.has(sourceRole) ||
    !PRESENTATION_ENDPOINT_ROLES.has(targetRole)
  ) {
    return false;
  }

  if (sourceRole === "delivery" || targetRole === "delivery") {
    return (
      (sourceRole === "delivery" && (targetRole === "delivery" || targetRole === "compute")) ||
      (targetRole === "delivery" && sourceRole === "compute")
    );
  }

  return true;
}

function getSummaryPresentationEdgeLabel(
  sourceRole: AutomaticDiagramSemanticRole,
  targetRole: AutomaticDiagramSemanticRole
): string {
  if (sourceRole === "entry" && targetRole === "compute") return "routes requests";
  if (sourceRole === "compute" && targetRole === "data") return "reads / writes";
  if (sourceRole === "delivery" && targetRole === "compute") return "deploys";
  if (sourceRole === "actor" && targetRole === "entry") return "requests";
  if (sourceRole === "async" && targetRole === "compute") return "triggers";
  if (sourceRole === "compute" && targetRole === "async") return "publishes";

  return "connects";
}

function getPresentationPairKey(sourceNodeId: string, targetNodeId: string): string {
  return `${sourceNodeId}\u0000${targetNodeId}`;
}

function reduceDenseDiagramEdgeLabels(
  edges: readonly DiagramEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramEdge[] {
  if (edges.length < 10) {
    return [...edges];
  }

  const visibleRelationshipLabels = new Set<string>();

  return edges.map((edge) => {
    if (!edge.label) {
      return edge;
    }

    const sourceNode = nodeById.get(edge.sourceNodeId);
    const targetNode = nodeById.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      return edge;
    }

    const sourceRole = getAutomaticDiagramSemanticRole(sourceNode);
    const targetRole = getAutomaticDiagramSemanticRole(targetNode);
    const relationshipKey = `${edge.sourceNodeId}:${edge.label.trim().toLowerCase()}`;
    const shouldHideLabel =
      DENSE_DIAGRAM_SUPPORT_ROLES.has(sourceRole) ||
      DENSE_DIAGRAM_SUPPORT_ROLES.has(targetRole) ||
      visibleRelationshipLabels.has(relationshipKey);

    if (shouldHideLabel) {
      return { ...edge, label: undefined };
    }

    visibleRelationshipLabels.add(relationshipKey);
    return edge;
  });
}

function readAuthoredArchitectureEdgeStyle(
  edge: ArchitectureJson["edges"][number]
): NonNullable<DiagramEdge["style"]> | undefined {
  const authoredEdge = edge as AuthoredArchitectureEdge;
  const color = authoredEdge.diagramColor;
  const lineStyle = authoredEdge.diagramLineStyle;
  const width = authoredEdge.diagramWidth;

  if (typeof color !== "string" && typeof lineStyle !== "string" && typeof width !== "string") {
    return undefined;
  }

  return {
    animated: false,
    ...(typeof color === "string" ? { color } : {}),
    ...(lineStyle === "solid" || lineStyle === "dashed" || lineStyle === "dotted"
      ? { lineStyle }
      : {}),
    ...(width === "thin" || width === "medium" || width === "thick" ? { width } : {})
  };
}

function readAuthoredArchitectureEdgeType(
  edge: ArchitectureJson["edges"][number]
): string | undefined {
  const diagramType = (edge as AuthoredArchitectureEdge).diagramType;

  return typeof diagramType === "string" && diagramType.trim().length > 0 ? diagramType : undefined;
}

function getEdgeRoutingPriority(
  sourceNodeId: string,
  targetNodeId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): number {
  const sourceType = getDiagramNodeResourceType(nodeById.get(sourceNodeId));
  const targetType = getDiagramNodeResourceType(nodeById.get(targetNodeId));

  if (isObservabilityRoutingType(sourceType) || isObservabilityRoutingType(targetType)) {
    return 20;
  }

  if (isControlPlaneRoutingType(sourceType) || isControlPlaneRoutingType(targetType)) {
    return 30;
  }

  if (isRuntimeStorageRoutingType(sourceType) || isRuntimeStorageRoutingType(targetType)) {
    return 10;
  }

  return 40;
}

function isObservabilityRoutingType(resourceType: string): boolean {
  return (
    resourceType === "aws_cloudwatch_log_group" ||
    resourceType === "aws_cloudwatch_metric_alarm" ||
    resourceType === "aws_cloudwatch_dashboard" ||
    resourceType === "aws_kms_key"
  );
}

function isRuntimeStorageRoutingType(resourceType: string): boolean {
  return (
    resourceType === "aws_lambda_function" ||
    resourceType === "aws_instance" ||
    resourceType === "aws_autoscaling_group" ||
    resourceType === "aws_lb_target_group" ||
    resourceType === "aws_s3_bucket" ||
    resourceType === "aws_db_instance" ||
    resourceType === "aws_ebs_volume"
  );
}

function isControlPlaneRoutingType(resourceType: string): boolean {
  return (
    resourceType === "aws_iam_role" ||
    resourceType === "aws_iam_policy" ||
    resourceType === "aws_iam_instance_profile" ||
    resourceType === "aws_lambda_permission" ||
    resourceType === "aws_security_group" ||
    resourceType === "aws_security_group_rule"
  );
}

function isConfigurationDependencyRoutingType(resourceType: string): boolean {
  return (
    isControlPlaneRoutingType(resourceType) ||
    resourceType === "aws_acm_certificate" ||
    resourceType === "aws_ami" ||
    resourceType === "aws_key_pair" ||
    resourceType === "aws_kms_key" ||
    resourceType === "aws_launch_template"
  );
}

export function normalizeDiagramJsonConventions(diagramJson: DiagramJson): DiagramJson {
  const preparedNodes = normalizeDiagramResourceNodeGeometry(diagramJson).nodes;
  const laidOutNodes = resolveSiblingNodeCollisions(
    fitAreaNodesToChildren(applyReadableTopologyLayout(preparedNodes))
  );
  const nodes = applyDiagramLayerOrder(
    fitAreaNodesToChildren(fitSecurityGroupScopesToTargets(laidOutNodes))
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return {
    ...diagramJson,
    edges: removeRepositoryGeneratedSupportEdges(
      normalizeDiagramEdges(
        diagramJson.edges.filter(
          (edge) =>
            shouldRenderDiagramEdge(edge, nodeById) &&
            !isRepositoryGeneratedSupportDependencyEdge(edge, nodeById)
        ),
        nodeById
      ),
      nodeById,
      false
    ),
    nodes
  };
}

export function normalizeRepositoryGeneratedDiagramLayout(diagramJson: DiagramJson): DiagramJson {
  if (!isRepositoryGeneratedDiagramLayout(diagramJson)) {
    return diagramJson;
  }

  const nodes = applyDiagramLayerOrder(
    fitAreaNodesToChildren(
      applyRepositoryGeneratedReferenceLayout(fitSecurityGroupScopesToTargets(diagramJson.nodes))
    )
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return {
    ...diagramJson,
    edges: removeRepositoryGeneratedSupportEdges(
      normalizeDiagramEdges(
        diagramJson.edges.filter(
          (edge) =>
            shouldRenderDiagramEdge(edge, nodeById) &&
            !isRepositoryGeneratedSupportDependencyEdge(edge, nodeById)
        ),
        nodeById
      ),
      nodeById,
      false
    ),
    nodes
  };
}

function createPresentationResourceDiagramNode(
  node: ArchitectureJson["nodes"][number],
  nodeType: string,
  index: number
): DiagramNode | null {
  const terraformResourceType = nodeType.trim();
  const resourceItem = RESOURCE_ITEMS_BY_TERRAFORM_TYPE.get(terraformResourceType);

  if (!resourceItem) {
    return null;
  }

  const position = {
    x: node.positionX,
    y: node.positionY
  };
  const baseNode = createResourceCatalogDiagramNode(
    node.type,
    terraformResourceType,
    position,
    index + 1
  );

  return {
    ...baseNode,
    id: node.id,
    label: node.label ?? baseNode.label,
    locked: false,
    metadata: readDiagramNodeMetadata(node.config ?? {}) ?? baseNode.metadata,
    parameters: createDiagramNodeParameters(node, terraformResourceType, baseNode.parameters),
    position,
    size: readDiagramNodeSize(node.config) ?? baseNode.size,
    style: mergeDiagramNodeStyle(baseNode.style, readDiagramNodeStyle(node.config ?? {})),
    type: terraformResourceType,
    zIndex: index + 1
  };
}

export function sanitizeSavedRepositoryGeneratedDiagramLayout(
  diagramJson: DiagramJson
): DiagramJson {
  if (!isRepositoryGeneratedDiagramLayout(diagramJson)) {
    return diagramJson;
  }

  const nodes = applyDiagramLayerOrder(
    restoreSavedRepositoryGeneratedNodeSemantics(
      applyPresentationIconUrls(
        restoreSavedRepositoryTemplateSemantics(
          flattenRepositoryManagedServicesArea(diagramJson.nodes)
        )
      )
    )
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return {
    ...diagramJson,
    edges: removeRepositoryGeneratedSupportEdges(
      normalizeDiagramEdges(
        diagramJson.edges.filter(
          (edge) =>
            shouldRenderDiagramEdge(edge, nodeById) &&
            !isRepositoryGeneratedSupportDependencyEdge(edge, nodeById)
        ),
        nodeById
      ),
      nodeById,
      false
    ),
    nodes
  };
}

function restoreSavedRepositoryTemplateSemantics(nodes: readonly DiagramNode[]): DiagramNode[] {
  let restoredNodes = [...nodes];

  for (const templateId of TEMPLATE_IDS) {
    const fixedPrefix = `fixed-template-${templateId}-`;
    const savedTemplateNodes = nodes.filter((node) => node.id.startsWith(fixedPrefix));

    if (savedTemplateNodes.length === 0) {
      continue;
    }

    const authoredDiagram = buildTemplateDiagramJson(templateId, {
      projectSlug: "repository-restore",
      shortId: "layout"
    });
    const authoredPrefix = `template-${templateId}-`;
    const authoredNodeById = new Map(authoredDiagram.nodes.map((node) => [node.id, node]));
    const outputNodeIdByAuthoredNodeId = new Map(
      savedTemplateNodes.flatMap((node) => {
        const authoredNodeId = `${authoredPrefix}${node.id.slice(fixedPrefix.length)}`;
        return authoredNodeById.has(authoredNodeId) ? [[authoredNodeId, node.id] as const] : [];
      })
    );

    restoredNodes = restoredNodes.map((node) => {
      if (!node.id.startsWith(fixedPrefix)) {
        return node;
      }

      const authoredNodeId = `${authoredPrefix}${node.id.slice(fixedPrefix.length)}`;
      const authoredNode = authoredNodeById.get(authoredNodeId);

      if (!authoredNode) {
        return node;
      }

      const { parentAreaNodeId: _savedParentAreaNodeId, ...savedMetadata } = node.metadata ?? {};
      const metadata = {
        ...savedMetadata,
        ...remapTemplateNodeMetadata(authoredNode.metadata, outputNodeIdByAuthoredNodeId)
      };

      return {
        ...node,
        ...(authoredNode.kind === "design" ? { iconUrl: authoredNode.iconUrl } : {}),
        kind: authoredNode.kind,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        type: authoredNode.type
      };
    });
  }

  return restoredNodes;
}

function restoreSavedRepositoryGeneratedNodeSemantics(
  nodes: readonly DiagramNode[]
): DiagramNode[] {
  return nodes.map((node) => {
    if (node.id !== "repository-fargate-runtime" || node.type !== "aws_ecs_task_definition") {
      return node;
    }

    const baseNode = createResourceCatalogDiagramNode(
      "UNKNOWN",
      "aws_ecs_task_definition",
      node.position,
      node.zIndex ?? 0
    );
    const position = {
      x: node.position.x + (node.size.width - baseNode.size.width) / 2,
      y: node.position.y + (node.size.height - baseNode.size.height) / 2
    };

    return {
      ...baseNode,
      id: node.id,
      label: node.label,
      locked: node.locked,
      metadata: node.metadata,
      parameters: {
        ...(node.parameters ?? baseNode.parameters!),
        values: {
          ...(node.parameters?.values ?? baseNode.parameters?.values ?? {}),
          sketchcatchReferenceTerraform: true
        }
      },
      position: node.kind === "design" ? position : node.position,
      style: mergeDiagramNodeStyle(baseNode.style, node.style),
      zIndex: node.zIndex
    };
  });
}

function isRepositoryGeneratedDiagramLayout(diagramJson: DiagramJson): boolean {
  const nodeIds = new Set(diagramJson.nodes.map((node) => node.id));

  return (
    nodeIds.has("repository-browser") &&
    nodeIds.has("repository-cloudfront") &&
    nodeIds.has("repository-web-assets") &&
    nodeIds.has("repository-fargate-runtime") &&
    [...nodeIds].some((id) => /^fixed-template-ecs-fargate-container-app-vpc$/u.test(id))
  );
}

function normalizeDiagramEdges(
  edges: readonly DiagramEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramEdge[] {
  const occupiedRoutes: OccupiedRoute[] = [];
  const routedEdges = new Map<string, DiagramEdge>();
  const routingItems = edges
    .map((edge, index) => ({ edge, index }))
    .sort(
      (leftItem, rightItem) =>
        getEdgeRoutingPriority(leftItem.edge.sourceNodeId, leftItem.edge.targetNodeId, nodeById) -
          getEdgeRoutingPriority(
            rightItem.edge.sourceNodeId,
            rightItem.edge.targetNodeId,
            nodeById
          ) || leftItem.index - rightItem.index
    );

  for (const { edge } of routingItems) {
    const diagramEdge = normalizeDiagramEdge(edge, nodeById, occupiedRoutes);
    addOccupiedRoute(diagramEdge, nodeById, occupiedRoutes);
    routedEdges.set(edge.id, diagramEdge);
  }

  return edges
    .map((edge) => routedEdges.get(edge.id))
    .filter((edge): edge is DiagramEdge => Boolean(edge));
}

function normalizeDiagramEdge(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode>,
  occupiedRoutes: readonly OccupiedRoute[]
): DiagramEdge {
  const handles = getDefaultEdgeHandles(
    nodeById.get(edge.sourceNodeId),
    nodeById.get(edge.targetNodeId),
    [...nodeById.values()],
    occupiedRoutes
  );
  const inferredStyle = getDiagramEdgeStyleForExistingEdge(edge, nodeById);
  const shouldPreferInferredStyle =
    isNonDefaultDiagramEdgeStyle(inferredStyle) &&
    (edge.style?.lineStyle == null || edge.style.lineStyle === "solid");

  return {
    ...edge,
    sourceHandleId: handles.sourceHandleId,
    style: {
      animated: edge.style?.animated ?? inferredStyle.animated,
      color: shouldPreferInferredStyle
        ? inferredStyle.color
        : (edge.style?.color ?? inferredStyle.color),
      lineStyle: shouldPreferInferredStyle
        ? inferredStyle.lineStyle
        : (edge.style?.lineStyle ?? inferredStyle.lineStyle),
      width: shouldPreferInferredStyle
        ? inferredStyle.width
        : (edge.style?.width ?? inferredStyle.width)
    },
    targetHandleId: handles.targetHandleId,
    type: edge.type ?? "smoothstep"
  };
}

function isNonDefaultDiagramEdgeStyle(style: NonNullable<DiagramEdge["style"]>): boolean {
  return (
    style.lineStyle !== DEFAULT_EDGE_STYLE.lineStyle ||
    style.width !== DEFAULT_EDGE_STYLE.width ||
    style.color !== DEFAULT_EDGE_STYLE.color
  );
}

function shouldRenderDiagramEdge(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  const sourceNode = nodeById.get(edge.sourceNodeId);
  const targetNode = nodeById.get(edge.targetNodeId);

  if (!sourceNode || !targetNode) {
    return false;
  }

  const architectureEdge = {
    id: edge.id,
    label: edge.label,
    sourceId: edge.sourceNodeId,
    targetId: edge.targetNodeId
  };

  return !isAreaContainmentRenderEdge(architectureEdge, sourceNode, targetNode, nodeById);
}

function getDiagramEdgeStyleForExistingEdge(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode>
): NonNullable<DiagramEdge["style"]> {
  const labelStyle = getDiagramEdgeStyle(edge.label);

  if (
    labelStyle.lineStyle !== DEFAULT_EDGE_STYLE.lineStyle ||
    labelStyle.width !== DEFAULT_EDGE_STYLE.width
  ) {
    return labelStyle;
  }

  return getDiagramEdgeStyleFromEndpoints(
    edge.sourceNodeId,
    edge.targetNodeId,
    nodeById,
    labelStyle
  );
}

function getDiagramEdgeStyleForArchitectureEdge(
  edge: ArchitectureJson["edges"][number],
  nodeById: ReadonlyMap<string, DiagramNode>
): NonNullable<DiagramEdge["style"]> {
  const labelStyle = getDiagramEdgeStyle(edge.label);

  if (
    labelStyle.lineStyle !== DEFAULT_EDGE_STYLE.lineStyle ||
    labelStyle.width !== DEFAULT_EDGE_STYLE.width
  ) {
    return labelStyle;
  }

  return getDiagramEdgeStyleFromEndpoints(edge.sourceId, edge.targetId, nodeById, labelStyle);
}

function getDiagramEdgeStyleFromEndpoints(
  sourceNodeId: string,
  targetNodeId: string,
  nodeById: ReadonlyMap<string, DiagramNode>,
  fallbackStyle: NonNullable<DiagramEdge["style"]>
): NonNullable<DiagramEdge["style"]> {
  const sourceResourceType = getDiagramNodeResourceType(nodeById.get(sourceNodeId));
  const targetResourceType = getDiagramNodeResourceType(nodeById.get(targetNodeId));

  if (
    isConfigurationDependencyRoutingType(sourceResourceType) ||
    isConfigurationDependencyRoutingType(targetResourceType)
  ) {
    return { ...DEPENDENCY_EDGE_STYLE };
  }

  if (isAsyncResourceType(sourceResourceType) || isAsyncResourceType(targetResourceType)) {
    return { ...ASYNC_EDGE_STYLE };
  }

  return fallbackStyle;
}

function getDiagramEdgeStyle(label: string | undefined): NonNullable<DiagramEdge["style"]> {
  const normalizedLabel = label?.trim().toLowerCase() ?? "";

  for (const entry of EDGE_STYLE_LABEL_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalizedLabel))) {
      return { ...entry.style };
    }
  }

  return { ...DEFAULT_EDGE_STYLE };
}

function shouldRenderArchitectureEdge(
  edge: ArchitectureJson["edges"][number],
  architectureNodeIds: ReadonlySet<string>,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  if (!architectureNodeIds.has(edge.sourceId) || !architectureNodeIds.has(edge.targetId)) {
    return false;
  }

  const sourceNode = nodeById.get(edge.sourceId);
  const targetNode = nodeById.get(edge.targetId);

  if (!sourceNode || !targetNode) {
    return false;
  }

  return !isAreaContainmentRenderEdge(edge, sourceNode, targetNode, nodeById);
}

// contains/hosts는 실제 containment Area가 source일 때만 화면 edge 대신 parent 관계로 숨깁니다.
function isAreaContainmentRenderEdge(
  edge: ArchitectureJson["edges"][number],
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  if (isAreaParentEdge(edge) && isContainmentAreaNode(sourceNode)) {
    return true;
  }

  const normalizedLabel = edge.label?.trim().toLowerCase();
  return (
    normalizedLabel === "references" &&
    isContainmentAreaNode(targetNode) &&
    hasAreaAncestor(sourceNode, targetNode.id, nodeById)
  );
}

function hasAreaAncestor(
  node: DiagramNode,
  ancestorAreaNodeId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>();

  while (parentAreaNodeId) {
    if (parentAreaNodeId === ancestorAreaNodeId) {
      return true;
    }

    if (visitedNodeIds.has(parentAreaNodeId)) {
      return false;
    }

    visitedNodeIds.add(parentAreaNodeId);
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return false;
}

function getDefaultEdgeHandles(
  sourceNode: DiagramNode | undefined,
  targetNode: DiagramNode | undefined,
  nodes: readonly DiagramNode[] = [],
  occupiedRoutes: readonly OccupiedRoute[] = []
): Pick<DiagramEdge, "sourceHandleId" | "targetHandleId"> {
  if (!sourceNode || !targetNode) {
    return {
      sourceHandleId: EDGE_HANDLE_IDS.right,
      targetHandleId: EDGE_HANDLE_IDS.left
    };
  }

  const routedHandles = getLowestOverlapEdgeHandles(sourceNode, targetNode, nodes, occupiedRoutes);

  if (routedHandles?.sourceHandleId && routedHandles.targetHandleId) {
    const completeRoutedHandles = {
      sourceHandleId: routedHandles.sourceHandleId,
      targetHandleId: routedHandles.targetHandleId
    };

    if (!doesOrthogonalRouteCrossResource(sourceNode, targetNode, completeRoutedHandles, nodes)) {
      return completeRoutedHandles;
    }
  }

  return getObstacleSafeEdgeHandles(sourceNode, targetNode, nodes);
}

function getLowestOverlapEdgeHandles(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  nodes: readonly DiagramNode[],
  occupiedRoutes: readonly OccupiedRoute[]
): Pick<DiagramEdge, "sourceHandleId" | "targetHandleId"> | undefined {
  const sourceHandles = Object.values(EDGE_HANDLE_IDS);
  const targetHandles = Object.values(EDGE_HANDLE_IDS);
  let bestHandles: Pick<DiagramEdge, "sourceHandleId" | "targetHandleId"> | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const sourceHandleId of sourceHandles) {
    for (const targetHandleId of targetHandles) {
      const score = scoreEdgeRouteOverlap(
        sourceNode,
        targetNode,
        sourceHandleId,
        targetHandleId,
        nodes,
        occupiedRoutes
      );

      if (score < bestScore) {
        bestScore = score;
        bestHandles = { sourceHandleId, targetHandleId };
      }
    }
  }

  return bestHandles;
}

type RouteSegment = {
  readonly from: DiagramNode["position"];
  readonly to: DiagramNode["position"];
};

type OccupiedRoute = {
  readonly id: string;
  readonly segments: readonly RouteSegment[];
  readonly sourceHandleId: string;
  readonly sourceNodeId: string;
  readonly targetHandleId: string;
  readonly targetNodeId: string;
};

function scoreEdgeRouteOverlap(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  sourceHandleId: string,
  targetHandleId: string,
  nodes: readonly DiagramNode[],
  occupiedRoutes: readonly OccupiedRoute[]
): number {
  const routeSegments = getOrthogonalRouteSegments(
    getNodeHandlePoint(sourceNode, sourceHandleId),
    getNodeHandlePoint(targetNode, targetHandleId),
    sourceHandleId,
    targetHandleId
  );
  let score =
    getRouteLength(routeSegments) +
    getHandleDirectionPenalty(sourceNode, targetNode, sourceHandleId, targetHandleId) +
    getControlPlaneRuntimeHandlePenalty(sourceNode, targetNode, sourceHandleId, targetHandleId) +
    getObservabilityBranchHandlePenalty(sourceNode, targetNode, sourceHandleId, targetHandleId) +
    getEndpointNodeReentryOverlapLength(routeSegments, sourceNode, targetNode) * 10_000;

  for (const node of nodes) {
    if (node.id === sourceNode.id || node.id === targetNode.id || isAreaDiagramNode(node)) {
      continue;
    }

    score +=
      routeSegments.reduce(
        (total, segment) => total + getSegmentNodeOverlapLength(segment, node),
        0
      ) * EDGE_ROUTE_NODE_OVERLAP_PENALTY;
  }

  for (const occupiedRoute of occupiedRoutes) {
    if (
      occupiedRoute.sourceNodeId === sourceNode.id &&
      occupiedRoute.targetNodeId === targetNode.id
    ) {
      continue;
    }

    score += getSharedHandlePenalty(
      sourceNode,
      targetNode,
      sourceHandleId,
      targetHandleId,
      occupiedRoute
    );
    score +=
      getRouteOverlapLength(routeSegments, occupiedRoute.segments) *
      EDGE_ROUTE_SEGMENT_OVERLAP_PENALTY;
    score +=
      getRouteCrowdingLength(routeSegments, occupiedRoute.segments) *
      EDGE_ROUTE_SEGMENT_CROWDING_PENALTY;
    score +=
      getRouteCrossingCount(routeSegments, occupiedRoute.segments) * EDGE_ROUTE_CROSSING_PENALTY;
  }

  return score;
}

function getControlPlaneRuntimeHandlePenalty(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  sourceHandleId: string,
  targetHandleId: string
): number {
  const sourceType = getDiagramNodeResourceType(sourceNode);
  const targetType = getDiagramNodeResourceType(targetNode);
  let penalty = 0;

  if (
    isControlPlaneRoutingType(sourceType) &&
    isRuntimeStorageRoutingType(targetType) &&
    !isVerticalEdgeHandle(targetHandleId)
  ) {
    penalty += 250_000;
  }

  if (
    isRuntimeStorageRoutingType(sourceType) &&
    isControlPlaneRoutingType(targetType) &&
    !isVerticalEdgeHandle(sourceHandleId)
  ) {
    penalty += 250_000;
  }

  return penalty;
}

function getObservabilityBranchHandlePenalty(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  sourceHandleId: string,
  targetHandleId: string
): number {
  const sourceType = getDiagramNodeResourceType(sourceNode);
  const targetType = getDiagramNodeResourceType(targetNode);

  if (!isRuntimeStorageRoutingType(sourceType) || !isObservabilityRoutingType(targetType)) {
    return 0;
  }

  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);
  const deltaY = targetCenter.y - sourceCenter.y;

  if (Math.abs(deltaY) < 80) {
    return 0;
  }

  const preferredSourceHandleId = deltaY < 0 ? EDGE_HANDLE_IDS.top : EDGE_HANDLE_IDS.bottom;
  const preferredTargetHandleId = deltaY < 0 ? EDGE_HANDLE_IDS.bottom : EDGE_HANDLE_IDS.top;

  return (
    (sourceHandleId === preferredSourceHandleId ? 0 : EDGE_ROUTE_OBSERVABILITY_BRANCH_PENALTY) +
    (targetHandleId === preferredTargetHandleId ? 0 : EDGE_ROUTE_OBSERVABILITY_BRANCH_PENALTY)
  );
}

function getEndpointNodeReentryOverlapLength(
  routeSegments: readonly RouteSegment[],
  sourceNode: DiagramNode,
  targetNode: DiagramNode
): number {
  const sourceReentryOverlap = routeSegments
    .slice(1)
    .reduce((total, segment) => total + getSegmentNodeOverlapLength(segment, sourceNode), 0);
  const targetReentryOverlap = routeSegments
    .slice(0, -1)
    .reduce((total, segment) => total + getSegmentNodeOverlapLength(segment, targetNode), 0);

  return sourceReentryOverlap + targetReentryOverlap;
}

function addOccupiedRoute(
  edge: Pick<
    DiagramEdge,
    "id" | "sourceHandleId" | "sourceNodeId" | "targetHandleId" | "targetNodeId"
  >,
  nodeById: ReadonlyMap<string, DiagramNode>,
  occupiedRoutes: OccupiedRoute[]
): void {
  const sourceNode = nodeById.get(edge.sourceNodeId);
  const targetNode = nodeById.get(edge.targetNodeId);

  if (!sourceNode || !targetNode) {
    return;
  }

  occupiedRoutes.push({
    id: edge.id,
    segments: getOrthogonalRouteSegments(
      getNodeHandlePoint(sourceNode, edge.sourceHandleId ?? EDGE_HANDLE_IDS.right),
      getNodeHandlePoint(targetNode, edge.targetHandleId ?? EDGE_HANDLE_IDS.left),
      edge.sourceHandleId ?? EDGE_HANDLE_IDS.right,
      edge.targetHandleId ?? EDGE_HANDLE_IDS.left
    ),
    sourceHandleId: edge.sourceHandleId ?? EDGE_HANDLE_IDS.right,
    sourceNodeId: edge.sourceNodeId,
    targetHandleId: edge.targetHandleId ?? EDGE_HANDLE_IDS.left,
    targetNodeId: edge.targetNodeId
  });
}

function getSharedHandlePenalty(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  sourceHandleId: string,
  targetHandleId: string,
  occupiedRoute: OccupiedRoute
): number {
  let penalty = 0;

  if (
    sourceNode.id === occupiedRoute.sourceNodeId &&
    sourceHandleId === occupiedRoute.sourceHandleId
  ) {
    penalty += EDGE_ROUTE_SHARED_HANDLE_PENALTY;
  }

  if (
    sourceNode.id === occupiedRoute.targetNodeId &&
    sourceHandleId === occupiedRoute.targetHandleId
  ) {
    penalty += EDGE_ROUTE_OPPOSING_SHARED_HANDLE_PENALTY;
  }

  if (
    targetNode.id === occupiedRoute.sourceNodeId &&
    targetHandleId === occupiedRoute.sourceHandleId
  ) {
    penalty += EDGE_ROUTE_OPPOSING_SHARED_HANDLE_PENALTY;
  }

  if (
    targetNode.id === occupiedRoute.targetNodeId &&
    targetHandleId === occupiedRoute.targetHandleId
  ) {
    penalty += EDGE_ROUTE_SHARED_HANDLE_PENALTY;
  }

  return penalty;
}

function getHandleDirectionPenalty(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  sourceHandleId: string,
  targetHandleId: string
): number {
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;
  let penalty = Math.abs(deltaX) + Math.abs(deltaY);

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    penalty +=
      deltaX >= 0 && sourceHandleId !== EDGE_HANDLE_IDS.right
        ? EDGE_ROUTE_WRONG_DIRECTION_PENALTY
        : 0;
    penalty +=
      deltaX < 0 && sourceHandleId !== EDGE_HANDLE_IDS.left
        ? EDGE_ROUTE_WRONG_DIRECTION_PENALTY
        : 0;
    penalty +=
      deltaX >= 0 && targetHandleId !== EDGE_HANDLE_IDS.left
        ? EDGE_ROUTE_WRONG_DIRECTION_PENALTY
        : 0;
    penalty +=
      deltaX < 0 && targetHandleId !== EDGE_HANDLE_IDS.right
        ? EDGE_ROUTE_WRONG_DIRECTION_PENALTY
        : 0;
  } else {
    penalty +=
      deltaY >= 0 && sourceHandleId !== EDGE_HANDLE_IDS.bottom
        ? EDGE_ROUTE_WRONG_DIRECTION_PENALTY
        : 0;
    penalty +=
      deltaY < 0 && sourceHandleId !== EDGE_HANDLE_IDS.top ? EDGE_ROUTE_WRONG_DIRECTION_PENALTY : 0;
    penalty +=
      deltaY >= 0 && targetHandleId !== EDGE_HANDLE_IDS.top
        ? EDGE_ROUTE_WRONG_DIRECTION_PENALTY
        : 0;
    penalty +=
      deltaY < 0 && targetHandleId !== EDGE_HANDLE_IDS.bottom
        ? EDGE_ROUTE_WRONG_DIRECTION_PENALTY
        : 0;
  }

  return penalty;
}

function getOrthogonalRouteSegments(
  sourcePoint: DiagramNode["position"],
  targetPoint: DiagramNode["position"],
  sourceHandleId: string,
  targetHandleId: string
): RouteSegment[] {
  const sourceExitPoint = getHandleStubPoint(sourcePoint, sourceHandleId);
  const targetExitPoint = getHandleStubPoint(targetPoint, targetHandleId);
  const segments: RouteSegment[] = [{ from: sourcePoint, to: sourceExitPoint }];

  if (sourceExitPoint.x === targetExitPoint.x || sourceExitPoint.y === targetExitPoint.y) {
    segments.push({ from: sourceExitPoint, to: targetExitPoint });
    segments.push({ from: targetExitPoint, to: targetPoint });
    return removeZeroLengthRouteSegments(segments);
  }

  if (isVerticalEdgeHandle(sourceHandleId) && isVerticalEdgeHandle(targetHandleId)) {
    const middleY = sourceExitPoint.y + (targetExitPoint.y - sourceExitPoint.y) / 2;

    segments.push(
      { from: sourceExitPoint, to: { x: sourceExitPoint.x, y: middleY } },
      { from: { x: sourceExitPoint.x, y: middleY }, to: { x: targetExitPoint.x, y: middleY } },
      { from: { x: targetExitPoint.x, y: middleY }, to: targetExitPoint },
      { from: targetExitPoint, to: targetPoint }
    );
    return removeZeroLengthRouteSegments(segments);
  }

  const middleX = sourceExitPoint.x + (targetExitPoint.x - sourceExitPoint.x) / 2;

  segments.push(
    { from: sourceExitPoint, to: { x: middleX, y: sourceExitPoint.y } },
    { from: { x: middleX, y: sourceExitPoint.y }, to: { x: middleX, y: targetExitPoint.y } },
    { from: { x: middleX, y: targetExitPoint.y }, to: targetExitPoint },
    { from: targetExitPoint, to: targetPoint }
  );
  return removeZeroLengthRouteSegments(segments);
}

function isVerticalEdgeHandle(handleId: string): boolean {
  return handleId === EDGE_HANDLE_IDS.top || handleId === EDGE_HANDLE_IDS.bottom;
}

function getHandleStubPoint(
  point: DiagramNode["position"],
  handleId: string
): DiagramNode["position"] {
  if (handleId === EDGE_HANDLE_IDS.left) {
    return { x: point.x - EDGE_HANDLE_STUB_LENGTH, y: point.y };
  }

  if (handleId === EDGE_HANDLE_IDS.right) {
    return { x: point.x + EDGE_HANDLE_STUB_LENGTH, y: point.y };
  }

  if (handleId === EDGE_HANDLE_IDS.top) {
    return { x: point.x, y: point.y - EDGE_HANDLE_STUB_LENGTH };
  }

  return { x: point.x, y: point.y + EDGE_HANDLE_STUB_LENGTH };
}

function removeZeroLengthRouteSegments(segments: readonly RouteSegment[]): RouteSegment[] {
  return segments.filter(
    (segment) => segment.from.x !== segment.to.x || segment.from.y !== segment.to.y
  );
}

function getNodeHandlePoint(node: DiagramNode, handleId: string): DiagramNode["position"] {
  const center = getNodeCenter(node);

  if (handleId === EDGE_HANDLE_IDS.left) {
    return { x: node.position.x, y: center.y };
  }

  if (handleId === EDGE_HANDLE_IDS.right) {
    return { x: node.position.x + node.size.width, y: center.y };
  }

  if (handleId === EDGE_HANDLE_IDS.top) {
    return { x: center.x, y: node.position.y };
  }

  return { x: center.x, y: node.position.y + node.size.height };
}

function getSegmentNodeOverlapLength(segment: RouteSegment, node: DiagramNode): number {
  const horizontal = segment.from.y === segment.to.y;
  const vertical = segment.from.x === segment.to.x;

  if (!horizontal && !vertical) {
    return 0;
  }

  const padding = 18;
  const visualBounds = getResourceNodeVisualBounds(node);
  const left = visualBounds.x - padding;
  const right = visualBounds.x + visualBounds.width + padding;
  const top = visualBounds.y - padding;
  const bottom = visualBounds.y + visualBounds.height + padding;

  if (horizontal) {
    const y = segment.from.y;

    if (y <= top || y >= bottom) {
      return 0;
    }

    const segmentLeft = Math.min(segment.from.x, segment.to.x);
    const segmentRight = Math.max(segment.from.x, segment.to.x);

    return Math.max(0, Math.min(segmentRight, right) - Math.max(segmentLeft, left));
  }

  const x = segment.from.x;

  if (x <= left || x >= right) {
    return 0;
  }

  const segmentTop = Math.min(segment.from.y, segment.to.y);
  const segmentBottom = Math.max(segment.from.y, segment.to.y);

  return Math.max(0, Math.min(segmentBottom, bottom) - Math.max(segmentTop, top));
}

function getRouteLength(segments: readonly RouteSegment[]): number {
  return segments.reduce(
    (total, segment) =>
      total + Math.abs(segment.to.x - segment.from.x) + Math.abs(segment.to.y - segment.from.y),
    0
  );
}

function getRouteOverlapLength(
  leftSegments: readonly RouteSegment[],
  rightSegments: readonly RouteSegment[]
): number {
  return leftSegments.reduce(
    (total, leftSegment) =>
      total +
      rightSegments.reduce(
        (segmentTotal, rightSegment) =>
          segmentTotal + getSegmentOverlapLength(leftSegment, rightSegment),
        0
      ),
    0
  );
}

function getRouteCrowdingLength(
  leftSegments: readonly RouteSegment[],
  rightSegments: readonly RouteSegment[]
): number {
  return leftSegments.reduce(
    (total, leftSegment) =>
      total +
      rightSegments.reduce(
        (segmentTotal, rightSegment) =>
          segmentTotal + getSegmentCrowdingLength(leftSegment, rightSegment),
        0
      ),
    0
  );
}

function getSegmentOverlapLength(leftSegment: RouteSegment, rightSegment: RouteSegment): number {
  const leftHorizontal = leftSegment.from.y === leftSegment.to.y;
  const rightHorizontal = rightSegment.from.y === rightSegment.to.y;
  const leftVertical = leftSegment.from.x === leftSegment.to.x;
  const rightVertical = rightSegment.from.x === rightSegment.to.x;

  if (
    leftHorizontal &&
    rightHorizontal &&
    Math.abs(leftSegment.from.y - rightSegment.from.y) <= 1
  ) {
    return getRangeOverlapLength(
      leftSegment.from.x,
      leftSegment.to.x,
      rightSegment.from.x,
      rightSegment.to.x
    );
  }

  if (leftVertical && rightVertical && Math.abs(leftSegment.from.x - rightSegment.from.x) <= 1) {
    return getRangeOverlapLength(
      leftSegment.from.y,
      leftSegment.to.y,
      rightSegment.from.y,
      rightSegment.to.y
    );
  }

  return 0;
}

function getSegmentCrowdingLength(leftSegment: RouteSegment, rightSegment: RouteSegment): number {
  const leftHorizontal = leftSegment.from.y === leftSegment.to.y;
  const rightHorizontal = rightSegment.from.y === rightSegment.to.y;
  const leftVertical = leftSegment.from.x === leftSegment.to.x;
  const rightVertical = rightSegment.from.x === rightSegment.to.x;

  if (leftHorizontal && rightHorizontal) {
    const distance = Math.abs(leftSegment.from.y - rightSegment.from.y);

    if (distance <= 1 || distance > EDGE_ROUTE_CROWDING_DISTANCE) {
      return 0;
    }

    return getRangeOverlapLength(
      leftSegment.from.x,
      leftSegment.to.x,
      rightSegment.from.x,
      rightSegment.to.x
    );
  }

  if (leftVertical && rightVertical) {
    const distance = Math.abs(leftSegment.from.x - rightSegment.from.x);

    if (distance <= 1 || distance > EDGE_ROUTE_CROWDING_DISTANCE) {
      return 0;
    }

    return getRangeOverlapLength(
      leftSegment.from.y,
      leftSegment.to.y,
      rightSegment.from.y,
      rightSegment.to.y
    );
  }

  return 0;
}

function getRouteCrossingCount(
  leftSegments: readonly RouteSegment[],
  rightSegments: readonly RouteSegment[]
): number {
  return leftSegments.reduce(
    (total, leftSegment) =>
      total +
      rightSegments.reduce(
        (segmentTotal, rightSegment) =>
          segmentTotal + (doSegmentsCross(leftSegment, rightSegment) ? 1 : 0),
        0
      ),
    0
  );
}

function doSegmentsCross(leftSegment: RouteSegment, rightSegment: RouteSegment): boolean {
  const leftHorizontal = leftSegment.from.y === leftSegment.to.y;
  const rightHorizontal = rightSegment.from.y === rightSegment.to.y;

  if (leftHorizontal === rightHorizontal) {
    return false;
  }

  const horizontalSegment = leftHorizontal ? leftSegment : rightSegment;
  const verticalSegment = leftHorizontal ? rightSegment : leftSegment;
  const horizontalY = horizontalSegment.from.y;
  const verticalX = verticalSegment.from.x;
  const horizontalLeft = Math.min(horizontalSegment.from.x, horizontalSegment.to.x);
  const horizontalRight = Math.max(horizontalSegment.from.x, horizontalSegment.to.x);
  const verticalTop = Math.min(verticalSegment.from.y, verticalSegment.to.y);
  const verticalBottom = Math.max(verticalSegment.from.y, verticalSegment.to.y);

  return (
    verticalX > horizontalLeft &&
    verticalX < horizontalRight &&
    horizontalY > verticalTop &&
    horizontalY < verticalBottom
  );
}

function getRangeOverlapLength(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
): number {
  const leftMin = Math.min(leftStart, leftEnd);
  const leftMax = Math.max(leftStart, leftEnd);
  const rightMin = Math.min(rightStart, rightEnd);
  const rightMax = Math.max(rightStart, rightEnd);

  return Math.max(0, Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin));
}

function getNodeCenter(node: DiagramNode): DiagramNode["position"] {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

// AI 초안의 vpcId/subnetId/contains/hosts 정보를 보드의 포함관계 이름표로 바꿉니다.
function applyAreaParentMetadata(
  nodes: readonly DiagramNode[],
  edges: readonly ArchitectureJson["edges"][number][]
): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const parentAreaNodeId =
      node.metadata?.parentAreaNodeId ??
      findConfigParentAreaNodeId(node, nodeById) ??
      findEdgeParentAreaNodeId(node, nodeById, edges) ??
      findDefaultRegionParentAreaNodeId(node, nodeById);

    if (!parentAreaNodeId) {
      return node;
    }

    return {
      ...node,
      metadata: {
        ...node.metadata,
        parentAreaNodeId
      }
    };
  });
}

// 자식이 밖으로 튀어나오지 않도록 VPC/Subnet 박스 크기를 필요한 만큼 키웁니다.
function fitAreaNodesToChildren(nodes: readonly DiagramNode[]): DiagramNode[] {
  let currentNodes = [...nodes];

  for (let pass = 0; pass < MAX_AREA_FIT_PASSES; pass += 1) {
    const nextNodes = fitAreaNodesToDirectChildren(currentNodes);

    if (areNodeLayoutsEqual(currentNodes, nextNodes)) {
      return nextNodes;
    }

    currentNodes = nextNodes;
  }

  return currentNodes;
}

function applyDiagramLayerOrder(nodes: readonly DiagramNode[]): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const depth = getAreaDepth(node, nodeById);
    const zIndex = isAreaDiagramNode(node) ? 1 + depth : 100 + depth;

    return {
      ...node,
      zIndex
    };
  });
}

function findDefaultRegionParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  if (node.kind !== "resource" || isAreaDiagramNode(node)) {
    return undefined;
  }

  const regionNodes = [...nodeById.values()].filter(
    (candidate) =>
      candidate.id !== node.id &&
      candidate.metadata?.parentAreaNodeId == null &&
      getDiagramNodeResourceType(candidate) === "aws_region"
  );

  return regionNodes.length === 1 ? regionNodes[0]?.id : undefined;
}

function applyDiagramResourceNameConventions(nodes: readonly DiagramNode[]): DiagramNode[] {
  const resourceNameByNodeId = new Map<string, string>();

  for (const node of nodes) {
    const parameters = node.parameters;

    if (!parameters) {
      continue;
    }

    resourceNameByNodeId.set(
      node.id,
      createConventionResourceName(parameters.resourceType, parameters.resourceName, [
        node.label,
        node.id
      ])
    );
  }

  const referenceRewrites = createTerraformReferenceRewrites(nodes, resourceNameByNodeId);

  return nodes.map((node) => {
    const parameters = node.parameters;

    if (!parameters) {
      return node;
    }

    const resourceName = resourceNameByNodeId.get(node.id) ?? parameters.resourceName;
    const values = rewriteTerraformReferencesInValue(
      parameters.values,
      referenceRewrites
    ) as ResourceConfig;

    if (resourceName === parameters.resourceName && values === parameters.values) {
      return node;
    }

    return {
      ...node,
      parameters: {
        ...parameters,
        resourceName,
        values
      }
    };
  });
}

type TerraformReferenceRewrite = {
  readonly from: string;
  readonly to: string;
};

function createTerraformReferenceRewrites(
  nodes: readonly DiagramNode[],
  resourceNameByNodeId: ReadonlyMap<string, string>
): TerraformReferenceRewrite[] {
  const rewriteByReference = new Map<string, string>();

  for (const node of nodes) {
    const parameters = node.parameters;

    if (!parameters) {
      continue;
    }

    const resourceName = resourceNameByNodeId.get(node.id) ?? parameters.resourceName;
    const referenceNames = createTerraformReferenceNameCandidates(node, parameters).filter(
      (referenceName) => referenceName !== resourceName
    );

    for (const referenceName of referenceNames) {
      const from = `${parameters.resourceType}.${referenceName}`;
      const to = `${parameters.resourceType}.${resourceName}`;
      rewriteByReference.set(from, to);

      if (parameters.terraformBlockType === "data") {
        rewriteByReference.set(`data.${from}`, `data.${to}`);
      }
    }
  }

  return [...rewriteByReference].map(([from, to]) => ({ from, to }));
}

function rewriteTerraformReferencesInValue(
  value: unknown,
  referenceRewrites: readonly TerraformReferenceRewrite[]
): unknown {
  if (typeof value === "string") {
    return rewriteTerraformReferenceString(value, referenceRewrites);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const rewrittenItems = value.map((item) => {
      const rewrittenItem = rewriteTerraformReferencesInValue(item, referenceRewrites);
      changed ||= rewrittenItem !== item;
      return rewrittenItem;
    });

    return changed ? rewrittenItems : value;
  }

  if (!isRecord(value)) {
    return value;
  }

  let changed = false;
  const rewrittenEntries = Object.entries(value).map(([key, entryValue]) => {
    const rewrittenValue = rewriteTerraformReferencesInValue(entryValue, referenceRewrites);
    changed ||= rewrittenValue !== entryValue;
    return [key, rewrittenValue] as const;
  });

  return changed ? Object.fromEntries(rewrittenEntries) : value;
}

function rewriteTerraformReferenceString(
  value: string,
  referenceRewrites: readonly TerraformReferenceRewrite[]
): string {
  let rewrittenValue = value;

  for (const rewrite of referenceRewrites) {
    if (rewrittenValue === rewrite.from) {
      rewrittenValue = rewrite.to;
      continue;
    }

    rewrittenValue = rewrittenValue.replaceAll(`${rewrite.from}.`, `${rewrite.to}.`);
  }

  return rewrittenValue;
}

type ReadableLayoutSlot = {
  readonly column: number;
  readonly row: number;
};

function applyRepositoryEcsReferenceLayout(nodes: readonly DiagramNode[]): DiagramNode[] {
  const nodeIds = new Set(nodes.map((node) => node.id));

  if (
    !nodeIds.has("fixed-template-ecs-fargate-container-app-vpc") ||
    !Object.keys(REPOSITORY_ECS_REFERENCE_LAYOUT).every((nodeId) => nodeIds.has(nodeId))
  ) {
    return [...nodes];
  }

  return nodes.map((node) => {
    const layout =
      REPOSITORY_ECS_REFERENCE_LAYOUT[node.id as keyof typeof REPOSITORY_ECS_REFERENCE_LAYOUT];

    if (!layout) {
      return node;
    }

    const { parentAreaNodeId: _parentAreaNodeId, ...metadata } = node.metadata ?? {};
    const nextMetadata = layout.parentAreaNodeId
      ? { ...metadata, parentAreaNodeId: layout.parentAreaNodeId }
      : metadata;

    return {
      ...node,
      metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined,
      position: { ...layout.position },
      size: { ...layout.size }
    };
  });
}

function applyRepositoryGeneratedReferenceLayout(nodes: readonly DiagramNode[]): DiagramNode[] {
  return applyRepositoryGeneratedVpcLayout(
    applyRepositoryGeneratedSupportLayout(flattenRepositoryManagedServicesArea(nodes))
  );
}

function flattenRepositoryManagedServicesArea(nodes: readonly DiagramNode[]): DiagramNode[] {
  return nodes.flatMap((node) => {
    if (node.id === REPOSITORY_MANAGED_SERVICES_AREA_ID) {
      return [];
    }

    if (node.metadata?.parentAreaNodeId !== REPOSITORY_MANAGED_SERVICES_AREA_ID) {
      return [node];
    }

    const { parentAreaNodeId: _parentAreaNodeId, ...metadata } = node.metadata;

    return [
      {
        ...node,
        metadata
      }
    ];
  });
}

function removeRepositoryGeneratedSupportEdges(
  edges: readonly DiagramEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>,
  preserveAuthoredTemplatePositions: boolean
): DiagramEdge[] {
  if (preserveAuthoredTemplatePositions || !hasRepositoryGeneratedFrontendNodes(nodeById)) {
    return [...edges];
  }

  return edges.filter((edge) => !isRepositoryGeneratedSupportDependencyEdge(edge, nodeById));
}

function hasRepositoryGeneratedFrontendNodes(nodeById: ReadonlyMap<string, DiagramNode>): boolean {
  return (
    nodeById.has("repository-browser") &&
    nodeById.has("repository-cloudfront") &&
    nodeById.has("repository-web-assets") &&
    nodeById.has("repository-fargate-runtime") &&
    nodeById.has("fixed-template-ecs-fargate-container-app-vpc")
  );
}

function isRepositoryGeneratedSupportDependencyEdge(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  const edgeIdentity = `${edge.id} ${edge.sourceNodeId} ${edge.targetNodeId}`.toLowerCase();

  if (
    /repository-ecr|repository-ecs-logs|execution-role|execution-policy|task-role|container-app-task/u.test(
      edgeIdentity
    )
  ) {
    return true;
  }

  const source = nodeById.get(edge.sourceNodeId);
  const target = nodeById.get(edge.targetNodeId);

  if (!source || !target) {
    return false;
  }

  const sourceDescriptor = getRepositoryEdgeEndpointDescriptor(source);
  const targetDescriptor = getRepositoryEdgeEndpointDescriptor(target);
  const edgeDescriptor = `${edge.id} ${edge.label ?? ""} ${sourceDescriptor} ${targetDescriptor}`;

  if (
    /browser|cloudfront|load[-_\s]*balancer|\balb\b|fargate[-_\s]*service/u.test(edgeDescriptor)
  ) {
    return false;
  }

  return /ecr|cloudwatch|logs?|task[-_\s]*definition|execution[-_\s]*role|task[-_\s]*role|policy|github[-_\s]*actions/u.test(
    edgeDescriptor
  );
}

function getRepositoryEdgeEndpointDescriptor(node: DiagramNode): string {
  return `${node.id} ${node.label} ${node.type} ${node.parameters?.resourceType ?? ""} ${node.parameters?.resourceName ?? ""}`.toLowerCase();
}

function applyRepositoryGeneratedSupportLayout(
  nodes: readonly DiagramNode[],
  protectedTemplateNodeIds: ReadonlySet<string> = new Set()
): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const templateBounds = getNodeSetBounds(
    nodes.filter((node) => protectedTemplateNodeIds.has(node.id))
  );
  const supportOrigin = templateBounds
    ? {
        x: templateBounds.x - REPOSITORY_TEMPLATE_SUPPORT_GAP,
        y: templateBounds.y
      }
    : { x: 200, y: 128 };
  const browserPosition = {
    x: supportOrigin.x - REPOSITORY_EXTERNAL_ACTOR_GAP,
    y: supportOrigin.y + 40
  };
  const githubActionsPosition = {
    x: browserPosition.x,
    y: browserPosition.y + REPOSITORY_SUPPORT_ROW_GAP
  };
  const supportNodes = nodes
    .filter(
      (node) =>
        (node.kind === "resource" || node.id.startsWith("repository-")) &&
        !protectedTemplateNodeIds.has(node.id) &&
        (!isAreaDiagramNode(node) || node.id.startsWith("repository-")) &&
        node.metadata?.parentAreaNodeId == null &&
        !isRepositoryBrowserNode(node) &&
        !isRepositoryGithubActionsNode(node)
    )
    .sort(compareRepositorySupportNodes);
  const slotCounts = new Map<string, number>();

  for (const supportNode of supportNodes) {
    const currentNode = nodeById.get(supportNode.id);

    if (!currentNode) {
      continue;
    }

    const slot = getRepositorySupportLayoutSlot(currentNode);
    const slotKey = `${slot.column}:${slot.row}`;
    const stackIndex = slotCounts.get(slotKey) ?? 0;
    const isAreaSupportRow = slot.row === 2;
    const rowBaseX = supportOrigin.x;
    const rowColumnGap = isAreaSupportRow ? 300 : REPOSITORY_SUPPORT_COLUMN_GAP;
    const visualColumn = slot.column % 3;
    const visualRowOffset = Math.floor(slot.column / 3) * REPOSITORY_SUPPORT_STACK_GAP;
    const nextPosition = {
      x: rowBaseX + visualColumn * rowColumnGap,
      y:
        supportOrigin.y +
        slot.row * REPOSITORY_SUPPORT_ROW_GAP +
        visualRowOffset +
        stackIndex * REPOSITORY_SUPPORT_STACK_GAP
    };

    slotCounts.set(slotKey, stackIndex + 1);
    moveNodeSubtree(
      currentNode.id,
      {
        x: nextPosition.x - currentNode.position.x,
        y: nextPosition.y - currentNode.position.y
      },
      nodeById
    );
  }

  const githubActionsNode = [...nodeById.values()].find(isRepositoryGithubActionsNode);

  if (githubActionsNode && githubActionsNode.metadata?.parentAreaNodeId == null) {
    moveNodeSubtree(
      githubActionsNode.id,
      {
        x: githubActionsPosition.x - githubActionsNode.position.x,
        y: githubActionsPosition.y - githubActionsNode.position.y
      },
      nodeById
    );
  }

  const browserNode = [...nodeById.values()].find(
    (node) => node.metadata?.parentAreaNodeId == null && isRepositoryBrowserNode(node)
  );

  if (browserNode) {
    moveNodeSubtree(
      browserNode.id,
      {
        x: browserPosition.x - browserNode.position.x,
        y: browserPosition.y - browserNode.position.y
      },
      nodeById
    );
  }

  return nodes.map((node) => nodeById.get(node.id) ?? node);
}

function isRepositoryBrowserNode(node: DiagramNode): boolean {
  return /(^|[-_\s])browser($|[-_\s])|client/u.test(`${node.id} ${node.label}`.toLowerCase());
}

function isRepositoryGithubActionsNode(node: DiagramNode): boolean {
  return /github[-_\s]*actions/u.test(`${node.id} ${node.label}`.toLowerCase());
}

function compareRepositorySupportNodes(left: DiagramNode, right: DiagramNode): number {
  const leftSlot = getRepositorySupportLayoutSlot(left);
  const rightSlot = getRepositorySupportLayoutSlot(right);

  return (
    leftSlot.row - rightSlot.row ||
    leftSlot.column - rightSlot.column ||
    left.position.y - right.position.y ||
    left.position.x - right.position.x ||
    left.id.localeCompare(right.id)
  );
}

function getRepositorySupportLayoutSlot(node: DiagramNode): ReadableLayoutSlot {
  const resourceType = getDiagramNodeResourceType(node);
  const descriptor =
    `${node.id} ${node.label} ${node.parameters?.resourceName ?? ""}`.toLowerCase();

  if (resourceType === "aws_cloudfront_distribution" || /cloudfront/u.test(descriptor)) {
    return { column: 0, row: 0 };
  }

  if (/public[-_\s]*access|bucket[-_\s]*policy|origin[-_\s]*access|\boac\b/u.test(descriptor)) {
    return { column: 2, row: 0 };
  }

  if (resourceType === "aws_s3_bucket" || /\bstatic\b|\bassets?\b|\bweb\b/u.test(descriptor)) {
    return { column: 1, row: 0 };
  }

  if (resourceType === "aws_ecr_repository" || /\becr\b|image[-_\s]*repository/u.test(descriptor)) {
    return { column: 0, row: 1 };
  }

  if (resourceType === "aws_ecs_task_definition" || /task[-_\s]*definition/u.test(descriptor)) {
    return { column: 1, row: 1 };
  }

  if (resourceType === "aws_cloudwatch_log_group" || /\blogs?\b|cloudwatch/u.test(descriptor)) {
    return { column: 2, row: 1 };
  }

  if (resourceType === "aws_subnet" || /\bsubnet\b/u.test(descriptor)) {
    return { column: /[-_\s]b\b|subnet[-_\s]*b/u.test(descriptor) ? 1 : 0, row: 2 };
  }

  if (resourceType === "aws_iam_role" || /\brole\b/u.test(descriptor)) {
    return { column: 3, row: 1 };
  }

  if (resourceType === "aws_iam_policy" || /\bpolicy\b/u.test(descriptor)) {
    return { column: 4, row: 1 };
  }

  return { column: 3, row: 0 };
}

function getNodeSetBounds(nodes: readonly DiagramNode[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (nodes.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function applyRepositoryGeneratedVpcLayout(nodes: readonly DiagramNode[]): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const vpcNode = [...nodeById.values()].find(
    (node) => isAreaDiagramNode(node) && getDiagramNodeResourceType(node) === "aws_vpc"
  );

  if (!vpcNode) {
    return [...nodes];
  }

  const subnetNodes = [...nodeById.values()].filter(
    (node) =>
      isAreaDiagramNode(node) &&
      getDiagramNodeResourceType(node) === "aws_subnet" &&
      node.metadata?.parentAreaNodeId === vpcNode.id
  );

  if (subnetNodes.length < 2) {
    return nodes.map((node) => nodeById.get(node.id) ?? node);
  }

  const publicSubnets = subnetNodes
    .filter(isRepositoryPublicSubnet)
    .sort(compareRepositoryAvailabilityZoneNodes);
  const privateSubnets = subnetNodes
    .filter((node) => !isRepositoryPublicSubnet(node))
    .sort(compareRepositoryAvailabilityZoneNodes);

  placeRepositorySubnet(publicSubnets[0], 0, 0, nodeById);
  placeRepositorySubnet(publicSubnets[1], 1, 0, nodeById);
  placeRepositorySubnet(privateSubnets[0], 0, 1, nodeById);
  placeRepositorySubnet(privateSubnets[1], 1, 1, nodeById);
  const securityGroupParents: RepositorySecurityGroupParents = { vpcNodeId: vpcNode.id };

  if (publicSubnets[0]) {
    securityGroupParents.publicWorkloadSubnetId = publicSubnets[0].id;
  }

  if (privateSubnets[0]) {
    securityGroupParents.privateWorkloadSubnetId = privateSubnets[0].id;
  }

  placeRepositorySharedSecurityGroupScopes(securityGroupParents, nodeById);
  placeRepositoryVpcSupportNodes(vpcNode.id, nodeById);

  return nodes.map((node) => nodeById.get(node.id) ?? node);
}

function placeRepositorySubnet(
  subnetNode: DiagramNode | undefined,
  column: number,
  row: number,
  nodeById: Map<string, DiagramNode>
): void {
  if (!subnetNode) {
    return;
  }

  const nextPosition = {
    x: REPOSITORY_VPC_ORIGIN.x + getRepositorySubnetXOffset(column, row),
    y: REPOSITORY_VPC_ORIGIN.y + 56 + row * REPOSITORY_SUBNET_ROW_GAP
  };
  const nextSize =
    column === 0 && row === 0
      ? REPOSITORY_ACTIVE_PUBLIC_SUBNET_SIZE
      : column === 0 && row === 1
        ? REPOSITORY_ACTIVE_PRIVATE_SUBNET_SIZE
        : REPOSITORY_SUBNET_SIZE;

  moveNodeSubtree(
    subnetNode.id,
    {
      x: nextPosition.x - subnetNode.position.x,
      y: nextPosition.y - subnetNode.position.y
    },
    nodeById
  );
  nodeById.set(subnetNode.id, {
    ...(nodeById.get(subnetNode.id) ?? subnetNode),
    size: { ...nextSize }
  });
}

function getRepositorySubnetXOffset(column: number, row: number): number {
  if (column === 0) {
    return 80;
  }

  return row === 1 ? 676 : 80 + REPOSITORY_SUBNET_COLUMN_GAP;
}

type RepositorySecurityGroupParents = {
  vpcNodeId: string;
  publicWorkloadSubnetId?: string;
  privateWorkloadSubnetId?: string;
};

function placeRepositorySharedSecurityGroupScopes(
  parents: RepositorySecurityGroupParents,
  nodeById: Map<string, DiagramNode>
): void {
  const securityGroups = [...nodeById.values()].filter((node) =>
    isRepositorySecurityGroupScope(node)
  );

  for (const securityGroup of securityGroups) {
    const securityGroupDescriptor =
      `${securityGroup.label} ${securityGroup.parameters?.resourceName ?? ""} ${securityGroup.parameters?.values["templateResourceId"] ?? ""}`.toLowerCase();
    const isTaskSecurityGroup = /task/u.test(securityGroupDescriptor);
    const parentAreaNodeId = isTaskSecurityGroup
      ? (parents.privateWorkloadSubnetId ?? parents.vpcNodeId)
      : (parents.publicWorkloadSubnetId ?? parents.vpcNodeId);
    const parentArea = nodeById.get(parentAreaNodeId);
    const parentOrigin = parentArea?.position ?? REPOSITORY_VPC_ORIGIN;
    const nextPosition = isTaskSecurityGroup
      ? { x: parentOrigin.x + 48, y: parentOrigin.y + 60 }
      : { x: parentOrigin.x + 50, y: parentOrigin.y + 58 };

    moveNodeSubtree(
      securityGroup.id,
      {
        x: nextPosition.x - securityGroup.position.x,
        y: nextPosition.y - securityGroup.position.y
      },
      nodeById
    );
    nodeById.set(securityGroup.id, {
      ...(nodeById.get(securityGroup.id) ?? securityGroup),
      metadata: {
        ...(nodeById.get(securityGroup.id) ?? securityGroup).metadata,
        parentAreaNodeId
      },
      size: isTaskSecurityGroup
        ? { ...REPOSITORY_TASK_SCOPE_SIZE }
        : { ...REPOSITORY_ALB_SCOPE_SIZE }
    });
    placeRepositorySecurityGroupResources(securityGroup.id, isTaskSecurityGroup, nodeById);
  }
}

function isRepositorySecurityGroupScope(node: DiagramNode): boolean {
  const descriptor =
    `${node.id} ${node.label} ${node.type} ${node.parameters?.resourceType ?? ""} ${node.parameters?.resourceName ?? ""}`.toLowerCase();

  return (
    getDiagramNodeResourceType(node) === "aws_security_group" ||
    /security[-_\s]*group/u.test(descriptor)
  );
}

function placeRepositorySecurityGroupResources(
  securityGroupId: string,
  isTaskSecurityGroup: boolean,
  nodeById: Map<string, DiagramNode>
): void {
  const securityGroup = nodeById.get(securityGroupId);

  if (!securityGroup) {
    return;
  }

  const childResources = [
    ...new Map(
      [...nodeById.values()]
        .filter((node) =>
          isRepositorySecurityGroupChild(node, securityGroupId, isTaskSecurityGroup)
        )
        .map((node) => [node.id, node])
    ).values()
  ]
    .map((node) => ({
      ...node,
      metadata: {
        ...node.metadata,
        parentAreaNodeId: securityGroupId
      }
    }))
    .sort(compareRepositorySupportNodes);

  for (const childResource of childResources) {
    nodeById.set(childResource.id, childResource);
  }

  childResources.forEach((resourceNode, index) => {
    const nextPosition = {
      x: securityGroup.position.x + (isTaskSecurityGroup ? 64 : 96) + index * 132,
      y: securityGroup.position.y + (isTaskSecurityGroup ? 58 : 44)
    };
    moveNodeSubtree(
      resourceNode.id,
      {
        x: nextPosition.x - resourceNode.position.x,
        y: nextPosition.y - resourceNode.position.y
      },
      nodeById
    );
  });
}

function isRepositorySecurityGroupChild(
  node: DiagramNode,
  securityGroupId: string,
  isTaskSecurityGroup: boolean
): boolean {
  if (isAreaDiagramNode(node) || node.id === securityGroupId) {
    return false;
  }

  if (node.metadata?.parentAreaNodeId === securityGroupId) {
    return true;
  }

  const resourceType = getDiagramNodeResourceType(node);
  const descriptor =
    `${node.id} ${node.label} ${node.type} ${node.parameters?.resourceType ?? ""} ${node.parameters?.resourceName ?? ""}`.toLowerCase();

  if (isTaskSecurityGroup) {
    return (
      resourceType === "aws_ecs_service" ||
      /(^|[-_\s])service($|[-_\s])|fargate[-_\s]*runtime/u.test(descriptor)
    );
  }

  return resourceType === "aws_lb" || /load[-_\s]*balancer|\balb\b/u.test(descriptor);
}

function placeRepositoryVpcSupportNodes(
  vpcNodeId: string,
  nodeById: Map<string, DiagramNode>
): void {
  const supportNodes = [...nodeById.values()]
    .filter((node) => !isAreaDiagramNode(node) && node.metadata?.parentAreaNodeId === vpcNodeId)
    .sort(compareRepositoryVpcSupportNodes);

  supportNodes.forEach((supportNode, index) => {
    const nextPosition = getRepositoryVpcSupportPosition(supportNode, index);

    moveNodeSubtree(
      supportNode.id,
      {
        x: nextPosition.x - supportNode.position.x,
        y: nextPosition.y - supportNode.position.y
      },
      nodeById
    );
  });
}

function getRepositoryVpcSupportPosition(
  node: DiagramNode,
  fallbackIndex: number
): DiagramNode["position"] {
  const resourceType = getDiagramNodeResourceType(node);
  const descriptor =
    `${node.id} ${node.label} ${node.parameters?.resourceName ?? ""}`.toLowerCase();

  if (resourceType === "aws_lb_listener" || /listener/u.test(descriptor)) {
    return { x: REPOSITORY_VPC_ORIGIN.x + 840, y: REPOSITORY_VPC_ORIGIN.y + 184 };
  }

  if (resourceType === "aws_lb_target_group" || /target[-_\s]*group/u.test(descriptor)) {
    return { x: REPOSITORY_VPC_ORIGIN.x + 840, y: REPOSITORY_VPC_ORIGIN.y + 296 };
  }

  if (resourceType === "aws_ecs_cluster" || /cluster/u.test(descriptor)) {
    return { x: REPOSITORY_VPC_ORIGIN.x + 840, y: REPOSITORY_VPC_ORIGIN.y + 408 };
  }

  const compactIndex = Math.max(0, fallbackIndex - 3);

  return {
    x: REPOSITORY_VPC_ORIGIN.x + 916 + (compactIndex % 3) * 76,
    y: REPOSITORY_VPC_ORIGIN.y + 184 + Math.floor(compactIndex / 3) * 76
  };
}

function compareRepositoryVpcSupportNodes(left: DiagramNode, right: DiagramNode): number {
  const leftSlot = getRepositoryVpcSupportSlot(left, 0);
  const rightSlot = getRepositoryVpcSupportSlot(right, 0);

  return (
    leftSlot.row - rightSlot.row ||
    leftSlot.column - rightSlot.column ||
    left.id.localeCompare(right.id)
  );
}

function getRepositoryVpcSupportSlot(node: DiagramNode, fallbackIndex: number): ReadableLayoutSlot {
  const resourceType = getDiagramNodeResourceType(node);
  const descriptor =
    `${node.id} ${node.label} ${node.parameters?.resourceName ?? ""}`.toLowerCase();

  if (resourceType === "aws_lb_listener" || /listener/u.test(descriptor)) {
    return { column: 0, row: 0 };
  }

  if (resourceType === "aws_lb_target_group" || /target[-_\s]*group/u.test(descriptor)) {
    return { column: 0, row: 1 };
  }

  if (resourceType === "aws_ecs_cluster" || /cluster/u.test(descriptor)) {
    return { column: 0, row: 2 };
  }

  return {
    column: 2 + (fallbackIndex % 4),
    row: Math.floor(fallbackIndex / 4)
  };
}

function isRepositoryPublicSubnet(node: DiagramNode): boolean {
  const descriptor = `${node.id} ${node.label}`.toLowerCase();
  const mapPublicIpOnLaunch = node.parameters?.values["mapPublicIpOnLaunch"];

  return descriptor.includes("public") || mapPublicIpOnLaunch === true;
}

function compareRepositoryAvailabilityZoneNodes(left: DiagramNode, right: DiagramNode): number {
  return (
    getRepositoryAvailabilityZoneRank(left) - getRepositoryAvailabilityZoneRank(right) ||
    left.position.x - right.position.x ||
    left.id.localeCompare(right.id)
  );
}

function getRepositoryAvailabilityZoneRank(node: DiagramNode): number {
  const descriptor = `${node.id} ${node.label}`.toLowerCase();

  if (/(^|[-_\s])a($|[-_\s])|az[-_\s]*a|subnet[-_\s]*a/u.test(descriptor)) return 0;
  if (/(^|[-_\s])b($|[-_\s])|az[-_\s]*b|subnet[-_\s]*b/u.test(descriptor)) return 1;

  return 2;
}

function applyReadableTopologyLayout(nodes: readonly DiagramNode[]): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const hasAreaNodes = nodes.some(isAreaDiagramNode);
  const nodesByParentId = createReadableLayoutNodesByParentId(nodes);
  const parentIds = [...nodesByParentId.keys()].sort(
    (leftParentId, rightParentId) =>
      getParentAreaDepth(leftParentId, nodeById) - getParentAreaDepth(rightParentId, nodeById)
  );

  for (const parentId of parentIds) {
    const groupNodes = nodesByParentId.get(parentId) ?? [];

    if (hasAreaNodes && parentId === ROOT_PARENT_AREA_ID) {
      continue;
    }

    if (groupNodes.length < READABLE_LAYOUT_MIN_GROUP_SIZE) {
      continue;
    }

    const parentNode = parentId === ROOT_PARENT_AREA_ID ? undefined : nodeById.get(parentId);
    const origin = getReadableLayoutOrigin(groupNodes, parentNode);
    const slotCounts = new Map<string, number>();

    for (const originalNode of [...groupNodes].sort(compareReadableLayoutNodes)) {
      const node = nodeById.get(originalNode.id);

      if (!node) {
        continue;
      }

      const slot = getReadableLayoutSlot(node, parentNode);
      const slotKey = `${slot.column}:${slot.row}`;
      const stackIndex = slotCounts.get(slotKey) ?? 0;
      const nextPosition = {
        x: origin.x + slot.column * READABLE_LAYOUT_COLUMN_GAP,
        y: origin.y + slot.row * READABLE_LAYOUT_ROW_GAP + stackIndex * READABLE_LAYOUT_STACK_GAP
      };
      const delta = {
        x: nextPosition.x - node.position.x,
        y: nextPosition.y - node.position.y
      };

      slotCounts.set(slotKey, stackIndex + 1);

      if (delta.x !== 0 || delta.y !== 0) {
        moveNodeSubtree(node.id, delta, nodeById);
      }
    }
  }

  return nodes.map((node) => nodeById.get(node.id) ?? node);
}

function createReadableLayoutNodesByParentId(
  nodes: readonly DiagramNode[]
): Map<string, DiagramNode[]> {
  const nodesByParentId = new Map<string, DiagramNode[]>();

  for (const node of nodes) {
    if (!isReadableLayoutCandidate(node)) {
      continue;
    }

    const parentId = node.metadata?.parentAreaNodeId ?? ROOT_PARENT_AREA_ID;
    const siblings = nodesByParentId.get(parentId) ?? [];
    siblings.push(node);
    nodesByParentId.set(parentId, siblings);
  }

  return nodesByParentId;
}

function isReadableLayoutCandidate(node: DiagramNode): boolean {
  return node.kind === "resource" && !isAreaDiagramNode(node);
}

function getReadableLayoutOrigin(
  nodes: readonly DiagramNode[],
  parentNode?: DiagramNode
): DiagramNode["position"] {
  const slots = nodes.map((node) => getReadableLayoutSlot(node, parentNode));
  const minColumn = Math.min(...slots.map((slot) => slot.column));
  const minRow = Math.min(...slots.map((slot) => slot.row));
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));

  return {
    x: minX - minColumn * READABLE_LAYOUT_COLUMN_GAP,
    y: minY - minRow * READABLE_LAYOUT_ROW_GAP
  };
}

function compareReadableLayoutNodes(leftNode: DiagramNode, rightNode: DiagramNode): number {
  const leftSlot = getReadableLayoutSlot(leftNode);
  const rightSlot = getReadableLayoutSlot(rightNode);

  return (
    leftSlot.row - rightSlot.row ||
    leftSlot.column - rightSlot.column ||
    leftNode.position.y - rightNode.position.y ||
    leftNode.position.x - rightNode.position.x ||
    leftNode.id.localeCompare(rightNode.id)
  );
}

function getReadableLayoutSlot(node: DiagramNode, parentNode?: DiagramNode): ReadableLayoutSlot {
  const resourceType = getDiagramNodeResourceType(node);
  const resourceName =
    `${node.parameters?.resourceName ?? ""} ${node.label} ${node.id}`.toLowerCase();

  if (parentNode && getDiagramNodeResourceType(parentNode) === "aws_region") {
    return getRegionReadableLayoutSlot(resourceType, resourceName);
  }

  if (resourceType === "aws_iam_role" || resourceType === "aws_iam_instance_profile") {
    return { column: 2, row: 0 };
  }

  if (resourceType === "aws_iam_policy") {
    return { column: 1, row: 0 };
  }

  if (resourceType === "aws_kms_key" || resourceType === "aws_acm_certificate") {
    return { column: 3, row: 0 };
  }

  if (
    resourceType === "aws_cloudfront_distribution" ||
    resourceType === "aws_route53_record" ||
    resourceType === "aws_wafv2_web_acl"
  ) {
    return { column: 0, row: 1 };
  }

  if (
    resourceType === "aws_s3_bucket" &&
    /(^|[_\s-])(asset|assets|static|site|website|web)([_\s-]|$)/u.test(resourceName)
  ) {
    return { column: 1, row: 1 };
  }

  if (
    resourceType === "aws_api_gateway_rest_api" ||
    resourceType === "aws_api_gateway_websocket_api" ||
    resourceType === "aws_api_gateway_resource" ||
    resourceType === "aws_api_gateway_method" ||
    resourceType === "aws_api_gateway_integration" ||
    resourceType === "aws_api_gateway_stage" ||
    resourceType === "aws_lb" ||
    resourceType === "aws_lb_listener"
  ) {
    return { column: 0, row: 2 };
  }

  if (
    resourceType === "aws_lambda_permission" ||
    resourceType === "aws_sqs_queue" ||
    resourceType === "aws_sns_topic" ||
    resourceType === "aws_lambda_event_source_mapping"
  ) {
    return { column: 1, row: 2 };
  }

  if (
    resourceType === "aws_lambda_function" ||
    resourceType === "aws_instance" ||
    resourceType === "aws_autoscaling_group" ||
    resourceType === "aws_lb_target_group"
  ) {
    return { column: 2, row: 2 };
  }

  if (
    resourceType === "aws_s3_bucket" ||
    resourceType === "aws_db_instance" ||
    resourceType === "aws_db_subnet_group" ||
    resourceType === "aws_ebs_volume"
  ) {
    return { column: 3, row: 2 };
  }

  if (resourceType === "aws_cloudwatch_log_group" || resourceType === "aws_cloudwatch_dashboard") {
    return { column: 3, row: 1 };
  }

  if (resourceType === "aws_cloudwatch_metric_alarm") {
    return { column: 3, row: 3 };
  }

  if (resourceType === "aws_security_group_rule") {
    return { column: 1, row: 3 };
  }

  return { column: 3, row: 2 };
}

function getRegionReadableLayoutSlot(
  resourceType: string,
  resourceName: string
): ReadableLayoutSlot {
  if (resourceType === "aws_iam_policy") {
    return { column: 0, row: 0 };
  }

  if (resourceType === "aws_iam_role" || resourceType === "aws_iam_instance_profile") {
    return { column: 1, row: 0 };
  }

  if (resourceType === "aws_kms_key" || resourceType === "aws_acm_certificate") {
    return { column: 2, row: 0 };
  }

  if (
    resourceType === "aws_cloudfront_distribution" ||
    resourceType === "aws_route53_record" ||
    resourceType === "aws_wafv2_web_acl"
  ) {
    return { column: 0, row: 1 };
  }

  if (
    resourceType === "aws_s3_bucket" &&
    /(^|[_\s-])(asset|assets|static|site|website|web)([_\s-]|$)/u.test(resourceName)
  ) {
    return { column: 1, row: 1 };
  }

  if (resourceType === "aws_cloudwatch_log_group" || resourceType === "aws_cloudwatch_dashboard") {
    return { column: 3, row: 1 };
  }

  if (resourceType === "aws_ami") {
    return { column: 0, row: 2 };
  }

  if (resourceType === "aws_s3_bucket") {
    return { column: 1, row: 2 };
  }

  if (resourceType === "aws_cloudwatch_metric_alarm") {
    return { column: 3, row: 2 };
  }

  if (resourceType === "aws_vpc") {
    return { column: 0, row: 3 };
  }

  return { column: 2, row: 2 };
}

function createConventionResourceName(
  resourceType: string,
  currentResourceName: string,
  fallbackNames: readonly string[] = []
): string {
  const convention = RESOURCE_NAME_CONVENTIONS[resourceType];

  if (!convention) {
    return toTerraformName(currentResourceName);
  }

  const normalizedName = toTerraformName(currentResourceName);
  const tokens = normalizedName.split("_").filter((token) => token.length > 0);

  if (tokens[0] === convention.prefix) {
    return normalizedName;
  }

  const aliasSet = new Set(convention.aliases);
  const body = tokens.filter((token) => !aliasSet.has(token)).join("_");

  if (body.length > 0) {
    return `${convention.prefix}_${body}`;
  }

  const fallbackBody = fallbackNames
    .map((fallbackName) => createConventionResourceNameBody(fallbackName, aliasSet))
    .find((candidate) => candidate.length > 0);

  return fallbackBody ? `${convention.prefix}_${fallbackBody}` : convention.prefix;
}

function createConventionResourceNameBody(value: string, aliasSet: ReadonlySet<string>): string {
  return toTerraformName(value)
    .split("_")
    .filter((token) => token.length > 0 && !aliasSet.has(token))
    .join("_");
}

function resolveSiblingNodeCollisions(nodes: readonly DiagramNode[]): DiagramNode[] {
  let currentNodes = [...nodes];

  for (let pass = 0; pass < MAX_AREA_FIT_PASSES; pass += 1) {
    const nextNodes = resolveSiblingNodeCollisionsOnce(currentNodes);

    if (areNodeLayoutsEqual(currentNodes, nextNodes)) {
      return nextNodes;
    }

    currentNodes = nextNodes;
  }

  return currentNodes;
}

function resolveSiblingNodeCollisionsOnce(nodes: readonly DiagramNode[]): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodesByParentId = createResourceNodesByParentId(nodes);
  const parentIds = [...nodesByParentId.keys()].sort(
    (leftParentId, rightParentId) =>
      getParentAreaDepth(leftParentId, nodeById) - getParentAreaDepth(rightParentId, nodeById)
  );

  for (const parentId of parentIds) {
    const siblingNodes = [...(nodesByParentId.get(parentId) ?? [])].sort(
      compareCollisionResolutionNodes
    );
    const placedNodes: DiagramNode[] = [];

    for (const originalNode of siblingNodes) {
      const node = nodeById.get(originalNode.id);

      if (!node) {
        continue;
      }

      const nextNode = moveNodeUntilClear(node, placedNodes, nodeById);
      const delta = {
        x: nextNode.position.x - node.position.x,
        y: nextNode.position.y - node.position.y
      };

      if (delta.x !== 0 || delta.y !== 0) {
        moveNodeSubtree(node.id, delta, nodeById);
      }

      const placedNode = nodeById.get(node.id);

      if (placedNode) {
        placedNodes.push(placedNode);
      }
    }
  }

  return nodes.map((node) => nodeById.get(node.id) ?? node);
}

function compareCollisionResolutionNodes(left: DiagramNode, right: DiagramNode): number {
  return (
    left.position.y - right.position.y ||
    left.position.x - right.position.x ||
    left.id.localeCompare(right.id)
  );
}

function createResourceNodesByParentId(nodes: readonly DiagramNode[]): Map<string, DiagramNode[]> {
  const nodesByParentId = new Map<string, DiagramNode[]>();

  for (const node of nodes) {
    if (node.kind !== "resource" && !isAreaDiagramNode(node)) {
      continue;
    }

    const parentId = node.metadata?.parentAreaNodeId ?? ROOT_PARENT_AREA_ID;
    const siblings = nodesByParentId.get(parentId) ?? [];
    siblings.push(node);
    nodesByParentId.set(parentId, siblings);
  }

  return nodesByParentId;
}

function getParentAreaDepth(parentId: string, nodeById: ReadonlyMap<string, DiagramNode>): number {
  if (parentId === ROOT_PARENT_AREA_ID) {
    return -1;
  }

  const parentNode = nodeById.get(parentId);

  return parentNode ? getAreaDepth(parentNode, nodeById) : 0;
}

function moveNodeSubtree(
  nodeId: string,
  delta: DiagramNode["position"],
  nodeById: Map<string, DiagramNode>
): void {
  for (const node of [...nodeById.values()]) {
    if (node.id !== nodeId && !hasAreaAncestor(node, nodeId, nodeById)) {
      continue;
    }

    nodeById.set(node.id, {
      ...node,
      position: {
        x: node.position.x + delta.x,
        y: node.position.y + delta.y
      }
    });
  }
}

function moveNodeUntilClear(
  node: DiagramNode,
  placedNodes: readonly DiagramNode[],
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode {
  let nextPosition = { ...node.position };

  for (let attempts = 0; attempts < 120; attempts += 1) {
    const candidate = {
      ...node,
      position: nextPosition
    };
    const overlappingNode = placedNodes.find((placedNode) =>
      doNodeFootprintsOverlap(candidate, placedNode, nodeById)
    );

    if (!overlappingNode) {
      return candidate;
    }

    if (isAreaDiagramNode(candidate) && isAreaDiagramNode(overlappingNode)) {
      const candidateFootprint = getNodeCollisionFootprint(candidate);
      const overlappingFootprint = getNodeCollisionFootprint(overlappingNode);
      nextPosition = {
        x: nextPosition.x,
        y:
          overlappingFootprint.y +
          overlappingFootprint.height +
          RESOURCE_COLLISION_GAP -
          (candidateFootprint.y - candidate.position.y)
      };
      continue;
    }

    const collisionStepSize = getNodeCollisionStepSize(node);
    const nextX = nextPosition.x + collisionStepSize.width + RESOURCE_COLLISION_GAP;
    nextPosition =
      nextX - node.position.x > RESOURCE_COLLISION_ROW_WIDTH
        ? {
            x: node.position.x,
            y: nextPosition.y + collisionStepSize.height + RESOURCE_COLLISION_GAP
          }
        : {
            x: nextX,
            y: nextPosition.y
          };
  }

  return {
    ...node,
    position: nextPosition
  };
}

function getNodeCollisionStepSize(node: DiagramNode): DiagramNode["size"] {
  const visualBounds = getResourceNodeVisualBounds(node);

  return {
    width: visualBounds.width,
    height: visualBounds.height
  };
}

function doNodeFootprintsOverlap(
  leftNode: DiagramNode,
  rightNode: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  if (isAreaDiagramNode(leftNode) !== isAreaDiagramNode(rightNode)) {
    return doAreaAndResourceFootprintsConflict(leftNode, rightNode, nodeById);
  }

  const left = getNodeCollisionFootprint(leftNode);
  const right = getNodeCollisionFootprint(rightNode);

  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function doAreaAndResourceFootprintsConflict(
  leftNode: DiagramNode,
  rightNode: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  const areaNode = isAreaDiagramNode(leftNode) ? leftNode : rightNode;
  const resourceNode = isAreaDiagramNode(leftNode) ? rightNode : leftNode;

  if (hasAreaAncestor(resourceNode, areaNode.id, nodeById)) {
    return false;
  }

  const area = getNodeCollisionFootprint(areaNode);
  const resource = getNodeCollisionFootprint(resourceNode);

  return (
    area.x < resource.x + resource.width &&
    area.x + area.width > resource.x &&
    area.y < resource.y + resource.height &&
    area.y + area.height > resource.y
  );
}

function getNodeCollisionFootprint(node: DiagramNode): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const visualBounds = getResourceNodeVisualBounds(node);

  return {
    x: visualBounds.x - RESOURCE_COLLISION_GAP / 2,
    y: visualBounds.y - RESOURCE_COLLISION_GAP / 2,
    width: visualBounds.width + RESOURCE_COLLISION_GAP,
    height: visualBounds.height + RESOURCE_COLLISION_GAP
  };
}

function getAreaDepth(node: DiagramNode, nodeById: ReadonlyMap<string, DiagramNode>): number {
  let depth = 0;
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>();

  while (parentAreaNodeId) {
    if (visitedNodeIds.has(parentAreaNodeId)) {
      return depth;
    }

    visitedNodeIds.add(parentAreaNodeId);
    depth += 1;
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return depth;
}

// 깊게 중첩된 Region/VPC/AZ/SG/Subnet 박스가 안정될 때 반복 계산을 멈춥니다.
function areNodeLayoutsEqual(
  leftNodes: readonly DiagramNode[],
  rightNodes: readonly DiagramNode[]
): boolean {
  return leftNodes.every((leftNode, index) => {
    const rightNode = rightNodes[index];

    return (
      rightNode?.position.x === leftNode.position.x &&
      rightNode.position.y === leftNode.position.y &&
      rightNode.size.width === leftNode.size.width &&
      rightNode.size.height === leftNode.size.height
    );
  });
}

function fitAreaNodesToDirectChildren(nodes: readonly DiagramNode[]): DiagramNode[] {
  const childrenByParentId = new Map<string, DiagramNode[]>();

  for (const node of nodes) {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (!parentAreaNodeId) {
      continue;
    }

    const children = childrenByParentId.get(parentAreaNodeId) ?? [];
    children.push(node);
    childrenByParentId.set(parentAreaNodeId, children);
  }

  return nodes.map((node) => {
    if (!isAreaDiagramNode(node)) {
      return node;
    }

    const children = childrenByParentId.get(node.id) ?? [];

    if (children.length === 0) {
      return node;
    }

    const requiredLayout = getRequiredAreaLayout(node, children);

    if (
      requiredLayout.position.x === node.position.x &&
      requiredLayout.position.y === node.position.y &&
      requiredLayout.size.width === node.size.width &&
      requiredLayout.size.height === node.size.height
    ) {
      return node;
    }

    return {
      ...node,
      position: requiredLayout.position,
      size: requiredLayout.size
    };
  });
}

function getRequiredAreaLayout(
  node: DiagramNode,
  children: readonly DiagramNode[]
): Pick<DiagramNode, "position" | "size"> {
  const shouldCompactArea = shouldCompactAreaToChildren(node);
  let left = shouldCompactArea ? Number.POSITIVE_INFINITY : node.position.x;
  let top = shouldCompactArea ? Number.POSITIVE_INFINITY : node.position.y;
  let right = shouldCompactArea ? Number.NEGATIVE_INFINITY : node.position.x + node.size.width;
  let bottom = shouldCompactArea ? Number.NEGATIVE_INFINITY : node.position.y + node.size.height;

  for (const child of children) {
    const childBounds = getResourceNodeVisualBounds(child);
    const childPadding = getAreaChildPadding(child);
    left = Math.min(left, childBounds.x - childPadding);
    top = Math.min(top, childBounds.y - childPadding);
    right = Math.max(right, childBounds.x + childBounds.width + childPadding);
    bottom = Math.max(bottom, childBounds.y + childBounds.height + childPadding);
  }
  const minimumSize = getCompactAreaMinimumSize(node);
  const width = Math.max(right - left, minimumSize.width);
  const height = Math.max(bottom - top, minimumSize.height);

  return {
    position: {
      x: left,
      y: top
    },
    size: {
      width,
      height
    }
  };
}

function shouldCompactAreaToChildren(node: DiagramNode): boolean {
  return (
    node.id === REPOSITORY_MANAGED_SERVICES_AREA_ID ||
    getCompactAreaMinimumSize(node) !== DEFAULT_AREA_MIN_SIZE
  );
}

const DEFAULT_AREA_MIN_SIZE: DiagramNode["size"] = { width: 0, height: 0 };

function getCompactAreaMinimumSize(node: DiagramNode): DiagramNode["size"] {
  if (isRepositoryGeneratedSubnetArea(node)) {
    return REPOSITORY_SUBNET_SIZE;
  }

  return COMPACT_AREA_MIN_SIZES[getDiagramNodeResourceType(node)] ?? DEFAULT_AREA_MIN_SIZE;
}

function isRepositoryGeneratedSubnetArea(node: DiagramNode): boolean {
  return (
    isAreaDiagramNode(node) &&
    getDiagramNodeResourceType(node) === "aws_subnet" &&
    (/^repository-/u.test(node.id) ||
      /^fixed-template-ecs-fargate-container-app-subnet-/u.test(node.id))
  );
}

function getAreaChildPadding(child: DiagramNode): number {
  return isAreaDiagramNode(child) ? AREA_CHILD_PADDING : RESOURCE_AREA_INSET_PADDING;
}

function findConfigParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  const routeTableAssociationParentAreaNodeId = findRouteTableAssociationParentAreaNodeId(
    node,
    nodeById
  );

  if (routeTableAssociationParentAreaNodeId) {
    return routeTableAssociationParentAreaNodeId;
  }

  const subnetNode = findConfigAreaNodeByParameter(node, "subnetId", nodeById);

  if (subnetNode && subnetNode.id !== node.id) {
    return subnetNode.id;
  }

  const multiSubnetParentAreaNodeId = findMultiSubnetParentAreaNodeId(node, nodeById);

  if (multiSubnetParentAreaNodeId) {
    return multiSubnetParentAreaNodeId;
  }

  const dbSubnetGroupParentAreaNodeId = findDbSubnetGroupParentAreaNodeId(node, nodeById);

  if (dbSubnetGroupParentAreaNodeId) {
    return dbSubnetGroupParentAreaNodeId;
  }

  const loadBalancerParentAreaNodeId = findLoadBalancerParentAreaNodeId(node, nodeById);

  if (loadBalancerParentAreaNodeId) {
    return loadBalancerParentAreaNodeId;
  }

  const vpcNode = findConfigAreaNodeByParameter(node, "vpcId", nodeById);

  return vpcNode && vpcNode.id !== node.id ? vpcNode.id : undefined;
}

const MULTI_SUBNET_REFERENCE_PATHS = [
  ["subnets"],
  ["subnetIds"],
  ["vpcZoneIdentifier"],
  ["networkConfiguration", "subnets"]
] as const;

function findMultiSubnetParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  const subnetNodes = MULTI_SUBNET_REFERENCE_PATHS.flatMap((path) =>
    getNestedStringParameterValues(node, path)
  )
    .map((referenceValue) => findReferencedNode(referenceValue, nodeById))
    .filter(
      (referencedNode): referencedNode is DiagramNode =>
        referencedNode !== undefined && getDiagramNodeResourceType(referencedNode) === "aws_subnet"
    );

  if (subnetNodes.length === 0) {
    return undefined;
  }

  if (subnetNodes.length === 1) {
    return subnetNodes[0]?.id;
  }

  const vpcNodeIds = new Set(
    subnetNodes.flatMap((subnetNode) => {
      const vpcNode = findConfigAreaNodeByParameter(subnetNode, "vpcId", nodeById);
      return vpcNode ? [vpcNode.id] : [];
    })
  );

  return vpcNodeIds.size === 1 ? [...vpcNodeIds][0] : undefined;
}

function findDbSubnetGroupParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  const dbSubnetGroupNode = findConfigNodeByParameter(node, "dbSubnetGroupName", nodeById);

  return dbSubnetGroupNode
    ? findMultiSubnetParentAreaNodeId(dbSubnetGroupNode, nodeById)
    : undefined;
}

function findLoadBalancerParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  if (getDiagramNodeResourceType(node) !== "aws_lb_listener") {
    return undefined;
  }

  const loadBalancerNode = findConfigNodeByParameter(node, "loadBalancerArn", nodeById);

  return loadBalancerNode ? findMultiSubnetParentAreaNodeId(loadBalancerNode, nodeById) : undefined;
}

function getNestedStringParameterValues(node: DiagramNode, path: readonly string[]): string[] {
  let value: unknown = node.parameters?.values;

  for (const key of path) {
    if (!isRecord(value)) {
      return [];
    }

    value = value[key];
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }

  return Array.isArray(value)
    ? value.filter(isString).filter((item) => item.trim().length > 0)
    : [];
}

function findRouteTableAssociationParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  if ((node.parameters?.resourceType ?? node.type) !== "aws_route_table_association") {
    return undefined;
  }

  const routeTableNode = findConfigNodeByParameter(node, "routeTableId", nodeById);
  const vpcNode = routeTableNode
    ? findConfigAreaNodeByParameter(routeTableNode, "vpcId", nodeById)
    : undefined;

  return vpcNode && vpcNode.id !== node.id ? vpcNode.id : undefined;
}

function findConfigAreaNodeByParameter(
  node: DiagramNode,
  parameterName: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode | undefined {
  const referencedNode = findConfigNodeByParameter(node, parameterName, nodeById);

  return referencedNode && isAreaDiagramNode(referencedNode) ? referencedNode : undefined;
}

function findConfigNodeByParameter(
  node: DiagramNode,
  parameterName: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode | undefined {
  const referenceValue = getStringParameterValue(node, parameterName);

  return referenceValue ? findReferencedNode(referenceValue, nodeById) : undefined;
}

function findReferencedNode(
  rawReferenceValue: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode | undefined {
  const referenceValue = normalizeReferenceValue(rawReferenceValue);
  const directNode = nodeById.get(referenceValue);

  if (directNode) {
    return directNode;
  }

  for (const node of nodeById.values()) {
    if (matchesTerraformNodeReference(referenceValue, node)) {
      return node;
    }
  }

  return undefined;
}

function matchesTerraformNodeReference(referenceValue: string, node: DiagramNode): boolean {
  const parameters = node.parameters;

  if (!parameters) {
    return false;
  }

  const referenceNames = createTerraformReferenceNameCandidates(node, parameters);
  const references = [...referenceNames].flatMap((resourceName) => {
    const resourceReferences = TERRAFORM_REFERENCE_ATTRIBUTE_SUFFIXES.map(
      (suffix) => `${parameters.resourceType}.${resourceName}.${suffix}`
    );

    return parameters.terraformBlockType === "data"
      ? [
          ...resourceReferences,
          ...resourceReferences.map((resourceReference) => `data.${resourceReference}`)
        ]
      : resourceReferences;
  });

  return references.includes(referenceValue);
}

function createTerraformReferenceNameCandidates(
  node: DiagramNode,
  parameters: DiagramNodeParameters
): string[] {
  return [
    ...new Set(
      [
        parameters.resourceName,
        getStringConfigValue(parameters.values, "terraformResourceName"),
        node.id,
        toTerraformName(node.id),
        toTerraformName(node.label)
      ].filter(
        (referenceName): referenceName is string =>
          typeof referenceName === "string" && referenceName.length > 0
      )
    )
  ];
}

function normalizeReferenceValue(value: string): string {
  return value.trim().replace(/^\$\{(.+)\}$/u, "$1");
}

// SG visual scope는 contains edge가 있어도 persisted parent 후보로 사용하지 않습니다.
function findEdgeParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>,
  edges: readonly ArchitectureJson["edges"][number][]
): string | undefined {
  for (const edge of edges) {
    if (edge.targetId !== node.id || !isAreaParentEdge(edge)) {
      continue;
    }

    const sourceNode = nodeById.get(edge.sourceId);

    if (sourceNode && sourceNode.id !== node.id && isContainmentAreaNode(sourceNode)) {
      return sourceNode.id;
    }
  }

  return undefined;
}

function isAreaParentEdge(edge: ArchitectureJson["edges"][number]): boolean {
  return isAreaContainmentEdgeLabel(edge.label);
}

function isAreaContainmentEdgeLabel(label: string | undefined): boolean {
  return typeof label === "string" && AREA_PARENT_EDGE_LABELS.has(label.trim().toLowerCase());
}

function isAreaDiagramNode(node: DiagramNode): boolean {
  return isAreaNode(node);
}

function getDiagramNodeResourceType(node: DiagramNode | undefined): string {
  return node?.parameters?.resourceType ?? node?.type ?? "";
}

function isAsyncResourceType(resourceType: string): boolean {
  return [
    "aws_cloudwatch_log_group",
    "aws_cloudwatch_metric_alarm",
    "aws_lambda_event_source_mapping",
    "aws_sns_topic",
    "aws_sqs_queue"
  ].includes(resourceType);
}

function getStringParameterValue(node: DiagramNode, key: string): string | undefined {
  const value = node.parameters?.values[key];

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getStringConfigValue(config: ResourceConfig, key: string): string | undefined {
  const value = config[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getConvertibleResourceNodeParameters(node: DiagramNode): DiagramNodeParameters | null {
  if (node.kind !== "resource") {
    return null;
  }

  if (node.parameters?.invalid === true) {
    return null;
  }

  if (node.parameters != null) {
    return node.parameters;
  }

  const resourceType = node.type.trim();

  if (!getResourceDefinitionByTerraform(DEFAULT_TERRAFORM_BLOCK_TYPE, resourceType)) {
    return null;
  }

  return {
    fileName: "main",
    resourceName: createConventionResourceName(resourceType, node.id, [node.label, node.id]),
    resourceType,
    terraformBlockType: DEFAULT_TERRAFORM_BLOCK_TYPE,
    values: {}
  };
}

function createArchitectureConfig(parameters: DiagramNodeParameters): ResourceConfig {
  const values = isRecord(parameters.values) ? parameters.values : {};
  const config: ResourceConfig = {
    ...values,
    terraformResourceName: parameters.resourceName,
    terraformResourceType: parameters.resourceType
  };

  return parameters.resourceType === "aws_security_group_rule"
    ? addSecurityGroupRuleIngress(config, values)
    : config;
}

function addSecurityGroupRuleIngress(
  config: ResourceConfig,
  values: ResourceConfig
): ResourceConfig {
  const ingress = normalizeSecurityGroupRuleIngress(values);

  return ingress.length > 0
    ? {
        ...config,
        ingress
      }
    : config;
}

function normalizeSecurityGroupRuleIngress(values: ResourceConfig): ResourceConfig[] {
  if (values["type"] !== "ingress") {
    return [];
  }

  const cidrBlocks = values["cidrBlocks"] ?? values["cidr_blocks"];

  if (!Array.isArray(cidrBlocks)) {
    return [];
  }

  const port = normalizePort(
    values["fromPort"] ?? values["from_port"] ?? values["toPort"] ?? values["to_port"]
  );

  return cidrBlocks
    .filter(isString)
    .map((cidr) => (port === undefined ? { cidr } : { cidr, port }));
}

// Security Group Rule 포트는 AWS가 받을 수 있는 숫자 범위만 분석 입력에 남깁니다.
function normalizePort(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return isValidPort(value) ? value : undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const port = Number(value);

  return isValidPort(port) ? port : undefined;
}

// LLM/API 응답에서 config가 비어도 Architecture Board 반영이 멈추지 않게 이름을 복구합니다.
function getArchitectureResourceName(
  node: ArchitectureJson["nodes"][number],
  resourceType: string
): string {
  const configuredName = node.config?.["terraformResourceName"];

  if (typeof configuredName === "string" && configuredName.trim().length > 0) {
    return configuredName;
  }

  const normalizedNodeId = toTerraformName(node.id);
  const convention = RESOURCE_NAME_CONVENTIONS[resourceType];

  return convention && normalizedNodeId === convention.prefix
    ? createConventionResourceName(resourceType, node.label ?? node.id, [node.id])
    : normalizedNodeId;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 0 && port <= 65_535;
}

function mapResourceTypeToTerraform(resourceType: ResourceType): string {
  if (resourceType === "UNKNOWN") {
    return UNKNOWN_TERRAFORM_RESOURCE_TYPE;
  }

  return (
    getDefaultResourceDefinitionByResourceType(resourceType)?.terraform.resourceType ??
    UNKNOWN_TERRAFORM_RESOURCE_TYPE
  );
}

function mapTerraformResourceType(parameters: DiagramNodeParameters): ResourceType {
  if (isRdsReadReplicaParameters(parameters)) {
    return "RDS_READ_REPLICA";
  }

  const terraformBlockType = parameters.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;

  return (
    getResourceDefinitionByTerraform(terraformBlockType, parameters.resourceType)?.resourceType ??
    "UNKNOWN"
  );
}

function isRdsReadReplicaParameters(parameters: DiagramNodeParameters): boolean {
  if (parameters.resourceType !== "aws_db_instance") {
    return false;
  }

  const values = isRecord(parameters.values) ? parameters.values : {};
  const replicateSourceDb = values["replicateSourceDb"] ?? values["replicate_source_db"];

  return typeof replicateSourceDb === "string" && replicateSourceDb.trim().length > 0;
}

function createResourceItemsByTerraformType(
  resources: readonly ResourceItem[]
): Map<string, ResourceItem> {
  const resourcesByType = new Map<string, ResourceItem>();

  for (const resource of resources) {
    if (resourcesByType.has(resource.nodeDefaults.type)) {
      continue;
    }

    resourcesByType.set(resource.nodeDefaults.type, resource);
  }

  return resourcesByType;
}

// Terraform resource name은 사용자 로케일과 무관한 ASCII identifier로 정규화합니다.
function toTerraformName(value: string): string {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return name.length > 0 ? name : "resource";
}

function isRecord(value: unknown): value is ResourceConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// SG rule 입력 배열에서 문자열 항목만 AWS ingress 값 후보로 남깁니다.
function isString(value: unknown): value is string {
  return typeof value === "string";
}
