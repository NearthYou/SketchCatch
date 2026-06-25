export type IsoDateTimeString = string;

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "internal_server_error";

export type ApiErrorResponse = {
  error: ApiErrorCode;
  message: string;
};

export type LoginLockedErrorResponse = ApiErrorResponse & {
  error: "too_many_requests";
  lockedUntil: IsoDateTimeString;
};

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

export type User = {
  id: string;
  username: string;
  email: string;
  nickname: string;
  createdAt: IsoDateTimeString;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export type SignupRequest = {
  username: string;
  email: string;
  nickname: string;
  password: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type RefreshTokenRequest = {
  refreshToken: string;
};

export type LogoutRequest = {
  refreshToken: string;
};

export type AuthResponse = {
  user: User;
  session: AuthSession;
};

export type CurrentUserResponse = {
  user: User;
};

export type Project = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type ProjectListResponse = {
  projects: Project[];
};

export type ProjectResponse = {
  project: Project;
};

export type CreateProjectRequest = {
  name: string;
  description?: string | undefined;
};

export type ArchitectureSource = "manual" | "prompt" | "imported";

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

export type ProjectDetailsResponse = {
  project: Project;
  architectures: ArchitectureSnapshot[];
  assets: ProjectAsset[];
};

export type CreateArchitectureSnapshotRequest = {
  version?: number | undefined;
  source?: string | undefined;
  architectureJson: ArchitectureJson;
};

export type CreateProjectAssetUploadRequest = {
  architectureId?: string | undefined;
  assetType: ProjectAssetType;
  fileName: string;
  contentType: string;
  byteSize?: number | undefined;
};

export type ProjectAssetUploadResponse = {
  asset: ProjectAsset;
  upload: {
    method: "PUT";
    url: string;
    headers: {
      "Content-Type": string;
    };
    expiresInSeconds: number;
  };
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

export type AiResultSource = "prompt" | "github" | "template_fallback" | "llm_fallback";

export type AiConfidence = "low" | "medium" | "high";

export type AiResultMetadata = {
  source: AiResultSource;
  confidence: AiConfidence;
  assumptions: string[];
  explanations: string[];
};

export type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  metadata: AiResultMetadata;
};

export type MoneyEstimate = {
  amount: number;
  currency: "USD" | "KRW";
};

export type ResourceCostEstimate = {
  resourceId: string;
  resourceType: ResourceType;
  name: string;
  monthlyEstimate: MoneyEstimate;
  costDrivers: string[];
  explanation: string;
};

export type CheckFindingCategory =
  | "cost"
  | "security"
  | "configuration"
  | "permission"
  | "network"
  | "performance"
  | "availability";

export type CheckFinding = {
  id: string;
  category: CheckFindingCategory;
  severity: RiskLevel;
  resourceId?: string | undefined;
  title: string;
  description: string;
  recommendation: string;
};

export type ChecklistItemStatus = "pass" | "warning" | "fail";

export type ChecklistItem = {
  id: string;
  label: string;
  status: ChecklistItemStatus;
  relatedFindingIds: string[];
};

export type AiPreDeploymentAnalysisResult = {
  summary: string;
  totalMonthlyEstimate: MoneyEstimate & {
    pricingAssumption: string;
  };
  resourceCostEstimates: ResourceCostEstimate[];
  findings: CheckFinding[];
  checklist: ChecklistItem[];
};

export type AiTerraformStage = "validate" | "export" | "plan" | "apply";

export type AiTerraformErrorCategory =
  | "permission"
  | "credential"
  | "region_or_resource"
  | "quota"
  | "syntax"
  | "dependency"
  | "unknown";

export type AiTerraformErrorExplanationResult = {
  stage: AiTerraformStage;
  category: AiTerraformErrorCategory;
  severity: RiskLevel;
  rawMessage: string;
  summary: string;
  likelyCause: string;
  nextActions: string[];
  relatedResourceId?: string | undefined;
};

export type AiTerraformDetectedResource = {
  terraformType: string;
  label: string;
  explanation: string;
};

export type AiTerraformPreviewExplanationResult = {
  summary: string;
  detectedResources: AiTerraformDetectedResource[];
  findings: CheckFinding[];
  checklist: ChecklistItem[];
};

export type PracticeSession = {
  id: string;
  name: string;
  expiresAt: IsoDateTimeString;
};

export type AwsResourceType = ResourceType;
export type ArchitectureNode = ResourceNode;
export type ArchitectureEdge = ResourceEdge;

export type DiagramNodeKind = "resource" | "design";

export type TerraformBlockType = "resource" | "data";

export type DiagramNodeStyle = {
  textColor?: string | undefined;
  borderColor?: string | undefined;
};

export type DiagramNodeParameters = {
  terraformBlockType?: TerraformBlockType | undefined;
  resourceType: string;
  resourceName: string;
  fileName: string;
  values: Record<string, unknown>;
  invalid?: boolean | undefined;
};

export type DiagramNode = {
  id: string;
  type: string;
  kind: DiagramNodeKind;
  position: { x: number; y: number };
  size: { width: number; height: number };
  label: string;
  iconUrl?: string | undefined;
  locked: boolean;
  zIndex: number;
  style?: DiagramNodeStyle | undefined;
  parameters?: DiagramNodeParameters | undefined;
};

export type DiagramEdgeStyle = {
  color?: string | undefined;
  width?: "thin" | "medium" | "thick" | undefined;
  animated?: boolean | undefined;
};

export type DiagramEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandleId?: string | undefined;
  targetHandleId?: string | undefined;
  label?: string | undefined;
  type?: string | undefined;
  style?: DiagramEdgeStyle | undefined;
};

export type DiagramViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type DiagramJson = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport: DiagramViewport;
};

