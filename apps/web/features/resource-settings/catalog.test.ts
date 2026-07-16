import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createTerraformParameterCatalogKey,
  getResourceDefinitionById,
  getResourceDefinitionByTerraform,
  resourceDefinitions
} from "@sketchcatch/types/resource-definitions";
import { terraformAwsParameterCatalog as generatedTerraformAwsParameterCatalog } from "../parameter-input/catalog.generated";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import { capturedBrainboardPaletteResourceIds } from "./captured-brainboard-palette-resource-ids";
import { resourceCatalog } from "./catalog";

const publicDirectoryPath = fileURLToPath(new URL("../../public", import.meta.url));
const brainboardCaptureDirectoryPath = fileURLToPath(
  new URL("../../../../docs/gg/feat-infrastructure-template/brainboard-captures/", import.meta.url)
);
const BRAINBOARD_CAPTURE_TERRAFORM_IDENTITY_COUNT = 87;

const terraformDefinitionKeys = new Set(
  resourceDefinitions.map(
    (definition) => `${definition.terraform.blockType}/${definition.terraform.resourceType}`
  )
);

const requestedMissingCatalogItems = [
  {
    id: "aws-api-gateway-websocket-api",
    type: "aws_apigatewayv2_api",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-API-Gateway_64.svg"
  },
  {
    id: "aws-sqs-queue",
    type: "aws_sqs_queue",
    iconUrl:
      "/Resource-Icons_07312025/Res_Application-Integration/Res_Amazon-Simple-Queue-Service_Queue_48.svg"
  },
  {
    id: "aws-elasticache-redis",
    type: "aws_elasticache_replication_group",
    iconUrl:
      "/Resource-Icons_07312025/Res_Database/Res_Amazon-ElastiCache_ElastiCache-for-Redis_48.svg"
  },
  {
    id: "aws-acm-certificate",
    type: "aws_acm_certificate",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Certificate-Manager_64.svg"
  },
  {
    id: "aws-rds-cluster",
    type: "aws_rds_cluster",
    iconUrl:
      "/Resource-Icons_07312025/Res_Database/Res_Amazon-RDS_Multi-AZ-DB-Cluster_48.svg"
  },
  {
    id: "aws-api-gateway-stage",
    type: "aws_api_gateway_stage",
    iconUrl:
      "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg"
  },
  {
    id: "aws-step-functions-state-machine",
    type: "aws_sfn_state_machine",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_App-Integration/64/Arch_AWS-Step-Functions_64.svg"
  },
  {
    id: "aws-lambda-event-source-mapping",
    type: "aws_lambda_event_source_mapping",
    iconUrl:
      "/Resource-Icons_07312025/Res_Compute/Res_AWS-Lambda_Lambda-Function_48.svg"
  },
  {
    id: "aws-cognito-user-pool",
    type: "aws_cognito_user_pool",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_Amazon-Cognito_64.svg"
  },
  {
    id: "aws-cognito-user-pool-client",
    type: "aws_cognito_user_pool_client",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_Amazon-Cognito_64.svg"
  },
  {
    id: "aws-ecr-repository",
    type: "aws_ecr_repository",
    iconUrl:
      "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Registry_Registry_48.svg"
  },
  {
    id: "aws-ecs-cluster",
    type: "aws_ecs_cluster",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Containers/64/Arch_Amazon-Elastic-Container-Service_64.svg"
  },
  {
    id: "aws-ecs-service",
    type: "aws_ecs_service",
    iconUrl:
      "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Service_Service_48.svg"
  },
  {
    id: "aws-ecs-task-definition",
    type: "aws_ecs_task_definition",
    iconUrl:
      "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Service_Task_48.svg"
  },
  {
    id: "aws-eks-cluster",
    type: "aws_eks_cluster",
    iconUrl:
      "/Architecture-Service-Icons_07312025/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg"
  }
] as const;

