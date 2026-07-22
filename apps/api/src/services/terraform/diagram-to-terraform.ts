import type {
  InfrastructureGraph,
  InfrastructureGraphNode,
  TerraformBlockType
} from "@sketchcatch/types";
import { isSupportedTerraformFunctionExpression } from "./terraform-function-expressions.js";
import {
  isGenericTerraformNestedBlock,
  isTerraformLifecycleIgnoreChangesAttribute,
  isTerraformNestedBlockAttribute
} from "./terraform-nested-blocks.js";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const INDENT_UNIT = "  ";
export const TERRAFORM_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const TERRAFORM_REFERENCE_PATTERN =
  /^(?:var|local|each|count|path|terraform)\.[a-zA-Z_][a-zA-Z0-9_]*$|^module\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$|^(?:aws|kubernetes|random)_[a-zA-Z0-9_]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$|^data\.[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/;
const TERRAFORM_RESOURCE_ADDRESS_PATTERN =
  /^(?:(?:aws|kubernetes|random)_[a-zA-Z0-9_]+\.[a-zA-Z0-9_-]+|module\.[a-zA-Z0-9_-]+)$/;

export class TerraformDiagramValidationError extends Error {
  readonly reason = "invalid_identifier";

  constructor(label: string, value: string) {
    super(`Invalid Terraform ${label}: ${value}`);
    this.name = "TerraformDiagramValidationError";
  }
}

export function renderTerraformFromInfrastructureGraph(graph: InfrastructureGraph): string {
  const renderableNodeIds = new Set(
    graph.nodes
      .filter(
        (node) =>
          node.config["sketchcatchReferenceTerraform"] !== true &&
          !hasUnsupportedReverseEngineeringCloudFrontVpcOrigin(node)
      )
      .map((node) => node.id)
  );
  const renderableGraph: InfrastructureGraph = {
    nodes: graph.nodes.filter((node) => renderableNodeIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => renderableNodeIds.has(edge.sourceId) && renderableNodeIds.has(edge.targetId)
    )
  };
  const resourceBlocks = renderableGraph.nodes.flatMap((node) => [
    renderBlock(node),
    ...renderCompanionBlocks(node)
  ]);

  return [...resourceBlocks, ...renderTerraformOutputs(renderableGraph)].join("\n\n");
}

function renderTerraformOutputs(graph: InfrastructureGraph): string[] {
  const liveObservationOutputs = renderLiveObservationOutputs(graph);
  const listeners = resourceNodes(graph, "aws_lb_listener");
  const hasApplicationDeliveryEdge =
    resourceNodes(graph, "aws_cloudfront_distribution").length > 0 ||
    resourceNodes(graph, "aws_s3_bucket_website_configuration").length > 0;
  const hasHttpsListener = listeners.some(
    (listener) => listener.config["protocol"] === "HTTPS" && listener.config["port"] === 443
  );

  if (hasHttpsListener && !hasApplicationDeliveryEdge) {
    return liveObservationOutputs;
  }

  return listeners.length === 0 || hasApplicationDeliveryEdge
    ? renderDeploymentOutputs(graph)
    : [];
}

function renderDeploymentOutputs(graph: InfrastructureGraph): string[] {
  const website = firstResourceNode(graph, "aws_s3_bucket_website_configuration");
  const webBucket = firstResourceNode(graph, "aws_s3_bucket");
  const cloudFront = firstResourceNode(graph, "aws_cloudfront_distribution");
  const ecrRepository = firstResourceNode(graph, "aws_ecr_repository");
  const loadBalancer = firstResourceNode(graph, "aws_lb");
  const targetGroup = firstResourceNode(graph, "aws_lb_target_group");
  const autoScalingGroup = firstResourceNode(graph, "aws_autoscaling_group");
  const ecsCluster = firstResourceNode(graph, "aws_ecs_cluster");
  const ecsService = firstResourceNode(graph, "aws_ecs_service");
  const ecsTaskDefinition = firstResourceNode(graph, "aws_ecs_task_definition");
  const applicationScalingTarget = firstResourceNode(graph, "aws_appautoscaling_target");
  const alarm = resourceNodes(graph, "aws_cloudwatch_metric_alarm").find(
    (node) =>
      node.config["metricName"] === "RequestCountPerTarget" &&
      typeof node.config["threshold"] === "number"
  );
  const logGroups = resourceNodes(graph, "aws_cloudwatch_log_group");

  const outputs = website
    ? [
        renderOutput(
          "static_site_url",
          `"http://\${aws_s3_bucket_website_configuration.${website.iac.resourceName}.website_endpoint}"`
        )
      ]
    : cloudFront
      ? [
          renderOutput(
            "static_site_url",
            `"https://\${aws_cloudfront_distribution.${cloudFront.iac.resourceName}.domain_name}"`
          )
        ]
      : [];

  if (cloudFront) {
    outputs.push(
      renderOutput(
        "cloudfront_distribution_id",
        `aws_cloudfront_distribution.${cloudFront.iac.resourceName}.id`
      ),
      renderOutput(
        "cloudfront_domain_name",
        `aws_cloudfront_distribution.${cloudFront.iac.resourceName}.domain_name`
      ),
      renderOutput(
        "cloudfront_url",
        `"https://\${aws_cloudfront_distribution.${cloudFront.iac.resourceName}.domain_name}"`
      )
    );
  }
  if (webBucket && (website || cloudFront)) {
    outputs.push(
      renderOutput("static_site_bucket_name", `aws_s3_bucket.${webBucket.iac.resourceName}.bucket`),
      renderOutput("static_bucket_name", `aws_s3_bucket.${webBucket.iac.resourceName}.bucket`)
    );
  }
  if (ecrRepository) {
    outputs.push(
      renderOutput(
        "ecr_repository_url",
        `aws_ecr_repository.${ecrRepository.iac.resourceName}.repository_url`
      ),
      renderOutput(
        "ecr_repository_name",
        `aws_ecr_repository.${ecrRepository.iac.resourceName}.name`
      ),
      renderOutput("ecr_repository_arn", `aws_ecr_repository.${ecrRepository.iac.resourceName}.arn`)
    );
  }
  if (ecsTaskDefinition) {
    outputs.push(
      renderOutput(
        "ecs_task_family",
        `aws_ecs_task_definition.${ecsTaskDefinition.iac.resourceName}.family`
      ),
      renderOutput(
        "ecs_task_definition_family",
        `aws_ecs_task_definition.${ecsTaskDefinition.iac.resourceName}.family`
      ),
      renderOutput(
        "ecs_task_definition_arn",
        `aws_ecs_task_definition.${ecsTaskDefinition.iac.resourceName}.arn`
      ),
      renderOutput(
        "ecs_task_role_arn",
        `aws_ecs_task_definition.${ecsTaskDefinition.iac.resourceName}.task_role_arn`
      ),
      renderOutput(
        "ecs_execution_role_arn",
        `aws_ecs_task_definition.${ecsTaskDefinition.iac.resourceName}.execution_role_arn`
      )
    );
  }
  if (logGroups.length > 0) {
    outputs.push(
      renderOutput(
        "log_group_names",
        `[${logGroups
          .map((node) => `aws_cloudwatch_log_group.${node.iac.resourceName}.name`)
          .join(", ")}]`
      )
    );
  }
  if (!loadBalancer || !targetGroup) {
    return outputs;
  }

  const loadBalancerAddress = `aws_lb.${loadBalancer.iac.resourceName}`;
  const targetGroupAddress = `aws_lb_target_group.${targetGroup.iac.resourceName}`;
  const apiBaseUrl = cloudFront && cloudFrontRoutesApiTraffic(cloudFront)
    ? `"https://\${aws_cloudfront_distribution.${cloudFront.iac.resourceName}.domain_name}"`
    : `"http://\${${loadBalancerAddress}.dns_name}"`;
  outputs.push(
    renderOutput("api_base_url", apiBaseUrl),
    renderOutput("api_origin_url", `"http://\${${loadBalancerAddress}.dns_name}"`),
    renderOutput("alb_arn", `${loadBalancerAddress}.arn`),
    renderOutput("alb_dns_name", `${loadBalancerAddress}.dns_name`),
    renderOutput("target_group_arn", `${targetGroupAddress}.arn`),
    renderOutput("alb_arn_suffix", `${loadBalancerAddress}.arn_suffix`),
    renderOutput("target_group_arn_suffix", `${targetGroupAddress}.arn_suffix`)
  );

  if (autoScalingGroup && alarm) {
    outputs.push(
      renderOutput("asg_name", `aws_autoscaling_group.${autoScalingGroup.iac.resourceName}.name`),
      renderOutput("scale_out_threshold", String(alarm.config["threshold"]))
    );
    return outputs;
  }
  if (!ecsCluster || !ecsService) {
    return outputs;
  }

  outputs.push(
    renderOutput("ecs_cluster_name", `aws_ecs_cluster.${ecsCluster.iac.resourceName}.name`),
    renderOutput("ecs_service_name", `aws_ecs_service.${ecsService.iac.resourceName}.name`)
  );
  const ecsContainer = resolveEcsServiceContainer(ecsService);
  if (ecsContainer) {
    outputs.push(
      renderOutput("ecs_container_name", JSON.stringify(ecsContainer.name)),
      renderOutput("ecs_container_port", String(ecsContainer.port))
    );
  }
  if (!applicationScalingTarget || typeof applicationScalingTarget.config["maxCapacity"] !== "number") {
    return outputs;
  }

  outputs.push(
    renderOutput("max_capacity", String(applicationScalingTarget.config["maxCapacity"]))
  );
  const requestThreshold = findAlbRequestCountTargetValue(
    graph,
    loadBalancerAddress,
    targetGroupAddress,
    applicationScalingTarget
  );
  if (requestThreshold !== null) {
    outputs.push(renderOutput("scale_out_threshold", String(requestThreshold)));
  }
  return outputs;
}

function resolveEcsServiceContainer(
  ecsService: InfrastructureGraphNode
): { name: string; port: number } | null {
  const value = ecsService.config["loadBalancer"];
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const name = candidate["containerName"];
    const port = candidate["containerPort"];
    if (typeof name === "string" && name.trim() && Number.isInteger(port) && Number(port) > 0) {
      return { name, port: Number(port) };
    }
  }
  return null;
}

