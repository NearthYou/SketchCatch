import type {
  DiscoveredResource,
  ResourceType,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import {
  getReverseEngineeringProviderTypeLabel,
  presentReverseEngineeringResource,
  presentReverseEngineeringScanErrors
} from "./reverse-engineering-presentation";

export const REVERSE_ENGINEERING_RESOURCE_CATEGORIES = [
  { key: "network", label: "네트워크" },
  { key: "compute", label: "서버·컴퓨팅" },
  { key: "data", label: "데이터·저장소" },
  { key: "security", label: "보안·권한" },
  { key: "operations", label: "애플리케이션·운영" },
  { key: "other", label: "기타 AWS 리소스" }
] as const;

export type ReverseEngineeringResourceCategoryKey =
  (typeof REVERSE_ENGINEERING_RESOURCE_CATEGORIES)[number]["key"];

export type ReverseEngineeringResourceCategoryGroup = {
  readonly key: ReverseEngineeringResourceCategoryKey;
  readonly label: string;
  readonly resources: readonly DiscoveredResource[];
  readonly matchingResources: readonly DiscoveredResource[];
  readonly supportedCount: number;
  readonly reviewOnlyCount: number;
  readonly unreadableServiceCount: number;
  readonly unreadableServiceNames: readonly string[];
};

export type ReverseEngineeringResourceAccordionModel = {
  readonly groups: readonly ReverseEngineeringResourceCategoryGroup[];
  readonly normalizedSearch: string;
  readonly unclassifiedUnreadableServiceCount: number;
  readonly unclassifiedUnreadableServiceNames: readonly string[];
};

export type ReverseEngineeringDetailSectionKey =
  | "summary"
  | "resources"
  | "structure"
  | "read-scope"
  | "checks"
  | "source";

export const REVERSE_ENGINEERING_DETAIL_SECTION_KEYS = [
  "summary",
  "resources",
  "structure",
  "read-scope",
  "checks",
  "source"
] as const satisfies readonly ReverseEngineeringDetailSectionKey[];

const NETWORK_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::EC2::CarrierGateway",
  "AWS::EC2::CustomerGateway",
  "AWS::EC2::DhcpOptions",
  "AWS::EC2::EgressOnlyInternetGateway",
  "AWS::EC2::EIP",
  "AWS::EC2::FlowLog",
  "AWS::EC2::InternetGateway",
  "AWS::EC2::LocalGatewayRoute",
  "AWS::EC2::LocalGatewayRouteTable",
  "AWS::EC2::LocalGatewayRouteTableVPCAssociation",
  "AWS::EC2::NatGateway",
  "AWS::EC2::NetworkAcl",
  "AWS::EC2::NetworkAclEntry",
  "AWS::EC2::NetworkInterface",
  "AWS::EC2::NetworkInterfacePermission",
  "AWS::EC2::PrefixList",
  "AWS::EC2::RouteTable",
  "AWS::EC2::RouteTableAssociation",
  "AWS::EC2::Subnet",
  "AWS::EC2::SubnetCidrBlock",
  "AWS::EC2::SubnetNetworkAclAssociation",
  "AWS::EC2::SubnetRouteTableAssociation",
  "AWS::EC2::TransitGateway",
  "AWS::EC2::TransitGatewayAttachment",
  "AWS::EC2::TransitGatewayRoute",
  "AWS::EC2::TransitGatewayRouteTable",
  "AWS::EC2::VPC",
  "AWS::EC2::VPCDHCPOptionsAssociation",
  "AWS::EC2::VPCEndpoint",
  "AWS::EC2::VPCPeeringConnection",
  "AWS::EC2::VPCPeeringConnectionAccepter",
  "AWS::EC2::VPNConnection",
  "AWS::EC2::VPNGateway"
]);

const COMPUTE_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::EC2::Image",
  "AWS::EC2::Instance",
  "AWS::EC2::LaunchTemplate"
]);

const DATA_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::EC2::Volume",
  "AWS::EC2::VolumeAttachment",
  "AWS::RDS::DBCluster",
  "AWS::RDS::DBClusterParameterGroup",
  "AWS::RDS::DBInstance",
  "AWS::RDS::DBOptionGroup",
  "AWS::RDS::DBParameterGroup",
  "AWS::RDS::DBProxy",
  "AWS::RDS::DBProxyEndpoint"
]);

