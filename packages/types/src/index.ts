export type AwsResourceType = "ec2" | "s3" | "rds" | "lambda" | "vpc" | "unknown";

export type ArchitectureNode = {
  id: string;
  label: string;
  resourceType: AwsResourceType;
};

export type ArchitectureEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type BudgetLimit = {
  amount: number;
  currency: string;
};

export type RiskLevel = "low" | "medium" | "high";

export type PracticeSession = {
  id: string;
  name: string;
  expiresAt: string;
};
