import type { ResourceType } from "@sketchcatch/types";

const resourceTypeLabels: Record<ResourceType, string> = {
	VPC: "VPC",
	SUBNET: "Subnet",
	INTERNET_GATEWAY: "Internet Gateway",
	ROUTE_TABLE: "Route Table",
	ROUTE_TABLE_ASSOCIATION: "Route Table Association",
	EC2: "EC2",
	RDS: "RDS",
	S3: "S3",
	SECURITY_GROUP: "Security Group",
	CLOUDFRONT: "CloudFront",
	LAMBDA: "Lambda",
	AMI: "AMI",
	IAM_ROLE: "IAM Role",
	IAM_POLICY: "IAM Policy",
	IAM_INSTANCE_PROFILE: "IAM Instance Profile",
	KMS_KEY: "KMS Key",
	CLOUDWATCH_LOG_GROUP: "CloudWatch Log Group",
	CLOUDWATCH_METRIC_ALARM: "CloudWatch Metric Alarm",
	API_GATEWAY_REST_API: "API Gateway REST API",
	LAMBDA_PERMISSION: "Lambda Permission",
	UNKNOWN: "Unknown"
};

// 내부 ResourceType 값을 화면에 보여줄 짧은 이름으로 바꿉니다.
export function getResourceTypeLabel(resourceType: ResourceType): string {
	return resourceTypeLabels[resourceType];
}
