import type {
  DiscoveredResource,
  ResourceConfig,
  ResourceType,
  TerraformBlockType
} from "@sketchcatch/types";
import {
  classifyReverseEngineeringManagement,
  type ReverseEngineeringManagementDecision
} from "./reverse-engineering-management-policy.js";

export type ReverseEngineeringTerraformProjection = {
  readonly management: ReverseEngineeringManagementDecision;
  readonly terraformBlockType?: TerraformBlockType | undefined;
  readonly terraformResourceType?: string | undefined;
  readonly terraformResourceName?: string | undefined;
  readonly terraformFileName?: string | undefined;
  readonly terraformValues: ResourceConfig;
};

const TERRAFORM_RESOURCE_TYPE_BY_RESOURCE_TYPE = new Map<ResourceType, string>([
  ["API_GATEWAY_REST_API", "aws_api_gateway_rest_api"],
  ["VPC", "aws_vpc"],
  ["SUBNET", "aws_subnet"],
  ["INTERNET_GATEWAY", "aws_internet_gateway"],
  ["ROUTE_TABLE", "aws_route_table"],
  ["ROUTE_TABLE_ASSOCIATION", "aws_route_table_association"],
  ["SECURITY_GROUP", "aws_security_group"],
  ["EC2", "aws_instance"],
  ["RDS", "aws_db_instance"],
  ["S3", "aws_s3_bucket"],
  ["CLOUDWATCH_METRIC_ALARM", "aws_cloudwatch_metric_alarm"],
  ["CLOUDWATCH_LOG_GROUP", "aws_cloudwatch_log_group"],
  ["EVENTBRIDGE_RULE", "aws_cloudwatch_event_rule"],
  ["EVENTBRIDGE_TARGET", "aws_cloudwatch_event_target"],
  ["LOAD_BALANCER", "aws_lb"],
  ["CLOUDFRONT", "aws_cloudfront_distribution"],
  ["ECS_CLUSTER", "aws_ecs_cluster"],
  ["ECS_SERVICE", "aws_ecs_service"],
  ["ECS_TASK_DEFINITION", "aws_ecs_task_definition"]
]);

/** 기존 AWS 리소스를 보드에서 편집 가능한 Terraform identity와 명시적 인수로 투영한다. */
export function createReverseEngineeringTerraformProjection(
  resource: DiscoveredResource,
  sameScanResources?: readonly DiscoveredResource[]
): ReverseEngineeringTerraformProjection {
  const management = classifyReverseEngineeringManagement(resource);
  const terraformResourceType = TERRAFORM_RESOURCE_TYPE_BY_RESOURCE_TYPE.get(
    resource.resourceType
  );

  if (management !== "managed" || !terraformResourceType) {
    return { management, terraformValues: {} };
  }

  const terraformValues = createReverseEngineeringTerraformValues(
    resource,
    sameScanResources
  );
  if (
    resource.resourceType === "ROUTE_TABLE_ASSOCIATION" &&
    Object.keys(terraformValues).length === 0
  ) {
    return { management: "needs_mapping", terraformValues: {} };
  }

  return {
    management,
    terraformBlockType: "resource",
    terraformResourceType,
    terraformResourceName: createStableTerraformResourceName(resource.id),
    terraformFileName: "reverse-engineering",
    terraformValues
  };
}

/** import suggestion과 Board identity가 공유할 ResourceType별 Terraform type을 반환한다. */
export function getReverseEngineeringTerraformResourceType(
  resourceType: ResourceType
): string | undefined {
  return TERRAFORM_RESOURCE_TYPE_BY_RESOURCE_TYPE.get(resourceType);
}

/** 공개·비공개 결과에서 동일한 source node id를 같은 정적 Terraform 이름으로 바꾼다. */
export function createStableTerraformResourceName(resourceId: string): string {
  const normalized = resourceId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  const safeName = normalized.length > 0 ? normalized : "resource";

  return /^[a-z_]/u.test(safeName) ? safeName : `resource_${safeName}`;
}

