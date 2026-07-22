import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";

export type ReverseEngineeringTerraformCompleteness = {
  readonly missingCreationFields: readonly string[];
  readonly importId: string | null;
};

/** 관리 분류, Board projection, import handoff가 공유하는 Terraform 완전성 판정이다. */
export function getReverseEngineeringTerraformCompleteness(
  resource: Pick<DiscoveredResource, "providerResourceId" | "resourceType" | "config">
): ReverseEngineeringTerraformCompleteness {
  return {
    missingCreationFields: getMissingTerraformCreationFields(
      resource.resourceType,
      resource.config
    ),
    importId: getStableTerraformImportId(resource)
  };
}

/** 관찰한 AWS 값만으로 같은 Terraform resource를 다시 선언할 수 없는 필드를 반환한다. */
function getMissingTerraformCreationFields(
  resourceType: ResourceType,
  config: Record<string, unknown>
): string[] {
  return [
    ...getIncompleteDetailFields(config),
    ...getMissingTerraformResourceFields(resourceType, config)
  ];
}

function getMissingTerraformResourceFields(
  resourceType: ResourceType,
  config: Record<string, unknown>
): string[] {
  if (resourceType === "VPC") {
    return [
      ...(getNonEmptyString(config["cidrBlock"]) ? [] : ["cidrBlock"]),
      ...(getNonEmptyString(config["instanceTenancy"]) ? [] : ["instanceTenancy"])
    ];
  }

  if (resourceType === "SUBNET") {
    return [
      ...(getNonEmptyString(config["vpcId"]) ? [] : ["vpcId"]),
      ...(getNonEmptyString(config["cidrBlock"]) ? [] : ["cidrBlock"]),
      ...(getNonEmptyString(config["availabilityZone"]) ? [] : ["availabilityZone"]),
      ...(typeof config["mapPublicIpOnLaunch"] === "boolean"
        ? []
        : ["mapPublicIpOnLaunch"]),
      ...(typeof config["assignIpv6AddressOnCreation"] === "boolean"
        ? []
        : ["assignIpv6AddressOnCreation"])
    ];
  }

  if (resourceType === "INTERNET_GATEWAY") {
    return hasCompleteInternetGatewayAttachments(config["attachments"])
      ? []
      : ["attachments"];
  }

  if (resourceType === "ROUTE_TABLE") {
    return [
      ...(getNonEmptyString(config["vpcId"]) ? [] : ["vpcId"]),
      ...(hasCompleteRouteTableRoutes(config["routes"]) ? [] : ["routes"])
    ];
  }

  if (resourceType === "ROUTE_TABLE_ASSOCIATION") {
    return [
      ...(getNonEmptyString(config["routeTableAssociationId"])
        ? []
        : ["routeTableAssociationId"]),
      ...(getNonEmptyString(config["subnetId"]) ? [] : ["subnetId"]),
      ...(getNonEmptyString(config["routeTableId"]) ? [] : ["routeTableId"]),
      ...(config["main"] === false ? [] : ["main=false"])
    ];
  }

  if (resourceType === "ELASTIC_IP") {
    return [
      ...(getValidElasticIpAllocationId(config["allocationId"]) ? [] : ["allocationId"]),
      ...(config["domain"] === "vpc" ? [] : ["domain=vpc"]),
      ...(config["associationTargetType"] === "unassociated" ||
      config["associationTargetType"] === "nat_gateway"
        ? []
        : ["associationTargetType"])
    ];
  }

  if (resourceType === "NAT_GATEWAY") {
    const connectivityType = config["connectivityType"];
    const allocationIds = getExactElasticIpAllocationIds(config["allocationIds"]);
    const primaryAllocationId = getValidElasticIpAllocationId(
      config["primaryAllocationId"]
    );
    const commonFields = [
      ...(getValidNatGatewayId(config["natGatewayId"]) ? [] : ["natGatewayId"]),
      ...(getNonEmptyString(config["subnetId"]) ? [] : ["subnetId"]),
      ...(config["state"] === "available" ? [] : ["state=available"]),
      ...(connectivityType === "public" || connectivityType === "private"
        ? []
        : ["connectivityType"])
    ];

    if (connectivityType === "public") {
      return [
        ...commonFields,
        ...(allocationIds && allocationIds.length > 0 ? [] : ["allocationIds"]),
        ...(primaryAllocationId && allocationIds?.includes(primaryAllocationId)
          ? []
          : ["primaryAllocationId"])
      ];
    }

    if (connectivityType === "private") {
      return [
        ...commonFields,
        ...(allocationIds?.length === 0 ? [] : ["allocationIds=[]"]),
        ...(config["primaryAllocationId"] === undefined ||
        config["primaryAllocationId"] === null ||
        config["primaryAllocationId"] === ""
          ? []
          : ["primaryAllocationId"])
      ];
    }

    return commonFields;
  }

  if (resourceType === "EC2") {
    return [
      ...(getNonEmptyString(config["imageId"]) ? [] : ["imageId"]),
      ...(getNonEmptyString(config["instanceType"]) ? [] : ["instanceType"]),
      ...(getNonEmptyString(config["subnetId"]) ? [] : ["subnetId"]),
      ...(getStringArray(config["securityGroupIds"]).length > 0
        ? []
        : ["securityGroupIds"]),
      ...(hasKnownEc2MonitoringState(config["monitoringState"])
        ? []
        : ["monitoringState"])
    ];
  }

  if (resourceType === "RDS") {
    return [
      ...(isPositiveNumber(config["allocatedStorage"]) ? [] : ["allocatedStorage"]),
      ...(getNonEmptyString(config["availabilityZone"]) ? [] : ["availabilityZone"]),
      ...(isNonNegativeNumber(config["backupRetentionPeriod"])
        ? []
        : ["backupRetentionPeriod"]),
      ...(getNonEmptyString(config["dbInstanceClass"]) ? [] : ["dbInstanceClass"]),
      ...(getNonEmptyString(config["dbSubnetGroupName"])
        ? []
        : ["dbSubnetGroupName"]),
      ...(typeof config["deletionProtection"] === "boolean"
        ? []
        : ["deletionProtection"]),
      ...(getNonEmptyString(config["engine"]) ? [] : ["engine"]),
      ...(getNonEmptyString(config["engineVersion"]) ? [] : ["engineVersion"]),
      ...(typeof config["multiAz"] === "boolean" ? [] : ["multiAz"]),
      ...(typeof config["publiclyAccessible"] === "boolean"
        ? []
        : ["publiclyAccessible"]),
      ...(typeof config["storageEncrypted"] === "boolean"
        ? []
        : ["storageEncrypted"]),
      ...(getNonEmptyString(config["storageType"]) ? [] : ["storageType"]),
      ...(getStringArray(config["vpcSecurityGroupIds"]).length > 0
        ? []
        : ["vpcSecurityGroupIds"])
    ];
  }

  if (resourceType === "S3") {
    return [];
  }

  if (resourceType === "CLOUDWATCH_METRIC_ALARM") {
    return [
      ...(getNonEmptyString(config["alarmName"]) ? [] : ["alarmName"]),
      ...(getNonEmptyString(config["comparisonOperator"])
        ? []
        : ["comparisonOperator"]),
      ...(isPositiveNumber(config["evaluationPeriods"])
        ? []
        : ["evaluationPeriods"]),
      ...(typeof config["threshold"] === "number" && Number.isFinite(config["threshold"])
        ? []
        : ["threshold"]),
      ...(getNonEmptyString(config["metricName"]) ? [] : ["metricName"]),
      ...(getNonEmptyString(config["namespace"]) ? [] : ["namespace"]),
      ...(isPositiveNumber(config["period"]) ? [] : ["period"]),
      ...((getNonEmptyString(config["statistic"]) ??
        getNonEmptyString(config["extendedStatistic"]))
        ? []
        : ["statistic/extendedStatistic"])
    ];
  }

  if (resourceType === "API_GATEWAY_REST_API") {
    return getNonEmptyString(config["name"]) ? [] : ["name"];
  }

  if (resourceType === "CLOUDWATCH_LOG_GROUP") {
    return getNonEmptyString(config["logGroupName"]) ? [] : ["logGroupName"];
  }

  if (resourceType === "EVENTBRIDGE_RULE") {
    return [
      ...(getValidEventBridgeName(config["name"]) ? [] : ["name"]),
      ...(getValidEventBridgeName(config["eventBusName"]) ? [] : ["eventBusName"]),
      ...(getNonEmptyString(config["state"]) ? [] : ["state"]),
      ...(getNonEmptyString(config["eventPattern"]) ||
      getNonEmptyString(config["scheduleExpression"])
        ? []
        : ["eventPattern/scheduleExpression"])
    ];
  }

  if (resourceType === "EVENTBRIDGE_TARGET") {
    return [
      ...(getValidEventBridgeName(config["targetId"]) ? [] : ["targetId"]),
      ...(getValidEventBridgeName(config["ruleName"]) ? [] : ["ruleName"]),
      ...(getValidEventBridgeName(config["eventBusName"]) ? [] : ["eventBusName"]),
      ...(getNonEmptyString(config["ruleTerraformReference"])
        ? []
        : ["ruleTerraformReference"]),
      ...(getNonEmptyString(config["targetTerraformReference"])
        ? []
        : ["targetTerraformReference"])
    ];
  }

  if (resourceType === "LOAD_BALANCER") {
    return [
      ...(getNonEmptyString(config["name"]) ? [] : ["name"]),
      ...((getNonEmptyString(config["loadBalancerType"]) ??
      getNonEmptyString(config["type"]))
        ? []
        : ["type"]),
      ...(getNonEmptyString(config["scheme"]) ? [] : ["scheme"]),
      ...(hasLoadBalancerSubnetPlacement(config) ? [] : ["subnetIds/subnetMapping"]),
      ...(hasSupportedLoadBalancerIpAddressType(config["ipAddressType"])
        ? []
        : ["ipAddressType"])
    ];
  }

  if (resourceType === "CLOUDFRONT") {
    const hasVpcOrigin = hasCloudFrontVpcOrigin(config["origin"]);

    return [
      ...(typeof config["enabled"] === "boolean" ? [] : ["enabled"]),
      ...(hasCloudFrontOrigin(config["origin"])
        ? []
        : [hasVpcOrigin ? "origin.vpcOriginConfig" : "origin"]),
      ...(hasCloudFrontDefaultCacheBehavior(config["defaultCacheBehavior"])
        ? []
        : ["defaultCacheBehavior"]),
      ...(hasGeoRestriction(config["restrictions"]) ? [] : ["restrictions"]),
      ...(hasCloudFrontViewerCertificate(config["viewerCertificate"])
        ? []
        : ["viewerCertificate"])
    ];
  }

  if (resourceType === "ECS_CLUSTER") {
    return getValidEcsName(config["name"]) ? [] : ["name"];
  }

  if (resourceType === "ECS_SERVICE") {
    return [
      ...(getValidEcsName(config["name"]) ? [] : ["name"]),
      ...(getNonEmptyString(config["clusterArn"]) ? [] : ["clusterArn"]),
      ...(getNonEmptyString(config["taskDefinitionArn"])
        ? []
        : ["taskDefinitionArn"]),
      ...(isNonNegativeNumber(config["desiredCount"]) ? [] : ["desiredCount"]),
      ...(getNonEmptyString(config["launchType"]) ||
      hasEcsCapacityProviderStrategy(config["capacityProviderStrategy"])
        ? []
        : ["launchType/capacityProviderStrategy"]),
      ...(hasEcsNetworkConfiguration(config["networkConfiguration"])
        ? []
        : ["networkConfiguration"]),
      ...getMissingEcsServiceLoadBalancerFields(config["loadBalancers"])
    ];
  }

  if (resourceType === "ECS_TASK_DEFINITION") {
    return [
      ...(getValidEcsName(config["family"]) ? [] : ["family"]),
      ...(hasEcsContainerDefinitions(config["containerDefinitions"])
        ? []
        : ["containerDefinitions"]),
      ...(getNonEmptyString(config["networkMode"]) ? [] : ["networkMode"]),
      ...(getStringArray(config["requiresCompatibilities"]).length > 0
        ? []
        : ["requiresCompatibilities"]),
      ...(getNonEmptyString(config["cpu"]) ? [] : ["cpu"]),
      ...(getNonEmptyString(config["memory"]) ? [] : ["memory"]),
      ...(config["requiresManualEnvironmentInput"] === true
        ? ["containerDefinitions.environment"]
        : [])
    ];
  }

  return [];
}