const legacySchemaLessPaletteItemIds = [
  "aws-cognito-user-pool",
  "aws-cognito-user-pool-client",
  "aws-caller-identity",
  "aws-ssm-parameter",
  "aws-ec2-managed-prefix-list",
  "aws-s3-website-configuration",
  "aws-codestarconnections-connection",
  "aws-step-functions-state-machine"
] as const;

test("resourceCatalog sizes area defaults below the Region hierarchy root", () => {
  assert.deepEqual(getResourceSize("aws_region"), { width: 260, height: 180 });
  assert.deepEqual(getResourceSize("aws_vpc"), { width: 240, height: 160 });
  assert.deepEqual(getResourceSize("aws_availability_zone"), { width: 220, height: 150 });
  assert.deepEqual(getResourceSize("design_group"), { width: 200, height: 130 });
  assert.deepEqual(getResourceSize("aws_autoscaling_group"), { width: 48, height: 48 });
  assert.deepEqual(getResourceSize("aws_subnet"), { width: 180, height: 120 });
  assert.deepEqual(getResourceSize("aws_security_group"), { width: 180, height: 120 });
});

test("resourceCatalog exposes Region and AZ as board resource area items", () => {
  assert.deepEqual(getCatalogDefaults("aws-region"), {
    type: "aws_region",
    label: "Region",
    size: { width: 260, height: 180 }
  });
  assert.deepEqual(getCatalogDefaults("aws-availability-zone"), {
    type: "aws_availability_zone",
    label: "AZ",
    size: { width: 220, height: 150 }
  });
});

test("resourceCatalog exposes the reusable flow Design items with their real icons", () => {
  assert.deepEqual(getCatalogDefaults("design-user-client"), {
    type: "sketchcatch_user_client",
    label: "User / Client",
    size: { width: 48, height: 48 }
  });
  assert.deepEqual(getCatalogDefaults("design-internet"), {
    type: "sketchcatch_internet",
    label: "Internet",
    size: { width: 48, height: 48 }
  });
  assert.deepEqual(getCatalogDefaults("design-source-repository"), {
    type: "sketchcatch_source_repository",
    label: "Source Repository",
    size: { width: 48, height: 48 }
  });
  assert.deepEqual(getCatalogDefaults("design-aws-account"), {
    type: "sketchcatch_aws_account",
    label: "AWS Account",
    size: { width: 200, height: 130 }
  });

  assert.equal(
    existsSync(
      `${publicDirectoryPath}/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Client_48_Light.svg`
    ),
    true
  );
  assert.equal(
    existsSync(
      `${publicDirectoryPath}/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Internet_48_Light.svg`
    ),
    true
  );
  assert.equal(
    existsSync(
      `${publicDirectoryPath}/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Git-Repository_48_Light.svg`
    ),
    true
  );
  assert.equal(
    existsSync(`${publicDirectoryPath}/Architecture-Group-Icons_07312025/AWS-Account_32.svg`),
    true
  );
});

test("resourceCatalog keeps regular resources at the 48px icon size", () => {
  assert.deepEqual(getResourceSize("aws_internet_gateway"), { width: 48, height: 48 });
  assert.deepEqual(getResourceSize("aws_route_table_association"), { width: 48, height: 48 });
  assert.deepEqual(getResourceSize("aws_cloudfront_distribution"), { width: 48, height: 48 });
  assert.deepEqual(getResourceSize("aws_s3_bucket"), { width: 48, height: 48 });
  assert.deepEqual(getResourceSize("aws_db_subnet_group"), { width: 48, height: 48 });
  assert.deepEqual(getResourceSize("aws_api_gateway_rest_api"), { width: 48, height: 48 });
  assert.deepEqual(getResourceSize("aws_api_gateway_resource"), { width: 48, height: 48 });
  assert.deepEqual(getResourceSize("aws_cloudwatch_event_rule"), { width: 48, height: 48 });
});

test("resourceCatalog provides a CloudFront icon for converted drafts and Terraform proposals", () => {
  const resource = resourceCatalog.find(
    (item) => item.nodeDefaults.type === "aws_cloudfront_distribution"
  );

  assert.equal(
    resource?.iconUrl,
    "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg"
  );
});

