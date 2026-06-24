export type IsoDateTimeString = string;

export type ResourceType =
  | "VPC"
  | "SUBNET"
  | "EC2"
  | "RDS"
  | "S3"
  | "SECURITY_GROUP"
  | "CLOUDFRONT"
  | "LAMBDA"
  | "UNKNOWN";

export type ResourceConfig = Record<string, unknown>;

export type ResourceNode = {
  id: string;
  type: ResourceType;
  label?: string | undefined;
  positionX: number;
  positionY: number;
  config: ResourceConfig;
};

export type ResourceEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string | undefined;
};

export type ArchitectureJson = {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
};

export type AnonymousWorkspace = {
  id: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type User = {
  id: string;
  email: string;
  nickname: string;
  createdAt: IsoDateTimeString;
};

export type Project = {
  id: string;
  workspaceId: string;
  userId?: string | undefined;
  name: string;
  description: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type ArchitectureSource = "manual" | "prompt_mock" | "imported";

export type ArchitectureSnapshot = {
  id: string;
  projectId: string;
  version: number;
  source: ArchitectureSource | string;
  architectureJson: ArchitectureJson;
  createdAt: IsoDateTimeString;
};

export type ProjectAssetType =
  | "diagram_png"
  | "diagram_svg"
  | "terraform_file"
  | "project_export_zip"
  | "thumbnail";

export type ProjectAsset = {
  id: string;
  projectId: string;
  architectureId: string | null;
  assetType: ProjectAssetType;
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number | null;
  createdAt: IsoDateTimeString;
};

export type TerraformArtifact = ProjectAsset & {
  assetType: "terraform_file";
  architectureId: string;
};

export type DeploymentStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";

export type Deployment = DeploymentBlock & {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  status: DeploymentStatus;
  planSummary: DeploymentPlanSummary | null;
  failureStage: DeploymentFailureStage | null;
  errorSummary: string | null;
  approvedAt: IsoDateTimeString | null;
  approvedBy: string | null;
  approvedTerraformArtifactId: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type DeploymentBlock = {
  isBlocked: boolean;
  blockedBy: DeploymentBlockedBy | null;
  blockedReason: string | null;
};

export type DeploymentWarningLevel = "low" | "medium" | "high";
export type DeploymentBlockedBy = "risk_analysis" | "cost_analysis" | "missing_approval";
export type DeploymentFailureStage = "validation" | "plan" | "approval" | "mock_run";

export type DeploymentPlanWarning = {
  level: DeploymentWarningLevel;
  message: string;
  relatedResourceId?: string;
};

export type DeploymentPlanSummary = {
  createCount: number;
  updateCount: number;
  deleteCount: number;
  replaceCount: number;
  blocked: boolean;
  warnings: DeploymentPlanWarning[];
};

export type DeploymentStage = "validate" | "plan" | "apply";

export type Template = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  architectureJson: ArchitectureJson;
  likeCount: number;
  createdAt: IsoDateTimeString;
};

export type AwsCredential = {
  id: string;
  userId: string;
  accountId: string;
  roleArn: string;
  createdAt: IsoDateTimeString;
};

export type DeploymentLogLevel = "INFO" | "WARN" | "ERROR";

export type DeploymentLog = {
  id: string;
  deploymentId: string;
  sequence: number;
  stage: DeploymentStage;
  level: DeploymentLogLevel;
  message: string;
  relatedResourceId: string | null;
  createdAt: IsoDateTimeString;
};

export type Activity = {
  id: string;
  userId: string;
  action: string;
  createdAt: IsoDateTimeString;
};

export type BudgetLimit = {
  amount: number;
  currency: string;
};

export type RiskLevel = "low" | "medium" | "high";

export type PracticeSession = {
  id: string;
  name: string;
  expiresAt: IsoDateTimeString;
};

export type AwsResourceType = ResourceType;
export type ArchitectureNode = ResourceNode;
export type ArchitectureEdge = ResourceEdge;
