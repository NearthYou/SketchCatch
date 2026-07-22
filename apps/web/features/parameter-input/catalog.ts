import {
  createTerraformParameterCatalogKey,
  resourceDefinitions
} from "@sketchcatch/types/resource-definitions";
import { terraformAwsParameterCatalog as generatedTerraformAwsParameterCatalog } from "./catalog.generated";
import type { ParameterCatalog, ParameterCatalogDefinition } from "./catalog.generated";

export type { ParameterCatalog, ParameterCatalogDefinition } from "./catalog.generated";

type FieldInput = Omit<
  ParameterCatalogDefinition,
  "computed" | "inputKind" | "optional" | "required" | "sensitive" | "type"
> &
  Partial<
    Pick<
      ParameterCatalogDefinition,
      "computed" | "core" | "inputKind" | "optional" | "required" | "sensitive" | "type"
    >
  >;

type CatalogPatch = {
  readonly definitions: readonly ParameterCatalogDefinition[];
  readonly removeNames?: readonly string[] | undefined;
};

const commonTags = field({
  name: "tags",
  terraformName: "tags",
  label: "Tags",
  type: "map",
  inputKind: "key-value",
  core: true,
  description: "AWS 콘솔과 비용 추적에서 리소스를 구분하기 위한 key-value 태그입니다."
});

const blockTypeParameterDefinitions: Record<
  string,
  readonly ParameterCatalogDefinition[]
> = {
  [createTerraformParameterCatalogKey("data", "aws_ssm_parameter")]: [
    required("name", "name", "Parameter name", "/sketchcatch/audit"),
    boolean("withDecryption", "with_decryption", "Decrypt SecureString")
  ],
  [createTerraformParameterCatalogKey("data", "aws_ec2_managed_prefix_list")]: [
    required(
      "name",
      "name",
      "Managed prefix list name",
      "com.amazonaws.ap-northeast-2.s3"
    )
  ],
  [createTerraformParameterCatalogKey("data", "aws_iam_policy")]: [
    core(
      "arn",
      "arn",
      "Policy ARN",
      "arn:aws:iam::aws:policy/IAMUserChangePassword"
    ),
    field({
      name: "name",
      terraformName: "name",
      label: "Policy name"
    }),
    field({
      name: "pathPrefix",
      terraformName: "path_prefix",
      label: "Path prefix",
      placeholder: "/"
    })
  ]
};