/** Resource 종류별로 AWS 관찰값 중 Terraform에서 실제로 선언할 값만 allowlist한다. */
export function createReverseEngineeringTerraformValues(
  resource: DiscoveredResource,
  sameScanResources?: readonly DiscoveredResource[]
): ResourceConfig {
  const { config } = resource;

  switch (resource.resourceType) {
    case "API_GATEWAY_REST_API":
      return compactConfig({
        name: config["name"],
        description: config["description"],
        apiKeySource: config["apiKeySource"],
        binaryMediaTypes: config["binaryMediaTypes"],
        disableExecuteApiEndpoint: config["disableExecuteApiEndpoint"],
        endpointConfiguration: config["endpointConfiguration"],
        minimumCompressionSize: config["minimumCompressionSize"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "VPC":
      return compactConfig({
        cidrBlock: config["cidrBlock"],
        instanceTenancy: config["instanceTenancy"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "SUBNET":
      return compactConfig({
        vpcId: config["vpcId"],
        cidrBlock: config["cidrBlock"],
        availabilityZone: config["availabilityZone"],
        assignIpv6AddressOnCreation: config["assignIpv6AddressOnCreation"],
        mapPublicIpOnLaunch: config["mapPublicIpOnLaunch"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "INTERNET_GATEWAY":
      return compactConfig({
        vpcId: readFirstAttachmentVpcId(config["attachments"]),
        tags: normalizeTerraformTags(config["tags"])
      });
    case "ROUTE_TABLE":
      return compactConfig({
        vpcId: config["vpcId"],
        route: normalizeRouteTableRoutes(config["routes"]),
        tags: normalizeTerraformTags(config["tags"])
      });
    case "ROUTE_TABLE_ASSOCIATION":
      return createRouteTableAssociationTerraformValues(resource, sameScanResources);
    case "SECURITY_GROUP":
      return compactConfig({
        name: config["groupName"],
        description: config["description"],
        vpcId: config["vpcId"],
        ingress: normalizeSecurityGroupRules(config["ingress"]),
        egress: normalizeSecurityGroupRules(config["egress"]),
        tags: normalizeTerraformTags(config["tags"])
      });
    case "EC2":
      return compactConfig({
        ami: config["imageId"],
        instanceType: config["instanceType"],
        subnetId: config["subnetId"],
        vpcSecurityGroupIds: config["securityGroupIds"],
        keyName: config["keyName"],
        iamInstanceProfile: readArnResourceName(config["iamInstanceProfileArn"]),
        monitoring: normalizeMonitoringState(config["monitoringState"]),
        tags: normalizeTerraformTags(config["tags"])
      });
    case "RDS":
      return compactConfig({
        identifier: resource.providerResourceId,
        allocatedStorage: config["allocatedStorage"],
        availabilityZone: config["availabilityZone"],
        backupRetentionPeriod: config["backupRetentionPeriod"],
        instanceClass: config["dbInstanceClass"],
        dbName: config["dbName"],
        dbSubnetGroupName: config["dbSubnetGroupName"],
        deletionProtection: config["deletionProtection"],
        engine: config["engine"],
        engineVersion: config["engineVersion"],
        multiAz: config["multiAz"],
        publiclyAccessible: config["publiclyAccessible"],
        storageEncrypted: config["storageEncrypted"],
        storageType: config["storageType"],
        vpcSecurityGroupIds: config["vpcSecurityGroupIds"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "S3":
      return compactConfig({
        bucket: resource.providerResourceId,
        tags: normalizeTerraformTags(config["tags"])
      });
    case "CLOUDWATCH_LOG_GROUP":
      return compactConfig({
        name: config["logGroupName"],
        retentionInDays: config["retentionInDays"]
      });
    case "CLOUDWATCH_METRIC_ALARM":
      return compactConfig({
        actionsEnabled: config["actionsEnabled"],
        alarmDescription: config["alarmDescription"],
        alarmName: config["alarmName"],
        comparisonOperator: config["comparisonOperator"],
        datapointsToAlarm: config["datapointsToAlarm"],
        dimensions: normalizeCloudWatchMetricAlarmDimensions(config["dimensions"]),
        evaluateLowSampleCountPercentiles: config["evaluateLowSampleCountPercentiles"],
        evaluationPeriods: config["evaluationPeriods"],
        extendedStatistic: config["extendedStatistic"],
        metricName: config["metricName"],
        namespace: config["namespace"],
        period: config["period"],
        statistic: config["statistic"],
        threshold: config["threshold"],
        treatMissingData: config["treatMissingData"],
        unit: config["unit"]
      });
    case "EVENTBRIDGE_RULE":
      return compactConfig({
        name: config["name"],
        description: config["description"],
        eventBusName: config["eventBusName"],
        eventPattern: config["eventPattern"],
        scheduleExpression: config["scheduleExpression"],
        state: config["state"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "EVENTBRIDGE_TARGET":
      return compactConfig({
        targetId: config["targetId"],
        eventBusName: config["eventBusName"],
        rule: config["ruleTerraformReference"] ?? config["rule"],
        arn: config["targetTerraformReference"] ?? config["arn"]
      });
    case "LOAD_BALANCER":
      return compactConfig({
        name: config["name"],
        internal: normalizeLoadBalancerInternal(config["scheme"]),
        loadBalancerType: config["loadBalancerType"] ?? config["type"],
        ipAddressType: config["ipAddressType"],
        securityGroups: config["securityGroupIds"],
        subnets: config["subnetIds"],
        subnetMapping: config["subnetMapping"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "CLOUDFRONT":
      return compactConfig({
        comment: config["comment"],
        enabled: config["enabled"],
        origin: config["origin"],
        defaultCacheBehavior: config["defaultCacheBehavior"],
        restrictions: config["restrictions"],
        viewerCertificate: config["viewerCertificate"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "ECS_CLUSTER":
      return compactConfig({
        name: config["name"],
        configuration: config["configuration"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "ECS_SERVICE":
      return compactConfig({
        name: config["name"],
        cluster: config["clusterArn"] ?? config["clusterName"],
        taskDefinition: config["taskDefinitionArn"],
        desiredCount: config["desiredCount"],
        launchType: config["launchType"],
        capacityProviderStrategy: config["capacityProviderStrategy"],
        networkConfiguration: normalizeEcsNetworkConfiguration(
          config["networkConfiguration"]
        ),
        loadBalancer: config["loadBalancers"],
        tags: normalizeTerraformTags(config["tags"])
      });
    case "ECS_TASK_DEFINITION":
      return compactConfig({
        family: config["family"],
        containerDefinitions: config["containerDefinitions"],
        networkMode: config["networkMode"],
        requiresCompatibilities: config["requiresCompatibilities"],
        cpu: config["cpu"],
        memory: config["memory"],
        executionRoleArn: config["executionRoleArn"],
        taskRoleArn: config["taskRoleArn"],
        tags: normalizeTerraformTags(config["tags"])
      });
    default:
      return {};
  }
}

/** Association은 같은 scan에서 관리 가능한 두 대상의 Terraform identity가 있을 때만 투영한다. */
function createRouteTableAssociationTerraformValues(
  resource: DiscoveredResource,
  sameScanResources: readonly DiscoveredResource[] | undefined
): ResourceConfig {
  if (!sameScanResources) {
    return {};
  }

  const subnet = findSameScanAssociationTarget(
    resource,
    sameScanResources,
    "SUBNET",
    resource.config["subnetId"]
  );
  const routeTable = findSameScanAssociationTarget(
    resource,
    sameScanResources,
    "ROUTE_TABLE",
    resource.config["routeTableId"]
  );
  if (!subnet || !routeTable) {
    return {};
  }

  return {
    subnetId: `aws_subnet.${createStableTerraformResourceName(subnet.id)}.id`,
    routeTableId: `aws_route_table.${createStableTerraformResourceName(routeTable.id)}.id`
  };
}

function findSameScanAssociationTarget(
  association: DiscoveredResource,
  sameScanResources: readonly DiscoveredResource[],
  resourceType: "SUBNET" | "ROUTE_TABLE",
  providerResourceId: unknown
): DiscoveredResource | undefined {
  if (typeof providerResourceId !== "string" || providerResourceId.trim().length === 0) {
    return undefined;
  }

  const candidates = sameScanResources.filter(
    (candidate) =>
      candidate.resourceType === resourceType &&
      candidate.providerResourceId === providerResourceId.trim() &&
      (association.relationships ?? []).some(
        (relationship) => relationship.targetResourceId === candidate.id
      )
  );
  const target = candidates.length === 1 ? candidates[0] : undefined;

  return target && classifyReverseEngineeringManagement(target) === "managed"
    ? target
    : undefined;
}

/** undefined, null, 빈 배열과 빈 object를 제거하되 false와 0은 보존한다. */
function compactConfig(config: ResourceConfig): ResourceConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => {
      if (value === undefined || value === null || value === "") {
        return false;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (isRecord(value)) {
        return Object.keys(value).length > 0;
      }
      return true;
    })
  );
}

/** AWS SDK의 두 태그 표기를 Terraform map으로 정규화한다. */
function normalizeTerraformTags(value: unknown): Record<string, string> | undefined {
  if (!Array.isArray(value)) {
    return isRecord(value)
      ? Object.fromEntries(
          Object.entries(value).filter((entry): entry is [string, string] =>
            typeof entry[1] === "string"
          )
        )
      : undefined;
  }

  const tags = value.flatMap((candidate): Array<[string, string]> => {
    if (!isRecord(candidate)) {
      return [];
    }
    const key = candidate["key"] ?? candidate["Key"];
    const tagValue = candidate["value"] ?? candidate["Value"];

    return typeof key === "string" && typeof tagValue === "string"
      ? [[key, tagValue]]
      : [];
  });

  return tags.length > 0 ? Object.fromEntries(tags) : undefined;
}

/** CloudWatch SDK Dimension 배열을 Terraform dimensions map으로 바꿉니다. */
function normalizeCloudWatchMetricAlarmDimensions(
  value: unknown
): Record<string, string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const dimensions = value.flatMap((candidate): Array<[string, string]> => {
    if (!isRecord(candidate)) {
      return [];
    }

    const name = candidate["Name"] ?? candidate["name"];
    const dimensionValue = candidate["Value"] ?? candidate["value"];
    return typeof name === "string" && typeof dimensionValue === "string"
      ? [[name, dimensionValue]]
      : [];
  });

  return dimensions.length > 0 ? Object.fromEntries(dimensions) : undefined;
}

/** Internet Gateway attachment 목록의 첫 VPC ID만 Terraform attachment 인수로 사용한다. */
function readFirstAttachmentVpcId(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const attachment of value) {
    if (isRecord(attachment) && typeof attachment["vpcId"] === "string") {
      return attachment["vpcId"];
    }
  }
  return undefined;
}

/** AWS Route Table 관찰값을 aws_route_table의 route nested block으로 바꾼다. */
function normalizeRouteTableRoutes(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const routes = value.flatMap((route) => {
    if (!isRecord(route)) {
      return [];
    }

    const normalized = compactConfig({
      cidrBlock: route["destinationCidrBlock"],
      ipv6CidrBlock: route["destinationIpv6CidrBlock"],
      gatewayId: route["gatewayId"],
      instanceId: route["instanceId"],
      natGatewayId: route["natGatewayId"],
      networkInterfaceId: route["networkInterfaceId"]
    });
    return Object.keys(normalized).length > 0 ? [normalized] : [];
  });

  return routes.length > 0 ? routes : undefined;
}

/** AWS Security Group 규칙을 Terraform ingress/egress nested block으로 바꾼다. */
function normalizeSecurityGroupRules(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const rules = value.flatMap((rule) => {
    if (!isRecord(rule)) {
      return [];
    }
    const cidr = rule["cidr"];
    const normalized = compactConfig({
      protocol: rule["ipProtocol"],
      fromPort: rule["fromPort"],
      toPort: rule["toPort"],
      description: rule["description"],
      cidrBlocks:
        normalizeSecurityGroupSourceValues(rule["cidrBlocks"]) ??
        (typeof cidr === "string" ? [cidr] : undefined),
      ipv6CidrBlocks: normalizeSecurityGroupSourceValues(rule["ipv6CidrBlocks"]),
      prefixListIds: normalizeSecurityGroupSourceValues(rule["prefixListIds"]),
      securityGroups: normalizeSecurityGroupSourceValues(rule["securityGroups"])
    });

    return Object.keys(normalized).length > 0 ? [normalized] : [];
  });

  return rules.length > 0 ? rules : undefined;
}

/** Security Group source 목록은 빈 값 없이 조회된 순서 그대로 Terraform에 전달합니다. */
function normalizeSecurityGroupSourceValues(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter(
    (source): source is string => typeof source === "string" && source.trim().length > 0
  );
  return values.length > 0 ? values : undefined;
}

/** ARN 형태의 instance profile은 Terraform이 요구하는 마지막 이름 부분만 사용한다. */
function readArnResourceName(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  return value.split("/").at(-1);
}

/** EC2 monitoring state를 Terraform boolean 인수로 바꾼다. */
function normalizeMonitoringState(value: unknown): boolean | undefined {
  return value === "enabled" ? true : value === "disabled" ? false : undefined;
}

/** ELB scheme을 aws_lb의 internal boolean으로 바꾼다. */
function normalizeLoadBalancerInternal(value: unknown): boolean | undefined {
  return value === "internal" ? true : value === "internet-facing" ? false : undefined;
}

/** AWS SDK의 awsvpc wrapper를 aws_ecs_service의 network_configuration block으로 바꾼다. */
function normalizeEcsNetworkConfiguration(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const awsvpc = isRecord(value["awsvpcConfiguration"])
    ? value["awsvpcConfiguration"]
    : value;

  return compactConfig({
    subnets: awsvpc["subnets"],
    securityGroups: awsvpc["securityGroups"],
    assignPublicIp:
      awsvpc["assignPublicIp"] === "ENABLED"
        ? true
        : awsvpc["assignPublicIp"] === "DISABLED"
          ? false
          : awsvpc["assignPublicIp"]
  });
}

/** JSON object로 안전하게 다룰 수 있는 값인지 확인한다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