test("resourceCatalog Terraform entries use shared resource definitions", () => {
  for (const resource of getTerraformCatalogItems()) {
    const terraformBlockType = resource.nodeDefaults.terraformBlockType ?? "resource";
    const definition = getResourceDefinitionById(resource.id);
    const terraformDefinition = getResourceDefinitionByTerraform(
      terraformBlockType,
      resource.nodeDefaults.type
    );

    assert.ok(
      definition,
      `Missing shared definition for catalog id ${resource.id}`
    );
    assert.ok(
      terraformDefinition,
      `Missing shared Terraform lookup for ${terraformBlockType}/${resource.nodeDefaults.type}`
    );
    assert.equal(definition.terraform.blockType, terraformBlockType);
    assert.equal(definition.terraform.resourceType, resource.nodeDefaults.type);
    assert.equal(resource.cloudProvider, definition.provider);
  }
});

test("resourceCatalog displays every shared Terraform resource definition", () => {
  const catalogDefinitionIds = new Set(getTerraformCatalogItems().map((resource) => resource.id));

  for (const definition of resourceDefinitions) {
    assert.ok(catalogDefinitionIds.has(definition.id), `Missing catalog presentation for ${definition.id}`);
  }
});

test("resource parameter panel capability matches the parameter catalog", () => {
  const capabilityKeys = new Set(resourceDefinitions
    .filter((definition) => definition.capabilities.parameterPanel)
    .map((definition) =>
      createTerraformParameterCatalogKey(
        definition.terraform.blockType,
        definition.terraform.resourceType
      )
    ));

  for (const key of capabilityKeys) {
    assert.ok(terraformParameterCatalog.resources[key]?.length, key);
  }

  for (const key of Object.keys(terraformParameterCatalog.resources)) {
    assert.equal(
      capabilityKeys.has(key) || Object.hasOwn(generatedTerraformAwsParameterCatalog.resources, key),
      true,
      key
    );
  }
});

test("legacy schema-less Terraform items remain enabled in the manual palette", () => {
  for (const id of legacySchemaLessPaletteItemIds) {
    const resource = resourceCatalog.find((candidate) => candidate.id === id);
    const definition = getResourceDefinitionById(id);

    assert.ok(resource, id);
    assert.ok(definition, id);
    assert.equal(definition.capabilities.parameterPanel, false, id);
    assert.equal(resource.enabled, true, id);
  }
});

test("every configurable Terraform definition remains enabled in the manual palette", () => {
  for (const definition of resourceDefinitions.filter(
    (candidate) => candidate.capabilities.parameterPanel
  )) {
    const resource = resourceCatalog.find((candidate) => candidate.id === definition.id);

    assert.ok(resource, definition.id);
    assert.equal(resource.enabled, true, definition.id);
  }
});

test("ECS Task Definition is available as a deployable manual palette resource", () => {
  const definition = getResourceDefinitionById("aws-ecs-task-definition");
  const resource = resourceCatalog.find((item) => item.id === "aws-ecs-task-definition");

  assert.ok(definition);
  assert.ok(resource);
  assert.equal(resource.enabled, true);
  assert.equal(resource.nodeDefaults.type, "aws_ecs_task_definition");
  assert.equal(definition.capabilities.parameterPanel, true);
  assert.equal(definition.capabilities.terraformPreview, true);
  assert.equal(definition.capabilities.terraformSync, true);
});

test("Autoscaling Policy is available through the shared definition and resource catalog", () => {
  const definition = getResourceDefinitionById("aws-autoscaling-policy");
  const resource = resourceCatalog.find((item) => item.id === "aws-autoscaling-policy");

  assert.deepEqual(definition, {
    id: "aws-autoscaling-policy",
    provider: "aws",
    resourceType: "AUTO_SCALING_POLICY",
    terraform: {
      blockType: "resource",
      resourceType: "aws_autoscaling_policy"
    },
    capabilities: {
      parameterPanel: true,
      terraformPreview: true,
      terraformSync: true
    }
  });
  assert.equal(resource?.category, "EC2 Launch & Scaling");
  assert.equal(
    resource?.iconUrl,
    "/Resource-Icons_07312025/Res_Compute/Res_Amazon-EC2_Auto-Scaling_48.svg"
  );
});