const priorityResourceFallbacks: Record<string, readonly ParameterCatalogDefinition[]> = {
  aws_api_gateway_integration_response: [
    ref("restApiId", "rest_api_id", "REST API", ["aws_api_gateway_rest_api"]),
    ref("resourceId", "resource_id", "API resource", ["aws_api_gateway_resource"]),
    ref(
      "httpMethod",
      "http_method",
      "HTTP method",
      ["aws_api_gateway_method"],
      true,
      "http_method"
    ),
    required("statusCode", "status_code", "Status code", "200")
  ],
  aws_api_gateway_method_response: [
    ref("restApiId", "rest_api_id", "REST API", ["aws_api_gateway_rest_api"]),
    ref("resourceId", "resource_id", "API resource", ["aws_api_gateway_resource"]),
    ref(
      "httpMethod",
      "http_method",
      "HTTP method",
      ["aws_api_gateway_method"],
      true,
      "http_method"
    ),
    required("statusCode", "status_code", "Status code", "200")
  ],
  aws_budgets_budget: [
    core("name", "name", "Budget name", "monthly-cost"),
    select("budgetType", "budget_type", "Budget type", ["COST", "USAGE"], true),
    select("timeUnit", "time_unit", "Time unit", ["MONTHLY", "QUARTERLY", "ANNUALLY"], true),
    required("limitAmount", "limit_amount", "Limit amount", "100"),
    required("limitUnit", "limit_unit", "Limit unit", "USD")
  ],
  aws_cloudfront_origin_access_identity: [
    core("comment", "comment", "Comment", "SketchCatch CloudFront access identity")
  ],
  aws_docdb_cluster: [
    core("clusterIdentifier", "cluster_identifier", "Cluster identifier", "sketchcatch-docdb"),
    core("engine", "engine", "Engine", "docdb"),
    boolean("skipFinalSnapshot", "skip_final_snapshot", "Skip final snapshot"),
    commonTags
  ],
  aws_dynamodb_global_table: [
    required("name", "name", "Table name", "sketchcatch-global-table"),
    nestedBlock(
      "replica",
      "replica",
      "Replica regions",
      [required("regionName", "region_name", "Region", "us-west-2")],
      true,
      true
    )
  ],
  aws_elastic_beanstalk_application: [
    required("name", "name", "Application name", "sketchcatch-app"),
    core("description", "description", "Description"),
    commonTags
  ],
  aws_elastic_beanstalk_environment: [
    required("name", "name", "Environment name", "sketchcatch-env"),
    ref(
      "application",
      "application",
      "Elastic Beanstalk application",
      ["aws_elastic_beanstalk_application"],
      true,
      "name"
    ),
    core("solutionStackName", "solution_stack_name", "Solution stack"),
    commonTags
  ],
  aws_elb: [
    core("name", "name", "Load balancer name", "sketchcatch-elb"),
    nestedBlock(
      "healthCheck",
      "health_check",
      "Health check",
      [
        number("healthyThreshold", "healthy_threshold", "Healthy threshold", true, "2"),
        number("interval", "interval", "Interval", true, "30"),
        required("target", "target", "Target", "HTTP:80/"),
        number("timeout", "timeout", "Timeout", true, "3"),
        number("unhealthyThreshold", "unhealthy_threshold", "Unhealthy threshold", true, "2")
      ],
      false
    ),
    nestedBlock(
      "listener",
      "listener",
      "Listeners",
      [
        number("instancePort", "instance_port", "Instance port", true, "80"),
        select("instanceProtocol", "instance_protocol", "Instance protocol", ["http", "https", "tcp", "ssl"], true),
        number("lbPort", "lb_port", "Load balancer port", true, "80"),
        select("lbProtocol", "lb_protocol", "Load balancer protocol", ["http", "https", "tcp", "ssl"], true)
      ],
      true,
      true
    ),
    refList("subnets", "subnets", "Subnets", ["aws_subnet"], false),
    refList("securityGroups", "security_groups", "Security groups", ["aws_security_group"], false),
    commonTags
  ],
  aws_flow_log: [
    ref("vpcId", "vpc_id", "VPC", ["aws_vpc"]),
    select("trafficType", "traffic_type", "Traffic type", ["ALL", "ACCEPT", "REJECT"], true),
    field({
      name: "logDestination",
      terraformName: "log_destination",
      label: "Log destination ARN"
    }),
    select("logDestinationType", "log_destination_type", "Destination type", ["cloud-watch-logs", "s3", "kinesis-data-firehose"]),
    field({ name: "iamRoleArn", terraformName: "iam_role_arn", label: "IAM role ARN" }),
    commonTags
  ],
  aws_fsx_lustre_file_system: [
    refList("subnetIds", "subnet_ids", "Subnets", ["aws_subnet"], true),
    number("storageCapacity", "storage_capacity", "Storage capacity (GiB)", false, "1200"),
    select("deploymentType", "deployment_type", "Deployment type", ["SCRATCH_1", "SCRATCH_2", "PERSISTENT_1", "PERSISTENT_2"]),
    commonTags
  ],
  aws_iam_group: [
    required("name", "name", "Group name", "sketchcatch-users"),
    core("path", "path", "Path", "/")
  ],
  aws_iam_group_policy_attachment: [
    ref("group", "group", "IAM group", ["aws_iam_group"], true, "name"),
    ref("policyArn", "policy_arn", "IAM policy", ["aws_iam_policy"], true, "arn")
  ],
  aws_iam_user: [
    required("name", "name", "User name", "sketchcatch-user"),
    core("path", "path", "Path", "/"),
    commonTags
  ],
  aws_iam_user_group_membership: [
    ref("user", "user", "IAM user", ["aws_iam_user"], true, "name"),
    refList("groups", "groups", "IAM groups", ["aws_iam_group"], true, "name")
  ],
  aws_iam_user_login_profile: [
    ref("user", "user", "IAM user", ["aws_iam_user"], true, "name"),
    number("passwordLength", "password_length", "Password length", false, "20"),
    boolean("passwordResetRequired", "password_reset_required", "Password reset required")
  ],
  aws_launch_configuration: [
    core("name", "name", "Launch configuration name", "sketchcatch-launch-config"),
    required("imageId", "image_id", "AMI ID", "ami-0123456789abcdef0"),
    required("instanceType", "instance_type", "Instance type", "t3.micro"),
    refList("securityGroups", "security_groups", "Security groups", ["aws_security_group"], false),
    boolean("associatePublicIpAddress", "associate_public_ip_address", "Associate public IP")
  ],
  aws_main_route_table_association: [
    ref("vpcId", "vpc_id", "VPC", ["aws_vpc"]),
    ref("routeTableId", "route_table_id", "Route table", ["aws_route_table"])
  ],
  aws_network_interface: [
    ref("subnetId", "subnet_id", "Subnet", ["aws_subnet"]),
    refList("securityGroups", "security_groups", "Security groups", ["aws_security_group"], false),
    list("privateIps", "private_ips", "Private IPs"),
    core("description", "description", "Description"),
    commonTags
  ],
  aws_organizations_account: [
    required("name", "name", "Account name", "sketchcatch-account"),
    required("email", "email", "Account email", "aws-account@example.com"),
    core("roleName", "role_name", "Role name", "OrganizationAccountAccessRole"),
    core("parentId", "parent_id", "Parent organization unit ID", "r-abcd"),
    boolean("closeOnDeletion", "close_on_deletion", "Close on deletion"),
    commonTags
  ],
  aws_s3_bucket_acl: [
    ref("bucket", "bucket", "S3 bucket", ["aws_s3_bucket"]),
    select("acl", "acl", "ACL", ["private", "public-read", "authenticated-read"], true)
  ],
  aws_s3_bucket_logging: [
    ref("bucket", "bucket", "Source bucket", ["aws_s3_bucket"]),
    ref("targetBucket", "target_bucket", "Target bucket", ["aws_s3_bucket"], true, "id"),
    required("targetPrefix", "target_prefix", "Target prefix", "logs/")
  ],
  aws_s3_bucket_notification: [
    ref("bucket", "bucket", "S3 bucket", ["aws_s3_bucket"]),
    boolean("eventbridge", "eventbridge", "Enable EventBridge")
  ],
  aws_s3_bucket_object: [
    ref("bucket", "bucket", "S3 bucket", ["aws_s3_bucket"]),
    required("key", "key", "Object key", "example.txt"),
    core("content", "content", "Content", "SketchCatch object"),
    select("acl", "acl", "ACL", ["private", "public-read"])
  ],
  aws_s3_bucket_replication_configuration: [
    ref("bucket", "bucket", "Source bucket", ["aws_s3_bucket"]),
    ref("role", "role", "Replication IAM role", ["aws_iam_role"], true, "arn"),
    nestedBlock(
      "rule",
      "rule",
      "Replication rules",
      [
        core("id", "id", "Rule ID", "replicate-all"),
        select("status", "status", "Status", ["Enabled", "Disabled"], true),
        nestedBlock(
          "destination",
          "destination",
          "Destination",
          [ref("bucket", "bucket", "Destination bucket", ["aws_s3_bucket"], true, "arn")]
        )
      ],
      true,
      true
    )
  ],
  aws_ses_email_identity: [
    required("email", "email", "Email address", "notifications@example.com")
  ],
  aws_vpc_peering_connection_accepter: [
    ref(
      "vpcPeeringConnectionId",
      "vpc_peering_connection_id",
      "VPC peering connection",
      ["aws_vpc_peering_connection"]
    ),
    boolean("autoAccept", "auto_accept", "Auto accept"),
    commonTags
  ],
  aws_waf_ipset: [
    required("name", "name", "IP set name", "sketchcatch-ip-set"),
    nestedBlock(
      "ipSetDescriptors",
      "ip_set_descriptors",
      "IP descriptors",
      [
        select("type", "type", "Type", ["IPV4", "IPV6"], true),
        required("value", "value", "CIDR", "192.0.2.0/24")
      ],
      false,
      true
    )
  ],
  aws_waf_rule: [
    required("name", "name", "Rule name", "sketchcatch-rule"),
    required("metricName", "metric_name", "Metric name", "SketchCatchRule")
  ],
  aws_waf_web_acl: [
    required("name", "name", "Web ACL name", "sketchcatch-web-acl"),
    required("metricName", "metric_name", "Metric name", "SketchCatchWebAcl"),
    nestedBlock(
      "defaultAction",
      "default_action",
      "Default action",
      [select("type", "type", "Action", ["ALLOW", "BLOCK"], true)]
    )
  ],
  aws_amplify_app: [
    required("name", "name", "App name"),
    core("description", "description", "Description"),
    core("repository", "repository", "Repository URL")
  ],
  kubernetes_namespace: [
    nestedBlock("metadata", "metadata", "Metadata", [
      required("name", "name", "Name")
    ], true)
  ],
  kubernetes_deployment: [
    nestedBlock("metadata", "metadata", "Metadata", [
      required("name", "name", "Name")
    ], true),
    nestedBlock("spec", "spec", "Deployment spec", [], true)
  ],
  kubernetes_service: [
    nestedBlock("metadata", "metadata", "Metadata", [
      required("name", "name", "Name")
    ], true),
    nestedBlock("spec", "spec", "Service spec", [], true)
  ],
  aws_route: [
    ref("routeTableId", "route_table_id", "Route table", ["aws_route_table"]),
    core("destinationCidrBlock", "destination_cidr_block", "Destination CIDR", "0.0.0.0/0"),
    ref("gatewayId", "gateway_id", "Gateway", ["aws_internet_gateway"], false),
    ref("natGatewayId", "nat_gateway_id", "NAT gateway", ["aws_nat_gateway"], false),
    ref(
      "vpcPeeringConnectionId",
      "vpc_peering_connection_id",
      "VPC peering",
      ["aws_vpc_peering_connection"],
      false
    )
  ],
  aws_network_acl: [
    ref("vpcId", "vpc_id", "VPC", ["aws_vpc"]),
    list("subnetIds", "subnet_ids", "Subnets"),
    commonTags
  ],
  aws_network_acl_rule: [
    ref("networkAclId", "network_acl_id", "Network ACL", ["aws_network_acl"]),
    number("ruleNumber", "rule_number", "Rule number", true, "100"),
    select("ruleAction", "rule_action", "Rule action", ["allow", "deny"], true),
    select("protocol", "protocol", "Protocol", ["tcp", "udp", "icmp", "-1"], true),
    boolean("egress", "egress", "Egress"),
    core("cidrBlock", "cidr_block", "CIDR block", "0.0.0.0/0"),
    number("fromPort", "from_port", "From port", false, "443"),
    number("toPort", "to_port", "To port", false, "443")
  ],
  aws_cloudfront_origin_access_control: [
    required("name", "name", "Name"),
    select(
      "originAccessControlOriginType",
      "origin_access_control_origin_type",
      "Origin type",
      ["s3", "mediastore", "mediapackagev2", "lambda"],
      true
    ),
    select(
      "signingBehavior",
      "signing_behavior",
      "Signing behavior",
      ["always", "never", "no-override"],
      true
    ),
    select("signingProtocol", "signing_protocol", "Signing protocol", ["sigv4"], true)
  ],
  aws_cloudfront_cache_policy: [
    required("name", "name", "Name"),
    core("comment", "comment", "Comment"),
    number("defaultTtl", "default_ttl", "Default TTL", false, "86400"),
    number("maxTtl", "max_ttl", "Max TTL", false, "31536000"),
    number("minTtl", "min_ttl", "Min TTL", false, "0")
  ],
  aws_cloudfront_origin_request_policy: [
    required("name", "name", "Name"),
    core("comment", "comment", "Comment")
  ],
  aws_route53_record: [
    ref("zoneId", "zone_id", "Hosted zone", ["aws_route53_zone"]),
    required("name", "name", "Record name"),
    select("type", "type", "Record type", ["A", "AAAA", "CNAME", "TXT", "MX", "NS"], true),
    number("ttl", "ttl", "TTL", false, "300"),
    list("records", "records", "Records")
  ],
  aws_route53_zone: [
    required("name", "name", "Zone name", "example.com"),
    core("comment", "comment", "Comment"),
    commonTags
  ],
  aws_wafv2_web_acl: [
    required("name", "name", "Name"),
    select("scope", "scope", "Scope", ["REGIONAL", "CLOUDFRONT"], true),
    core("description", "description", "Description"),
    commonTags
  ],
  aws_wafv2_web_acl_association: [
    required("resourceArn", "resource_arn", "Resource ARN"),
    required("webAclArn", "web_acl_arn", "Web ACL ARN")
  ],
  aws_vpc_peering_connection: [
    ref("vpcId", "vpc_id", "Requester VPC", ["aws_vpc"]),
    ref("peerVpcId", "peer_vpc_id", "Peer VPC", ["aws_vpc"]),
    core("peerOwnerId", "peer_owner_id", "Peer owner ID"),
    boolean("autoAccept", "auto_accept", "Auto accept"),
    commonTags
  ],
  aws_iam_role_policy: [
    ref("role", "role", "Role", ["aws_iam_role"], true, "name"),
    required("policy", "policy", "Policy JSON")
  ],
  aws_iam_role_policy_attachment: [
    ref("role", "role", "Role", ["aws_iam_role"], true, "name"),
    ref("policyArn", "policy_arn", "Policy ARN", ["aws_iam_policy"], true, "arn")
  ],
  aws_kms_alias: [
    required("name", "name", "Alias name", "alias/app-key"),
    ref("targetKeyId", "target_key_id", "Target KMS key", ["aws_kms_key"])
  ],
  aws_lb: [
    core("name", "name", "Name"),
    select("loadBalancerType", "load_balancer_type", "Type", ["application", "network", "gateway"]),
    list("subnets", "subnets", "Subnets"),
    list("securityGroups", "security_groups", "Security groups"),
    commonTags
  ],
  aws_lb_target_group: [
    core("name", "name", "Name"),
    number("port", "port", "Port", false, "80"),
    select("protocol", "protocol", "Protocol", ["HTTP", "HTTPS", "TCP", "TLS", "UDP"]),
    select("targetType", "target_type", "Target type", ["instance", "ip", "lambda", "alb"]),
    ref("vpcId", "vpc_id", "VPC", ["aws_vpc"], false),
    number(
      "deregistrationDelay",
      "deregistration_delay",
      "Deregistration delay",
      false,
      "300"
    ),
    nestedBlock("healthCheck", "health_check", "Health check", [
      boolean("enabled", "enabled", "Enabled"),
      select("protocol", "protocol", "Protocol", ["HTTP", "HTTPS", "TCP", "TLS", "UDP"]),
      core("port", "port", "Port", "traffic-port"),
      core("path", "path", "Path", "/health"),
      core("matcher", "matcher", "Matcher", "200"),
      number("interval", "interval", "Interval", false, "15"),
      number("timeout", "timeout", "Timeout", false, "5"),
      number("healthyThreshold", "healthy_threshold", "Healthy threshold", false, "2"),
      number("unhealthyThreshold", "unhealthy_threshold", "Unhealthy threshold", false, "2")
    ], false),
    commonTags
  ],
  aws_lb_target_group_attachment: [
    ref("targetGroupArn", "target_group_arn", "Target group", ["aws_lb_target_group"], true, "arn"),
    required("targetId", "target_id", "Target ID"),
    number("port", "port", "Port", false, "80")
  ],
  aws_lb_listener: [
    ref("loadBalancerArn", "load_balancer_arn", "Load balancer", ["aws_lb"], true, "arn"),
    number("port", "port", "Port", true, "443"),
    select("protocol", "protocol", "Protocol", ["HTTP", "HTTPS", "TCP", "TLS"], true),
    ref("certificateArn", "certificate_arn", "Certificate", ["aws_acm_certificate"], false, "arn")
  ],
  aws_s3_object: [
    ref("bucket", "bucket", "Bucket", ["aws_s3_bucket"], true, "id"),
    required("key", "key", "Object key"),
    core("source", "source", "Source path"),
    core("contentType", "content_type", "Content type")
  ],
  aws_s3_bucket_policy: [
    ref("bucket", "bucket", "Bucket", ["aws_s3_bucket"], true, "id"),
    required("policy", "policy", "Policy JSON")
  ],
  aws_volume_attachment: [
    required("deviceName", "device_name", "Device name", "/dev/sdf"),
    ref("volumeId", "volume_id", "EBS volume", ["aws_ebs_volume"]),
    ref("instanceId", "instance_id", "EC2 instance", ["aws_instance"])
  ],
  aws_efs_file_system: [
    core("creationToken", "creation_token", "Creation token"),
    boolean("encrypted", "encrypted", "Encrypted"),
    select("performanceMode", "performance_mode", "Performance mode", ["generalPurpose", "maxIO"]),
    select("throughputMode", "throughput_mode", "Throughput mode", [
      "bursting",
      "provisioned",
      "elastic"
    ]),
    commonTags
  ],
  aws_efs_mount_target: [
    ref("fileSystemId", "file_system_id", "EFS file system", ["aws_efs_file_system"]),
    ref("subnetId", "subnet_id", "Subnet", ["aws_subnet"]),
    list("securityGroups", "security_groups", "Security groups")
  ],
  aws_efs_access_point: [
    ref("fileSystemId", "file_system_id", "EFS file system", ["aws_efs_file_system"]),
    commonTags
  ],
  aws_rds_cluster: [
    core("clusterIdentifier", "cluster_identifier", "Cluster identifier"),
    select(
      "engine",
      "engine",
      "Engine",
      ["aurora-mysql", "aurora-postgresql", "mysql", "postgres"],
      true
    ),
    core("databaseName", "database_name", "Database name"),
    core("masterUsername", "master_username", "Master username"),
    boolean("storageEncrypted", "storage_encrypted", "Storage encrypted"),
    boolean("deletionProtection", "deletion_protection", "Deletion protection"),
    commonTags
  ],
  aws_rds_cluster_instance: [
    core("identifier", "identifier", "Identifier"),
    ref(
      "clusterIdentifier",
      "cluster_identifier",
      "RDS cluster",
      ["aws_rds_cluster"],
      true,
      "cluster_identifier"
    ),
    required("instanceClass", "instance_class", "Instance class", "db.t3.medium"),
    select("engine", "engine", "Engine", ["aurora-mysql", "aurora-postgresql"], true),
    commonTags
  ],
  aws_elasticache_replication_group: [
    required("replicationGroupId", "replication_group_id", "Replication group ID"),
    core("description", "description", "Description"),
    core("nodeType", "node_type", "Node type", "cache.t4g.micro"),
    number("numCacheClusters", "num_cache_clusters", "Cache clusters", false, "1"),
    boolean("automaticFailoverEnabled", "automatic_failover_enabled", "Automatic failover")
  ],
  aws_elasticache_subnet_group: [
    required("name", "name", "Name"),
    list("subnetIds", "subnet_ids", "Subnets", true),
    core("description", "description", "Description")
  ],
  aws_elasticache_parameter_group: [
    required("name", "name", "Name"),
    required("family", "family", "Family", "redis7"),
    core("description", "description", "Description")
  ],
  aws_secretsmanager_secret: [
    core("name", "name", "Name"),
    core("description", "description", "Description"),
    ref("kmsKeyId", "kms_key_id", "KMS key", ["aws_kms_key"], false),
    commonTags
  ],
  aws_secretsmanager_secret_version: [
    ref("secretId", "secret_id", "Secret", ["aws_secretsmanager_secret"], true, "id"),
    field({
      name: "secretString",
      terraformName: "secret_string",
      label: "Secret string",
      required: true,
      sensitive: true,
      description:
        "Terraform state에 저장될 수 있으므로 실제 운영 secret 입력은 승인된 경로에서만 사용하세요."
    })
  ],
  aws_lambda_alias: [
    required("name", "name", "Alias name"),
    ref(
      "functionName",
      "function_name",
      "Lambda function",
      ["aws_lambda_function"],
      true,
      "function_name"
    ),
    required("functionVersion", "function_version", "Function version")
  ],
  aws_lambda_event_source_mapping: [
    required("eventSourceArn", "event_source_arn", "Event source ARN"),
    ref(
      "functionName",
      "function_name",
      "Lambda function",
      ["aws_lambda_function"],
      true,
      "function_name"
    ),
    number("batchSize", "batch_size", "Batch size", false, "10"),
    boolean("enabled", "enabled", "Enabled")
  ],
  aws_apigatewayv2_api: [
    required("name", "name", "Name"),
    select("protocolType", "protocol_type", "Protocol type", ["HTTP", "WEBSOCKET"], true)
  ],
  aws_apigatewayv2_route: [
    ref("apiId", "api_id", "API", ["aws_apigatewayv2_api"], true, "id"),
    required("routeKey", "route_key", "Route key", "GET /items"),
    core("target", "target", "Target")
  ],
  aws_apigatewayv2_integration: [
    ref("apiId", "api_id", "API", ["aws_apigatewayv2_api"], true, "id"),
    select(
      "integrationType",
      "integration_type",
      "Integration type",
      ["AWS_PROXY", "HTTP_PROXY", "MOCK"],
      true
    ),
    core("integrationUri", "integration_uri", "Integration URI")
  ],
  aws_apigatewayv2_stage: [
    ref("apiId", "api_id", "API", ["aws_apigatewayv2_api"], true, "id"),
    required("name", "name", "Stage name", "$default"),
    boolean("autoDeploy", "auto_deploy", "Auto deploy")
  ],
  aws_api_gateway_deployment: [
    ref("restApiId", "rest_api_id", "REST API", ["aws_api_gateway_rest_api"], true, "id"),
    core("stageName", "stage_name", "Stage name"),
    core("description", "description", "Description")
  ],
  aws_api_gateway_stage: [
    ref("restApiId", "rest_api_id", "REST API", ["aws_api_gateway_rest_api"], true, "id"),
    ref("deploymentId", "deployment_id", "Deployment", ["aws_api_gateway_deployment"], true, "id"),
    required("stageName", "stage_name", "Stage name")
  ],
  aws_cloudwatch_log_stream: [
    required("name", "name", "Stream name"),
    ref("logGroupName", "log_group_name", "Log group", ["aws_cloudwatch_log_group"], true, "name")
  ],
  aws_cloudwatch_log_resource_policy: [
    required("policyName", "policy_name", "Policy name"),
    required("policyDocument", "policy_document", "Policy document")
  ],
  aws_cloudwatch_event_permission: [
    required("principal", "principal", "Principal"),
    required("statementId", "statement_id", "Statement ID"),
    core("action", "action", "Action", "events:PutEvents")
  ],
  aws_scheduler_schedule: [
    required("name", "name", "Name"),
    required("scheduleExpression", "schedule_expression", "Schedule expression", "rate(5 minutes)"),
    select("state", "state", "State", ["ENABLED", "DISABLED"])
  ],
  aws_codebuild_project: [
    required("name", "name", "Name"),
    required(
      "serviceRole",
      "service_role",
      "Service role ARN",
      "arn:aws:iam::123456789012:role/sketchcatch-audit"
    ),
    core("description", "description", "Description")
  ],
  aws_codedeploy_app: [
    required("name", "name", "Name"),
    select("computePlatform", "compute_platform", "Compute platform", ["Server", "Lambda", "ECS"])
  ],
  aws_codedeploy_deployment_group: [
    required("appName", "app_name", "App name"),
    required("deploymentGroupName", "deployment_group_name", "Deployment group name"),
    required("serviceRoleArn", "service_role_arn", "Service role ARN")
  ],
  aws_codepipeline: [required("name", "name", "Name"), required("roleArn", "role_arn", "Role ARN")],
  aws_sns_topic_subscription: [
    ref("topicArn", "topic_arn", "SNS topic", ["aws_sns_topic"], true, "arn"),
    select("protocol", "protocol", "Protocol", ["http", "https", "email", "sqs", "lambda"], true),
    required("endpoint", "endpoint", "Endpoint")
  ],
  aws_sqs_queue: [
    core("name", "name", "Name"),
    number(
      "visibilityTimeoutSeconds",
      "visibility_timeout_seconds",
      "Visibility timeout",
      false,
      "30"
    ),
    commonTags
  ],
  aws_acm_certificate: [
    required("domainName", "domain_name", "Domain name", "example.com"),
    select("validationMethod", "validation_method", "Validation method", ["DNS", "EMAIL"]),
    list("subjectAlternativeNames", "subject_alternative_names", "Subject alternative names"),
    commonTags
  ],
  aws_acm_certificate_validation: [
    ref("certificateArn", "certificate_arn", "Certificate", ["aws_acm_certificate"], true, "arn"),
    list("validationRecordFqdns", "validation_record_fqdns", "Validation record FQDNs")
  ],
  aws_ecr_repository: [
    required("name", "name", "Name"),
    select("imageTagMutability", "image_tag_mutability", "Image tag mutability", [
      "MUTABLE",
      "IMMUTABLE"
    ]),
    commonTags
  ],
  aws_ecr_lifecycle_policy: [
    ref("repository", "repository", "Repository", ["aws_ecr_repository"], true, "name"),
    required("policy", "policy", "Lifecycle policy JSON")
  ],
  aws_ecs_cluster: [core("name", "name", "Name"), commonTags],
  aws_ecs_service: [
    required("name", "name", "Name"),
    ref("cluster", "cluster", "ECS cluster", ["aws_ecs_cluster"], true, "id"),
    ref(
      "taskDefinition",
      "task_definition",
      "Task definition",
      ["aws_ecs_task_definition"],
      true,
      "arn"
    ),
    number("desiredCount", "desired_count", "Desired count", false, "1")
  ],
  aws_ecs_task_definition: [
    required("family", "family", "Family"),
    select("networkMode", "network_mode", "Network mode", ["awsvpc", "bridge", "host", "none"]),
    field({
      name: "requiresCompatibilities",
      terraformName: "requires_compatibilities",
      label: "Requires compatibilities",
      type: "list",
      inputKind: "multi-select",
      options: ["FARGATE", "EC2", "EXTERNAL", "MANAGED_INSTANCES"],
      core: true
    }),
    core("cpu", "cpu", "CPU", "256"),
    core("memory", "memory", "Memory", "512")
  ],
  aws_ecs_capacity_provider: [required("name", "name", "Name"), commonTags],
  aws_eks_cluster: [
    required("name", "name", "Name"),
    required("roleArn", "role_arn", "Role ARN"),
    core("version", "version", "Kubernetes version"),
    commonTags
  ],
  aws_eks_node_group: [
    ref("clusterName", "cluster_name", "EKS cluster", ["aws_eks_cluster"], true, "name"),
    required("nodeGroupName", "node_group_name", "Node group name"),
    required("nodeRoleArn", "node_role_arn", "Node role ARN"),
    list("subnetIds", "subnet_ids", "Subnets", true)
  ],
  aws_eks_addon: [
    ref("clusterName", "cluster_name", "EKS cluster", ["aws_eks_cluster"], true, "name"),
    required("addonName", "addon_name", "Add-on name")
  ],
  aws_config_configuration_recorder: [
    core("name", "name", "Name"),
    required("roleArn", "role_arn", "Role ARN")
  ],
  aws_config_delivery_channel: [
    core("name", "name", "Name"),
    required("s3BucketName", "s3_bucket_name", "S3 bucket name")
  ],
  aws_config_config_rule: [
    required("name", "name", "Name"),
    core("description", "description", "Description")
  ],
  aws_cloudtrail: [
    required("name", "name", "Name"),
    required("s3BucketName", "s3_bucket_name", "S3 bucket name"),
    boolean(
      "includeGlobalServiceEvents",
      "include_global_service_events",
      "Include global service events"
    ),
    boolean("isMultiRegionTrail", "is_multi_region_trail", "Multi-region trail"),
    commonTags
  ],
  aws_xray_group: [
    required("groupName", "group_name", "Group name"),
    core("filterExpression", "filter_expression", "Filter expression")
  ],
  aws_xray_sampling_rule: [
    required("ruleName", "rule_name", "Rule name"),
    number("priority", "priority", "Priority", true, "1000"),
    number("reservoirSize", "reservoir_size", "Reservoir size", true, "1"),
    number("fixedRate", "fixed_rate", "Fixed rate", true, "0.05"),
    required("serviceName", "service_name", "Service name", "*"),
    required("serviceType", "service_type", "Service type", "*"),
    required("host", "host", "Host", "*"),
    required("httpMethod", "http_method", "HTTP method", "*"),
    required("urlPath", "url_path", "URL path", "*"),
    number("version", "version", "Version", true, "1")
  ],
  aws_shield_protection: [
    required("name", "name", "Name"),
    required("resourceArn", "resource_arn", "Resource ARN"),
    commonTags
  ],
  aws_guardduty_detector: [boolean("enable", "enable", "Enable", true)]
} satisfies Record<string, readonly ParameterCatalogDefinition[]>;