export type ProjectDraft = {
  projectId: string;
  diagramJson: DiagramJson;
  revision: number;
  serverSavedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type SaveProjectDraftRequest = {
  diagramJson: DiagramJson;
};

export type ProjectDraftResponse = {
  draft: ProjectDraft | null;
};

export type TerraformGenerateRequest = {
  diagramJson: DiagramJson;
};

export type TerraformGenerateResponse = {
  terraformCode: string;
};

export type CloudProvider = "aws";

export type ResourceArea =
  | "containers"
  | "compute"
  | "network"
  | "storage"
  | "database"
  | "security-identity"
  | "tools"
  | "ai"
  | "application"
  | "other";

export type ResourceItem = {
  id: string;
  name: string;
  cloudProvider: CloudProvider;
  area: ResourceArea;
  category?: string | undefined;
  iconUrl: string;
  enabled: boolean;
  nodeDefaults: {
    terraformBlockType?: TerraformBlockType | undefined;
    type: string;
    label: string;
    size: {
      width: number;
      height: number;
    };
  };
};

export type ResourceDragPayload = {
  source: "resource-settings-panel";
  item: ResourceItem;
};

export type ParameterInputKind =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "multi-select"
  | "key-value"
  | "reference-picker"
  | "nested-block";

export type ResourceParameterDefinition = {
  name: string;
  terraformName: string;
  label: string;
  type: "string" | "number" | "boolean" | "list" | "set" | "map" | "object";
  required: boolean;
  optional: boolean;
  computed: boolean;
  sensitive: boolean;
  description?: string | undefined;
  inputKind: ParameterInputKind;
  options?: string[] | undefined;
  referenceTargetTypes?: string[] | undefined;
  referenceAttribute?: string | undefined;
};

export type TerraformResourceParameterCatalog = {
  provider: CloudProvider;
  generatedAt: IsoDateTimeString;
  source: string;
  resources: Record<string, ResourceParameterDefinition[]>;
};

export type ResourceNodeParameters = DiagramNodeParameters;