test("main parameter catalog exposes scaling, networking, listener, alarm, and policy controls", () => {
  const asg = getParameters("aws_autoscaling_group");
  assertMainParameter(asg, "minSize", "Min");
  assertMainParameter(asg, "desiredCapacity", "Desired");
  assertMainParameter(asg, "maxSize", "Max");
  assert.equal(getParameter(asg, "desiredCapacity").optional, true);
  assert.deepEqual(getParameter(asg, "targetGroupArns").referenceTargetTypes, ["aws_lb_target_group"]);
  assert.equal(getParameter(asg, "targetGroupArns").referenceAttribute, "arn");

  const securityGroup = getParameters("aws_security_group");
  for (const name of ["vpcId", "ingress", "egress"]) {
    assert.equal(getParameter(securityGroup, name).core, true, `Missing main/core ${name}`);
  }
  const ingressChildNames = getParameter(securityGroup, "ingress").children?.map((child) => child.name) ?? [];
  for (const name of ["fromPort", "toPort", "protocol", "cidrBlocks"]) {
    assert.ok(ingressChildNames.includes(name), `Missing nested ingress field ${name}`);
  }

  const listenerDefaultAction = getParameter(getParameters("aws_lb_listener"), "defaultAction");
  assert.equal(listenerDefaultAction.core, true);
  assert.deepEqual(listenerDefaultAction.children?.map((child) => child.name), ["type", "targetGroupArn"]);
  assert.deepEqual(listenerDefaultAction.children?.[0]?.options, ["forward", "redirect", "fixed-response"]);
  assert.deepEqual(listenerDefaultAction.children?.[1]?.referenceTargetTypes, ["aws_lb_target_group"]);
  assert.equal(listenerDefaultAction.children?.[1]?.referenceAttribute, "arn");

  const alarm = getParameters("aws_cloudwatch_metric_alarm");
  assert.equal(getParameter(alarm, "dimensions").inputKind, "key-value");
  assert.equal(getParameter(alarm, "dimensions").core, true);
  assert.equal(getParameter(alarm, "alarmActions").core, true);
  assert.deepEqual(getParameter(alarm, "alarmActions").referenceTargetTypes, [
    "aws_sns_topic",
    "aws_autoscaling_policy"
  ]);
  assert.equal(getParameter(alarm, "alarmActions").referenceAttribute, "arn");

  const policy = getParameters("aws_autoscaling_policy");
  for (const name of [
    "name",
    "autoscalingGroupName",
    "policyType",
    "adjustmentType",
    "scalingAdjustment",
    "cooldown",
    "targetTrackingConfiguration"
  ]) {
    assert.equal(getParameter(policy, name).core, true, `Missing main/core ${name}`);
  }
  assert.deepEqual(getParameter(policy, "autoscalingGroupName").referenceTargetTypes, [
    "aws_autoscaling_group"
  ]);
  assert.equal(getParameter(policy, "autoscalingGroupName").referenceAttribute, "name");
  const tracking = getParameter(policy, "targetTrackingConfiguration");
  assert.deepEqual(tracking.children?.map((child) => child.name), [
    "targetValue",
    "disableScaleIn",
    "predefinedMetricSpecification"
  ]);
  const metric = tracking.children?.[2];
  assert.deepEqual(metric?.children?.map((child) => child.name), [
    "predefinedMetricType",
    "resourceLabel"
  ]);
  assert.deepEqual(metric?.children?.[0]?.options, [
    "ASGAverageCPUUtilization",
    "ASGAverageNetworkIn",
    "ASGAverageNetworkOut",
    "ALBRequestCountPerTarget"
  ]);
  assert.equal(metric?.children?.[1]?.optional, true);
});