const SECURITY_PROVIDER_RESOURCE_TYPES = new Set([
  "AWS::EC2::KeyPair",
  "AWS::EC2::SecurityGroup",
  "AWS::EC2::SecurityGroupEgress",
  "AWS::EC2::SecurityGroupIngress",
  "AWS::EC2::SecurityGroupRule",
  "AWS::Lambda::Permission"
]);

const NETWORK_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::CloudWAN::",
  "AWS::DirectConnect::",
  "AWS::GlobalAccelerator::",
  "AWS::NetworkFirewall::",
  "AWS::NetworkManager::",
  "AWS::Route53::",
  "AWS::Route53Resolver::",
  "AWS::VpcLattice::"
] as const;
const COMPUTE_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::Amplify::",
  "AWS::AppRunner::",
  "AWS::ApplicationAutoScaling::",
  "AWS::AutoScaling::",
  "AWS::Batch::",
  "AWS::Bedrock::",
  "AWS::EC2::",
  "AWS::ECR::",
  "AWS::ECS::",
  "AWS::EKS::",
  "AWS::ElasticBeanstalk::",
  "AWS::EMR::",
  "AWS::Lambda::",
  "AWS::Lightsail::",
  "AWS::SageMaker::"
] as const;
const DATA_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::Athena::",
  "AWS::Backup::",
  "AWS::DAX::",
  "AWS::DataSync::",
  "AWS::DocDB::",
  "AWS::DynamoDB::",
  "AWS::EFS::",
  "AWS::ElastiCache::",
  "AWS::FSx::",
  "AWS::Glue::",
  "AWS::LakeFormation::",
  "AWS::Neptune::",
  "AWS::OpenSearchService::",
  "AWS::RDS::",
  "AWS::Redshift::",
  "AWS::S3::",
  "AWS::StorageGateway::",
  "AWS::Timestream::",
  "AWS::Transfer::"
] as const;
const SECURITY_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::AccessAnalyzer::",
  "AWS::Account::",
  "AWS::AuditManager::",
  "AWS::CertificateManager::",
  "AWS::CloudTrail::",
  "AWS::Cognito::",
  "AWS::Config::",
  "AWS::DirectoryService::",
  "AWS::GuardDuty::",
  "AWS::IdentityStore::",
  "AWS::IAM::",
  "AWS::KMS::",
  "AWS::Organizations::",
  "AWS::RAM::",
  "AWS::SecurityHub::",
  "AWS::SecretsManager::",
  "AWS::Shield::",
  "AWS::SSO::",
  "AWS::SSM::",
  "AWS::WAF::",
  "AWS::WAFRegional::",
  "AWS::WAFv2::"
] as const;
const OPERATIONS_PROVIDER_RESOURCE_PREFIXES = [
  "AWS::APIGateway::",
  "AWS::ApiGateway::",
  "AWS::ApiGatewayV2::",
  "AWS::AppConfig::",
  "AWS::AppMesh::",
  "AWS::ApplicationSignals::",
  "AWS::CloudFront::",
  "AWS::CloudFormation::",
  "AWS::CloudWatch::",
  "AWS::CodeBuild::",
  "AWS::CodeDeploy::",
  "AWS::CodePipeline::",
  "AWS::CodeStar::",
  "AWS::ElasticLoadBalancing::",
  "AWS::ElasticLoadBalancingV2::",
  "AWS::Events::",
  "AWS::EventBridge::",
  "AWS::Logs::",
  "AWS::ResourceExplorer2::",
  "AWS::ResourceGroups::",
  "AWS::Scheduler::",
  "AWS::ServiceDiscovery::",
  "AWS::SNS::",
  "AWS::SQS::",
  "AWS::StepFunctions::",
  "AWS::Tagging::",
  "AWS::XRay::"
] as const;

// generic inventory 결과가 팔레트 enum만 알고 오는 경우에도 같은 분류를 유지합니다.
const RESOURCE_TYPE_CATEGORIES: Readonly<
  Partial<Record<ResourceType, ReverseEngineeringResourceCategoryKey>>
