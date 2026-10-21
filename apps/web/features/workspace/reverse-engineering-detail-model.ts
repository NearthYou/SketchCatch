import type {
  DiscoveredResource,
  ResourceType,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage
} from "@sketchcatch/types";
import {
  getReverseEngineeringProviderTypeLabel,
  getReverseEngineeringResourceTypeLabel,
  presentReverseEngineeringResource,
  presentReverseEngineeringScanErrors,
  type ReverseEngineeringScanErrorAction,
  type ReverseEngineeringScanErrorPresentation
} from "./reverse-engineering-detail-presentation";

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

export type ReverseEngineeringUnreadableService = {
  readonly action: ReverseEngineeringScanErrorAction;
  readonly affectedProviderResourceTypes: readonly string[];
  readonly causeLabel: string;
  readonly key: string;
  readonly remedy: string;
  readonly serviceLabel: string;
};

export type ReverseEngineeringCapabilityLimit = {
  readonly affectedProviderResourceTypes: readonly string[];
  readonly key: string;
  readonly serviceLabel: string;
};

export type ReverseEngineeringResourceCategoryGroup = {
  readonly key: ReverseEngineeringResourceCategoryKey;
  readonly label: string;
  readonly matchingResources: readonly DiscoveredResource[];
  readonly resources: readonly DiscoveredResource[];
  readonly reviewOnlyCount: number;
  readonly supportedCount: number;
  readonly unreadableServiceCount: number;
  readonly unreadableServiceNames: readonly string[];
  readonly unreadableServices: readonly ReverseEngineeringUnreadableService[];
};

export type ReverseEngineeringResourceAccordionModel = {
  readonly capabilityLimits: readonly ReverseEngineeringCapabilityLimit[];
  readonly groups: readonly ReverseEngineeringResourceCategoryGroup[];
  readonly normalizedSearch: string;
  readonly unclassifiedUnreadableServices: readonly ReverseEngineeringUnreadableService[];
};

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

const RESOURCE_TYPE_CATEGORIES: Readonly<
  Record<ResourceType, ReverseEngineeringResourceCategoryKey>
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
  RANDOM_PASSWORD: "security",
  RDS: "data",
  RDS_CLUSTER: "data",
  RDS_CLUSTER_INSTANCE: "data",
  RDS_READ_REPLICA: "data",
  ROUTE53_RECORD: "network",
  ROUTE53_ZONE: "network",
  ROUTE_TABLE: "network",
  ROUTE_TABLE_ASSOCIATION: "network",
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
  UNKNOWN: "other",
  VOLUME_ATTACHMENT: "data",
  VPC: "network",
  VPC_ENDPOINT: "network",
  VPC_PEERING_CONNECTION: "network",
  WAF_WEB_ACL: "security",
  WAF_WEB_ACL_ASSOCIATION: "security",
  XRAY_GROUP: "operations",
  XRAY_SAMPLING_RULE: "operations"
};

