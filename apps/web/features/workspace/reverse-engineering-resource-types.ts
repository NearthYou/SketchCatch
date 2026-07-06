import type { ResourceType, ReverseEngineeringResourceSelection } from "../../../../packages/types/src";

export const REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION = "ALL" satisfies ReverseEngineeringResourceSelection;

export const REVERSE_ENGINEERING_RESOURCE_TYPES: ResourceType[] = [
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "SECURITY_GROUP",
  "EC2",
  "RDS",
  "S3"
];

export const REVERSE_ENGINEERING_RESOURCE_SELECTIONS: ReverseEngineeringResourceSelection[] = [
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  ...REVERSE_ENGINEERING_RESOURCE_TYPES
];