> = {
  ACM_CERTIFICATE: "security",
  ACM_CERTIFICATE_VALIDATION: "security",
  AMI: "compute",
  AMPLIFY_APP: "compute",
  API_GATEWAY_AUTHORIZER: "operations",
  API_GATEWAY_DEPLOYMENT: "operations",
  API_GATEWAY_INTEGRATION: "operations",
  API_GATEWAY_METHOD: "operations",
  API_GATEWAY_RESOURCE: "operations",
  API_GATEWAY_REST_API: "operations",
  API_GATEWAY_STAGE: "operations",
  API_GATEWAY_V2_INTEGRATION: "operations",
  API_GATEWAY_V2_ROUTE: "operations",
  API_GATEWAY_V2_STAGE: "operations",
  API_GATEWAY_WEBSOCKET_API: "operations",
  APPLICATION_AUTO_SCALING_POLICY: "compute",
  APPLICATION_AUTO_SCALING_TARGET: "compute",
  AUTO_SCALING_GROUP: "compute",
  AUTO_SCALING_POLICY: "compute",
  AWS_CALLER_IDENTITY: "security",
  CLOUDFRONT: "operations",
  CLOUDTRAIL: "security",
  CLOUDWATCH_DASHBOARD: "operations",
  CLOUDWATCH_LOG_GROUP: "operations",
  CLOUDWATCH_LOG_RESOURCE_POLICY: "operations",
  CLOUDWATCH_LOG_STREAM: "operations",
  CLOUDWATCH_METRIC_ALARM: "operations",
  CODEBUILD_PROJECT: "operations",
  CODEDEPLOY_APP: "operations",
  CODEDEPLOY_DEPLOYMENT_GROUP: "operations",
  CODEPIPELINE: "operations",
  CODESTAR_CONNECTION: "operations",
  COGNITO_USER_POOL: "security",
  COGNITO_USER_POOL_CLIENT: "security",
  CONFIG_CONFIGURATION_RECORDER: "security",
  CONFIG_DELIVERY_CHANNEL: "security",
  CONFIG_RULE: "security",
  DB_SUBNET_GROUP: "data",
  DYNAMODB_TABLE: "data",
  EC2: "compute",
  EBS_VOLUME: "data",
  ECR_LIFECYCLE_POLICY: "compute",
  ECR_REPOSITORY: "compute",
  ECS_CAPACITY_PROVIDER: "compute",
  ECS_CLUSTER: "compute",
  ECS_SERVICE: "compute",
  ECS_TASK_DEFINITION: "compute",
  EFS_ACCESS_POINT: "data",
  EFS_FILE_SYSTEM: "data",
  EFS_MOUNT_TARGET: "data",
  EKS_ADDON: "compute",
  EKS_CLUSTER: "compute",
  EKS_FARGATE_PROFILE: "compute",
  EKS_NODE_GROUP: "compute",
  ELASTICACHE_PARAMETER_GROUP: "data",
  ELASTICACHE_REDIS: "data",
  ELASTICACHE_SUBNET_GROUP: "data",
  ELASTIC_IP: "network",
  EVENTBRIDGE_PERMISSION: "operations",
  EVENTBRIDGE_RULE: "operations",
  EVENTBRIDGE_TARGET: "operations",
  GUARDDUTY_DETECTOR: "security",
  IAM_INSTANCE_PROFILE: "security",
  IAM_POLICY: "security",
  IAM_ROLE: "security",
  INTERNET_GATEWAY: "network",
  KEY_PAIR: "security",
  KMS_ALIAS: "security",
  KMS_KEY: "security",
  KUBERNETES_DEPLOYMENT: "compute",
  KUBERNETES_NAMESPACE: "compute",
  KUBERNETES_SERVICE: "compute",
  LAMBDA: "compute",
  LAMBDA_ALIAS: "compute",
  LAMBDA_EVENT_SOURCE_MAPPING: "compute",
  LAMBDA_PERMISSION: "security",
  LAUNCH_TEMPLATE: "compute",
  LOAD_BALANCER: "operations",
  LOAD_BALANCER_LISTENER: "operations",
  LOAD_BALANCER_TARGET_GROUP: "operations",
  LOAD_BALANCER_TARGET_GROUP_ATTACHMENT: "operations",
  NAT_GATEWAY: "network",
  NETWORK_ACL: "network",
  NETWORK_ACL_RULE: "network",
  RDS: "data",
  RDS_CLUSTER: "data",
  RDS_CLUSTER_INSTANCE: "data",
  RDS_READ_REPLICA: "data",
  ROUTE_TABLE: "network",
  ROUTE_TABLE_ASSOCIATION: "network",
  ROUTE53_RECORD: "network",
  ROUTE53_ZONE: "network",
  S3: "data",
  SCHEDULER_SCHEDULE: "operations",
  SECRETS_MANAGER_SECRET: "security",
  SECURITY_GROUP: "security",
  SHIELD_PROTECTION: "security",
  SNS_TOPIC: "operations",
  SNS_TOPIC_SUBSCRIPTION: "operations",
  SQS_QUEUE: "operations",
  SSM_PARAMETER: "security",
  STEP_FUNCTIONS_STATE_MACHINE: "operations",
  SUBNET: "network",
  VOLUME_ATTACHMENT: "data",
  VPC: "network",
  VPC_ENDPOINT: "network",
  VPC_PEERING_CONNECTION: "network",
  WAF_WEB_ACL: "security",
  WAF_WEB_ACL_ASSOCIATION: "security",
  XRAY_GROUP: "operations",
  XRAY_SAMPLING_RULE: "operations"
};