/** gg: 상세 Modal이 분류·검색·읽기 실패를 같은 기준으로 렌더하도록 한 모델로 묶습니다. */
export function buildReverseEngineeringResourceAccordionModel(input: {
  readonly coverage?: ReverseEngineeringServiceCoverage | undefined;
  readonly resources: readonly DiscoveredResource[];
  readonly scanErrors: readonly ReverseEngineeringScanError[];
  readonly search: string;
}): ReverseEngineeringResourceAccordionModel {
  const normalizedSearch = normalizeSearch(input.search);
  const resourcesByCategory = createCategoryMap<DiscoveredResource[]>();

  for (const category of REVERSE_ENGINEERING_RESOURCE_CATEGORIES) {
    resourcesByCategory.set(category.key, []);
  }

  for (const resource of input.resources) {
    resourcesByCategory
      .get(getReverseEngineeringResourceCategory(resource.providerResourceType, resource.resourceType))
      ?.push(resource);
  }

  const unreadableServices = getUnreadableServices(input.coverage, input.scanErrors);
  const unreadableServicesByCategory = createCategoryMap<Map<string, ReverseEngineeringUnreadableService>>();
  const unclassifiedUnreadableServices = new Map<string, ReverseEngineeringUnreadableService>();

  for (const category of REVERSE_ENGINEERING_RESOURCE_CATEGORIES) {
    unreadableServicesByCategory.set(category.key, new Map());
  }

  for (const service of unreadableServices) {
    const categories = new Set(
      service.affectedProviderResourceTypes.map((providerResourceType) =>
        getReverseEngineeringResourceCategory(providerResourceType)
      )
    );

    if (categories.size === 0) {
      unclassifiedUnreadableServices.set(service.key, service);
      continue;
    }

    for (const category of categories) {
      unreadableServicesByCategory.get(category)?.set(service.key, service);
    }
  }

  return {
    capabilityLimits: getCapabilityLimits(input.coverage),
    groups: REVERSE_ENGINEERING_RESOURCE_CATEGORIES.map((category) => {
      const resources = resourcesByCategory.get(category.key) ?? [];
      const categoryUnreadableServices = sortServices(
        [...(unreadableServicesByCategory.get(category.key)?.values() ?? [])]
      );

      return {
        key: category.key,
        label: category.label,
        matchingResources: normalizedSearch
          ? resources.filter((resource) => matchesResourceSearch(resource, category.label, normalizedSearch))
          : resources,
        resources,
        reviewOnlyCount: resources.filter(
          (resource) => presentReverseEngineeringResource(resource).displayState === "review_only"
        ).length,
        supportedCount: resources.filter(
          (resource) => presentReverseEngineeringResource(resource).displayState === "supported"
        ).length,
        unreadableServiceCount: categoryUnreadableServices.length,
        unreadableServiceNames: categoryUnreadableServices.map((service) => service.serviceLabel),
        unreadableServices: categoryUnreadableServices
      };
    }),
    normalizedSearch,
    unclassifiedUnreadableServices: sortServices([...unclassifiedUnreadableServices.values()])
  };
}

/** gg: Resource Explorer·Tagging·CloudFormation 표기와 팔레트 enum을 하나의 분류 규칙으로 맞춥니다. */
export function getReverseEngineeringResourceCategory(
  providerResourceType: string,
  resourceType?: ResourceType | undefined
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

  if (startsWithProviderType(providerResourceType, COMPUTE_PROVIDER_RESOURCE_PREFIXES)) {
    return "compute";
  }

  if (startsWithProviderType(providerResourceType, OPERATIONS_PROVIDER_RESOURCE_PREFIXES)) {
    return "operations";
  }

  return resourceType ? RESOURCE_TYPE_CATEGORIES[resourceType] : "other";
}

/** gg: 검색 중에는 결과가 있는 분류만 열어 전체 목록을 한꺼번에 펼치지 않습니다. */
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

/** gg: 카테고리 첫 요약에서도 읽기 실패가 없다는 상태를 숫자 없이 분명히 보여 줍니다. */
export function getReverseEngineeringCategoryReadStatusLabel(
  unreadableServiceCount: number
): string {
  return unreadableServiceCount > 0 ? `읽기 실패 ${unreadableServiceCount}` : "읽기 완료";
}

/** gg: 분류 Map을 항상 같은 키 집합으로 만들어 누락된 패널을 막습니다. */
function createCategoryMap<Value>(): Map<ReverseEngineeringResourceCategoryKey, Value> {
  return new Map();
}

/** gg: coverage와 scan error를 합쳐 부분 성공 결과도 빠뜨리지 않고 보여 줍니다. */
function getUnreadableServices(
  coverage: ReverseEngineeringServiceCoverage | undefined,
  scanErrors: readonly ReverseEngineeringScanError[]
): readonly ReverseEngineeringUnreadableService[] {
  const serviceByKey = new Map<string, ReverseEngineeringUnreadableService>();

  for (const service of coverage?.unavailableServices ?? []) {
    serviceByKey.set(service.serviceKey, {
      action: service.remedy === "open_settings" ? "open_settings" : "retry",
      affectedProviderResourceTypes: getSafeProviderResourceTypes(service.affectedProviderResourceTypes),
      causeLabel: getCoverageCauseLabel(service.reason),
      key: service.serviceKey,
      remedy:
        service.remedy === "open_settings"
          ? "AWS 연결과 권한을 확인한 뒤 다시 시도해 주세요."
          : "잠시 후 다시 시도해 주세요.",
      serviceLabel: getSafeServiceLabel(service.displayName)
    });
  }

  for (const scanError of presentReverseEngineeringScanErrors(scanErrors)) {
    if (!serviceByKey.has(scanError.key)) {
      serviceByKey.set(scanError.key, toUnreadableService(scanError));
    }
  }

  return sortServices([...serviceByKey.values()]);
}

