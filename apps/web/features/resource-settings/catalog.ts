import type { ResourceItem } from "../../../../packages/types/src/index";

const size = { width: 112, height: 108 };

const groupIconPath = "/Architecture-Group-Icons_07312025";
const serviceIconPath = "/Architecture-Service-Icons_07312025";
const resourceIconPath = "/Resource-Icons_07312025";

export const resourceCatalog: ResourceItem[] = [
  {
    id: "design-region",
    name: "Region",
    cloudProvider: "aws",
    area: "containers",
    category: "Containers",
    iconUrl: `${groupIconPath}/Region_32.svg`,
    enabled: true,
    nodeDefaults: { type: "design_region", label: "Region", size: { width: 260, height: 180 } }
  },
  {
    id: "design-az",
    name: "AZ",
    cloudProvider: "aws",
    area: "containers",
    category: "Containers",
    iconUrl: `${groupIconPath}/AWS-Cloud_32.svg`,
    enabled: true,
    nodeDefaults: { type: "design_az", label: "Availability Zone", size: { width: 220, height: 150 } }
  },
  {
    id: "design-group",
    name: "Group",
    cloudProvider: "aws",
    area: "containers",
    category: "Containers",
    iconUrl: `${groupIconPath}/Auto-Scaling-group_32.svg`,
    enabled: true,
    nodeDefaults: { type: "design_group", label: "Group", size: { width: 200, height: 130 } }
  },
  {
    id: "aws-vpc",
    name: "VPC",
    cloudProvider: "aws",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-Virtual-Private-Cloud_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_vpc", label: "VPC", size }
  },
  {
    id: "aws-subnet",
    name: "Subnet",
    cloudProvider: "aws",
    area: "network",
    category: "Network",
    iconUrl: `${groupIconPath}/Private-subnet_32.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_subnet", label: "Subnet", size }
  },
  {
    id: "aws-internet-gateway",
    name: "Internet Gateway",
    cloudProvider: "aws",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Internet-Gateway_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_internet_gateway", label: "Internet Gateway", size }
  },
  {
    id: "aws-route-table",
    name: "Route Table",
    cloudProvider: "aws",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_route_table", label: "Route Table", size }
  },
  {
    id: "aws-nat-gateway",
    name: "NAT Gateway",
    cloudProvider: "aws",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_NAT-Gateway_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_nat_gateway", label: "NAT Gateway", size }
  },
  {
    id: "aws-vpc-endpoint",
    name: "VPC Endpoint",
    cloudProvider: "aws",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Endpoints_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_vpc_endpoint", label: "VPC Endpoint", size }
  },
  {
    id: "aws-security-group",
    name: "Security Group",
    cloudProvider: "aws",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Network-Firewall_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_security_group", label: "Security Group", size }
  },
  {
    id: "aws-security-group-rule",
    name: "Security Group Rule",
    cloudProvider: "aws",
    area: "security-identity",
    category: "Security",
    iconUrl: `${resourceIconPath}/Res_Security-Identity-Compliance/Res_AWS-Network-Firewall_Endpoints_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_security_group_rule", label: "Security Group Rule", size }
  },
  {
    id: "aws-iam-role",
    name: "IAM Role",
    cloudProvider: "aws",
    area: "security-identity",
    category: "Security",
    iconUrl: `${resourceIconPath}/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_iam_role", label: "IAM Role", size }
  },
  {
    id: "aws-iam-policy",
    name: "IAM Policy",
    cloudProvider: "aws",
    area: "security-identity",
    category: "Security",
    iconUrl: `${resourceIconPath}/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_iam_policy", label: "IAM Policy", size }
  },
  {
    id: "aws-iam-instance-profile",
    name: "IAM Instance Profile",
    cloudProvider: "aws",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Identity-and-Access-Management_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_iam_instance_profile", label: "IAM Instance Profile", size }
  },
  {
    id: "aws-kms-key",
    name: "KMS Key",
    cloudProvider: "aws",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Key-Management-Service_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_kms_key", label: "KMS Key", size }
  },
  {
    id: "aws-ec2-instance",
    name: "EC2 Instance",
    cloudProvider: "aws",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_instance", label: "EC2 Instance", size }
  },
  {
    id: "aws-ami",
    name: "AMI",
    cloudProvider: "aws",
    area: "compute",
    category: "Compute",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_Amazon-EC2_AMI_48.svg`,
    enabled: true,
    nodeDefaults: { terraformBlockType: "data", type: "aws_ami", label: "AMI", size }
  },
  {
    id: "aws-key-pair",
    name: "Key Pair",
    cloudProvider: "aws",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_key_pair", label: "Key Pair", size }
  },
  {
    id: "aws-eip",
    name: "Elastic IP",
    cloudProvider: "aws",
    area: "compute",
    category: "Compute",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_Amazon-EC2_Elastic-IP-Address_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_eip", label: "Elastic IP", size }
  },
  {
    id: "aws-launch-template",
    name: "Launch Template",
    cloudProvider: "aws",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_launch_template", label: "Launch Template", size }
  },
  {
    id: "aws-autoscaling-group",
    name: "Auto Scaling Group",
    cloudProvider: "aws",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2-Auto-Scaling_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_autoscaling_group", label: "Auto Scaling Group", size }
  },
  {
    id: "aws-s3-bucket",
    name: "S3 Bucket",
    cloudProvider: "aws",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_s3_bucket", label: "S3 Bucket", size }
  },
  {
    id: "aws-s3-public-access-block",
    name: "S3 Bucket Public Access Block",
    cloudProvider: "aws",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_s3_bucket_public_access_block", label: "S3 Public Access", size }
  },
  {
    id: "aws-s3-versioning",
    name: "S3 Bucket Versioning",
    cloudProvider: "aws",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Object-Lock_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_s3_bucket_versioning", label: "S3 Versioning", size }
  },
  {
    id: "aws-s3-encryption",
    name: "S3 Bucket Server Side Encryption",
    cloudProvider: "aws",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg`,
    enabled: true,
    nodeDefaults: {
      type: "aws_s3_bucket_server_side_encryption_configuration",
      label: "S3 Encryption",
      size
    }
  },
  {
    id: "aws-s3-lifecycle",
    name: "S3 Bucket Lifecycle",
    cloudProvider: "aws",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Intelligent-Tiering_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_s3_bucket_lifecycle_configuration", label: "S3 Lifecycle", size }
  },
  {
    id: "aws-ebs-volume",
    name: "EBS Volume",
    cloudProvider: "aws",
    area: "storage",
    category: "Storage",
    iconUrl: `${serviceIconPath}/Arch_Storage/64/Arch_Amazon-Elastic-Block-Store_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_ebs_volume", label: "EBS Volume", size }
  },
  {
    id: "aws-rds-instance",
    name: "RDS Instance",
    cloudProvider: "aws",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_db_instance", label: "RDS Instance", size }
  },
  {
    id: "aws-db-subnet-group",
    name: "DB Subnet Group",
    cloudProvider: "aws",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_db_subnet_group", label: "DB Subnet Group", size }
  },
  {
    id: "aws-db-parameter-group",
    name: "RDS Parameter Group",
    cloudProvider: "aws",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_db_parameter_group", label: "RDS Parameter Group", size }
  },
  {
    id: "aws-db-option-group",
    name: "RDS Option Group",
    cloudProvider: "aws",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_db_option_group", label: "RDS Option Group", size }
  },
  {
    id: "aws-db-snapshot",
    name: "RDS Snapshot",
    cloudProvider: "aws",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_db_snapshot", label: "RDS Snapshot", size }
  },
  {
    id: "aws-dynamodb-table",
    name: "DynamoDB Table",
    cloudProvider: "aws",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-DynamoDB_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_dynamodb_table", label: "DynamoDB Table", size }
  },
  {
    id: "aws-lambda-function",
    name: "Lambda Function",
    cloudProvider: "aws",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_AWS-Lambda_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_lambda_function", label: "Lambda Function", size }
  },
  {
    id: "aws-lambda-permission",
    name: "Lambda Permission",
    cloudProvider: "aws",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_AWS-Lambda_Lambda-Function_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_lambda_permission", label: "Lambda Permission", size }
  },
  {
    id: "aws-api-gateway-rest-api",
    name: "API Gateway REST API",
    cloudProvider: "aws",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-API-Gateway_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_api_gateway_rest_api", label: "REST API", size }
  },
  {
    id: "aws-api-gateway-resource",
    name: "API Gateway Resource",
    cloudProvider: "aws",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_api_gateway_resource", label: "API Resource", size }
  },
  {
    id: "aws-api-gateway-method",
    name: "API Gateway Method",
    cloudProvider: "aws",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_api_gateway_method", label: "API Method", size }
  },
  {
    id: "aws-api-gateway-integration",
    name: "API Gateway Integration",
    cloudProvider: "aws",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_api_gateway_integration", label: "API Integration", size }
  },
  {
    id: "aws-cloudwatch-log-group",
    name: "CloudWatch Log Group",
    cloudProvider: "aws",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Management-Governance/Res_Amazon-CloudWatch_Logs_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_cloudwatch_log_group", label: "Log Group", size }
  },
  {
    id: "aws-cloudwatch-metric-alarm",
    name: "CloudWatch Metric Alarm",
    cloudProvider: "aws",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Management-Governance/Res_Amazon-CloudWatch_Alarm_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_cloudwatch_metric_alarm", label: "Metric Alarm", size }
  },
  {
    id: "aws-cloudwatch-dashboard",
    name: "CloudWatch Dashboard",
    cloudProvider: "aws",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${serviceIconPath}/Arch_Management-Governance/64/Arch_Amazon-CloudWatch_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_cloudwatch_dashboard", label: "Dashboard", size }
  },
  {
    id: "aws-eventbridge-rule",
    name: "EventBridge Rule",
    cloudProvider: "aws",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Application-Integration/Res_Amazon-EventBridge_Rule_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_cloudwatch_event_rule", label: "Event Rule", size }
  },
  {
    id: "aws-eventbridge-target",
    name: "EventBridge Target",
    cloudProvider: "aws",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${serviceIconPath}/Arch_App-Integration/64/Arch_Amazon-EventBridge_64.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_cloudwatch_event_target", label: "Event Target", size }
  },
  {
    id: "aws-sns-topic",
    name: "SNS Topic",
    cloudProvider: "aws",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Application-Integration/Res_Amazon-Simple-Notification-Service_Topic_48.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_sns_topic", label: "SNS Topic", size }
  }
];
