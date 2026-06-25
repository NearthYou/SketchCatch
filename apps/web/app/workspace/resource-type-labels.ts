import type { ResourceType } from "@sketchcatch/types";

const resourceTypeLabels: Record<ResourceType, string> = {
	VPC: "VPC",
	SUBNET: "Subnet",
	EC2: "EC2",
	RDS: "RDS",
	S3: "S3",
	SECURITY_GROUP: "Security Group",
	CLOUDFRONT: "CloudFront",
	LAMBDA: "Lambda",
	UNKNOWN: "Unknown"
};

export function getResourceTypeLabel(resourceType: ResourceType): string {
	return resourceTypeLabels[resourceType];
}