test("generated parameter catalog retains override core fields", () => {
  const minSize = generatedTerraformAwsParameterCatalog.resources["aws_autoscaling_group"]?.find(
    (parameter) => parameter.name === "minSize"
  );

  assert.equal(minSize?.core, true);
});

test("resourceCatalog exposes requested missing resources with public icon assets", () => {
  for (const expected of requestedMissingCatalogItems) {
    const resource = resourceCatalog.find((item) => item.id === expected.id);

    assert.ok(resource, `Missing catalog resource: ${expected.id}`);
    assert.equal(resource.nodeDefaults.type, expected.type, expected.id);
    assert.equal(resource.iconUrl, expected.iconUrl, expected.id);
    assert.equal(existsSync(`${publicDirectoryPath}${expected.iconUrl}`), true, expected.iconUrl);
  }
});

test("committed Brainboard captures have exactly one shared and catalog match for all 87 identities", () => {
  const capturedIdentities = readCapturedTerraformIdentities();

  assert.equal(capturedIdentities.length, BRAINBOARD_CAPTURE_TERRAFORM_IDENTITY_COUNT);

  for (const { blockType, resourceType } of capturedIdentities) {
    const key = `${blockType}/${resourceType}`;
    const sharedMatches = resourceDefinitions.filter(
      (definition) =>
        definition.terraform.blockType === blockType &&
        definition.terraform.resourceType === resourceType
    );
    const catalogMatches = resourceCatalog.filter(
      (resource) => createCatalogResourceKey(resource) === key
    );

    assert.equal(sharedMatches.length, 1, `shared:${key}`);
    assert.equal(catalogMatches.length, 1, `catalog:${key}`);
    assert.equal(catalogMatches[0]?.id, sharedMatches[0]?.id, key);
    assert.equal(catalogMatches[0]?.nodeDefaults.type, resourceType, key);
    assert.equal(
      catalogMatches[0]?.nodeDefaults.terraformBlockType ?? "resource",
      blockType,
      key
    );
    assert.ok(catalogMatches[0]?.iconUrl, `Missing icon for ${key}`);
    assert.equal(
      existsSync(`${publicDirectoryPath}${catalogMatches[0]?.iconUrl}`),
      true,
      catalogMatches[0]?.iconUrl
    );
  }
});

test("captured Brainboard resources are configurable from the manual Palette", () => {
  assert.equal(capturedBrainboardPaletteResourceIds.length, 31);

  assert.equal(getTerraformCatalogItems().every((resource) => resource.enabled), true);

  for (const id of capturedBrainboardPaletteResourceIds) {
    const resource = resourceCatalog.find((candidate) => candidate.id === id);
    const definition = getResourceDefinitionById(id);

    assert.ok(resource, id);
    assert.ok(definition, id);
    assert.equal(resource.enabled, true, id);
    assert.equal(definition.capabilities.parameterPanel, true, id);
    assert.ok(
      terraformParameterCatalog.resources[
        createTerraformParameterCatalogKey(
          definition.terraform.blockType,
          definition.terraform.resourceType
        )
      ]?.length,
      `${id} has no parameter catalog`
    );
    assert.equal(definition.capabilities.terraformPreview, true, id);
    assert.equal(definition.capabilities.terraformSync, true, id);
    assert.ok(resource.iconUrl, id);
    assert.equal(existsSync(`${publicDirectoryPath}${resource.iconUrl}`), true, resource.iconUrl);
  }
});

test("IAM Policy data source uses its own block-type-aware parameter schema", () => {
  const parameters = terraformParameterCatalog.resources[
    createTerraformParameterCatalogKey("data", "aws_iam_policy")
  ];

  assert.ok(parameters);
  assert.deepEqual(
    parameters.map(({ name }) => name),
    ["arn", "name", "pathPrefix"]
  );
  assert.equal(parameters.some(({ name }) => name === "policy"), false);
});

test("resourceCatalog IDs and Terraform identities remain unique", () => {
  const ids = resourceCatalog.map((resource) => resource.id);
  const terraformIdentities = getTerraformCatalogItems().map(createCatalogResourceKey);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(terraformIdentities).size, terraformIdentities.length);
});

