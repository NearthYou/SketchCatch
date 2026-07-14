const TERRAFORM_NESTED_BLOCK_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  aws_ami: new Set(["filter"]),
  aws_api_gateway_rest_api: new Set(["endpointConfiguration"]),
  aws_appautoscaling_policy: new Set(["targetTrackingScalingPolicyConfiguration"]),
  aws_autoscaling_group: new Set(["launchTemplate", "tag"]),
  aws_autoscaling_policy: new Set(["stepAdjustment", "targetTrackingConfiguration"]),
  aws_codebuild_project: new Set([
    "artifacts",
    "buildStatusConfig",
    "cloudwatchLogs",
    "environment",
    "gitSubmodulesConfig",
    "logsConfig",
    "registryCredential",
    "s3Logs",
    "source",
    "vpcConfig"
  ]),
  aws_codedeploy_deployment_group: new Set([
    "alarmConfiguration",
    "autoRollbackConfiguration",
    "blueGreenDeploymentConfig",
    "deploymentStyle",
    "ec2TagFilter",
    "ec2TagSet",
    "ecsService",
    "loadBalancerInfo",
    "targetGroupInfo",
    "targetGroupPairInfo",
    "triggerConfiguration"
  ]),
  aws_cloudfront_cache_policy: new Set(["parametersInCacheKeyAndForwardedToOrigin"]),
  aws_cloudfront_distribution: new Set([
    "defaultCacheBehavior",
    "orderedCacheBehavior",
    "origin",
    "restrictions",
    "viewerCertificate"
  ]),
  aws_cloudfront_origin_request_policy: new Set([
    "cookiesConfig",
    "headersConfig",
    "queryStringsConfig"
  ]),
  aws_config_config_rule: new Set(["source"]),
  aws_codepipeline: new Set(["action", "artifactStore", "encryptionKey", "stage"]),
  aws_db_parameter_group: new Set(["parameter"]),
  aws_dynamodb_table: new Set(["attribute"]),
  aws_eks_cluster: new Set(["vpcConfig"]),
  aws_eks_node_group: new Set(["scalingConfig"]),
  aws_ecs_cluster: new Set(["setting"]),
  aws_ecs_service: new Set([
    "deploymentCircuitBreaker",
    "loadBalancer",
    "networkConfiguration"
  ]),
  aws_ecr_repository: new Set(["imageScanningConfiguration"]),
  aws_instance: new Set(["rootBlockDevice"]),
  aws_lambda_function: new Set(["environment"]),
  aws_launch_template: new Set([
    "iamInstanceProfile",
    "metadataOptions",
    "monitoring",
    "networkInterfaces",
    "tagSpecifications"
  ]),
  aws_lb_listener: new Set(["defaultAction", "forward"]),
  aws_lb_target_group: new Set(["healthCheck", "stickiness"]),
  aws_route_table: new Set(["route"]),
  aws_s3_bucket_server_side_encryption_configuration: new Set(["rule"]),
  aws_s3_bucket_website_configuration: new Set(["errorDocument", "indexDocument", "routingRule"]),
  aws_s3_bucket_lifecycle_configuration: new Set(["rule"]),
  aws_s3_bucket_versioning: new Set(["versioningConfiguration"]),
  aws_scheduler_schedule: new Set(["flexibleTimeWindow", "target"]),
  aws_security_group: new Set(["egress", "ingress"]),
  aws_wafv2_web_acl: new Set(["defaultAction", "visibilityConfig"]),
  kubernetes_namespace: new Set(["metadata"]),
  kubernetes_deployment: new Set(["metadata", "spec"]),
  kubernetes_service: new Set(["metadata", "spec"])
};

const TERRAFORM_NESTED_BLOCK_ATTRIBUTES_BY_PATH: Record<string, ReadonlySet<string>> = {
  "aws_autoscaling_policy.targetTrackingConfiguration": new Set(["predefinedMetricSpecification"]),
  "aws_cloudfront_distribution.origin": new Set(["customOriginConfig", "s3OriginConfig"]),
  "aws_cloudfront_distribution.restrictions": new Set(["geoRestriction"]),
  "kubernetes_deployment.spec": new Set(["selector"])
};

const TERRAFORM_SINGLE_NESTED_BLOCK_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  aws_lb_target_group: new Set(["healthCheck"])
};

const GENERIC_TERRAFORM_NESTED_BLOCKS = new Set([
  "container",
  "cookies",
  "customOriginConfig",
  "forwardedValues",
  "geoRestriction",
  "loadBalancer",
  "metadata",
  "networkConfiguration",
  "port",
  "predefinedMetricSpecification",
  "spec",
  "template"
]);

export function getTerraformNestedBlockAttributes(
  resourceType: string
): ReadonlySet<string> | undefined {
  return TERRAFORM_NESTED_BLOCK_ATTRIBUTES[resourceType];
}

export function isTerraformNestedBlockAttribute(
  resourceType: string,
  attributeName: string,
  parentPath: readonly string[] = []
): boolean {
  if (parentPath.length > 0) {
    const pathKey = `${resourceType}.${parentPath.map(toCamelCase).join(".")}`;
    if (TERRAFORM_NESTED_BLOCK_ATTRIBUTES_BY_PATH[pathKey]?.has(toCamelCase(attributeName))) {
      return true;
    }
  }

  return getTerraformNestedBlockAttributes(resourceType)?.has(toCamelCase(attributeName)) === true;
}

export function isTerraformSingleNestedBlockAttribute(
  resourceType: string,
  attributeName: string
): boolean {
  return TERRAFORM_SINGLE_NESTED_BLOCK_ATTRIBUTES[resourceType]?.has(toCamelCase(attributeName)) === true;
}

export function isGenericTerraformNestedBlock(attributeName: string): boolean {
  return GENERIC_TERRAFORM_NESTED_BLOCKS.has(toCamelCase(attributeName));
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}