/**
 * 세부 패널이 알아야 할 분류·검색·부분 실패 집계를 한 곳에 모읍니다.
 * 호출자는 결과와 검색어만 넘기며, 화면은 이 model을 그대로 렌더합니다.
 */
export function buildReverseEngineeringResourceAccordionModel(input: {
  readonly resources: readonly DiscoveredResource[];
  readonly coverage?: ReverseEngineeringServiceCoverage | undefined;
  readonly scanErrors: readonly ReverseEngineeringScanError[];
  readonly search: string;
}): ReverseEngineeringResourceAccordionModel {
  const normalizedSearch = normalizeSearch(input.search);
  const resourcesByCategory = new Map<ReverseEngineeringResourceCategoryKey, DiscoveredResource[]>(
    REVERSE_ENGINEERING_RESOURCE_CATEGORIES.map((category) => [category.key, []])
  );

  for (const resource of input.resources) {
    resourcesByCategory
      .get(getReverseEngineeringResourceCategory(resource.providerResourceType, resource.resourceType))
      ?.push(resource);
  }

  const unreadableServicesByCategory = new Map<
    ReverseEngineeringResourceCategoryKey,
    Map<string, string>
  >(REVERSE_ENGINEERING_RESOURCE_CATEGORIES.map((category) => [category.key, new Map()]));
  const unclassifiedUnreadableServices = new Map<string, string>();

  for (const unavailableService of getUnavailableServices(input.coverage, input.scanErrors)) {
    const categories = new Set(
      unavailableService.providerResourceTypes.map((providerResourceType) =>
        getReverseEngineeringResourceCategory(providerResourceType)
      )
    );

    if (categories.size === 0) {
      unclassifiedUnreadableServices.set(unavailableService.key, unavailableService.name);
      continue;
    }

    for (const category of categories) {
      unreadableServicesByCategory
        .get(category)
        ?.set(unavailableService.key, unavailableService.name);
    }
  }

  return {
    groups: REVERSE_ENGINEERING_RESOURCE_CATEGORIES.map((category) => {
      const resources = resourcesByCategory.get(category.key) ?? [];
      const matchingResources = normalizedSearch
        ? resources.filter((resource) =>
            matchesReverseEngineeringResourceSearch(resource, category.label, normalizedSearch)
          )
        : resources;
      const unreadableServices = [
        ...(unreadableServicesByCategory.get(category.key)?.values() ?? [])
      ].sort((left, right) => left.localeCompare(right, "ko-KR"));

      return {
        key: category.key,
        label: category.label,
        resources,
        matchingResources,
        supportedCount: resources.filter(
          (resource) => presentReverseEngineeringResource(resource).displayState === "supported"
        ).length,
        reviewOnlyCount: resources.filter(
          (resource) => presentReverseEngineeringResource(resource).displayState === "review_only"
        ).length,
        unreadableServiceCount: unreadableServices.length,
        unreadableServiceNames: unreadableServices
      };
    }),
    normalizedSearch,
    unclassifiedUnreadableServiceCount: unclassifiedUnreadableServices.size,
    unclassifiedUnreadableServiceNames: [...unclassifiedUnreadableServices.values()].sort(
      (left, right) => left.localeCompare(right, "ko-KR")
    )
  };
}

