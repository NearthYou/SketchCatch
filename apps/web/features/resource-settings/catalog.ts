import {
  getResourceDefinitionById,
  type ResourceDefinition
} from "@sketchcatch/types/resource-definitions";
import type { ResourceArea, ResourceItem } from "@sketchcatch/types";

const size = { width: 124, height: 96 };
const vpcAreaSize = { width: 240, height: 160 };
const subnetAreaSize = { width: 180, height: 120 };
const securityGroupAreaSize = subnetAreaSize;
const autoscalingGroupAreaSize = { width: 200, height: 130 };

const groupIconPath = "/Architecture-Group-Icons_07312025";
const serviceIconPath = "/Architecture-Service-Icons_07312025";
const resourceIconPath = "/Resource-Icons_07312025";

type TerraformResourcePresentation = {
  readonly area: ResourceArea;
  readonly category: string;
  readonly definitionId: string;
  readonly iconUrl: string;
  readonly label: string;
  readonly name: string;
  readonly size: ResourceItem["nodeDefaults"]["size"];
};

const resourceCategoryOverrides: Record<string, string> = {
  "aws-ami": "EC2 Core",
  "aws-acm-certificate": "Certificates",
  "aws-acm-certificate-validation": "Certificates",
  "aws-api-gateway-deployment": "API Gateway REST",
  "aws-api-gateway-authorizer": "API Gateway REST",
  "aws-api-gateway-integration": "API Gateway REST",
  "aws-api-gateway-method": "API Gateway REST",
  "aws-api-gateway-resource": "API Gateway REST",
  "aws-api-gateway-rest-api": "API Gateway REST",
  "aws-api-gateway-stage": "API Gateway REST",
  "aws-api-gateway-v2-integration": "API Gateway v2",
  "aws-api-gateway-v2-route": "API Gateway v2",
  "aws-api-gateway-v2-stage": "API Gateway v2",
  "aws-api-gateway-websocket-api": "API Gateway v2",
  "aws-autoscaling-group": "EC2 Launch & Scaling",
  "aws-autoscaling-policy": "EC2 Launch & Scaling",
  "aws-cloudfront-cache-policy": "Edge / CDN",
  "aws-cloudfront-distribution": "Edge / CDN",
  "aws-cloudfront-origin-access-control": "Edge / CDN",
  "aws-cloudfront-origin-request-policy": "Edge / CDN",
  "aws-cloudtrail": "Observability",
  "aws-cloudwatch-dashboard": "Observability",
  "aws-cloudwatch-log-group": "Observability",
  "aws-cloudwatch-log-resource-policy": "Observability",
  "aws-cloudwatch-log-stream": "Observability",
  "aws-cloudwatch-metric-alarm": "Observability",
  "aws-codebuild-project": "CI/CD",
  "aws-codedeploy-app": "CI/CD",
  "aws-codedeploy-deployment-group": "CI/CD",
  "aws-codepipeline": "CI/CD",
  "aws-codestarconnections-connection": "CI/CD",
  "aws-config-configuration-recorder": "Governance / Config",
  "aws-config-delivery-channel": "Governance / Config",
  "aws-config-rule": "Governance / Config",
  "aws-cognito-user-pool": "Identity",
  "aws-cognito-user-pool-client": "Identity",
  "aws-db-option-group": "RDS Supporting Resources",
  "aws-db-parameter-group": "RDS Supporting Resources",
  "aws-db-snapshot": "RDS Supporting Resources",
  "aws-db-subnet-group": "RDS Supporting Resources",
  "aws-dynamodb-table": "DynamoDB",
  "aws-ebs-volume": "EBS",
  "aws-ec2-instance": "EC2 Core",
  "aws-ecr-lifecycle-policy": "ECR",
  "aws-ecr-repository": "ECR",
  "aws-ecs-capacity-provider": "ECS",
  "aws-ecs-cluster": "ECS",
  "aws-ecs-service": "ECS",
  "aws-ecs-task-definition": "ECS",
  "aws-efs-access-point": "EFS",
  "aws-efs-file-system": "EFS",
  "aws-efs-mount-target": "EFS",
  "aws-eip": "EC2 Core",
  "aws-eks-addon": "EKS",
  "aws-eks-cluster": "EKS",
  "aws-eks-node-group": "EKS",
  "aws-amplify-app": "Frontend / Web Mobile",
  "kubernetes-namespace": "Kubernetes",
  "kubernetes-deployment": "Kubernetes",
  "kubernetes-service": "Kubernetes",
  "aws-elasticache-parameter-group": "ElastiCache",
  "aws-elasticache-redis": "ElastiCache",
  "aws-elasticache-subnet-group": "ElastiCache",
  "aws-eventbridge-permission": "EventBridge / Scheduler",
  "aws-eventbridge-rule": "EventBridge / Scheduler",
  "aws-eventbridge-target": "EventBridge / Scheduler",
  "aws-guardduty-detector": "Web Protection",
  "aws-iam-instance-profile": "IAM",
  "aws-iam-policy": "IAM",
  "aws-iam-role": "IAM",
  "aws-iam-role-policy": "IAM",
  "aws-iam-role-policy-attachment": "IAM",
  "aws-internet-gateway": "Routing & Gateways",
  "aws-key-pair": "EC2 Core",
  "aws-kms-alias": "KMS",
  "aws-kms-key": "KMS",
  "aws-launch-template": "EC2 Launch & Scaling",
  "aws-lambda-alias": "Lambda",
  "aws-lambda-event-source-mapping": "Lambda",
  "aws-lambda-function": "Lambda",
  "aws-lambda-permission": "Lambda",
  "aws-lb": "Load Balancing",
  "aws-lb-listener": "Load Balancing",
  "aws-lb-target-group": "Load Balancing",
  "aws-lb-target-group-attachment": "Load Balancing",
  "aws-nat-gateway": "Routing & Gateways",
  "aws-network-acl": "Network Access Control",
  "aws-network-acl-rule": "Network Access Control",
  "aws-rds-cluster": "RDS Cluster",
  "aws-rds-cluster-instance": "RDS Cluster",
  "aws-rds-instance": "RDS Instances",
  "aws-rds-read-replica": "RDS Instances",
  "aws-route": "Routing & Gateways",
  "aws-route-table": "Routing & Gateways",
  "aws-route-table-association": "Routing & Gateways",
  "aws-route53-record": "DNS",
  "aws-route53-zone": "DNS",
  "aws-s3-bucket": "S3 Core",
  "aws-s3-bucket-policy": "S3 Controls",
  "aws-s3-encryption": "S3 Controls",
  "aws-s3-lifecycle": "S3 Controls",
  "aws-s3-object": "S3 Core",
  "aws-s3-public-access-block": "S3 Controls",
  "aws-s3-versioning": "S3 Controls",
  "aws-s3-website-configuration": "S3 Controls",
  "aws-scheduler-schedule": "EventBridge / Scheduler",
  "aws-security-group": "Network Security",
  "aws-security-group-rule": "Network Security",
  "aws-secretsmanager-secret": "Secrets",
  "aws-secretsmanager-secret-version": "Secrets",
  "aws-shield-protection": "Web Protection",
  "aws-sns-topic": "Messaging",
  "aws-sns-topic-subscription": "Messaging",
  "aws-sqs-queue": "Messaging",
  "aws-step-functions-state-machine": "Workflow",
  "aws-vpc": "VPC Core",
  "aws-vpc-endpoint": "VPC Core",
  "aws-vpc-peering-connection": "VPC Core",
  "aws-subnet": "VPC Core",
  "aws-volume-attachment": "EBS",
  "aws-wafv2-web-acl": "Web Protection",
  "aws-wafv2-web-acl-association": "Web Protection",
  "aws-xray-group": "Observability",
  "aws-xray-sampling-rule": "Observability"
};

