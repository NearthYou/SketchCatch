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
	UNKNOWN: "Unknown"
};

// 내부 ResourceType 값을 화면에 보여줄 짧은 이름으로 바꿉니다.
export function getResourceTypeLabel(resourceType: ResourceType): string {
	return resourceTypeLabels[resourceType];
}