function getStableTerraformImportId(
  resource: Pick<DiscoveredResource, "providerResourceId" | "resourceType" | "config">
): string | null {
  if (resource.resourceType === "ELASTIC_IP") {
    return getValidElasticIpAllocationId(resource.config["allocationId"]);
  }

  if (resource.resourceType === "NAT_GATEWAY") {
    return getValidNatGatewayId(resource.config["natGatewayId"]);
  }

  if (resource.resourceType === "ROUTE_TABLE_ASSOCIATION") {
    const subnetId = getNonEmptyString(resource.config["subnetId"]);
    const routeTableId = getNonEmptyString(resource.config["routeTableId"]);

    return resource.config["main"] === false && subnetId && routeTableId
      ? `${subnetId}/${routeTableId}`
      : null;
  }

  if (resource.resourceType === "EVENTBRIDGE_RULE") {
    const ruleName = getValidEventBridgeName(resource.config["name"]);
    const eventBusName = getValidEventBridgeName(resource.config["eventBusName"]);

    return ruleName && eventBusName
      ? eventBusName === "default"
        ? ruleName
        : `${eventBusName}/${ruleName}`
      : null;
  }

  if (resource.resourceType === "EVENTBRIDGE_TARGET") {
    const targetId = getValidEventBridgeName(resource.config["targetId"]);
    const ruleName = getValidEventBridgeName(resource.config["ruleName"]);
    const eventBusName = getValidEventBridgeName(resource.config["eventBusName"]);

    return targetId && ruleName && eventBusName
      ? eventBusName === "default"
        ? `${ruleName}/${targetId}`
        : `${eventBusName}/${ruleName}/${targetId}`
      : null;
  }

  if (resource.resourceType === "CLOUDWATCH_METRIC_ALARM") {
    return getNonEmptyString(resource.config["alarmName"]);
  }

  if (resource.resourceType === "CLOUDWATCH_LOG_GROUP") {
    return getNonEmptyString(resource.config["logGroupName"]);
  }

  if (resource.resourceType === "CLOUDFRONT") {
    return getNonEmptyString(resource.config["id"]);
  }

  if (resource.resourceType === "LOAD_BALANCER") {
    const providerResourceId = resource.providerResourceId.trim();

    return isApplicationLoadBalancerArn(providerResourceId) ? providerResourceId : null;
  }

  if (resource.resourceType === "ECS_CLUSTER") {
    const providerResourceId = resource.providerResourceId.trim();

    return isEcsClusterArn(providerResourceId) ? providerResourceId : null;
  }

  if (resource.resourceType === "ECS_SERVICE") {
    return getEcsServiceImportId(resource);
  }

  if (resource.resourceType === "ECS_TASK_DEFINITION") {
    const providerResourceId = resource.providerResourceId.trim();

    return isEcsTaskDefinitionArn(providerResourceId) ? providerResourceId : null;
  }

  if (/^aws-ref-[a-f0-9]{24}$/u.test(resource.providerResourceId)) {
    return null;
  }

  return getNonEmptyString(resource.providerResourceId);
}