function firstResourceNode(
  graph: InfrastructureGraph,
  resourceType: string
): InfrastructureGraphNode | undefined {
  return resourceNodes(graph, resourceType)[0];
}

function cloudFrontRoutesApiTraffic(node: InfrastructureGraphNode): boolean {
  const behaviorValue = node.config["orderedCacheBehavior"];
  const behaviors = Array.isArray(behaviorValue) ? behaviorValue : [behaviorValue];

  if (behaviors.some(
    (behavior) =>
      isRecord(behavior) &&
      typeof behavior["pathPattern"] === "string" &&
      behavior["pathPattern"].startsWith("/api/")
  )) {
    return true;
  }

  const defaultBehaviorValue = node.config["defaultCacheBehavior"];
  const defaultBehaviors = Array.isArray(defaultBehaviorValue)
    ? defaultBehaviorValue
    : [defaultBehaviorValue];
  const apiWriteMethods = ["DELETE", "PATCH", "POST", "PUT"];

  return defaultBehaviors.some((behavior) => {
    if (!isRecord(behavior) || !Array.isArray(behavior["allowedMethods"])) return false;
    const allowedMethods = new Set(
      behavior["allowedMethods"]
        .filter((method): method is string => typeof method === "string")
        .map((method) => method.toUpperCase())
    );
    return apiWriteMethods.every((method) => allowedMethods.has(method));
  });
}

function renderCompanionBlocks(node: InfrastructureGraphNode): string[] {
  return [
    ...(hasInlineLambdaSource(node) ? [renderInlineLambdaArchive(node)] : []),
    ...renderReverseEngineeringEcsClusterCapacityProviders(node),
    ...(hasManagedS3Versioning(node) ? [renderManagedS3Versioning(node)] : [])
  ];
}

function renderReverseEngineeringEcsClusterCapacityProviders(
  node: InfrastructureGraphNode
): string[] {
  if (
    node.iac.resourceType !== "aws_ecs_cluster" ||
    node.config["providerResourceType"] !== "AWS::ECS::Cluster"
  ) {
    return [];
  }

  const capacityProviders = readStringArray(node.config["capacityProviders"]);
  if (!capacityProviders) {
    return [];
  }

  const resourceName = `${node.iac.resourceName}_capacity_providers`;
  const companionNode: InfrastructureGraphNode = {
    id: `${node.id}-capacity-providers`,
    label: `${node.label} capacity providers`,
    iac: {
      provider: node.iac.provider,
      terraformBlockType: "resource",
      resourceType: "aws_ecs_cluster_capacity_providers",
      resourceName,
      fileName: node.iac.fileName
    },
    config: {
      clusterName: `aws_ecs_cluster.${node.iac.resourceName}.name`,
      capacityProviders
    }
  };

  return [renderBlock(companionNode)];
}

function createRenderableResourceConfig(node: InfrastructureGraphNode): Record<string, unknown> {
  const config = normalizeReverseEngineeringResourceConfig(node);
  delete config["versioningEnabled"];
  delete config["releaseManagedContent"];
  if (!hasInlineLambdaSource(node)) return config;

  delete config["inlineSource"];
  const archiveAddress = `data.archive_file.${node.iac.resourceName}_bundle`;
  config["filename"] = `${archiveAddress}.output_path`;
  config["sourceCodeHash"] = `${archiveAddress}.output_base64sha256`;
  return config;
}

// gg: Reverse Engineering 관찰값에서 실제 Terraform이 관리할 수 있는 필드만 남깁니다.
function normalizeReverseEngineeringResourceConfig(
  node: InfrastructureGraphNode
): Record<string, unknown> {
  if (!isReverseEngineeringResourceConfig(node.config)) {
    return { ...node.config };
  }

  if (node.iac.resourceType === "aws_lb") {
    return normalizeReverseEngineeringLoadBalancerConfig(node.config);
  }

  if (node.iac.resourceType === "aws_cloudfront_distribution") {
    return normalizeReverseEngineeringCloudFrontConfig(node.config);
  }

  if (node.iac.resourceType === "aws_ecs_cluster") {
    return normalizeReverseEngineeringEcsClusterConfig(node.config);
  }

  if (node.iac.resourceType === "aws_ecs_service") {
    return normalizeReverseEngineeringEcsServiceConfig(node.config);
  }

  if (node.iac.resourceType === "aws_ecs_task_definition") {
    return normalizeReverseEngineeringEcsTaskDefinitionConfig(node.config);
  }

  if (node.iac.resourceType === "aws_cloudwatch_log_group") {
    return normalizeReverseEngineeringCloudWatchLogGroupConfig(node.config);
  }

  return { ...node.config };
}

// gg: 전용 AWS reader가 만든 config만 Reverse Engineering 정규화 대상으로 인정합니다.
function isReverseEngineeringResourceConfig(config: Record<string, unknown>): boolean {
  return (
    config["providerResourceType"] === "AWS::ElasticLoadBalancingV2::LoadBalancer" ||
    config["providerResourceType"] === "AWS::CloudFront::Distribution" ||
    config["providerResourceType"] === "AWS::ECS::Cluster" ||
    config["providerResourceType"] === "AWS::ECS::Service" ||
    config["providerResourceType"] === "AWS::ECS::TaskDefinition" ||
    config["providerResourceType"] === "AWS::Logs::LogGroup"
  );
}

// gg: 로그 이름, 보존 기간, KMS 연결만 Terraform 관리값으로 전달합니다.
function normalizeReverseEngineeringCloudWatchLogGroupConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  return compactTerraformConfig({
    name: readNonEmptyString(config["name"] ?? config["logGroupName"]),
    retentionInDays: readNumber(config["retentionInDays"]),
    kmsKeyId: readNonEmptyString(config["kmsKeyId"])
  });
}

// The AWS summary proves a VPC origin exists, but not enough provider configuration to recreate it.
// Omit the whole reverse-engineered distribution rather than emit an invalid origin block.
function hasUnsupportedReverseEngineeringCloudFrontVpcOrigin(
  node: InfrastructureGraphNode
): boolean {
  return (
    node.iac.resourceType === "aws_cloudfront_distribution" &&
    isReverseEngineeringResourceConfig(node.config) &&
    normalizeRecordList(node.config["origin"]).some(
      (origin) => hasCloudFrontVpcOriginConfig(origin)
    )
  );
}

function hasCloudFrontVpcOriginConfig(origin: Record<string, unknown>): boolean {
  return isRecord(origin["vpcOriginConfig"]) || isRecord(origin["VpcOriginConfig"]);
}

function normalizeReverseEngineeringLoadBalancerConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const scheme = readNonEmptyString(config["scheme"]);
  const internal =
    typeof config["internal"] === "boolean"
      ? config["internal"]
      : scheme
        ? scheme === "internal"
        : undefined;

  return compactTerraformConfig({
    internal,
    ipAddressType: readSupportedLoadBalancerIpAddressType(config["ipAddressType"]),
    loadBalancerType:
      readNonEmptyString(config["loadBalancerType"]) ?? readNonEmptyString(config["type"]),
    name: readNonEmptyString(config["name"]),
    securityGroups: readStringArray(config["securityGroups"] ?? config["securityGroupIds"]),
    subnetMapping: normalizeLoadBalancerSubnetMappings(config["subnetMapping"]),
    subnets: readStringArray(config["subnets"] ?? config["subnetIds"])
  });
}