const terraformValidateRequiredAdditions = {
  aws_appautoscaling_target: {
    removeNames: ["name", "tags"],
    definitions: [
      number("maxCapacity", "max_capacity", "Maximum capacity", true, "2"),
      number("minCapacity", "min_capacity", "Minimum capacity", true, "1"),
      required("resourceId", "resource_id", "Scalable resource ID", "service/audit-cluster/audit-service"),
      select(
        "scalableDimension",
        "scalable_dimension",
        "Scalable dimension",
        ["ecs:service:DesiredCount"],
        true
      ),
      select("serviceNamespace", "service_namespace", "Service namespace", ["ecs"], true)
    ]
  },
  aws_appautoscaling_policy: {
    removeNames: ["tags"],
    definitions: [
      required("name", "name", "Policy name", "audit-target-tracking"),
      select("policyType", "policy_type", "Policy type", ["TargetTrackingScaling"], true),
      required("resourceId", "resource_id", "Scalable resource ID", "service/audit-cluster/audit-service"),
      select(
        "scalableDimension",
        "scalable_dimension",
        "Scalable dimension",
        ["ecs:service:DesiredCount"],
        true
      ),
      select("serviceNamespace", "service_namespace", "Service namespace", ["ecs"], true),
      nestedBlock(
        "targetTrackingScalingPolicyConfiguration",
        "target_tracking_scaling_policy_configuration",
        "Target tracking configuration",
        [
          number("targetValue", "target_value", "Target value", true, "50"),
          nestedBlock(
            "predefinedMetricSpecification",
            "predefined_metric_specification",
            "Predefined metric",
            [
              select(
                "predefinedMetricType",
                "predefined_metric_type",
                "Metric type",
                ["ECSServiceAverageCPUUtilization"],
                true
              )
            ]
          )
        ]
      )
    ]
  },
  aws_api_gateway_authorizer: {
    removeNames: ["tags"],
    definitions: [
      required("name", "name", "Authorizer name", "sketchcatch-authorizer"),
      ref("restApiId", "rest_api_id", "REST API", ["aws_api_gateway_rest_api"], true, "id"),
      select("type", "type", "Authorizer type", ["TOKEN", "REQUEST", "COGNITO_USER_POOLS"])
    ]
  },
  aws_ecs_capacity_provider: {
    definitions: [
      nestedBlock(
        "autoScalingGroupProvider",
        "auto_scaling_group_provider",
        "Auto Scaling group provider",
        [
          ref(
            "autoScalingGroupArn",
            "auto_scaling_group_arn",
            "Auto Scaling group",
            ["aws_autoscaling_group"],
            true,
            "arn"
          )
        ]
      )
    ]
  },
  aws_eks_fargate_profile: {
    removeNames: ["name"],
    definitions: [
      ref("clusterName", "cluster_name", "EKS cluster", ["aws_eks_cluster"], true, "name"),
      required("fargateProfileName", "fargate_profile_name", "Fargate profile name", "audit-profile"),
      ref(
        "podExecutionRoleArn",
        "pod_execution_role_arn",
        "Pod execution role",
        ["aws_iam_role"],
        true,
        "arn"
      ),
      nestedBlock("selector", "selector", "Pod selector", [
        required("namespace", "namespace", "Namespace", "default")
      ])
    ]
  },
  aws_security_group_rule: {
    removeNames: ["cidrBlocks"],
    definitions: [list("cidrBlocks", "cidr_blocks", "CIDR blocks", true)]
  },
  aws_autoscaling_group: {
    removeNames: ["launchTemplate"],
    definitions: [
      nestedBlock(
        "launchTemplate",
        "launch_template",
        "Launch template",
        [
          ref("id", "id", "Launch template", ["aws_launch_template"], true, "id"),
          core("version", "version", "Version", "$Latest")
        ]
      )
    ]
  },
  aws_autoscaling_policy: {
    removeNames: ["adjustmentType", "scalingAdjustment"],
    definitions: [
      select(
        "adjustmentType",
        "adjustment_type",
        "Adjustment type",
        ["ChangeInCapacity"]
      ),
      number("scalingAdjustment", "scaling_adjustment", "Scaling adjustment", false, "1")
    ]
  },
  aws_ebs_volume: {
    removeNames: ["size"],
    definitions: [number("size", "size", "Size (GiB)", true, "8")]
  },
  aws_instance: {
    removeNames: ["instanceType"],
    definitions: [
      select(
        "instanceType",
        "instance_type",
        "Instance type",
        ["t3.micro", "t3.small", "t3.medium"],
        true
      )
    ]
  },
  aws_lambda_function: {
    definitions: [
      field({
        name: "inlineSource",
        terraformName: "inline_source",
        label: "Inline source",
        core: true,
        placeholder: "export const handler = async () => ({ statusCode: 200 });",
        description: "배포 가능한 zip을 생성하기 위한 Lambda 기본 소스입니다."
      })
    ]
  },
  aws_cloudwatch_event_rule: {
    removeNames: ["scheduleExpression"],
    definitions: [
      required("scheduleExpression", "schedule_expression", "Schedule expression", "rate(1 day)")
    ]
  },
  aws_s3_bucket_lifecycle_configuration: {
    definitions: [
      nestedBlock("rule", "rule", "Lifecycle rules", [
        required("id", "id", "Rule ID", "expire-old-objects"),
        select("status", "status", "Status", ["Enabled", "Disabled"], true),
        nestedBlock("filter", "filter", "Filter", [])
      ], true, true)
    ]
  },
  aws_api_gateway_deployment: {
    removeNames: ["stageName"],
    definitions: []
  },
  aws_cognito_user_pool: {
    definitions: [required("name", "name", "User pool name", "sketchcatch-users")]
  },
  aws_cognito_user_pool_client: {
    removeNames: ["tags"],
    definitions: [
      required("name", "name", "Client name", "sketchcatch-client"),
      ref("userPoolId", "user_pool_id", "User pool", ["aws_cognito_user_pool"], true, "id")
    ]
  },
  aws_s3_bucket_website_configuration: {
    removeNames: ["name", "tags"],
    definitions: [
      ref("bucket", "bucket", "S3 bucket", ["aws_s3_bucket"], true, "id"),
      nestedBlock("indexDocument", "index_document", "Index document", [
        required("suffix", "suffix", "Index suffix", "index.html")
      ]),
      nestedBlock("errorDocument", "error_document", "Error document", [
        required("key", "key", "Error document key", "error.html")
      ], false)
    ]
  },
  aws_codestarconnections_connection: {
    definitions: [
      required("name", "name", "Connection name", "sketchcatch-github"),
      select("providerType", "provider_type", "Provider type", ["GitHub"], true)
    ]
  },
  aws_sfn_state_machine: {
    definitions: [
      required("name", "name", "State machine name", "sketchcatch-state-machine"),
      ref("roleArn", "role_arn", "Execution role", ["aws_iam_role"], true, "arn"),
      required(
        "definition",
        "definition",
        "State machine definition",
        '{"StartAt":"Done","States":{"Done":{"Type":"Succeed"}}}'
      )
    ]
  },
  kubernetes_namespace: {
    definitions: [
      nestedBlock("metadata", "metadata", "Metadata", [
        required("name", "name", "Namespace name", "sketchcatch")
      ])
    ]
  },
  kubernetes_deployment: {
    definitions: [
      nestedBlock("metadata", "metadata", "Metadata", [
        required("name", "name", "Deployment name", "web")
      ]),
      nestedBlock("spec", "spec", "Deployment spec", [
        number("replicas", "replicas", "Replicas", false, "1"),
        nestedBlock("selector", "selector", "Selector", [
          field({
            name: "matchLabels",
            terraformName: "match_labels",
            label: "Match labels",
            type: "map",
            inputKind: "key-value",
            required: true
          })
        ]),
        nestedBlock("template", "template", "Pod template", [
          nestedBlock("metadata", "metadata", "Metadata", [
            field({
              name: "labels",
              terraformName: "labels",
              label: "Labels",
              type: "map",
              inputKind: "key-value",
              required: true
            })
          ]),
          nestedBlock("spec", "spec", "Pod spec", [
            nestedBlock(
              "container",
              "container",
              "Containers",
              [
                required("name", "name", "Container name", "web"),
                required("image", "image", "Container image", "nginx:stable")
              ],
              true,
              true
            )
          ])
        ])
      ])
    ]
  },
  kubernetes_service: {
    definitions: [
      nestedBlock("metadata", "metadata", "Metadata", [
        required("name", "name", "Service name", "web")
      ]),
      nestedBlock("spec", "spec", "Service spec", [
        field({
          name: "selector",
          terraformName: "selector",
          label: "Selector",
          type: "map",
          inputKind: "key-value",
          required: true
        }),
        nestedBlock(
          "port",
          "port",
          "Ports",
          [
            number("port", "port", "Port", true, "80"),
            number("targetPort", "target_port", "Target port", false, "80")
          ],
          true,
          true
        )
      ])
    ]
  },
  aws_api_gateway_resource: {
    removeNames: ["parentId"],
    definitions: [
      ref(
        "parentId",
        "parent_id",
        "Parent REST API resource",
        ["aws_api_gateway_rest_api"],
        true,
        "root_resource_id"
      )
    ]
  },
  aws_launch_template: {
    definitions: [
      field({
        name: "updateDefaultVersion",
        terraformName: "update_default_version",
        label: "Update default version",
        type: "boolean",
        inputKind: "checkbox",
        core: true,
        description: "새 Launch Template version을 기본 version으로 지정할지 정합니다."
      }),
      nestedBlock("metadataOptions", "metadata_options", "Metadata options", [
        select("httpEndpoint", "http_endpoint", "HTTP endpoint", ["enabled", "disabled"]),
        select("httpTokens", "http_tokens", "HTTP tokens", ["required", "optional"])
      ], false, true),
      nestedBlock("networkInterfaces", "network_interfaces", "Network interfaces", [
        field({
          name: "associatePublicIpAddress",
          terraformName: "associate_public_ip_address",
          label: "Associate public IP",
          type: "boolean",
          inputKind: "checkbox"
        }),
        field({
          name: "securityGroups",
          terraformName: "security_groups",
          label: "Security groups",
          type: "list",
          inputKind: "reference-picker",
          referenceTargetTypes: ["aws_security_group"]
        })
      ], false, true),
      nestedBlock("tagSpecifications", "tag_specifications", "Tag specifications", [
        select(
          "resourceType",
          "resource_type",
          "Resource type",
          ["instance", "volume", "network-interface", "spot-instances-request"],
          true
        ),
        field({
          name: "tags",
          terraformName: "tags",
          label: "Tags",
          type: "map",
          inputKind: "key-value",
          required: true
        })
      ])
    ]
  },
  aws_cloudfront_distribution: {
    definitions: [
      field({
        name: "enabled",
        terraformName: "enabled",
        label: "Enabled",
        type: "boolean",
        inputKind: "checkbox",
        required: true
      }),
      core("defaultRootObject", "default_root_object", "Default root object", "index.html"),
      nestedBlock("origin", "origin", "Origin", [
        required("domainName", "domain_name", "Domain name", "example.com"),
        required("originId", "origin_id", "Origin ID", "primary"),
        ref(
          "originAccessControlId",
          "origin_access_control_id",
          "Origin access control",
          ["aws_cloudfront_origin_access_control"],
          false,
          "id"
        ),
        nestedBlock("customOriginConfig", "custom_origin_config", "Custom origin config", [
          number("httpPort", "http_port", "HTTP port", true, "80"),
          number("httpsPort", "https_port", "HTTPS port", true, "443"),
          select(
            "originProtocolPolicy",
            "origin_protocol_policy",
            "Origin protocol policy",
            ["http-only", "https-only", "match-viewer"],
            true
          ),
          field({
            name: "originSslProtocols",
            terraformName: "origin_ssl_protocols",
            label: "Origin SSL protocols",
            type: "list",
            inputKind: "text",
            required: true,
            placeholder: "TLSv1.2"
          })
        ], false, true)
      ], true, true),
      nestedBlock("defaultCacheBehavior", "default_cache_behavior", "Default cache behavior", [
        field({
          name: "allowedMethods",
          terraformName: "allowed_methods",
          label: "Allowed methods",
          type: "list",
          inputKind: "text",
          required: true,
          placeholder: "GET"
        }),
        field({
          name: "cachedMethods",
          terraformName: "cached_methods",
          label: "Cached methods",
          type: "list",
          inputKind: "text",
          required: true,
          placeholder: "GET"
        }),
        required("targetOriginId", "target_origin_id", "Target origin ID", "primary"),
        select(
          "viewerProtocolPolicy",
          "viewer_protocol_policy",
          "Viewer protocol policy",
          ["redirect-to-https", "allow-all", "https-only"],
          true
        ),
        core("cachePolicyId", "cache_policy_id", "Cache policy ID")
      ], true, true),
      nestedBlock("orderedCacheBehavior", "ordered_cache_behavior", "Ordered cache behavior", [
        required("pathPattern", "path_pattern", "Path pattern", "/api/*"),
        required("targetOriginId", "target_origin_id", "Target origin ID", "alb-api"),
        select(
          "viewerProtocolPolicy",
          "viewer_protocol_policy",
          "Viewer protocol policy",
          ["redirect-to-https", "allow-all", "https-only"],
          true
        ),
        field({
          name: "allowedMethods",
          terraformName: "allowed_methods",
          label: "Allowed methods",
          type: "list",
          inputKind: "text",
          required: true,
          placeholder: "GET"
        }),
        field({
          name: "cachedMethods",
          terraformName: "cached_methods",
          label: "Cached methods",
          type: "list",
          inputKind: "text",
          required: true,
          placeholder: "GET"
        }),
        core("cachePolicyId", "cache_policy_id", "Cache policy ID"),
        core(
          "originRequestPolicyId",
          "origin_request_policy_id",
          "Origin request policy ID"
        )
      ], false, true),
      nestedBlock("restrictions", "restrictions", "Restrictions", [
        nestedBlock(
          "geoRestriction",
          "geo_restriction",
          "Geo restriction",
          [
            select(
              "restrictionType",
              "restriction_type",
              "Restriction type",
              ["none", "whitelist", "blacklist"],
              true
            )
          ],
          true,
          true
        )
      ], true, true),
      nestedBlock("viewerCertificate", "viewer_certificate", "Viewer certificate", [
        field({
          name: "cloudfrontDefaultCertificate",
          terraformName: "cloudfront_default_certificate",
          label: "CloudFront default certificate",
          type: "boolean",
          inputKind: "checkbox",
          core: true
        })
      ], true, true)
    ]
  },
  aws_wafv2_web_acl: {
    definitions: [
      nestedBlock("defaultAction", "default_action", "Default action", [
        nestedBlock("allow", "allow", "Allow", [], true, true)
      ]),
      nestedBlock("visibilityConfig", "visibility_config", "Visibility config", [
        field({
          name: "cloudwatchMetricsEnabled",
          terraformName: "cloudwatch_metrics_enabled",
          label: "CloudWatch metrics",
          type: "boolean",
          inputKind: "checkbox",
          required: true
        }),
        required("metricName", "metric_name", "Metric name", "sketchcatch-audit"),
        field({
          name: "sampledRequestsEnabled",
          terraformName: "sampled_requests_enabled",
          label: "Sampled requests",
          type: "boolean",
          inputKind: "checkbox",
          required: true
        })
      ])
    ]
  },
  aws_s3_bucket_versioning: {
    removeNames: ["status"],
    definitions: [
      nestedBlock("versioningConfiguration", "versioning_configuration", "Versioning configuration", [
        select("status", "status", "Status", ["Enabled", "Suspended"], true)
      ])
    ]
  },
  aws_s3_bucket_server_side_encryption_configuration: {
    removeNames: ["sseAlgorithm", "kmsMasterKeyId"],
    definitions: [
      nestedBlock("rule", "rule", "Rule", [
        nestedBlock(
          "applyServerSideEncryptionByDefault",
          "apply_server_side_encryption_by_default",
          "Default encryption",
          [
            select("sseAlgorithm", "sse_algorithm", "SSE algorithm", ["AES256", "aws:kms"], true),
            core("kmsMasterKeyId", "kms_master_key_id", "KMS key")
          ],
          true,
          true
        )
      ])
    ]
  },
  aws_codebuild_project: {
    definitions: [
      nestedBlock("artifacts", "artifacts", "Artifacts", [
        select("type", "type", "Type", ["NO_ARTIFACTS", "S3", "CODEPIPELINE"], true)
      ]),
      nestedBlock("environment", "environment", "Environment", [
        select("computeType", "compute_type", "Compute type", ["BUILD_GENERAL1_SMALL"], true),
        required("image", "image", "Image", "aws/codebuild/standard:7.0"),
        select("type", "type", "Type", ["LINUX_CONTAINER"], true)
      ]),
      nestedBlock("source", "source", "Source", [
        select("type", "type", "Type", ["NO_SOURCE", "S3", "CODEPIPELINE", "GITHUB"], true)
      ])
    ]
  },
  aws_codepipeline: {
    definitions: [
      nestedBlock("artifactStore", "artifact_store", "Artifact store", [
        required("location", "location", "Location", "sketchcatch-audit-artifacts"),
        select("type", "type", "Type", ["S3"], true)
      ]),
      nestedBlock(
        "stage",
        "stage",
        "Stage",
        [
          required("name", "name", "Stage name", "Source"),
          nestedBlock(
            "action",
            "action",
            "Action",
            [
              select("category", "category", "Category", ["Source", "Build", "Deploy"], true),
              required("name", "name", "Action name", "Source"),
              select("owner", "owner", "Owner", ["AWS", "ThirdParty", "Custom"], true),
              required("provider", "provider", "Provider", "S3"),
              required("version", "version", "Version", "1")
            ],
            true,
            true
          )
        ],
        true,
        true
      )
    ]
  },
  aws_ecs_task_definition: {
    definitions: [
      required(
        "containerDefinitions",
        "container_definitions",
        "Container definitions JSON",
        "[{\"name\":\"app\",\"image\":\"public.ecr.aws/docker/library/nginx:latest\",\"essential\":true}]"
      )
    ]
  },
  aws_eks_cluster: {
    definitions: [
      nestedBlock("vpcConfig", "vpc_config", "VPC config", [
        field({
          name: "subnetIds",
          terraformName: "subnet_ids",
          label: "Subnets",
          type: "list",
          inputKind: "reference-picker",
          required: true,
          referenceTargetTypes: ["aws_subnet"]
        })
      ])
    ]
  },
  aws_cloudfront_cache_policy: {
    definitions: [
      nestedBlock(
        "parametersInCacheKeyAndForwardedToOrigin",
        "parameters_in_cache_key_and_forwarded_to_origin",
        "Cache key and origin forwarding",
        [
          nestedBlock(
            "cookiesConfig",
            "cookies_config",
            "Cookies config",
            [select("cookieBehavior", "cookie_behavior", "Cookie behavior", ["none", "all"], true)],
            true,
            true
          ),
          nestedBlock(
            "headersConfig",
            "headers_config",
            "Headers config",
            [select("headerBehavior", "header_behavior", "Header behavior", ["none", "whitelist"], true)],
            true,
            true
          ),
          nestedBlock(
            "queryStringsConfig",
            "query_strings_config",
            "Query strings config",
            [
              select(
                "queryStringBehavior",
                "query_string_behavior",
                "Query string behavior",
                ["none", "all"],
                true
              )
            ],
            true,
            true
          )
        ]
      )
    ]
  },
  aws_cloudfront_origin_request_policy: {
    definitions: [
      nestedBlock("cookiesConfig", "cookies_config", "Cookies config", [
        select("cookieBehavior", "cookie_behavior", "Cookie behavior", ["none", "all"], true)
      ]),
      nestedBlock("headersConfig", "headers_config", "Headers config", [
        select("headerBehavior", "header_behavior", "Header behavior", ["none", "allViewer"], true)
      ]),
      nestedBlock("queryStringsConfig", "query_strings_config", "Query strings config", [
        select(
          "queryStringBehavior",
          "query_string_behavior",
          "Query string behavior",
          ["none", "all"],
          true
        )
      ])
    ]
  },
  aws_scheduler_schedule: {
    definitions: [
      nestedBlock("flexibleTimeWindow", "flexible_time_window", "Flexible time window", [
        select("mode", "mode", "Mode", ["OFF", "FLEXIBLE"], true)
      ]),
      nestedBlock("target", "target", "Target", [
        required("arn", "arn", "Target ARN", "arn:aws:sqs:ap-northeast-2:123456789012:audit"),
        required("roleArn", "role_arn", "Role ARN", "arn:aws:iam::123456789012:role/sketchcatch-audit")
      ])
    ]
  },
  aws_eks_node_group: {
    definitions: [
      nestedBlock("scalingConfig", "scaling_config", "Scaling config", [
        number("desiredSize", "desired_size", "Desired size", true, "1"),
        number("maxSize", "max_size", "Max size", true, "1"),
        number("minSize", "min_size", "Min size", true, "1")
      ])
    ]
  },
  aws_config_config_rule: {
    definitions: [
      nestedBlock("source", "source", "Source", [
        select("owner", "owner", "Owner", ["AWS", "CUSTOM_LAMBDA", "CUSTOM_POLICY"], true),
        core("sourceIdentifier", "source_identifier", "Source identifier", "S3_BUCKET_PUBLIC_READ_PROHIBITED")
      ])
    ]
  },
  aws_xray_sampling_rule: {
    definitions: [
      required("resourceArn", "resource_arn", "Resource ARN", "*")
    ]
  }
} satisfies Record<string, CatalogPatch>;