function isApplicationLoadBalancerArn(value: string): boolean {
  return /^arn:[^:]+:elasticloadbalancing:[^:]+:[^:]+:loadbalancer\/app\/.+/.test(value);
}

function isEcsClusterArn(value: string): boolean {
  return /^arn:[^:]+:ecs:[^:]+:\d{12}:cluster\/[A-Za-z0-9_-]+$/.test(value);
}

function isEcsTaskDefinitionArn(value: string): boolean {
  return /^arn:[^:]+:ecs:[^:]+:\d{12}:task-definition\/[A-Za-z0-9_-]+:\d+$/.test(value);
}

function getEcsServiceImportId(
  resource: Pick<DiscoveredResource, "providerResourceId" | "config">
): string | null {
  const serviceArnMatch = /^arn:[^:]+:ecs:[^:]+:\d{12}:service\/([^/]+)(?:\/([^/]+))?$/.exec(
    resource.providerResourceId.trim()
  );
  const clusterArnMatch = /^arn:[^:]+:ecs:[^:]+:\d{12}:cluster\/([^/]+)$/.exec(
    getNonEmptyString(resource.config["clusterArn"]) ?? ""
  );
  const clusterName =
    getValidEcsName(resource.config["clusterName"]) ??
    getValidEcsName(clusterArnMatch?.[1]) ??
    getValidEcsName(serviceArnMatch?.[2] ? serviceArnMatch[1] : undefined);
  const serviceName =
    getValidEcsName(resource.config["name"]) ??
    getValidEcsName(serviceArnMatch?.[2] ?? serviceArnMatch?.[1]);

  return clusterName && serviceName ? `${clusterName}/${serviceName}` : null;
}

