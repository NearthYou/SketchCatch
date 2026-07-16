import type { DiagramNode } from "@sketchcatch/types";
import { isAreaNode } from "../diagram-editor/area-nodes";

export type AutomaticDiagramSemanticRole =
  | "actor"
  | "entry"
  | "network"
  | "compute"
  | "data"
  | "async"
  | "security"
  | "observability"
  | "delivery"
  | "support";

type ProviderLayoutMapping = {
  readonly areaMinimumSizeByResourceType: Readonly<Record<string, DiagramNode["size"]>>;
  readonly matchesResourceType: (resourceType: string) => boolean;
  readonly rolePatterns: ReadonlyArray<{
    readonly pattern: RegExp;
    readonly role: AutomaticDiagramSemanticRole;
  }>;
};

const DEFAULT_AREA_MINIMUM_SIZE: DiagramNode["size"] = { width: 220, height: 160 };

const GENERIC_ROLE_PATTERNS: ProviderLayoutMapping["rolePatterns"] = [
  {
    pattern: /\b(security|identity|permission|policy|role|secret|certificate|encryption)\b/u,
    role: "security"
  },
  {
    pattern: /\b(observability|monitor|metric|alarm|logging|logs?|tracing|telemetry)\b/u,
    role: "observability"
  },
  {
    pattern: /\b(ci\/?cd|pipeline|delivery|deployment|registry|build|release)\b/u,
    role: "delivery"
  },
  { pattern: /\b(user|browser|client|customer|actor)\b/u, role: "actor" },
  { pattern: /\b(dns|cdn|api|gateway|load balancer|ingress|edge)\b/u, role: "entry" },
  { pattern: /\b(database|storage|bucket|table|cache|volume|data)\b/u, role: "data" },
  { pattern: /\b(queue|topic|event|stream|workflow|message|async)\b/u, role: "async" },
  { pattern: /\b(compute|function|container|service|server|cluster|runtime)\b/u, role: "compute" },
  {
    pattern: /\b(network|region|zone|subnet|route|firewall|vpc|virtual network)\b/u,
    role: "network"
  }
];

// AWS is the first provider adapter. The layout engine consumes only neutral roles and sizes.
const AWS_LAYOUT_MAPPING: ProviderLayoutMapping = {
  areaMinimumSizeByResourceType: {
    aws_availability_zone: { width: 300, height: 200 },
    aws_region: { width: 520, height: 320 },
    aws_security_group: { width: 240, height: 176 },
    aws_subnet: { width: 260, height: 196 },
    aws_vpc: { width: 400, height: 280 }
  },
  matchesResourceType: (resourceType) => resourceType.startsWith("aws_"),
  rolePatterns: [
    {
      pattern:
        /(?:appautoscaling_(?:policy|target)|db_subnet_group|ecs_(?:cluster|task_definition)|eip|internet_gateway|lb_(?:listener|target_group)|nat_gateway|network_acl|route(?:_table)?(?:_association)?)\b/u,
      role: "support"
    },
    {
      pattern: /iam|kms|cognito|guardduty|shield|waf|acm|secretsmanager|security_group/u,
      role: "security"
    },
    { pattern: /cloudwatch|xray/u, role: "observability" },
    { pattern: /codebuild|codepipeline|codedeploy|ecr/u, role: "delivery" },
    {
      pattern: /cloudfront|route53|api_gateway|apigateway|load_balancer|\baws_lb\b/u,
      role: "entry"
    },
    { pattern: /rds|db_instance|dynamodb|s3|elasticache|ebs/u, role: "data" },
    { pattern: /sqs|sns|sfn|eventbridge|kinesis/u, role: "async" },
    { pattern: /lambda|instance|ecs|eks|autoscaling|launch_template/u, role: "compute" },
    { pattern: /vpc|subnet|route|gateway|nat/u, role: "network" }
  ]
};

const PROVIDER_LAYOUT_MAPPINGS: readonly ProviderLayoutMapping[] = [AWS_LAYOUT_MAPPING];

export function getAutomaticDiagramSemanticRole(node: DiagramNode): AutomaticDiagramSemanticRole {
  const resourceType = `${node.parameters?.resourceType ?? node.type} ${node.type}`.toLowerCase();
  const descriptor = `${resourceType} ${node.label}`.toLowerCase();
  const providerMapping = PROVIDER_LAYOUT_MAPPINGS.find((mapping) =>
    mapping.matchesResourceType(resourceType)
  );

  if (/\bfargate\s+task\b/u.test(descriptor)) {
    return "compute";
  }

  return (
    findRole(providerMapping?.rolePatterns ?? [], resourceType) ??
    findRole(GENERIC_ROLE_PATTERNS, descriptor) ??
    "support"
  );
}

export function getAutomaticDiagramAreaMinimumSize(node: DiagramNode): DiagramNode["size"] {
  const resourceType = (node.parameters?.resourceType ?? node.type).toLowerCase();
  const providerMapping = PROVIDER_LAYOUT_MAPPINGS.find((mapping) =>
    mapping.matchesResourceType(resourceType)
  );
  const providerMinimumSize = providerMapping?.areaMinimumSizeByResourceType[resourceType];

  if (providerMinimumSize) {
    return providerMinimumSize;
  }

  if (!isAreaNode(node)) {
    return DEFAULT_AREA_MINIMUM_SIZE;
  }

  const descriptor = `${resourceType} ${node.label}`.toLowerCase();

  if (/\b(cloud|account|region)\b/u.test(descriptor)) return { width: 520, height: 320 };
  if (/\b(zone|availability zone)\b/u.test(descriptor)) return { width: 300, height: 200 };
  if (/\b(subnet|security group|firewall)\b/u.test(descriptor)) return { width: 260, height: 196 };
  if (/\b(network|vpc|virtual network)\b/u.test(descriptor)) return { width: 400, height: 280 };

  return DEFAULT_AREA_MINIMUM_SIZE;
}

function findRole(
  patterns: ProviderLayoutMapping["rolePatterns"],
  descriptor: string
): AutomaticDiagramSemanticRole | undefined {
  return patterns.find(({ pattern }) => pattern.test(descriptor))?.role;
}