test("resourceCatalog does not alias classic AWS resources to newer identities", () => {
  assertDistinctCatalogIdentities("aws-elb", "aws-lb");
  assertDistinctCatalogIdentities(
    "aws-cloudfront-origin-access-identity",
    "aws-cloudfront-origin-access-control"
  );
  assertDistinctCatalogIdentities("aws-s3-bucket-object", "aws-s3-object");
  assertDistinctCatalogIdentities("aws-waf-web-acl", "aws-wafv2-web-acl");
});

test("resourceCatalog assigns readable subcategories inside each large resource area", () => {
  assertCatalogCategory("aws-vpc", "VPC Core");
  assertCatalogCategory("aws-route", "Routing & Gateways");
  assertCatalogCategory("aws-lb-target-group-attachment", "Load Balancing");
  assertCatalogCategory("aws-cloudfront-cache-policy", "Edge / CDN");
  assertCatalogCategory("aws-route53-zone", "DNS");
  assertCatalogCategory("aws-s3-public-access-block", "S3 Controls");
  assertCatalogCategory("aws-volume-attachment", "EBS");
  assertCatalogCategory("aws-efs-mount-target", "EFS");
  assertCatalogCategory("aws-rds-cluster-instance", "RDS Cluster");
  assertCatalogCategory("aws-elasticache-subnet-group", "ElastiCache");
  assertCatalogCategory("aws-iam-role-policy-attachment", "IAM");
  assertCatalogCategory("aws-acm-certificate", "Certificates");
  assertCatalogCategory("aws-cognito-user-pool", "Identity");
  assertCatalogCategory("aws-wafv2-web-acl-association", "Web Protection");
  assertCatalogCategory("aws-api-gateway-deployment", "API Gateway REST");
  assertCatalogCategory("aws-api-gateway-v2-route", "API Gateway v2");
  assertCatalogCategory("aws-eventbridge-target", "EventBridge / Scheduler");
  assertCatalogCategory("aws-sns-topic-subscription", "Messaging");
  assertCatalogCategory("aws-cloudtrail", "Observability");
  assertCatalogCategory("aws-config-rule", "Governance / Config");
  assertCatalogCategory("aws-ecs-capacity-provider", "ECS");
  assertCatalogCategory("aws-eks-addon", "EKS");
});

test("RDS parameters include the read replica source field", () => {
  const rdsParameters = terraformParameterCatalog.resources["aws_db_instance"] ?? [];
  const readReplicaField = rdsParameters.find((parameter) => parameter.name === "replicateSourceDb");

  assert.ok(readReplicaField, "Missing aws_db_instance.replicateSourceDb");
  assert.equal(readReplicaField.terraformName, "replicate_source_db");
});

test("RDS parameters include the expanded main parameter example from the JH inventory", () => {
  const rdsParameters = terraformParameterCatalog.resources["aws_db_instance"] ?? [];
  const rdsParameterNames = new Set(rdsParameters.map((parameter) => parameter.name));

  for (const parameterName of [
    "backupRetentionPeriod",
    "caCertIdentifier",
    "deletionProtection",
    "enabledCloudwatchLogsExports",
    "iamDatabaseAuthenticationEnabled",
    "maxAllocatedStorage",
    "multiAz",
    "storageEncrypted",
    "storageType"
  ]) {
    assert.ok(rdsParameterNames.has(parameterName), `Missing aws_db_instance.${parameterName}`);
  }

  const iamAuthField = rdsParameters.find(
    (parameter) => parameter.name === "iamDatabaseAuthenticationEnabled"
  );

  assert.equal(iamAuthField?.terraformName, "iam_database_authentication_enabled");
});