function getIncompleteDetailFields(config: Record<string, unknown>): string[] {
  const marker = config["reverseEngineeringIncompleteDetails"];
  if (marker === undefined) {
    return [];
  }
  if (!Array.isArray(marker)) {
    return ["details"];
  }

  const detailNames = getStringArray(marker);
  if (detailNames.length !== marker.length) {
    return ["details"];
  }

  return detailNames.map((detailName) => `details.${detailName}`);
}

function hasCompleteInternetGatewayAttachments(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (attachment) =>
        isRecord(attachment) && getNonEmptyString(attachment["vpcId"]) !== null
    )
  );
}

function hasCompleteRouteTableRoutes(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((route) => {
      if (!isRecord(route)) {
        return false;
      }

      const hasDestination =
        getNonEmptyString(route["destinationCidrBlock"]) !== null ||
        getNonEmptyString(route["destinationIpv6CidrBlock"]) !== null;
      const hasTarget = [
        "gatewayId",
        "instanceId",
        "natGatewayId",
        "networkInterfaceId"
      ].some((key) => getNonEmptyString(route[key]) !== null);

      return hasDestination && hasTarget;
    })
  );
}

function hasKnownEc2MonitoringState(value: unknown): boolean {
  return value === "enabled" || value === "disabled";
}