const designCatalogItems: ResourceItem[] = [
  {
    id: "design-user-client",
    name: "User / Client",
    cloudProvider: "aws",
    area: "other",
    category: "Flow",
    iconUrl: `${resourceIconPath}/Res_General-Icons/Res_48_Light/Res_Client_48_Light.svg`,
    enabled: true,
    nodeDefaults: {
      type: "sketchcatch_user_client",
      label: "User / Client",
      size
    }
  },
  {
    id: "design-internet",
    name: "Internet",
    cloudProvider: "aws",
    area: "network",
    category: "Flow",
    iconUrl: `${resourceIconPath}/Res_General-Icons/Res_48_Light/Res_Internet_48_Light.svg`,
    enabled: true,
    nodeDefaults: {
      type: "sketchcatch_internet",
      label: "Internet",
      size
    }
  },
  {
    id: "aws-region",
    name: "Region",
    cloudProvider: "aws",
    area: "containers",
    category: "Board Containers",
    iconUrl: `${groupIconPath}/Region_32.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_region", label: "Region", size: { width: 260, height: 180 } }
  },
  {
    id: "aws-availability-zone",
    name: "AZ",
    cloudProvider: "aws",
    area: "containers",
    category: "Board Containers",
    iconUrl: `${groupIconPath}/AWS-Cloud_32.svg`,
    enabled: true,
    nodeDefaults: { type: "aws_availability_zone", label: "AZ", size: { width: 220, height: 150 } }
  },
  {
    id: "design-group",
    name: "Group",
    cloudProvider: "aws",
    area: "containers",
    category: "Board Containers",
    iconUrl: `${groupIconPath}/Auto-Scaling-group_32.svg`,
    enabled: true,
    nodeDefaults: { type: "design_group", label: "Group", size: { width: 200, height: 130 } }
  }
];

const terraformResourcePresentations = [
  {
    definitionId: "aws-vpc",
    name: "VPC",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-Virtual-Private-Cloud_64.svg`,
    label: "VPC",
    size: vpcAreaSize
  },
  {
    definitionId: "aws-subnet",
    name: "Subnet",
    area: "network",
    category: "Network",
    iconUrl: `${groupIconPath}/Private-subnet_32.svg`,
    label: "Subnet",
    size: subnetAreaSize
  },
  {
    definitionId: "aws-internet-gateway",
    name: "Internet Gateway",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Internet-Gateway_48.svg`,
    label: "Internet Gateway",
    size
  },
  {
    definitionId: "aws-route-table",
    name: "Route Table",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg`,
    label: "Route Table",
    size
  },
  {
    definitionId: "aws-route-table-association",
    name: "Route Table Association",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_AWS-Cloud-WAN_Transit-Gateway-Route-Table-Attachment_48.svg`,
    label: "Route Table Association",
    size
  },
  {
    definitionId: "aws-route",
    name: "Route",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg`,
    label: "Route",
    size
  },
  {
    definitionId: "aws-cloudfront-distribution",
    name: "CloudFront Distribution",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg`,
    label: "CloudFront Distribution",
    size
  },
  {
    definitionId: "aws-cloudfront-origin-access-control",
    name: "CloudFront OAC",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg`,
    label: "CloudFront OAC",
    size
  },
  {
    definitionId: "aws-route53-record",
    name: "Route 53 Record",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-Route-53_64.svg`,
    label: "Route 53 Record",
    size
  },
  {
    definitionId: "aws-wafv2-web-acl",
    name: "WAF Web ACL",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-WAF_64.svg`,
    label: "WAF Web ACL",
    size
  },
  {
    definitionId: "aws-nat-gateway",
    name: "NAT Gateway",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_NAT-Gateway_48.svg`,
    label: "NAT Gateway",
    size
  },
  {
    definitionId: "aws-vpc-endpoint",
    name: "VPC Endpoint",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Endpoints_48.svg`,
    label: "VPC Endpoint",
    size
  },
  {
    definitionId: "aws-security-group",
    name: "Security Group",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Network-Firewall_64.svg`,
    label: "Security Group",
    size: securityGroupAreaSize
  },
  {
    definitionId: "aws-security-group-rule",
    name: "Security Group Rule",
    area: "security-identity",
    category: "Security",
    iconUrl: `${resourceIconPath}/Res_Security-Identity-Compliance/Res_AWS-Network-Firewall_Endpoints_48.svg`,
    label: "Security Group Rule",
    size
  },
  {
    definitionId: "aws-iam-role",
    name: "IAM Role",
    area: "security-identity",
    category: "Security",
    iconUrl: `${resourceIconPath}/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg`,
    label: "IAM Role",
    size
  },
  {
    definitionId: "aws-iam-policy",
    name: "IAM Policy",
    area: "security-identity",
    category: "Security",
    iconUrl: `${resourceIconPath}/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg`,
    label: "IAM Policy",
    size
  },
  {
    definitionId: "aws-iam-role-policy",
    name: "IAM Role Policy",
    area: "security-identity",
    category: "Security",
    iconUrl: `${resourceIconPath}/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg`,
    label: "Role Policy",
    size
  },
  {
    definitionId: "aws-iam-role-policy-attachment",
    name: "IAM Role Policy Attachment",
    area: "security-identity",
    category: "Security",
    iconUrl: `${resourceIconPath}/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg`,
    label: "Policy Attachment",
    size
  },
  {
    definitionId: "aws-iam-instance-profile",
    name: "IAM Instance Profile",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Identity-and-Access-Management_64.svg`,
    label: "IAM Instance Profile",
    size
  },
  {
    definitionId: "aws-kms-key",
    name: "KMS Key",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Key-Management-Service_64.svg`,
    label: "KMS Key",
    size
  },
  {
    definitionId: "aws-acm-certificate",
    name: "ACM Certificate",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Certificate-Manager_64.svg`,
    label: "ACM Certificate",
    size
  },
  {
    definitionId: "aws-cognito-user-pool",
    name: "Cognito User Pool",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_Amazon-Cognito_64.svg`,
    label: "User Pool",
    size
  },
  {
    definitionId: "aws-cognito-user-pool-client",
    name: "Cognito User Pool Client",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_Amazon-Cognito_64.svg`,
    label: "Pool Client",
    size
  },
  {
    definitionId: "aws-amplify-app",
    name: "Amplify App",
    area: "application",
    category: "Frontend / Web Mobile",
    iconUrl: `${serviceIconPath}/Arch_Front-End-Web-Mobile/64/Arch_AWS-Amplify_64.svg`,
    label: "Amplify App",
    size
  },
  {
    definitionId: "aws-ec2-instance",
    name: "EC2 Instance",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2_64.svg`,
    label: "EC2 Instance",
    size
  },
  {
    definitionId: "aws-ami",
    name: "AMI",
    area: "compute",
    category: "Compute",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_Amazon-EC2_AMI_48.svg`,
    label: "AMI",
    size
  },
  {
    definitionId: "aws-caller-identity",
    name: "Caller Identity",
    area: "tools",
    category: "Terraform Data Sources",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Identity-and-Access-Management_64.svg`,
    label: "Caller Identity",
    size
  },
  {
    definitionId: "aws-ssm-parameter",
    name: "SSM Parameter",
    area: "tools",
    category: "Terraform Data Sources",
    iconUrl: `${resourceIconPath}/Res_Management-Governance/Res_AWS-Systems-Manager_Parameter-Store_48.svg`,
    label: "SSM Parameter",
    size
  },
  {
    definitionId: "aws-key-pair",
    name: "Key Pair",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2_64.svg`,
    label: "Key Pair",
    size
  },
  {
    definitionId: "aws-eip",
    name: "Elastic IP",
    area: "compute",
    category: "Compute",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_Amazon-EC2_Elastic-IP-Address_48.svg`,
    label: "Elastic IP",
    size
  },
  {
    definitionId: "aws-launch-template",
    name: "Launch Template",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2_64.svg`,
    label: "Launch Template",
    size
  },
  {
    definitionId: "aws-autoscaling-group",
    name: "Auto Scaling Group",
    area: "compute",
    category: "Compute",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_Amazon-EC2-Auto-Scaling_64.svg`,
    label: "Auto Scaling Group",
    size: autoscalingGroupAreaSize
  },
  {
    definitionId: "aws-autoscaling-policy",
    name: "Autoscaling Policy",
    area: "compute",
    category: "Compute",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_Amazon-EC2_Auto-Scaling_48.svg`,
    label: "Autoscaling Policy",
    size
  },
  {
    definitionId: "aws-lb",
    name: "Application Load Balancer",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Elastic-Load-Balancing_64.svg`,
    label: "Load Balancer",
    size
  },
  {
    definitionId: "aws-lb-target-group",
    name: "ALB Target Group",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg`,
    label: "Target Group",
    size
  },
  {
    definitionId: "aws-lb-listener",
    name: "ALB Listener",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg`,
    label: "ALB Listener",
    size
  },
  {
    definitionId: "aws-s3-bucket",
    name: "S3 Bucket",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg`,
    label: "S3 Bucket",
    size
  },
  {
    definitionId: "aws-s3-object",
    name: "S3 Object",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg`,
    label: "S3 Object",
    size
  },
  {
    definitionId: "aws-s3-bucket-policy",
    name: "S3 Bucket Policy",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg`,
    label: "S3 Policy",
    size
  },
  {
    definitionId: "aws-s3-website-configuration",
    name: "S3 Website Configuration",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg`,
    label: "S3 Website",
    size
  },
  {
    definitionId: "aws-s3-public-access-block",
    name: "S3 Bucket Public Access Block",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg`,
    label: "S3 Public Access",
    size
  },
  {
    definitionId: "aws-s3-versioning",
    name: "S3 Bucket Versioning",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Object-Lock_48.svg`,
    label: "S3 Versioning",
    size
  },
  {
    definitionId: "aws-s3-encryption",
    name: "S3 Bucket Server Side Encryption",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg`,
    label: "S3 Encryption",
    size
  },
  {
    definitionId: "aws-s3-lifecycle",
    name: "S3 Bucket Lifecycle",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Intelligent-Tiering_48.svg`,
    label: "S3 Lifecycle",
    size
  },
  {
    definitionId: "aws-ebs-volume",
    name: "EBS Volume",
    area: "storage",
    category: "Storage",
    iconUrl: `${serviceIconPath}/Arch_Storage/64/Arch_Amazon-Elastic-Block-Store_64.svg`,
    label: "EBS Volume",
    size
  },
  {
    definitionId: "aws-rds-instance",
    name: "RDS Instance",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    label: "RDS Instance",
    size
  },
  {
    definitionId: "aws-rds-read-replica",
    name: "RDS Read Replica",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    label: "RDS Replica",
    size
  },
  {
    definitionId: "aws-rds-cluster",
    name: "RDS Cluster",
    area: "database",
    category: "Database",
    iconUrl: `${resourceIconPath}/Res_Database/Res_Amazon-RDS_Multi-AZ-DB-Cluster_48.svg`,
    label: "RDS Cluster",
    size
  },
  {
    definitionId: "aws-db-subnet-group",
    name: "DB Subnet Group",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    label: "DB Subnet Group",
    size
  },
  {
    definitionId: "aws-db-parameter-group",
    name: "RDS Parameter Group",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    label: "RDS Parameter Group",
    size
  },
  {
    definitionId: "aws-db-option-group",
    name: "RDS Option Group",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    label: "RDS Option Group",
    size
  },
  {
    definitionId: "aws-db-snapshot",
    name: "RDS Snapshot",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-RDS_64.svg`,
    label: "RDS Snapshot",
    size
  },
  {
    definitionId: "aws-dynamodb-table",
    name: "DynamoDB Table",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-DynamoDB_64.svg`,
    label: "DynamoDB Table",
    size
  },
  {
    definitionId: "aws-elasticache-redis",
    name: "ElastiCache Redis",
    area: "database",
    category: "Database",
    iconUrl: `${resourceIconPath}/Res_Database/Res_Amazon-ElastiCache_ElastiCache-for-Redis_48.svg`,
    label: "Redis",
    size
  },
  {
    definitionId: "aws-secretsmanager-secret",
    name: "Secrets Manager Secret",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Secrets-Manager_64.svg`,
    label: "Secrets Manager Secret",
    size
  },
  {
    definitionId: "aws-secretsmanager-secret-version",
    name: "Secrets Manager Secret Version",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Secrets-Manager_64.svg`,
    label: "Secret Version",
    size
  },
  {
    definitionId: "aws-lambda-function",
    name: "Lambda Function",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${serviceIconPath}/Arch_Compute/64/Arch_AWS-Lambda_64.svg`,
    label: "Lambda Function",
    size
  },
  {
    definitionId: "aws-lambda-permission",
    name: "Lambda Permission",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_AWS-Lambda_Lambda-Function_48.svg`,
    label: "Lambda Permission",
    size
  },
  {
    definitionId: "aws-lambda-event-source-mapping",
    name: "Lambda Event Source Mapping",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_AWS-Lambda_Lambda-Function_48.svg`,
    label: "Event Source",
    size
  },
  {
    definitionId: "aws-api-gateway-rest-api",
    name: "API Gateway REST API",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-API-Gateway_64.svg`,
    label: "REST API",
    size
  },
  {
    definitionId: "aws-api-gateway-authorizer",
    name: "API Gateway Authorizer",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-API-Gateway_64.svg`,
    label: "API Authorizer",
    size
  },
  {
    definitionId: "aws-api-gateway-websocket-api",
    name: "API Gateway WebSocket API",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-API-Gateway_64.svg`,
    label: "WebSocket API",
    size
  },
  {
    definitionId: "aws-api-gateway-resource",
    name: "API Gateway Resource",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    label: "API Resource",
    size
  },
  {
    definitionId: "aws-api-gateway-method",
    name: "API Gateway Method",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    label: "API Method",
    size
  },
  {
    definitionId: "aws-api-gateway-integration",
    name: "API Gateway Integration",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    label: "API Integration",
    size
  },
  {
    definitionId: "aws-api-gateway-stage",
    name: "API Gateway Stage",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    label: "API Stage",
    size
  },
  {
    definitionId: "aws-cloudwatch-log-group",
    name: "CloudWatch Log Group",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Management-Governance/Res_Amazon-CloudWatch_Logs_48.svg`,
    label: "Log Group",
    size
  },
  {
    definitionId: "aws-cloudwatch-metric-alarm",
    name: "CloudWatch Metric Alarm",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Management-Governance/Res_Amazon-CloudWatch_Alarm_48.svg`,
    label: "Metric Alarm",
    size
  },
  {
    definitionId: "aws-cloudwatch-dashboard",
    name: "CloudWatch Dashboard",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${serviceIconPath}/Arch_Management-Governance/64/Arch_Amazon-CloudWatch_64.svg`,
    label: "Dashboard",
    size
  },
  {
    definitionId: "aws-eventbridge-rule",
    name: "EventBridge Rule",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Application-Integration/Res_Amazon-EventBridge_Rule_48.svg`,
    label: "Event Rule",
    size
  },
  {
    definitionId: "aws-eventbridge-target",
    name: "EventBridge Target",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${serviceIconPath}/Arch_App-Integration/64/Arch_Amazon-EventBridge_64.svg`,
    label: "Event Target",
    size
  },
  {
    definitionId: "aws-codebuild-project",
    name: "CodeBuild Project",
    area: "tools",
    category: "CI/CD",
    iconUrl: `${serviceIconPath}/Arch_Developer-Tools/64/Arch_AWS-CodeBuild_64.svg`,
    label: "CodeBuild",
    size
  },
  {
    definitionId: "aws-codedeploy-app",
    name: "CodeDeploy App",
    area: "tools",
    category: "CI/CD",
    iconUrl: `${serviceIconPath}/Arch_Developer-Tools/64/Arch_AWS-CodeDeploy_64.svg`,
    label: "CodeDeploy App",
    size
  },
  {
    definitionId: "aws-codedeploy-deployment-group",
    name: "CodeDeploy Deployment Group",
    area: "tools",
    category: "CI/CD",
    iconUrl: `${serviceIconPath}/Arch_Developer-Tools/64/Arch_AWS-CodeDeploy_64.svg`,
    label: "Deployment Group",
    size
  },
  {
    definitionId: "aws-codepipeline",
    name: "CodePipeline",
    area: "tools",
    category: "CI/CD",
    iconUrl: `${serviceIconPath}/Arch_Developer-Tools/64/Arch_AWS-CodePipeline_64.svg`,
    label: "CodePipeline",
    size
  },
  {
    definitionId: "aws-codestarconnections-connection",
    name: "CodeStar Connection",
    area: "tools",
    category: "CI/CD",
    iconUrl: `${serviceIconPath}/Arch_Developer-Tools/64/Arch_AWS-CodePipeline_64.svg`,
    label: "CodeStar Connection",
    size
  },
  {
    definitionId: "aws-sns-topic",
    name: "SNS Topic",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Application-Integration/Res_Amazon-Simple-Notification-Service_Topic_48.svg`,
    label: "SNS Topic",
    size
  },
  {
    definitionId: "aws-sqs-queue",
    name: "SQS Queue",
    area: "tools",
    category: "Messaging / Events",
    iconUrl: `${resourceIconPath}/Res_Application-Integration/Res_Amazon-Simple-Queue-Service_Queue_48.svg`,
    label: "SQS Queue",
    size
  },
  {
    definitionId: "aws-step-functions-state-machine",
    name: "Step Functions State Machine",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${serviceIconPath}/Arch_App-Integration/64/Arch_AWS-Step-Functions_64.svg`,
    label: "State Machine",
    size
  },
  {
    definitionId: "aws-ecr-repository",
    name: "ECR Repository",
    area: "containers",
    category: "Containers",
    iconUrl: `${resourceIconPath}/Res_Containers/Res_Amazon-Elastic-Container-Registry_Registry_48.svg`,
    label: "ECR Repository",
    size
  },
  {
    definitionId: "aws-ecs-cluster",
    name: "ECS Cluster",
    area: "containers",
    category: "Containers",
    iconUrl: `${serviceIconPath}/Arch_Containers/64/Arch_Amazon-Elastic-Container-Service_64.svg`,
    label: "ECS Cluster",
    size
  },
  {
    definitionId: "aws-ecs-service",
    name: "ECS Service",
    area: "containers",
    category: "Containers",
    iconUrl: `${resourceIconPath}/Res_Containers/Res_Amazon-Elastic-Container-Service_Service_48.svg`,
    label: "ECS Service",
    size
  },
  {
    definitionId: "aws-ecs-task-definition",
    name: "ECS Task Definition",
    area: "containers",
    category: "Containers",
    iconUrl: `${resourceIconPath}/Res_Containers/Res_Amazon-Elastic-Container-Service_Task_48.svg`,
    label: "Task Definition",
    size
  },
  {
    definitionId: "aws-eks-cluster",
    name: "EKS Cluster",
    area: "containers",
    category: "Containers",
    iconUrl: `${serviceIconPath}/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg`,
    label: "EKS Cluster",
    size
  },
  {
    definitionId: "aws-network-acl",
    name: "Network ACL",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Network-Access-Control-List_48.svg`,
    label: "Network ACL",
    size
  },
  {
    definitionId: "aws-network-acl-rule",
    name: "Network ACL Rule",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Network-Access-Control-List_48.svg`,
    label: "NACL Rule",
    size
  },
  {
    definitionId: "aws-cloudfront-cache-policy",
    name: "CloudFront Cache Policy",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg`,
    label: "Cache Policy",
    size
  },
  {
    definitionId: "aws-cloudfront-origin-request-policy",
    name: "CloudFront Origin Request Policy",
    area: "network",
    category: "Network",
    iconUrl: `${serviceIconPath}/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg`,
    label: "Origin Request Policy",
    size
  },
  {
    definitionId: "aws-route53-zone",
    name: "Route 53 Hosted Zone",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-Route-53-Hosted-Zone_48.svg`,
    label: "Hosted Zone",
    size
  },
  {
    definitionId: "aws-wafv2-web-acl-association",
    name: "WAF Web ACL Association",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-WAF_64.svg`,
    label: "WAF Association",
    size
  },
  {
    definitionId: "aws-vpc-peering-connection",
    name: "VPC Peering Connection",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-VPC_Peering-Connection_48.svg`,
    label: "VPC Peering",
    size
  },
  {
    definitionId: "aws-kms-alias",
    name: "KMS Alias",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Key-Management-Service_64.svg`,
    label: "KMS Alias",
    size
  },
  {
    definitionId: "aws-lb-target-group-attachment",
    name: "ALB Target Group Attachment",
    area: "network",
    category: "Network",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg`,
    label: "Target Attachment",
    size
  },
  {
    definitionId: "aws-volume-attachment",
    name: "EBS Volume Attachment",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Elastic-Block-Store_Volume_48.svg`,
    label: "Volume Attachment",
    size
  },
  {
    definitionId: "aws-efs-file-system",
    name: "EFS File System",
    area: "storage",
    category: "Storage",
    iconUrl: `${resourceIconPath}/Res_Storage/Res_Amazon-Elastic-File-System_EFS-Standard_48.svg`,
    label: "EFS File System",
    size
  },
  {
    definitionId: "aws-efs-mount-target",
    name: "EFS Mount Target",
    area: "storage",
    category: "Storage",
    iconUrl: `${serviceIconPath}/Arch_Storage/64/Arch_Amazon-EFS_64.svg`,
    label: "EFS Mount Target",
    size
  },
  {
    definitionId: "aws-efs-access-point",
    name: "EFS Access Point",
    area: "storage",
    category: "Storage",
    iconUrl: `${serviceIconPath}/Arch_Storage/64/Arch_Amazon-EFS_64.svg`,
    label: "EFS Access Point",
    size
  },
  {
    definitionId: "aws-rds-cluster-instance",
    name: "RDS Cluster Instance",
    area: "database",
    category: "Database",
    iconUrl: `${resourceIconPath}/Res_Database/Res_Amazon-Aurora_Amazon-RDS-Instance_48.svg`,
    label: "Cluster Instance",
    size
  },
  {
    definitionId: "aws-elasticache-subnet-group",
    name: "ElastiCache Subnet Group",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-ElastiCache_64.svg`,
    label: "Cache Subnet Group",
    size
  },
  {
    definitionId: "aws-elasticache-parameter-group",
    name: "ElastiCache Parameter Group",
    area: "database",
    category: "Database",
    iconUrl: `${serviceIconPath}/Arch_Database/64/Arch_Amazon-ElastiCache_64.svg`,
    label: "Cache Parameter Group",
    size
  },
  {
    definitionId: "aws-lambda-alias",
    name: "Lambda Alias",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Compute/Res_AWS-Lambda_Lambda-Function_48.svg`,
    label: "Lambda Alias",
    size
  },
  {
    definitionId: "aws-api-gateway-v2-route",
    name: "API Gateway V2 Route",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    label: "V2 Route",
    size
  },
  {
    definitionId: "aws-api-gateway-v2-integration",
    name: "API Gateway V2 Integration",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    label: "V2 Integration",
    size
  },
  {
    definitionId: "aws-api-gateway-v2-stage",
    name: "API Gateway V2 Stage",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    label: "V2 Stage",
    size
  },
  {
    definitionId: "aws-api-gateway-deployment",
    name: "API Gateway Deployment",
    area: "application",
    category: "Serverless / Application",
    iconUrl: `${resourceIconPath}/Res_Networking-Content-Delivery/Res_Amazon-API-Gateway_Endpoint_48.svg`,
    label: "API Deployment",
    size
  },
  {
    definitionId: "aws-cloudwatch-log-stream",
    name: "CloudWatch Log Stream",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${resourceIconPath}/Res_Management-Governance/Res_Amazon-CloudWatch_Logs_48.svg`,
    label: "Log Stream",
    size
  },
  {
    definitionId: "aws-cloudwatch-log-resource-policy",
    name: "CloudWatch Log Resource Policy",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${serviceIconPath}/Arch_Management-Governance/64/Arch_Amazon-CloudWatch_64.svg`,
    label: "Log Resource Policy",
    size
  },
  {
    definitionId: "aws-eventbridge-permission",
    name: "EventBridge Permission",
    area: "tools",
    category: "Messaging / Events",
    iconUrl: `${serviceIconPath}/Arch_App-Integration/64/Arch_Amazon-EventBridge_64.svg`,
    label: "Event Permission",
    size
  },
  {
    definitionId: "aws-scheduler-schedule",
    name: "EventBridge Scheduler Schedule",
    area: "tools",
    category: "Messaging / Events",
    iconUrl: `${resourceIconPath}/Res_Application-Integration/Res_Amazon-EventBridge_Scheduler_48.svg`,
    label: "Schedule",
    size
  },
  {
    definitionId: "aws-sns-topic-subscription",
    name: "SNS Topic Subscription",
    area: "tools",
    category: "Messaging / Events",
    iconUrl: `${resourceIconPath}/Res_Application-Integration/Res_Amazon-Simple-Notification-Service_HTTP-Notification_48.svg`,
    label: "SNS Subscription",
    size
  },
  {
    definitionId: "aws-acm-certificate-validation",
    name: "ACM Certificate Validation",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Certificate-Manager_64.svg`,
    label: "Cert Validation",
    size
  },
  {
    definitionId: "aws-ecr-lifecycle-policy",
    name: "ECR Lifecycle Policy",
    area: "containers",
    category: "Containers",
    iconUrl: `${resourceIconPath}/Res_Containers/Res_Amazon-Elastic-Container-Registry_Registry_48.svg`,
    label: "ECR Lifecycle",
    size
  },
  {
    definitionId: "aws-ecs-capacity-provider",
    name: "ECS Capacity Provider",
    area: "containers",
    category: "Containers",
    iconUrl: `${serviceIconPath}/Arch_Containers/64/Arch_Amazon-Elastic-Container-Service_64.svg`,
    label: "Capacity Provider",
    size
  },
  {
    definitionId: "aws-eks-node-group",
    name: "EKS Node Group",
    area: "containers",
    category: "Containers",
    iconUrl: `${serviceIconPath}/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg`,
    label: "Node Group",
    size
  },
  {
    definitionId: "aws-eks-addon",
    name: "EKS Add-on",
    area: "containers",
    category: "Containers",
    iconUrl: `${serviceIconPath}/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg`,
    label: "EKS Add-on",
    size
  },
  {
    definitionId: "kubernetes-namespace",
    name: "Kubernetes Namespace",
    area: "containers",
    category: "Containers",
    iconUrl: `${serviceIconPath}/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg`,
    label: "Namespace",
    size
  },
  {
    definitionId: "kubernetes-deployment",
    name: "Kubernetes Deployment",
    area: "containers",
    category: "Containers",
    iconUrl: `${serviceIconPath}/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg`,
    label: "Deployment",
    size
  },
  {
    definitionId: "kubernetes-service",
    name: "Kubernetes Service",
    area: "containers",
    category: "Containers",
    iconUrl: `${serviceIconPath}/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg`,
    label: "Service",
    size
  },
  {
    definitionId: "aws-config-configuration-recorder",
    name: "AWS Config Recorder",
    area: "tools",
    category: "Governance / Config",
    iconUrl: `${serviceIconPath}/Arch_Management-Governance/64/Arch_AWS-Config_64.svg`,
    label: "Config Recorder",
    size
  },
  {
    definitionId: "aws-config-delivery-channel",
    name: "AWS Config Delivery Channel",
    area: "tools",
    category: "Governance / Config",
    iconUrl: `${serviceIconPath}/Arch_Management-Governance/64/Arch_AWS-Config_64.svg`,
    label: "Delivery Channel",
    size
  },
  {
    definitionId: "aws-config-rule",
    name: "AWS Config Rule",
    area: "tools",
    category: "Governance / Config",
    iconUrl: `${serviceIconPath}/Arch_Management-Governance/64/Arch_AWS-Config_64.svg`,
    label: "Config Rule",
    size
  },
  {
    definitionId: "aws-cloudtrail",
    name: "CloudTrail",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${serviceIconPath}/Arch_Management-Governance/64/Arch_AWS-CloudTrail_64.svg`,
    label: "CloudTrail",
    size
  },
  {
    definitionId: "aws-xray-group",
    name: "X-Ray Group",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${serviceIconPath}/Arch_Developer-Tools/64/Arch_AWS-X-Ray_64.svg`,
    label: "X-Ray Group",
    size
  },
  {
    definitionId: "aws-xray-sampling-rule",
    name: "X-Ray Sampling Rule",
    area: "tools",
    category: "Observability / Operations",
    iconUrl: `${serviceIconPath}/Arch_Developer-Tools/64/Arch_AWS-X-Ray_64.svg`,
    label: "Sampling Rule",
    size
  },
  {
    definitionId: "aws-shield-protection",
    name: "Shield Protection",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_AWS-Shield_64.svg`,
    label: "Shield Protection",
    size
  },
  {
    definitionId: "aws-guardduty-detector",
    name: "GuardDuty Detector",
    area: "security-identity",
    category: "Security",
    iconUrl: `${serviceIconPath}/Arch_Security-Identity-Compliance/64/Arch_Amazon-GuardDuty_64.svg`,
    label: "GuardDuty",
    size
  }
] as const satisfies readonly TerraformResourcePresentation[];

export const resourceCatalog: ResourceItem[] = [
  ...designCatalogItems,
  ...terraformResourcePresentations.map(createTerraformResourceItem)
];

function createTerraformResourceItem(presentation: TerraformResourcePresentation): ResourceItem {
  const definition = requireResourceDefinition(presentation.definitionId);

  return {
    id: definition.id,
    name: presentation.name,
    cloudProvider: definition.provider,
    area: presentation.area,
    category: resourceCategoryOverrides[definition.id] ?? presentation.category,
    iconUrl: presentation.iconUrl,
    enabled: true,
    nodeDefaults: {
      ...(definition.terraform.blockType !== "resource"
        ? { terraformBlockType: definition.terraform.blockType }
        : {}),
      type: definition.terraform.resourceType,
      label: presentation.label,
      size: presentation.size
    }
  };
}

function requireResourceDefinition(definitionId: string): ResourceDefinition {
  const definition = getResourceDefinitionById(definitionId);

  if (!definition) {
    throw new Error(`Missing shared resource definition: ${definitionId}`);
  }

  return definition;
}