test("parameter catalog covers Terraform CLI audit required right-panel paths", () => {
  const requiredPathsByResource: Record<string, string[]> = {
    aws_cloudfront_distribution: [
      "default_cache_behavior",
      "default_cache_behavior.allowed_methods",
      "default_cache_behavior.cached_methods",
      "default_cache_behavior.target_origin_id",
      "default_cache_behavior.viewer_protocol_policy",
      "enabled",
      "origin",
      "origin.domain_name",
      "origin.origin_id",
      "restrictions",
      "restrictions.geo_restriction",
      "restrictions.geo_restriction.restriction_type",
      "viewer_certificate"
    ],
    aws_wafv2_web_acl: [
      "default_action",
      "visibility_config",
      "visibility_config.cloudwatch_metrics_enabled",
      "visibility_config.metric_name",
      "visibility_config.sampled_requests_enabled"
    ],
    aws_s3_bucket_versioning: ["versioning_configuration"],
    aws_s3_bucket_server_side_encryption_configuration: ["rule"],
    aws_codebuild_project: [
      "artifacts",
      "artifacts.type",
      "environment",
      "environment.compute_type",
      "environment.image",
      "environment.type",
      "source",
      "source.type"
    ],
    aws_codepipeline: [
      "artifact_store",
      "artifact_store.location",
      "artifact_store.type",
      "stage",
      "stage.action",
      "stage.action.category",
      "stage.action.name",
      "stage.action.owner",
      "stage.action.provider",
      "stage.action.version",
      "stage.name"
    ],
    aws_ecs_task_definition: ["container_definitions"],
    aws_eks_cluster: ["vpc_config", "vpc_config.subnet_ids"],
    aws_cloudfront_cache_policy: [
      "parameters_in_cache_key_and_forwarded_to_origin",
      "parameters_in_cache_key_and_forwarded_to_origin.cookies_config",
      "parameters_in_cache_key_and_forwarded_to_origin.cookies_config.cookie_behavior",
      "parameters_in_cache_key_and_forwarded_to_origin.headers_config",
      "parameters_in_cache_key_and_forwarded_to_origin.query_strings_config",
      "parameters_in_cache_key_and_forwarded_to_origin.query_strings_config.query_string_behavior"
    ],
    aws_cloudfront_origin_request_policy: [
      "cookies_config",
      "cookies_config.cookie_behavior",
      "headers_config",
      "query_strings_config",
      "query_strings_config.query_string_behavior"
    ],
    aws_scheduler_schedule: [
      "flexible_time_window",
      "flexible_time_window.mode",
      "target",
      "target.arn",
      "target.role_arn"
    ],
    aws_eks_node_group: [
      "scaling_config",
      "scaling_config.desired_size",
      "scaling_config.max_size",
      "scaling_config.min_size"
    ],
    aws_config_config_rule: ["source", "source.owner"],
    aws_xray_sampling_rule: ["resource_arn"]
  };

  for (const [resourceType, requiredPaths] of Object.entries(requiredPathsByResource)) {
    const parameterPaths = collectParameterTerraformPaths(getParameters(resourceType));

    for (const requiredPath of requiredPaths) {
      assert.ok(
        parameterPaths.has(requiredPath),
        `Missing ${resourceType}.${requiredPath} from the right-panel parameter catalog`
      );
    }
  }
});

test("Terraform CLI audit sample defaults use provider-valid catalog values", () => {
  const codebuild = getParameters("aws_codebuild_project");
  assert.match(String(getParameter(codebuild, "serviceRole").placeholder), /^arn:aws:iam::/);

  const codepipeline = getParameters("aws_codepipeline");
  assert.equal(getParameter(codepipeline, "stage").type, "list");

  const ecsTaskDefinition = getParameters("aws_ecs_task_definition");
  assert.deepEqual(getParameter(ecsTaskDefinition, "requiresCompatibilities").options, [
    "FARGATE",
    "EC2",
    "EXTERNAL",
    "MANAGED_INSTANCES"
  ]);

  const xraySamplingRule = getParameters("aws_xray_sampling_rule");
  assert.equal(getParameter(xraySamplingRule, "priority").placeholder, "1000");
});

function getResourceSize(resourceType: string) {
  const resource = resourceCatalog.find((item) => item.nodeDefaults.type === resourceType);

  assert.ok(resource, `Missing catalog resource: ${resourceType}`);

  return resource.nodeDefaults.size;
}