function hasEcsCapacityProviderStrategy(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => isRecord(item) && getValidEcsName(item["capacityProvider"]) !== null
    )
  );
}

function hasEcsNetworkConfiguration(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["awsvpcConfiguration"])) {
    return false;
  }

  return (
    getStringArray(value["awsvpcConfiguration"]["subnets"]).length > 0 &&
    getStringArray(value["awsvpcConfiguration"]["securityGroups"]).length > 0
  );
}

function getMissingEcsServiceLoadBalancerFields(value: unknown): string[] {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return [];
  }

  if (!Array.isArray(value) || !value.every(isRecord)) {
    return ["loadBalancers"];
  }

  const missingFields = new Set<string>();
  for (const loadBalancer of value) {
    const targetGroupArn = getNonEmptyString(loadBalancer["targetGroupArn"]);
    const loadBalancerName = getNonEmptyString(loadBalancer["loadBalancerName"]);

    if ((targetGroupArn === null) === (loadBalancerName === null)) {
      missingFields.add("loadBalancers.targetGroupArn/loadBalancerName");
    }
    if (getNonEmptyString(loadBalancer["containerName"]) === null) {
      missingFields.add("loadBalancers.containerName");
    }
    if (!isEcsContainerPort(loadBalancer["containerPort"])) {
      missingFields.add("loadBalancers.containerPort");
    }
  }

  return [...missingFields];
}