/** gg: 지원하지 않는 목록 방식은 권한 실패와 분리해 안내합니다. */
function getCapabilityLimits(
  coverage: ReverseEngineeringServiceCoverage | undefined
): readonly ReverseEngineeringCapabilityLimit[] {
  return (coverage?.capabilityLimits ?? [])
    .map((limit) => ({
      affectedProviderResourceTypes: getSafeProviderResourceTypes(limit.affectedProviderResourceTypes),
      key: limit.serviceKey,
      serviceLabel: getSafeServiceLabel(limit.displayName)
    }))
    .sort((left, right) => left.serviceLabel.localeCompare(right.serviceLabel, "ko-KR"));
}

/** gg: 오류 표시 모델은 상세 분류 모델이 사용할 최소 필드만 전달합니다. */
function toUnreadableService(
  presentation: ReverseEngineeringScanErrorPresentation
): ReverseEngineeringUnreadableService {
  return {
    action: presentation.action,
    affectedProviderResourceTypes: presentation.affectedProviderResourceTypes,
    causeLabel: presentation.causeLabel,
    key: presentation.key,
    remedy: presentation.remedy,
    serviceLabel: presentation.serviceLabel
  };
}

/** gg: coverage의 안전한 사유를 사람에게 바로 보이는 짧은 원인으로 바꿉니다. */
function getCoverageCauseLabel(
  reason: ReverseEngineeringServiceCoverage["unavailableServices"][number]["reason"]
): string {
  if (reason === "permission_required") {
    return "권한 부족";
  }

  return reason === "not_configured" ? "연결 설정 필요" : "다시 시도 필요";
}

/** gg: contract 밖의 문자열이 서비스 이름 자리에 들어와도 내부 정보는 노출하지 않습니다. */
function getSafeServiceLabel(displayName: string): string {
  const trimmedDisplayName = displayName.trim();

  return trimmedDisplayName && trimmedDisplayName.length <= 80 && !trimmedDisplayName.includes("arn:")
    ? trimmedDisplayName
    : "AWS 서비스";
}

/** gg: resource type 표기는 분류에만 쓰므로 허용된 AWS type 형태만 보관합니다. */
function getSafeProviderResourceTypes(
  providerResourceTypes: readonly string[] | undefined
): readonly string[] {
  return [
    ...new Set(
      (providerResourceTypes ?? []).filter((providerResourceType) =>
        /^AWS::[A-Za-z0-9]{1,64}::[A-Za-z0-9]{1,128}$/u.test(providerResourceType)
      )
    )
  ].sort();
}

/** gg: 검색은 이름·AWS 서비스·사람이 읽는 종류·원본 type 모두에서 동작합니다. */
function matchesResourceSearch(
  resource: DiscoveredResource,
  categoryLabel: string,
  normalizedSearch: string
): boolean {
  const presentation = presentReverseEngineeringResource(resource);

  return [
    categoryLabel,
    presentation.displayName,
    presentation.managementLabel,
    presentation.resourceKindLabel,
    presentation.serviceLabel,
    presentation.sourceProviderType,
    getReverseEngineeringProviderTypeLabel(resource.providerResourceType),
    getReverseEngineeringResourceTypeLabel(resource.resourceType)
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR")
    .includes(normalizedSearch);
}

/** gg: 빈 검색은 접힌 기본 상태를 유지하도록 공백을 먼저 정리합니다. */
function normalizeSearch(query: string): string {
  return query.trim().toLocaleLowerCase("ko-KR");
}

/** gg: type prefix는 정확히 AWS namespace 경계에서만 비교합니다. */
function startsWithProviderType(providerResourceType: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => providerResourceType.startsWith(prefix));
}

/** gg: 여러 서비스는 항상 같은 순서로 보여 테스트와 화면 이동을 안정적으로 만듭니다. */
function sortServices<
  Service extends Pick<ReverseEngineeringUnreadableService, "serviceLabel">
>(services: readonly Service[]): Service[] {
  return [...services].sort((left, right) => left.serviceLabel.localeCompare(right.serviceLabel, "ko-KR"));
}