export function getReverseEngineeringResourceCategory(
  providerResourceType: string,
  resourceType?: string | undefined
): ReverseEngineeringResourceCategoryKey {
  if (
    SECURITY_PROVIDER_RESOURCE_TYPES.has(providerResourceType) ||
    startsWithProviderType(providerResourceType, SECURITY_PROVIDER_RESOURCE_PREFIXES)
  ) {
    return "security";
  }

  if (
    DATA_PROVIDER_RESOURCE_TYPES.has(providerResourceType) ||
    startsWithProviderType(providerResourceType, DATA_PROVIDER_RESOURCE_PREFIXES)
  ) {
    return "data";
  }

  if (
    NETWORK_PROVIDER_RESOURCE_TYPES.has(providerResourceType) ||
    startsWithProviderType(providerResourceType, NETWORK_PROVIDER_RESOURCE_PREFIXES)
  ) {
    return "network";
  }

  if (
    COMPUTE_PROVIDER_RESOURCE_TYPES.has(providerResourceType) ||
    startsWithProviderType(providerResourceType, COMPUTE_PROVIDER_RESOURCE_PREFIXES)
  ) {
    return "compute";
  }

  if (startsWithProviderType(providerResourceType, OPERATIONS_PROVIDER_RESOURCE_PREFIXES)) {
    return "operations";
  }

  return resourceType
    ? (RESOURCE_TYPE_CATEGORIES[resourceType as ResourceType] ?? "other")
    : "other";
}

/** 검색 중에는 결과가 있는 리소스 분류만 자동으로 열립니다. */
export function getSearchExpandedReverseEngineeringResourceCategories(
  model: ReverseEngineeringResourceAccordionModel
): ReadonlySet<ReverseEngineeringResourceCategoryKey> {
  if (!model.normalizedSearch) {
    return new Set();
  }

  return new Set(
    model.groups
      .filter((group) => group.matchingResources.length > 0)
      .map((group) => group.key)
  );
}

function getUnavailableServices(
  coverage: ReverseEngineeringServiceCoverage | undefined,
  scanErrors: readonly ReverseEngineeringScanError[]
): readonly { readonly key: string; readonly name: string; readonly providerResourceTypes: readonly string[] }[] {
  if (coverage) {
    return coverage.unavailableServices.map((service) => ({
      key: service.serviceKey,
      name: service.displayName,
      providerResourceTypes: service.affectedProviderResourceTypes ?? []
    }));
  }

  return presentReverseEngineeringScanErrors(scanErrors).map((error) => ({
    key: error.key,
    name: error.serviceName,
    providerResourceTypes: error.affectedProviderResourceTypes ?? []
  }));
}

function matchesReverseEngineeringResourceSearch(
  resource: DiscoveredResource,
  categoryLabel: string,
  normalizedSearch: string
): boolean {
  const presentation = presentReverseEngineeringResource(resource);
  return [
    categoryLabel,
    presentation.displayName,
    presentation.serviceLabel,
    getReverseEngineeringProviderTypeLabel(resource.providerResourceType),
    resource.providerResourceType,
    presentation.regionLabel,
    presentation.statusLabel
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR")
    .includes(normalizedSearch);
}

function normalizeSearch(query: string): string {
  return query.trim().toLocaleLowerCase("ko-KR");
}

function startsWithProviderType(providerResourceType: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => providerResourceType.startsWith(prefix));
}