function isEcsContainerPort(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65_535;
}

function hasEcsContainerDefinitions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (container) =>
        isRecord(container) &&
        getValidEcsName(container["name"]) !== null &&
        getNonEmptyString(container["image"]) !== null
    )
  );
}

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasCloudFrontOrigin(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (origin) =>
        isRecord(origin) &&
        !hasCloudFrontVpcOriginConfig(origin) &&
        getNonEmptyString(origin["originId"]) !== null &&
        getNonEmptyString(origin["domainName"]) !== null
    )
  );
}

function hasCloudFrontVpcOrigin(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((origin) => isRecord(origin) && hasCloudFrontVpcOriginConfig(origin))
  );
}

function hasCloudFrontVpcOriginConfig(origin: Record<string, unknown>): boolean {
  return isRecord(origin["vpcOriginConfig"]) || isRecord(origin["VpcOriginConfig"]);
}

function hasLoadBalancerSubnetPlacement(config: Record<string, unknown>): boolean {
  if (getStringArray(config["subnetIds"]).length > 0) {
    return true;
  }

  return (
    Array.isArray(config["subnetMapping"]) &&
    config["subnetMapping"].length > 0 &&
    config["subnetMapping"].every(
      (mapping) => isRecord(mapping) && getNonEmptyString(mapping["subnetId"]) !== null
    )
  );
}

function hasSupportedLoadBalancerIpAddressType(value: unknown): boolean {
  return value === "ipv4" || value === "dualstack" || value === "dualstack-without-public-ipv4";
}

function hasCloudFrontDefaultCacheBehavior(value: unknown): boolean {
  return (
    isRecord(value) &&
    getNonEmptyString(value["targetOriginId"]) !== null &&
    getNonEmptyString(value["viewerProtocolPolicy"]) !== null &&
    getStringArray(value["allowedMethods"]).length > 0 &&
    getStringArray(value["cachedMethods"]).length > 0 &&
    (isRecord(value["forwardedValues"]) || getNonEmptyString(value["cachePolicyId"]) !== null)
  );
}

function hasGeoRestriction(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value["geoRestriction"]) &&
    getNonEmptyString(value["geoRestriction"]["restrictionType"]) !== null
  );
}

function hasCloudFrontViewerCertificate(value: unknown): boolean {
  return (
    isRecord(value) &&
    (typeof value["cloudfrontDefaultCertificate"] === "boolean" ||
      getNonEmptyString(value["acmCertificateArn"]) !== null ||
      getNonEmptyString(value["iamCertificateId"]) !== null)
  );
}

function getValidEventBridgeName(value: unknown): string | null {
  const name = getNonEmptyString(value);

  return name && /^[A-Za-z0-9._-]+$/u.test(name) ? name : null;
}

function getValidEcsName(value: unknown): string | null {
  const name = getNonEmptyString(value);

  return name && /^[A-Za-z0-9_-]+$/u.test(name) ? name : null;
}

function getValidElasticIpAllocationId(value: unknown): string | null {
  const allocationId = getNonEmptyString(value);

  return allocationId && /^eipalloc-[a-f0-9]{8,}$/iu.test(allocationId)
    ? allocationId
    : null;
}

function getValidNatGatewayId(value: unknown): string | null {
  const natGatewayId = getNonEmptyString(value);

  return natGatewayId && /^nat-[a-f0-9]{8,}$/iu.test(natGatewayId)
    ? natGatewayId
    : null;
}

function getExactElasticIpAllocationIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const allocationIds = value.flatMap((candidate) => {
    const allocationId = getValidElasticIpAllocationId(candidate);
    return allocationId ? [allocationId] : [];
  });

  return allocationIds.length === value.length && new Set(allocationIds).size === value.length
    ? allocationIds
    : null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