export const terraformAwsParameterCatalog = {
  ...generatedTerraformAwsParameterCatalog,
  source: `${generatedTerraformAwsParameterCatalog.source}+priority-resource-fallbacks+terraform-validate-required-additions`,
  resources: createResourceParameterCatalog()
} satisfies ParameterCatalog;

export const terraformParameterCatalog = terraformAwsParameterCatalog;

function createResourceParameterCatalog(): ParameterCatalog["resources"] {
  const resources: ParameterCatalog["resources"] = {
    ...generatedTerraformAwsParameterCatalog.resources
  };

  for (const definition of resourceDefinitions) {
    if (
      !definition.capabilities.parameterPanel ||
      definition.terraform.blockType !== "resource" ||
      resources[definition.terraform.resourceType]
    ) {
      continue;
    }

    const fallback = priorityResourceFallbacks[definition.terraform.resourceType] ?? [
      core("name", "name", "Name"),
      commonTags
    ];

    resources[definition.terraform.resourceType] = [...fallback];
  }

  for (const definition of resourceDefinitions) {
    if (
      !definition.capabilities.parameterPanel ||
      definition.terraform.blockType === "resource"
    ) {
      continue;
    }

    const scopedKey = createTerraformParameterCatalogKey(
      definition.terraform.blockType,
      definition.terraform.resourceType
    );
    const legacyDefinitions = resources[definition.terraform.resourceType];
    if (!resources[scopedKey] && legacyDefinitions) {
      resources[scopedKey] = [...legacyDefinitions];
    }
  }

  for (const [key, definitions] of Object.entries(blockTypeParameterDefinitions)) {
    resources[key] = [...definitions];
  }

  applyTerraformValidateRequiredAdditions(resources);

  return resources;
}