function readSupportedLoadBalancerIpAddressType(value: unknown): string | undefined {
  return value === "ipv4" ||
    value === "dualstack" ||
    value === "dualstack-without-public-ipv4"
    ? value
    : undefined;
}

function normalizeLoadBalancerSubnetMappings(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const mappings = value
    .filter(isRecord)
    .map((mapping) =>
      compactTerraformConfig({
        allocationId: readNonEmptyString(mapping["allocationId"]),
        ipv6Address: readNonEmptyString(mapping["ipv6Address"]),
        privateIpv4Address: readNonEmptyString(mapping["privateIpv4Address"]),
        subnetId: readNonEmptyString(mapping["subnetId"])
      })
    )
    .filter((mapping) => Object.keys(mapping).length > 0);

  return mappings.length > 0 ? mappings : undefined;
}

function normalizeReverseEngineeringEcsClusterConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  return compactTerraformConfig({
    name: readNonEmptyString(config["name"]),
    configuration: normalizeEcsClusterConfiguration(config["configuration"])
  });
}

function normalizeEcsClusterConfiguration(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const executeCommand = value["executeCommandConfiguration"];
  const normalizedExecuteCommand = isRecord(executeCommand)
    ? compactTerraformConfig({
        kmsKeyId: readNonEmptyString(executeCommand["kmsKeyId"]),
        logging: readNonEmptyString(executeCommand["logging"]),
        logConfiguration: normalizeEcsExecuteCommandLogConfiguration(
          executeCommand["logConfiguration"]
        )
      })
    : undefined;
  const normalized = compactTerraformConfig({
    executeCommandConfiguration:
      normalizedExecuteCommand && Object.keys(normalizedExecuteCommand).length > 0
        ? normalizedExecuteCommand
        : undefined,
    managedStorageConfiguration: normalizeEcsManagedStorageConfiguration(
      value["managedStorageConfiguration"]
    )
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeEcsExecuteCommandLogConfiguration(
  value: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = compactTerraformConfig({
    cloudWatchEncryptionEnabled: readBoolean(value["cloudWatchEncryptionEnabled"]),
    cloudWatchLogGroupName: readNonEmptyString(value["cloudWatchLogGroupName"]),
    s3BucketName: readNonEmptyString(value["s3BucketName"]),
    s3BucketEncryptionEnabled: readBoolean(value["s3EncryptionEnabled"]),
    s3KeyPrefix: readString(value["s3KeyPrefix"])
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeEcsManagedStorageConfiguration(
  value: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = compactTerraformConfig({
    kmsKeyId: readNonEmptyString(value["kmsKeyId"]),
    fargateEphemeralStorageKmsKeyId: readNonEmptyString(
      value["fargateEphemeralStorageKmsKeyId"]
    )
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeReverseEngineeringEcsServiceConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const capacityProviderStrategy = normalizeEcsCapacityProviderStrategy(
    config["capacityProviderStrategy"]
  );

  return compactTerraformConfig({
    name: readNonEmptyString(config["name"]),
    cluster: readNonEmptyString(config["clusterArn"]),
    taskDefinition: readNonEmptyString(config["taskDefinitionArn"]),
    desiredCount: readNumber(config["desiredCount"]),
    launchType:
      capacityProviderStrategy === undefined
        ? readNonEmptyString(config["launchType"])
        : undefined,
    capacityProviderStrategy,
    networkConfiguration: normalizeEcsServiceNetworkConfiguration(
      config["networkConfiguration"]
    ),
    loadBalancer: normalizeEcsServiceLoadBalancers(config["loadBalancers"])
  });
}

function normalizeEcsCapacityProviderStrategy(
  value: unknown
): Record<string, unknown>[] | undefined {
  const strategy = normalizeRecordList(value)
    .map((item) =>
      compactTerraformConfig({
        capacityProvider: readNonEmptyString(item["capacityProvider"]),
        base: readNumber(item["base"]),
        weight: readNumber(item["weight"])
      })
    )
    .filter((item) => readNonEmptyString(item["capacityProvider"]) !== undefined);

  return strategy.length > 0 ? strategy : undefined;
}

function normalizeEcsServiceNetworkConfiguration(
  value: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const awsvpc = isRecord(value["awsvpcConfiguration"])
    ? value["awsvpcConfiguration"]
    : value;
  const assignPublicIp = normalizeEcsAssignPublicIp(awsvpc["assignPublicIp"]);
  const normalized = compactTerraformConfig({
    assignPublicIp,
    securityGroups: readStringArray(awsvpc["securityGroups"]),
    subnets: readStringArray(awsvpc["subnets"])
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeEcsAssignPublicIp(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  return value === "ENABLED" ? true : value === "DISABLED" ? false : undefined;
}

function normalizeEcsServiceLoadBalancers(
  value: unknown
): Record<string, unknown>[] | undefined {
  const loadBalancers = normalizeRecordList(value)
    .flatMap((loadBalancer) => {
      const targetGroupArn = readNonEmptyString(loadBalancer["targetGroupArn"]);
      const elbName = readNonEmptyString(loadBalancer["loadBalancerName"]);
      const containerName = readNonEmptyString(loadBalancer["containerName"]);
      const containerPort = readEcsContainerPort(loadBalancer["containerPort"]);

      return hasExactlyOneEcsServiceLoadBalancerTarget(targetGroupArn, elbName) &&
        containerName !== undefined &&
        containerPort !== undefined
        ? [compactTerraformConfig({ targetGroupArn, elbName, containerName, containerPort })]
        : [];
    });

  return loadBalancers.length > 0 ? loadBalancers : undefined;
}

function hasExactlyOneEcsServiceLoadBalancerTarget(
  targetGroupArn: string | undefined,
  elbName: string | undefined
): boolean {
  return (targetGroupArn !== undefined) !== (elbName !== undefined);
}

function readEcsContainerPort(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65_535
    ? value
    : undefined;
}

function normalizeReverseEngineeringEcsTaskDefinitionConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  return compactTerraformConfig({
    family: readNonEmptyString(config["family"]),
    containerDefinitions: normalizeEcsContainerDefinitions(config["containerDefinitions"]),
    networkMode: readNonEmptyString(config["networkMode"]),
    requiresCompatibilities: readStringArray(config["requiresCompatibilities"]),
    cpu: readNonEmptyString(config["cpu"]),
    memory: readNonEmptyString(config["memory"]),
    executionRoleArn: readNonEmptyString(config["executionRoleArn"]),
    taskRoleArn: readNonEmptyString(config["taskRoleArn"])
  });
}

function normalizeEcsContainerDefinitions(
  value: unknown
): Record<string, unknown>[] | undefined {
  const containers = normalizeRecordList(value)
    .map((container) =>
      compactTerraformConfig({
        name: readNonEmptyString(container["name"]),
        image: readNonEmptyString(container["image"]),
        cpu: readNumber(container["cpu"]),
        memory: readNumber(container["memory"]),
        memoryReservation: readNumber(container["memoryReservation"]),
        essential: readBoolean(container["essential"]),
        portMappings: normalizeEcsContainerPortMappings(container["portMappings"]),
        secrets: normalizeEcsContainerSecrets(container["secrets"]),
        readonlyRootFilesystem: readBoolean(container["readonlyRootFilesystem"]),
        user: readString(container["user"]),
        workingDirectory: readString(container["workingDirectory"])
      })
    )
    .filter(
      (container) =>
        readNonEmptyString(container["name"]) !== undefined &&
        readNonEmptyString(container["image"]) !== undefined
    );

  return containers.length > 0 ? containers : undefined;
}

function normalizeEcsContainerPortMappings(
  value: unknown
): Record<string, unknown>[] | undefined {
  const portMappings = normalizeRecordList(value)
    .map((portMapping) =>
      compactTerraformConfig({
        name: readNonEmptyString(portMapping["name"]),
        containerPort: readNumber(portMapping["containerPort"]),
        hostPort: readNumber(portMapping["hostPort"]),
        protocol: readNonEmptyString(portMapping["protocol"]),
        appProtocol: readNonEmptyString(portMapping["appProtocol"])
      })
    )
    .filter((portMapping) => readNumber(portMapping["containerPort"]) !== undefined);

  return portMappings.length > 0 ? portMappings : undefined;
}

function normalizeEcsContainerSecrets(
  value: unknown
): Record<string, unknown>[] | undefined {
  const secrets = normalizeRecordList(value)
    .map((secret) =>
      compactTerraformConfig({
        name: readNonEmptyString(secret["name"]),
        valueFrom: readNonEmptyString(secret["valueFrom"])
      })
    )
    .filter(
      (secret) =>
        readNonEmptyString(secret["name"]) !== undefined &&
        readNonEmptyString(secret["valueFrom"]) !== undefined
    );

  return secrets.length > 0 ? secrets : undefined;
}

function normalizeReverseEngineeringCloudFrontConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  return compactTerraformConfig({
    aliases: readStringArray(config["aliases"]),
    comment: readString(config["comment"]),
    defaultCacheBehavior: normalizeCloudFrontCacheBehaviors(config["defaultCacheBehavior"], false),
    defaultRootObject: readString(config["defaultRootObject"]),
    enabled: readBoolean(config["enabled"]),
    httpVersion: readNonEmptyString(config["httpVersion"]),
    isIpv6Enabled: readBoolean(config["isIpv6Enabled"]),
    orderedCacheBehavior: normalizeCloudFrontCacheBehaviors(config["orderedCacheBehavior"], true),
    origin: normalizeCloudFrontOriginBlocks(config["origin"]),
    priceClass: readNonEmptyString(config["priceClass"]),
    restrictions: normalizeCloudFrontRestrictions(config["restrictions"]),
    retainOnDelete: readBoolean(config["retainOnDelete"]),
    viewerCertificate: normalizeCloudFrontViewerCertificates(config["viewerCertificate"]),
    waitForDeployment: readBoolean(config["waitForDeployment"]),
    webAclId: readNonEmptyString(config["webAclId"])
  });
}

function normalizeCloudFrontOriginBlocks(value: unknown): Record<string, unknown>[] | undefined {
  const origins = normalizeRecordList(value).map((origin) =>
    compactTerraformConfig({
      connectionAttempts: readNumber(origin["connectionAttempts"]),
      connectionTimeout: readNumber(origin["connectionTimeout"]),
      customOriginConfig: normalizeCloudFrontCustomOriginConfig(origin["customOriginConfig"]),
      domainName: readNonEmptyString(origin["domainName"]),
      originAccessControlId: readNonEmptyString(origin["originAccessControlId"]),
      originId: readNonEmptyString(origin["originId"]),
      originPath: readString(origin["originPath"]),
      s3OriginConfig: normalizeCloudFrontS3OriginConfig(origin["s3OriginConfig"])
    })
  );

  return origins.length > 0 ? origins : undefined;
}

function normalizeCloudFrontCustomOriginConfig(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = compactTerraformConfig({
    httpPort: readNumber(value["httpPort"]),
    httpsPort: readNumber(value["httpsPort"]),
    originKeepaliveTimeout: readNumber(value["originKeepaliveTimeout"]),
    originProtocolPolicy: readNonEmptyString(value["originProtocolPolicy"]),
    originReadTimeout: readNumber(value["originReadTimeout"]),
    originSslProtocols: readStringArray(value["originSslProtocols"])
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeCloudFrontS3OriginConfig(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const originAccessIdentity = readString(value["originAccessIdentity"]);

  return originAccessIdentity === undefined ? undefined : { originAccessIdentity };
}

function normalizeCloudFrontCacheBehaviors(
  value: unknown,
  multiple: boolean
): Record<string, unknown> | Record<string, unknown>[] | undefined {
  const behaviors = normalizeRecordList(value).map((behavior) =>
    compactTerraformConfig({
      allowedMethods: readStringArray(behavior["allowedMethods"]),
      cachePolicyId: readNonEmptyString(behavior["cachePolicyId"]),
      cachedMethods: readStringArray(behavior["cachedMethods"]),
      compress: readBoolean(behavior["compress"]),
      defaultTtl: readNumber(behavior["defaultTtl"]),
      fieldLevelEncryptionId: readNonEmptyString(behavior["fieldLevelEncryptionId"]),
      forwardedValues: normalizeCloudFrontForwardedValues(behavior["forwardedValues"]),
      maxTtl: readNumber(behavior["maxTtl"]),
      minTtl: readNumber(behavior["minTtl"]),
      originRequestPolicyId: readNonEmptyString(behavior["originRequestPolicyId"]),
      pathPattern: readNonEmptyString(behavior["pathPattern"]),
      realtimeLogConfigArn: readNonEmptyString(behavior["realtimeLogConfigArn"]),
      responseHeadersPolicyId: readNonEmptyString(behavior["responseHeadersPolicyId"]),
      smoothStreaming: readBoolean(behavior["smoothStreaming"]),
      targetOriginId: readNonEmptyString(behavior["targetOriginId"]),
      trustedKeyGroups: readStringArray(behavior["trustedKeyGroups"]),
      trustedSigners: readStringArray(behavior["trustedSigners"]),
      viewerProtocolPolicy: readNonEmptyString(behavior["viewerProtocolPolicy"])
    })
  );

  if (behaviors.length === 0) {
    return undefined;
  }

  return multiple ? behaviors : behaviors[0];
}

function normalizeCloudFrontForwardedValues(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = compactTerraformConfig({
    cookies: normalizeCloudFrontCookies(value["cookies"]),
    headers: readStringArray(value["headers"]),
    queryString: readBoolean(value["queryString"]),
    queryStringCacheKeys: readStringArray(value["queryStringCacheKeys"])
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeCloudFrontCookies(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = compactTerraformConfig({
    forward: readNonEmptyString(value["forward"]),
    whitelistedNames: readStringArray(value["whitelistedNames"])
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeCloudFrontRestrictions(value: unknown): Record<string, unknown> | undefined {
  const restriction = normalizeRecordList(value)[0];
  const geoRestriction = restriction && isRecord(restriction["geoRestriction"])
    ? compactTerraformConfig({
        locations: readStringArray(restriction["geoRestriction"]["locations"]),
        restrictionType: readNonEmptyString(
          restriction["geoRestriction"]["restrictionType"]
        )
      })
    : undefined;

  return geoRestriction && Object.keys(geoRestriction).length > 0
    ? { geoRestriction }
    : undefined;
}

function normalizeCloudFrontViewerCertificates(
  value: unknown
): Record<string, unknown> | undefined {
  const certificate = normalizeRecordList(value)[0];
  if (!certificate) {
    return undefined;
  }

  const normalized = compactTerraformConfig({
    acmCertificateArn: readNonEmptyString(certificate["acmCertificateArn"]),
    cloudfrontDefaultCertificate: readBoolean(certificate["cloudfrontDefaultCertificate"]),
    iamCertificateId: readNonEmptyString(certificate["iamCertificateId"]),
    minimumProtocolVersion: readNonEmptyString(certificate["minimumProtocolVersion"]),
    sslSupportMethod: readNonEmptyString(certificate["sslSupportMethod"])
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeRecordList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  return isRecord(value) ? [value] : [];
}

function compactTerraformConfig(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (value === undefined) return false;
      return !Array.isArray(value) || value.length > 0;
    })
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );

  return strings.length > 0 ? strings : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hasManagedS3Versioning(node: InfrastructureGraphNode): boolean {
  return node.iac.resourceType === "aws_s3_bucket" && node.config["versioningEnabled"] === true;
}

function renderManagedS3Versioning(node: InfrastructureGraphNode): string {
  const name = `${node.iac.resourceName}_versioning`;
  return [
    `resource "aws_s3_bucket_versioning" "${name}" {`,
    `${INDENT_UNIT}bucket = aws_s3_bucket.${node.iac.resourceName}.id`,
    "",
    `${INDENT_UNIT}versioning_configuration {`,
    `${INDENT_UNIT}${INDENT_UNIT}status = "Enabled"`,
    `${INDENT_UNIT}}`,
    "}"
  ].join("\n");
}

function hasInlineLambdaSource(node: InfrastructureGraphNode): boolean {
  return node.iac.resourceType === "aws_lambda_function" &&
    typeof node.config["inlineSource"] === "string" &&
    node.config["inlineSource"].length > 0;
}

function renderInlineLambdaArchive(node: InfrastructureGraphNode): string {
  const source = node.config["inlineSource"];
  if (typeof source !== "string") return "";
  const archiveName = `${node.iac.resourceName}_bundle`;
  return [
    `data "archive_file" "${archiveName}" {`,
    `${INDENT_UNIT}type = "zip"`,
    `${INDENT_UNIT}source_content = ${JSON.stringify(source)}`,
    `${INDENT_UNIT}source_content_filename = "index.mjs"`,
    `${INDENT_UNIT}output_path = "\${path.module}/${archiveName}.zip"`,
    "}"
  ].join("\n");
}

function renderLiveObservationOutputs(graph: InfrastructureGraph): string[] {
  const topology = resolveLiveObservationTopology(graph);
  if (!topology) return [];

  const { loadBalancer, targetGroup, trafficRecord } = topology;
  const loadBalancerAddress = `aws_lb.${loadBalancer.iac.resourceName}`;
  const targetGroupAddress = `aws_lb_target_group.${targetGroup.iac.resourceName}`;
  const trafficRecordAddress = `aws_route53_record.${trafficRecord.iac.resourceName}`;
  const commonOutputs = [
    renderOutput("traffic_url", `"https://\${${trafficRecordAddress}.name}/traffic"`),
    renderOutput("traffic_hostname", `${trafficRecordAddress}.name`),
    renderOutput("load_balancer_dns_name", `${loadBalancerAddress}.dns_name`),
    renderOutput("load_balancer_arn", `${loadBalancerAddress}.arn`),
    renderOutput("target_group_arn", `${targetGroupAddress}.arn`),
    ...renderLiveObservationLogGroupOutputs(topology.logGroups)
  ];

  if (topology.capacity.kind === "asg") {
    const { autoScalingGroup, alarm } = topology.capacity;
    const autoScalingGroupAddress = `aws_autoscaling_group.${autoScalingGroup.iac.resourceName}`;

    return [
      ...commonOutputs,
      renderOutput("asg_name", `${autoScalingGroupAddress}.name`),
      renderOutput("scale_out_threshold", String(alarm.config["threshold"]))
    ];
  }

  const { ecsCluster, ecsService, applicationScalingTarget } = topology.capacity;
  const maxCapacity = applicationScalingTarget.config["maxCapacity"] as number;

  const ecsClusterAddress = `aws_ecs_cluster.${ecsCluster.iac.resourceName}`;
  const ecsServiceAddress = `aws_ecs_service.${ecsService.iac.resourceName}`;

  const requestThreshold = findAlbRequestCountTargetValue(
    graph,
    loadBalancerAddress,
    targetGroupAddress,
    applicationScalingTarget
  );

  return [
    ...commonOutputs,
    renderOutput("ecs_cluster_name", `${ecsClusterAddress}.name`),
    renderOutput("ecs_service_name", `${ecsServiceAddress}.name`),
    renderOutput("max_capacity", String(maxCapacity)),
    ...(requestThreshold === null
      ? []
      : [renderOutput("scale_out_threshold", String(requestThreshold))])
  ];
}

type LiveObservationTopology = {
  loadBalancer: InfrastructureGraphNode;
  targetGroup: InfrastructureGraphNode;
  trafficRecord: InfrastructureGraphNode;
  logGroups: InfrastructureGraphNode[];
  capacity:
    | {
        kind: "asg";
        autoScalingGroup: InfrastructureGraphNode;
        alarm: InfrastructureGraphNode;
      }
    | {
        kind: "ecs_fargate";
        ecsCluster: InfrastructureGraphNode;
        ecsService: InfrastructureGraphNode;
        applicationScalingTarget: InfrastructureGraphNode;
      };
};

type RuntimeCandidate =
  | { kind: "asg"; node: InfrastructureGraphNode }
  | { kind: "ecs_fargate"; node: InfrastructureGraphNode };

function resolveLiveObservationTopology(
  graph: InfrastructureGraph
): LiveObservationTopology | null {
  const topologies: LiveObservationTopology[] = [];
  for (const listener of resourceNodes(graph, "aws_lb_listener")) {
    if (listener.config["protocol"] !== "HTTPS" || listener.config["port"] !== 443) {
      continue;
    }

    const loadBalancer = findUniqueReferencedNode(
      graph,
      listener.config["loadBalancerArn"],
      "aws_lb",
      ["arn"]
    );
    const certificate = findUniqueReferencedNode(
      graph,
      listener.config["certificateArn"],
      "aws_acm_certificate",
      ["arn"]
    );
    if (!loadBalancer || !certificate) continue;

    const targetGroupReferences = forwardTargetGroupReferences(listener);
    if (targetGroupReferences.length !== 1) continue;
    const targetGroup = findUniqueReferencedNode(
      graph,
      targetGroupReferences[0],
      "aws_lb_target_group",
      ["arn"]
    );
    if (!targetGroup) continue;
    const trafficRecords = findValidatedTrafficRecords(
      graph,
      terraformAddress(loadBalancer),
      certificate
    );
    if (trafficRecords.length !== 1) continue;

    const runtime = resolveRuntimeTopology(graph, loadBalancer, targetGroup);
    if (!runtime) continue;
    topologies.push({
      loadBalancer,
      targetGroup,
      trafficRecord: trafficRecords[0]!,
      logGroups: runtime.logGroups,
      capacity: runtime.capacity
    });
  }

  return topologies.length === 1 ? topologies[0]! : null;
}

function resolveRuntimeTopology(
  graph: InfrastructureGraph,
  loadBalancer: InfrastructureGraphNode,
  targetGroup: InfrastructureGraphNode
): Pick<LiveObservationTopology, "capacity" | "logGroups"> | null {
  const runtimes: RuntimeCandidate[] = [
    ...resourceNodes(graph, "aws_autoscaling_group").map(
      (node): RuntimeCandidate => ({ kind: "asg", node })
    ),
    ...resourceNodes(graph, "aws_ecs_service").map(
      (node): RuntimeCandidate => ({ kind: "ecs_fargate", node })
    )
  ];
  const targetGroupAddress = terraformAddress(targetGroup);
  const attached = runtimes.filter((runtime) =>
    runtimeReferencesTargetGroup(graph, runtime, targetGroup, targetGroupAddress)
  );

  let selected: RuntimeCandidate;
  let legacySingleRuntime = false;
  if (attached.length === 1) {
    selected = attached[0]!;
  } else if (
    attached.length === 0 &&
    runtimes.length === 1 &&
    resourceNodes(graph, "aws_lb").length === 1 &&
    resourceNodes(graph, "aws_lb_target_group").length === 1 &&
    !runtimeHasAnotherTargetGroupLink(graph, runtimes[0]!)
  ) {
    selected = runtimes[0]!;
    legacySingleRuntime = true;
  } else {
    return null;
  }

  const logGroups = resolveRuntimeLogGroups(graph, selected, legacySingleRuntime);
  if (logGroups === null) return null;

  if (selected.kind === "asg") {
    const alarm = resolveAsgPressureAlarm(
      graph,
      loadBalancer,
      targetGroup,
      selected.node
    );
    if (!alarm) return null;
    return {
      capacity: {
        kind: "asg",
        autoScalingGroup: selected.node,
        alarm
      },
      logGroups
    };
  }

  const ecsCluster = findUniqueReferencedNode(
    graph,
    selected.node.config["cluster"],
    "aws_ecs_cluster",
    ["id", "arn", "name"]
  ) ?? (legacySingleRuntime ? onlyNode(resourceNodes(graph, "aws_ecs_cluster")) : null);
  const applicationScalingTargets = resourceNodes(graph, "aws_appautoscaling_target")
    .filter((node) =>
      containsTerraformReference(
        node.config["resourceId"],
        terraformAddress(selected.node),
        ["name"]
      )
    );
  const applicationScalingTarget = onlyNode(applicationScalingTargets);
  if (
    !ecsCluster ||
    !applicationScalingTarget ||
    typeof applicationScalingTarget.config["maxCapacity"] !== "number"
  ) {
    return null;
  }

  return {
    capacity: {
      kind: "ecs_fargate",
      ecsCluster,
      ecsService: selected.node,
      applicationScalingTarget
    },
    logGroups
  };
}

function runtimeReferencesTargetGroup(
  graph: InfrastructureGraph,
  runtime: RuntimeCandidate,
  targetGroup: InfrastructureGraphNode,
  targetGroupAddress: string
): boolean {
  const configValue = runtime.kind === "asg"
    ? runtime.node.config["targetGroupArns"]
    : runtime.node.config["loadBalancer"];
  return containsTerraformReferenceOfType(
    configValue,
    "aws_lb_target_group",
    "arn"
  )
    ? containsTerraformReference(configValue, targetGroupAddress, ["arn"])
    : nodesDirectlyConnected(graph, runtime.node, targetGroup);
}

function runtimeHasAnotherTargetGroupLink(
  graph: InfrastructureGraph,
  runtime: RuntimeCandidate
): boolean {
  const configValue = runtime.kind === "asg"
    ? runtime.node.config["targetGroupArns"]
    : runtime.node.config["loadBalancer"];
  if (containsTerraformReferenceOfType(configValue, "aws_lb_target_group", "arn")) {
    return true;
  }
  return resourceNodes(graph, "aws_lb_target_group").some(
    (targetGroup) =>
      nodesDirectlyConnected(graph, runtime.node, targetGroup)
  );
}

function resolveRuntimeLogGroups(
  graph: InfrastructureGraph,
  runtime: RuntimeCandidate,
  legacySingleRuntime: boolean
): InfrastructureGraphNode[] | null {
  const owners = runtime.kind === "ecs_fargate"
    ? resolveEcsLogOwners(graph, runtime.node)
    : resolveAsgLogOwners(graph, runtime.node);
  if (!owners) return null;

  const logGroups = resourceNodes(graph, "aws_cloudwatch_log_group");
  const referenced = logGroups.filter((logGroup) =>
    owners.some((owner) =>
      containsTerraformReference(owner.config, terraformAddress(logGroup), ["name", "arn"])
    )
  );
  if (
    owners.some((owner) =>
      containsTerraformReferenceOfTypeForAttributes(
        owner.config,
        "aws_cloudwatch_log_group",
        ["name", "arn"]
      )
    ) && referenced.length === 0
  ) {
    return null;
  }
  const explicit = uniqueNodes([
    ...referenced,
    ...owners.flatMap((owner) => outgoingNodes(graph, owner, "aws_cloudwatch_log_group"))
  ]);
  const allLogGroups = resourceNodes(graph, "aws_cloudwatch_log_group");
  const selected = explicit.length > 0
    ? explicit
    : legacySingleRuntime && allLogGroups.length <= 1
      ? allLogGroups
      : [];
  return selected.length <= 10 ? selected : null;
}

function resolveEcsLogOwners(
  graph: InfrastructureGraph,
  service: InfrastructureGraphNode
): InfrastructureGraphNode[] | null {
  const taskDefinition = resolveOwnedSupportNode(
    graph,
    service,
    service.config["taskDefinition"],
    "aws_ecs_task_definition",
    ["arn", "id"]
  );
  return taskDefinition === null
    ? null
    : taskDefinition
      ? [service, taskDefinition]
      : [service];
}

function resolveAsgLogOwners(
  graph: InfrastructureGraph,
  autoScalingGroup: InfrastructureGraphNode
): InfrastructureGraphNode[] | null {
  const owners = [autoScalingGroup];
  const launchTemplate = resolveOwnedSupportNode(
    graph,
    autoScalingGroup,
    autoScalingGroup.config["launchTemplate"],
    "aws_launch_template",
    ["id", "name", "arn"]
  );
  if (launchTemplate === null) return null;
  if (!launchTemplate) return owners;
  owners.push(launchTemplate);

  const instanceProfile = resolveOwnedSupportNode(
    graph,
    launchTemplate,
    launchTemplate.config["iamInstanceProfile"],
    "aws_iam_instance_profile",
    ["name", "arn", "id"]
  );
  if (instanceProfile === null) return null;
  if (!instanceProfile) return owners;
  owners.push(instanceProfile);

  const role = resolveOwnedSupportNode(
    graph,
    instanceProfile,
    instanceProfile.config["role"],
    "aws_iam_role",
    ["name", "arn", "id"]
  );
  if (role === null) return null;
  if (!role) return owners;
  owners.push(role);

  for (const resourceType of ["aws_iam_role_policy", "aws_iam_policy"] as const) {
    owners.push(...resourceNodes(graph, resourceType).filter((policy) =>
      containsTerraformReference(policy.config["role"], terraformAddress(role), ["name", "id", "arn"]) ||
      graph.edges.some((edge) => edge.sourceId === role.id && edge.targetId === policy.id)
    ));
  }
  return uniqueNodes(owners);
}

function resolveOwnedSupportNode(
  graph: InfrastructureGraph,
  owner: InfrastructureGraphNode,
  referenceValue: unknown,
  resourceType: string,
  attributes: readonly string[]
): InfrastructureGraphNode | null | undefined {
  const candidates = resourceNodes(graph, resourceType);
  const referenced = candidates.filter((candidate) =>
    containsTerraformReference(referenceValue, terraformAddress(candidate), attributes)
  );
  if (referenced.length > 0) return onlyNode(referenced);
  if (containsTerraformReferenceOfTypeForAttributes(referenceValue, resourceType, attributes)) {
    return null;
  }
  const outgoing = outgoingNodes(graph, owner, resourceType);
  return outgoing.length === 0 ? undefined : onlyNode(outgoing);
}

function outgoingNodes(
  graph: InfrastructureGraph,
  source: InfrastructureGraphNode,
  resourceType: string
): InfrastructureGraphNode[] {
  const targetIds = new Set(
    graph.edges
      .filter((edge) => edge.sourceId === source.id)
      .map((edge) => edge.targetId)
  );
  return resourceNodes(graph, resourceType).filter((node) => targetIds.has(node.id));
}

function resolveAsgPressureAlarm(
  graph: InfrastructureGraph,
  loadBalancer: InfrastructureGraphNode,
  targetGroup: InfrastructureGraphNode,
  autoScalingGroup: InfrastructureGraphNode
): InfrastructureGraphNode | null {
  const autoScalingGroups = resourceNodes(graph, "aws_autoscaling_group");
  const loadBalancers = resourceNodes(graph, "aws_lb");
  const targetGroups = resourceNodes(graph, "aws_lb_target_group");
  const candidates = resourceNodes(graph, "aws_cloudwatch_metric_alarm").filter(
    (node) =>
      node.config["metricName"] === "RequestCountPerTarget" &&
      typeof node.config["threshold"] === "number"
  );
  const validCandidates = candidates.filter((alarm) => {
    const actionOwner = resolveAlarmActionAutoScalingGroup(
      graph,
      alarm,
      autoScalingGroups
    );
    if (!actionOwner || actionOwner.id !== autoScalingGroup.id) {
      return false;
    }

    const loadBalancerDimensions = loadBalancers.filter((candidate) =>
      containsTerraformReference(
        alarm.config["dimensions"],
        terraformAddress(candidate),
        ["arn_suffix"]
      )
    );
    const targetGroupDimensions = targetGroups.filter((candidate) =>
      containsTerraformReference(
        alarm.config["dimensions"],
        terraformAddress(candidate),
        ["arn_suffix"]
      )
    );
    if (
      onlyNode(loadBalancerDimensions)?.id !== loadBalancer.id ||
      onlyNode(targetGroupDimensions)?.id !== targetGroup.id
    ) {
      return false;
    }

    const dimensionOwners = autoScalingGroups.filter((candidate) =>
      containsTerraformReference(
        alarm.config["dimensions"],
        terraformAddress(candidate),
        ["name"]
      )
    );
    const hasDimensionReference = containsTerraformReferenceOfType(
      alarm.config["dimensions"],
      "aws_autoscaling_group",
      "name"
    );
    if (hasDimensionReference && onlyNode(dimensionOwners)?.id !== autoScalingGroup.id) {
      return false;
    }

    const edgeOwners = autoScalingGroups.filter((candidate) =>
      nodesDirectlyConnected(graph, alarm, candidate)
    );
    return edgeOwners.length === 0 || onlyNode(edgeOwners)?.id === autoScalingGroup.id;
  });
  return onlyNode(validCandidates);
}

function resolveAlarmActionAutoScalingGroup(
  graph: InfrastructureGraph,
  alarm: InfrastructureGraphNode,
  autoScalingGroups: readonly InfrastructureGraphNode[]
): InfrastructureGraphNode | null | undefined {
  const alarmActions = alarm.config["alarmActions"];
  if (!Array.isArray(alarmActions) || alarmActions.length !== 1) return null;
  const action = alarmActions[0];
  if (!containsTerraformReferenceOfType(action, "aws_autoscaling_policy", "arn")) {
    return null;
  }

  const policies = resourceNodes(graph, "aws_autoscaling_policy").filter((policy) =>
    containsTerraformReference(action, terraformAddress(policy), ["arn"])
  );
  const policy = onlyNode(policies);
  if (!policy) return null;

  const policyOwners = autoScalingGroups.filter((candidate) =>
    containsTerraformReference(
      policy.config["autoscalingGroupName"],
      terraformAddress(candidate),
      ["name"]
    )
  );
  if (
    !containsTerraformReferenceOfType(
      policy.config["autoscalingGroupName"],
      "aws_autoscaling_group",
      "name"
    )
  ) {
    return null;
  }
  return onlyNode(policyOwners);
}

function renderLiveObservationLogGroupOutputs(
  logGroups: readonly InfrastructureGraphNode[]
): string[] {
  const addresses = logGroups
    .map((node) => `aws_cloudwatch_log_group.${node.iac.resourceName}.name`);

  if (addresses.length === 0) return [];
  if (addresses.length === 1) {
    return [renderOutput("log_group_name", addresses[0]!)];
  }

  return [renderOutput("log_group_names", `[${addresses.join(", ")}]`)];
}

function findValidatedTrafficRecords(
  graph: InfrastructureGraph,
  loadBalancerAddress: string,
  certificate: InfrastructureGraphNode
): InfrastructureGraphNode[] {
  const certificateDomainName = certificate.config["domainName"];
  if (typeof certificateDomainName !== "string" || certificateDomainName.length === 0) {
    return [];
  }

  return graph.nodes.filter((node) => {
    if (
      node.iac.terraformBlockType !== "resource" ||
      node.iac.resourceType !== "aws_route53_record" ||
      node.config["name"] !== certificateDomainName ||
      node.config["type"] !== "CNAME"
    ) {
      return false;
    }

    const records = node.config["records"];
    return (
      Array.isArray(records) &&
      records.length === 1 &&
      records[0] === `${loadBalancerAddress}.dns_name`
    );
  });
}

function forwardTargetGroupReferences(listener: InfrastructureGraphNode): unknown[] {
  const defaultAction = listener.config["defaultAction"];
  const actions = Array.isArray(defaultAction) ? defaultAction : [defaultAction];
  return actions.flatMap((action) =>
    isRecord(action) && action["type"] === "forward"
      ? [action["targetGroupArn"]]
      : []
  );
}

function findAlbRequestCountTargetValue(
  graph: InfrastructureGraph,
  loadBalancerAddress: string,
  targetGroupAddress: string,
  applicationScalingTarget: InfrastructureGraphNode
): number | null {
  const scalingTargetAddress = terraformAddress(applicationScalingTarget);
  const selectedTargetPolicies = resourceNodes(graph, "aws_appautoscaling_policy").filter(
    (policy) => containsTerraformReference(
        policy.config["resourceId"],
        scalingTargetAddress,
        ["resource_id"]
      )
  );
  const requestPolicies = selectedTargetPolicies.flatMap((policy) => {
    const configuration = policy.config["targetTrackingScalingPolicyConfiguration"];
    if (!isRecord(configuration)) return [];

    const specificationValue = configuration["predefinedMetricSpecification"];
    const specifications = Array.isArray(specificationValue)
      ? specificationValue.filter(isRecord)
      : isRecord(specificationValue)
        ? [specificationValue]
        : [];
    const albRequestSpecifications = specifications.filter(
      (specification) =>
        specification["predefinedMetricType"] === "ALBRequestCountPerTarget"
    );
    if (albRequestSpecifications.length === 0) return [];

    const specification = onlyNode(albRequestSpecifications);
    const resourceLabel = specification?.["resourceLabel"];
    const loadBalancerReferences = resourceNodes(graph, "aws_lb").filter((candidate) =>
      containsTerraformReference(
        resourceLabel,
        terraformAddress(candidate),
        ["arn_suffix"]
      )
    );
    const targetGroupReferences = resourceNodes(graph, "aws_lb_target_group").filter(
      (candidate) =>
        containsTerraformReference(
          resourceLabel,
          terraformAddress(candidate),
          ["arn_suffix"]
        )
    );
    const targetValue = configuration["targetValue"];
    const valid =
      typeof targetValue === "number" &&
      Number.isFinite(targetValue) &&
      targetValue >= 0 &&
      typeof resourceLabel === "string" &&
      onlyNode(loadBalancerReferences) !== null &&
      terraformAddress(loadBalancerReferences[0]!) === loadBalancerAddress &&
      onlyNode(targetGroupReferences) !== null &&
      terraformAddress(targetGroupReferences[0]!) === targetGroupAddress;
    return [{ targetValue, valid }];
  });

  const selected = onlyNode(requestPolicies);
  return selected?.valid ? selected.targetValue as number : null;
}

function resourceNodes(
  graph: InfrastructureGraph,
  resourceType: string
): InfrastructureGraphNode[] {
  return graph.nodes.filter(
    (node) =>
      node.iac.terraformBlockType === "resource" && node.iac.resourceType === resourceType
  );
}

function findUniqueReferencedNode(
  graph: InfrastructureGraph,
  value: unknown,
  resourceType: string,
  attributes: readonly string[]
): InfrastructureGraphNode | null {
  return onlyNode(
    resourceNodes(graph, resourceType).filter((node) =>
      containsTerraformReference(value, terraformAddress(node), attributes)
    )
  );
}

function containsTerraformReference(
  value: unknown,
  address: string,
  attributes: readonly string[]
): boolean {
  if (typeof value === "string") {
    return attributes.some((attribute) => {
      const reference = `${address}.${attribute}`;
      return value === reference || value.includes(`\${${reference}}`);
    });
  }
  if (Array.isArray(value)) {
    return value.some((candidate) =>
      containsTerraformReference(candidate, address, attributes)
    );
  }
  return isRecord(value) && Object.values(value).some((candidate) =>
    containsTerraformReference(candidate, address, attributes)
  );
}

function containsTerraformReferenceOfType(
  value: unknown,
  resourceType: string,
  attribute: string
): boolean {
  if (typeof value === "string") {
    const escapedResourceType = resourceType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `${escapedResourceType}\\.[a-zA-Z_][a-zA-Z0-9_-]*\\.${escapedAttribute}(?:[^a-zA-Z0-9_]|$)`
    ).test(value);
  }
  if (Array.isArray(value)) {
    return value.some((candidate) =>
      containsTerraformReferenceOfType(candidate, resourceType, attribute)
    );
  }
  return isRecord(value) && Object.values(value).some((candidate) =>
    containsTerraformReferenceOfType(candidate, resourceType, attribute)
  );
}

function containsTerraformReferenceOfTypeForAttributes(
  value: unknown,
  resourceType: string,
  attributes: readonly string[]
): boolean {
  return attributes.some((attribute) =>
    containsTerraformReferenceOfType(value, resourceType, attribute)
  );
}

function nodesDirectlyConnected(
  graph: InfrastructureGraph,
  left: InfrastructureGraphNode,
  right: InfrastructureGraphNode
): boolean {
  return graph.edges.some(
    (edge) =>
      (edge.sourceId === left.id && edge.targetId === right.id) ||
      (edge.sourceId === right.id && edge.targetId === left.id)
  );
}

function terraformAddress(node: InfrastructureGraphNode): string {
  return `${node.iac.resourceType}.${node.iac.resourceName}`;
}

function onlyNode<T>(nodes: readonly T[]): T | null {
  return nodes.length === 1 ? nodes[0]! : null;
}

function uniqueNodes(nodes: readonly InfrastructureGraphNode[]): InfrastructureGraphNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

function renderOutput(name: string, valueExpression: string): string {
  return [`output "${name}" {`, `${INDENT_UNIT}value = ${valueExpression}`, "}"].join("\n");
}

// resource/data block 하나를 만든다. 예: resource "aws_vpc" "main" { ... }
function renderBlock(node: InfrastructureGraphNode): string {
  const terraformBlockType = node.iac.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;
  assertTerraformIdentifier(node.iac.resourceType, "resource type");
  assertTerraformIdentifier(node.iac.resourceName, "resource name");

  const body = Object.entries(createRenderableResourceConfig(node)).flatMap(([key, value]) =>
    renderBodyEntry(node.iac.resourceType, key, value, 1)
  );
  if (
    node.iac.resourceType === "aws_s3_object" &&
    node.config["releaseManagedContent"] === true
  ) {
    body.push(
      "  lifecycle {",
      "    ignore_changes = [content, content_type, cache_control, etag, source]",
      "  }"
    );
  }

  const block = [
    `${terraformBlockType} "${node.iac.resourceType}" "${node.iac.resourceName}" {`,
    ...body,
    "}"
  ].join("\n");

  return isReverseEngineeringResourceConfig(node.config)
    ? alignSingleLineTerraformAttributes(block)
    : block;
}

// terraform fmt가 같은 depth의 연속된 단일행 attribute에 적용하는 정렬을 재현합니다.
// Reverse Engineering fixture를 쓰기 전에 수정하지 않아도 strict fmt -check를 통과하게 합니다.
function alignSingleLineTerraformAttributes(block: string): string {
  const lines = block.split("\n");
  let groupStart = 0;

  while (groupStart < lines.length) {
    const first = parseSingleLineTerraformAttribute(lines[groupStart]);
    if (!first) {
      groupStart += 1;
      continue;
    }

    const attributes = [first];
    let groupEnd = groupStart + 1;

    while (groupEnd < lines.length) {
      const next = parseSingleLineTerraformAttribute(lines[groupEnd]);
      if (!next || next.indentation !== first.indentation) {
        break;
      }

      attributes.push(next);
      groupEnd += 1;
    }

    const longestNameLength = Math.max(...attributes.map((attribute) => attribute.name.length));
    for (const [offset, attribute] of attributes.entries()) {
      lines[groupStart + offset] =
        `${attribute.indentation}${attribute.name.padEnd(longestNameLength)} = ${attribute.value}`;
    }
    groupStart = groupEnd;
  }

  return lines.join("\n");
}

function parseSingleLineTerraformAttribute(
  line: string | undefined
): { indentation: string; name: string; value: string } | null {
  const match = /^(\s+)([a-zA-Z_][a-zA-Z0-9_-]*) = (.+)$/.exec(line ?? "");
  if (!match || /[([{]$/.test(match[3] ?? "")) {
    return null;
  }

  return { indentation: match[1]!, name: match[2]!, value: match[3]! };
}

function renderBodyEntry(
  resourceType: string,
  key: string,
  value: unknown,
  indentLevel: number
): string[] {
  const normalizedValue = normalizeTopLevelValue(resourceType, key, value);

  if (
    resourceType === "aws_ecs_task_definition" &&
    toSnakeCase(key) === "container_definitions" &&
    Array.isArray(normalizedValue)
  ) {
    return [
      `${indent(indentLevel)}container_definitions = jsonencode(${renderValue(normalizedValue, indentLevel)})`
    ];
  }

  if (shouldRenderNestedBlocks(resourceType, key, normalizedValue)) {
    return renderNestedBlocks(resourceType, key, normalizedValue, indentLevel, []);
  }

  return [renderAttribute(key, normalizedValue, indentLevel)];
}

function normalizeTopLevelValue(resourceType: string, key: string, value: unknown): unknown {
  if (
    resourceType === "aws_security_group" &&
    (key === "egress" || key === "ingress") &&
    Array.isArray(value)
  ) {
    return value.map((item) => (isRecord(item) ? normalizeSecurityGroupRuleBlock(item) : item));
  }

  return value;
}

function normalizeSecurityGroupRuleBlock(rule: Record<string, unknown>): Record<string, unknown> {
  const normalizedRule: Record<string, unknown> = {};
  const port = rule["port"];
  const cidr = rule["cidr"];
  const hasCidrBlocks = rule["cidrBlocks"] !== undefined || rule["cidr_blocks"] !== undefined;

  for (const [key, value] of Object.entries(rule)) {
    if (key !== "cidr" && key !== "port") {
      normalizedRule[key] = value;
    }
  }

  if (port !== undefined) {
    if (rule["fromPort"] === undefined && rule["from_port"] === undefined) {
      normalizedRule.fromPort = port;
    }

    if (rule["toPort"] === undefined && rule["to_port"] === undefined) {
      normalizedRule.toPort = port;
    }

    if (rule["protocol"] === undefined) {
      normalizedRule.protocol = "tcp";
    }
  }

  if (cidr !== undefined && !hasCidrBlocks) {
    normalizedRule.cidrBlocks = [cidr];
  }

  return normalizedRule;
}

function shouldRenderNestedBlocks(
  resourceType: string,
  key: string,
  value: unknown
): value is Record<string, unknown> | Record<string, unknown>[] {
  return (
    (isTerraformNestedBlockAttribute(resourceType, key) ||
      (resourceType === "aws_lb" && toSnakeCase(key) === "subnet_mapping") ||
      isReverseEngineeringEcsNestedBlock(resourceType, key)) &&
    ((Array.isArray(value) && value.every(isRecord)) || isRecord(value))
  );
}

function renderNestedBlocks(
  resourceType: string,
  key: string,
  value: Record<string, unknown> | Record<string, unknown>[],
  indentLevel: number,
  parentPath: readonly string[]
): string[] {
  const blockName = toSnakeCase(key);
  const values = Array.isArray(value) ? value : [value];

  assertTerraformIdentifier(blockName, "nested block name");

  return values.map((value) =>
    [
      `${indent(indentLevel)}${blockName} {`,
      ...Object.entries(value).flatMap(([nestedKey, nestedValue]) =>
        renderNestedBlockEntry(
          resourceType,
          [...parentPath, key],
          nestedKey,
          nestedValue,
          indentLevel + 1
        )
      ),
      `${indent(indentLevel)}}`
    ].join("\n")
  );
}

function renderNestedBlockEntry(
  resourceType: string,
  parentPath: readonly string[],
  key: string,
  value: unknown,
  indentLevel: number
): string[] {
  if (
    isTerraformLifecycleIgnoreChangesAttribute(resourceType, key, parentPath) &&
    Array.isArray(value)
  ) {
    return [renderLifecycleIgnoreChanges(value, indentLevel)];
  }

  if (
    (isTerraformNestedBlockAttribute(resourceType, key, parentPath) ||
      isGenericTerraformNestedBlock(key) ||
      isReverseEngineeringEcsNestedBlock(resourceType, key, parentPath)) &&
    ((Array.isArray(value) && value.every(isRecord)) || isRecord(value))
  ) {
    return renderNestedBlocks(resourceType, key, value, indentLevel, parentPath);
  }

  return [renderAttribute(key, value, indentLevel)];
}

function isReverseEngineeringEcsNestedBlock(
  resourceType: string,
  key: string,
  parentPath: readonly string[] = []
): boolean {
  const path = [...parentPath.map(toSnakeCase), toSnakeCase(key)].join(".");

  return (
    (resourceType === "aws_ecs_cluster" &&
      [
        "configuration",
        "configuration.execute_command_configuration",
        "configuration.execute_command_configuration.log_configuration",
        "configuration.managed_storage_configuration"
      ].includes(path)) ||
    (resourceType === "aws_ecs_service" && path === "capacity_provider_strategy")
  );
}

function renderLifecycleIgnoreChanges(value: unknown[], indentLevel: number): string {
  const renderedValue = value.length === 0
    ? "[]"
    : [
        "[",
        ...value.map((item) =>
          `${indent(indentLevel + 1)}${
            typeof item === "string" && TERRAFORM_IDENTIFIER_PATTERN.test(item)
              ? item
              : renderValue(item, indentLevel + 1)
          },`
        ),
        `${indent(indentLevel)}]`
      ].join("\n");

  return `${indent(indentLevel)}ignore_changes = ${renderedValue}`;
}

function renderAttribute(key: string, value: unknown, indentLevel: number): string {
  const attributeName = toSnakeCase(key);
  assertTerraformIdentifier(attributeName, "attribute name");

  const renderedValue =
    attributeName === "depends_on"
      ? renderDependencyList(value, indentLevel)
      : renderValue(value, indentLevel);

  return `${indent(indentLevel)}${attributeName} = ${renderedValue}`;
}

function renderDependencyList(value: unknown, indentLevel: number): string {
  if (!Array.isArray(value)) {
    return renderValue(value, indentLevel);
  }

  if (value.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...value.map((dependency) => {
      const renderedDependency =
        typeof dependency === "string" && TERRAFORM_RESOURCE_ADDRESS_PATTERN.test(dependency)
          ? dependency
          : renderValue(dependency, indentLevel + 1);

      return `${indent(indentLevel + 1)}${renderedDependency},`;
    }),
    `${indent(indentLevel)}]`
  ].join("\n");
}

// JavaScript 값을 Terraform HCL 값 표현으로 바꾼다.
function renderValue(value: unknown, indentLevel: number): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return isTerraformReference(value) || isSupportedTerraformFunctionExpression(value)
      ? value
      : JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return renderArray(value, indentLevel);
  }

  if (isRecord(value)) {
    return renderObject(value, indentLevel);
  }

  return JSON.stringify(String(value));
}

// 배열 값을 사람이 읽기 쉬운 여러 줄 Terraform list로 출력한다.
function renderArray(values: unknown[], indentLevel: number): string {
  if (values.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...values.map((value) => `${indent(indentLevel + 1)}${renderValue(value, indentLevel + 1)},`),
    `${indent(indentLevel)}]`
  ].join("\n");
}

// object 값을 Terraform map/object 표현으로 바꾼다. tags 같은 nested key는 원래 이름을 유지한다.
function renderObject(value: Record<string, unknown>, indentLevel: number): string {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "{}";
  }

  return [
    "{",
    ...entries.map(
      ([key, nestedValue]) =>
        `${indent(indentLevel + 1)}${renderObjectKey(key)} = ${renderValue(nestedValue, indentLevel + 1)}`
    ),
    `${indent(indentLevel)}}`
  ].join("\n");
}

function renderObjectKey(key: string): string {
  return TERRAFORM_IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Terraform reference는 따옴표 없이 출력해야 하므로 일반 문자열과 구분한다.
function isTerraformReference(value: string): boolean {
  return TERRAFORM_REFERENCE_PATTERN.test(value);
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function indent(level: number): string {
  return INDENT_UNIT.repeat(level);
}

function assertTerraformIdentifier(value: string, label: string): void {
  if (TERRAFORM_IDENTIFIER_PATTERN.test(value)) {
    return;
  }

  throw new TerraformDiagramValidationError(label, value);
}