function getCatalogDefaults(resourceId: string) {
  const resource = resourceCatalog.find((item) => item.id === resourceId);

  assert.ok(resource, `Missing catalog resource: ${resourceId}`);

  return resource.nodeDefaults;
}

function assertCatalogCategory(resourceId: string, expectedCategory: string) {
  const resource = resourceCatalog.find((item) => item.id === resourceId);

  assert.ok(resource, `Missing catalog resource: ${resourceId}`);
  assert.equal(resource.category, expectedCategory, resourceId);
}

function assertDistinctCatalogIdentities(firstId: string, secondId: string) {
  const first = resourceCatalog.find((resource) => resource.id === firstId);
  const second = resourceCatalog.find((resource) => resource.id === secondId);

  assert.ok(first, firstId);
  assert.ok(second, secondId);
  assert.notEqual(createCatalogResourceKey(first), createCatalogResourceKey(second));
}

function getTerraformCatalogItems() {
  return resourceCatalog.filter((resource) => terraformDefinitionKeys.has(createCatalogResourceKey(resource)));
}

function getParameters(resourceType: string) {
  const parameters = terraformParameterCatalog.resources[resourceType];

  assert.ok(parameters, `Missing parameter catalog for ${resourceType}`);
  return parameters;
}

function getParameter(
  parameters: readonly NonNullable<(typeof terraformParameterCatalog.resources)[string]>[number][],
  name: string
) {
  const parameter = parameters.find((candidate) => candidate.name === name);

  assert.ok(parameter, `Missing parameter ${name}`);
  return parameter;
}

function assertMainParameter(
  parameters: readonly NonNullable<(typeof terraformParameterCatalog.resources)[string]>[number][],
  name: string,
  label: string
) {
  const parameter = getParameter(parameters, name);

  assert.equal(parameter.label, label);
  assert.equal(parameter.core, true, `Missing main/core ${name}`);
}

function collectParameterTerraformPaths(
  parameters: readonly NonNullable<(typeof terraformParameterCatalog.resources)[string]>[number][],
  parentPath = ""
): Set<string> {
  const paths = new Set<string>();

  for (const parameter of parameters) {
    const path = parentPath
      ? `${parentPath}.${parameter.terraformName}`
      : parameter.terraformName;

    paths.add(path);

    for (const childPath of collectParameterTerraformPaths(parameter.children ?? [], path)) {
      paths.add(childPath);
    }
  }

  return paths;
}

function createCatalogResourceKey(resource: (typeof resourceCatalog)[number]): string {
  return `${resource.nodeDefaults.terraformBlockType ?? "resource"}/${resource.nodeDefaults.type}`;
}

function readCapturedTerraformIdentities(): Array<{
  readonly blockType: "data" | "resource";
  readonly resourceType: string;
}> {
  const identityKeys = new Set<string>();

  for (const fileName of readdirSync(brainboardCaptureDirectoryPath).sort()) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    const capture = JSON.parse(
      readFileSync(`${brainboardCaptureDirectoryPath}/${fileName}`, "utf8")
    ) as {
      readonly terraform?: {
        readonly resourceAddresses?: readonly string[] | undefined;
      } | null;
    };

    for (const address of capture.terraform?.resourceAddresses ?? []) {
      identityKeys.add(createTerraformIdentityKeyFromAddress(address));
    }
  }

  return [...identityKeys].sort().map((key) => {
    const separatorIndex = key.indexOf("/");
    const blockType = key.slice(0, separatorIndex);

    assert.ok(blockType === "data" || blockType === "resource", key);

    return {
      blockType,
      resourceType: key.slice(separatorIndex + 1)
    };
  });
}

function createTerraformIdentityKeyFromAddress(address: string): string {
  const segments = address.split(".");

  if (segments[0] === "data") {
    assert.ok(segments[1], `Invalid Terraform data address: ${address}`);
    return `data/${segments[1]}`;
  }

  assert.ok(segments[0], `Invalid Terraform resource address: ${address}`);
  return `resource/${segments[0]}`;
}