function applyTerraformValidateRequiredAdditions(resources: ParameterCatalog["resources"]): void {
  const additions = Object.entries(terraformValidateRequiredAdditions) as Array<
    [string, CatalogPatch]
  >;

  for (const [resourceType, patch] of additions) {
    const replacements = new Set([
      ...(patch.removeNames ?? []),
      ...patch.definitions.map((definition) => definition.name)
    ]);
    const existing = resources[resourceType] ?? [];

    resources[resourceType] = [
      ...existing.filter((definition) => !replacements.has(definition.name)),
      ...patch.definitions
    ];
  }
}

function required(
  name: string,
  terraformName: string,
  label: string,
  placeholder?: string
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    required: true,
    ...(placeholder === undefined ? {} : { placeholder })
  });
}

function core(
  name: string,
  terraformName: string,
  label: string,
  placeholder?: string
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    core: true,
    ...(placeholder === undefined ? {} : { placeholder })
  });
}

function ref(
  name: string,
  terraformName: string,
  label: string,
  referenceTargetTypes: string[],
  requiredField = true,
  referenceAttribute?: string
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    required: requiredField,
    core: !requiredField,
    inputKind: "reference-picker",
    referenceTargetTypes,
    ...(referenceAttribute === undefined ? {} : { referenceAttribute })
  });
}

function refList(
  name: string,
  terraformName: string,
  label: string,
  referenceTargetTypes: string[],
  requiredField = true,
  referenceAttribute?: string
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    type: "list",
    required: requiredField,
    core: !requiredField,
    inputKind: "reference-picker",
    referenceTargetTypes,
    ...(referenceAttribute === undefined ? {} : { referenceAttribute })
  });
}

function list(
  name: string,
  terraformName: string,
  label: string,
  requiredField = false
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    type: "list",
    inputKind: "text",
    required: requiredField,
    core: !requiredField
  });
}

function number(
  name: string,
  terraformName: string,
  label: string,
  requiredField = false,
  placeholder?: string
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    type: "number",
    inputKind: "number",
    required: requiredField,
    core: !requiredField,
    ...(placeholder === undefined ? {} : { placeholder })
  });
}

function boolean(
  name: string,
  terraformName: string,
  label: string,
  coreField = true
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    type: "boolean",
    inputKind: "checkbox",
    core: coreField
  });
}

function select(
  name: string,
  terraformName: string,
  label: string,
  options: string[],
  requiredField = false
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    inputKind: "select",
    options,
    required: requiredField,
    core: !requiredField
  });
}

function nestedBlock(
  name: string,
  terraformName: string,
  label: string,
  children: readonly ParameterCatalogDefinition[],
  requiredField = true,
  collection = false
): ParameterCatalogDefinition {
  return field({
    name,
    terraformName,
    label,
    type: collection ? "list" : "object",
    inputKind: "nested-block",
    required: requiredField,
    core: !requiredField,
    children: [...children]
  });
}

function field(input: FieldInput): ParameterCatalogDefinition {
  const requiredField = input.required ?? false;

  return {
    ...input,
    type: input.type ?? "string",
    required: requiredField,
    optional: input.optional ?? !requiredField,
    computed: input.computed ?? false,
    sensitive: input.sensitive ?? false,
    inputKind: input.inputKind ?? "text"
  };
}
