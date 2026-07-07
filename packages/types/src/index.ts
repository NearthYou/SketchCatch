// allow: SIZE_OK - shared package root contract; splitting needs a separate repo-wide migration.
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
  | "INTERNET_GATEWAY"
  | "ROUTE_TABLE"
  | "ROUTE_TABLE_ASSOCIATION"
  | "EC2"
  | "RDS"
  | "S3"
  | "SECURITY_GROUP"
  | "CLOUDFRONT"
  | "ROUTE53_RECORD"
  | "WAF_WEB_ACL"
  | "LOAD_BALANCER"
  | "LOAD_BALANCER_LISTENER"
  | "LAMBDA"
  | "AMI"
  | "IAM_ROLE"
  | "IAM_POLICY"
  | "IAM_INSTANCE_PROFILE"
  | "KMS_KEY"
  | "DB_SUBNET_GROUP"
  | "SECRETS_MANAGER_SECRET"
  | "VPC_ENDPOINT"
  | "CLOUDWATCH_LOG_GROUP"
  | "CLOUDWATCH_METRIC_ALARM"
  | "API_GATEWAY_REST_API"
  | "LAMBDA_PERMISSION"
  | "UNKNOWN";

export type ReverseEngineeringResourceSelection = "ALL" | ResourceType;

export type CloudProvider = "aws";

export type TerraformBlockType = "resource" | "data";

export type TerraformBlockIdentity = {
  terraformBlockType: TerraformBlockType;
  resourceType: string;
  resourceName: string;
};

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

export type InfrastructureGraphNodeIaC = {
  provider: CloudProvider;
  terraformBlockType: TerraformBlockType;
  resourceType: string;
  resourceName: string;
  fileName?: string | undefined;
};

export type InfrastructureGraphNode = {
  id: string;
  label?: string | undefined;
  iac: InfrastructureGraphNodeIaC;
  config: ResourceConfig;
};

export type InfrastructureGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string | undefined;
};

export type InfrastructureGraph = {
  nodes: InfrastructureGraphNode[];
  edges: InfrastructureGraphEdge[];
};

export type User = {
  id: string;
  username: string;
  email: string;
  nickname: string;
  createdAt: IsoDateTimeString;
};

export type OAuthProvider = "naver" | "kakao" | "github";

export type AuthSession = {
  accessToken: string;
  expiresInSeconds: number;
};

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_REQUIRED_CATEGORY_COUNT = 3;
export const PASSWORD_POLICY_HELP_TEXT =
  "10자 이상, 영어 대문자/소문자/숫자/특수문자 중 3가지 이상을 포함해주세요.";
export const PASSWORD_POLICY_ERROR_MESSAGE =
  "비밀번호는 10자 이상, 영어 대문자/소문자/숫자/특수문자 중 3가지 이상을 포함해야 합니다.";

const PASSWORD_UPPERCASE_PATTERN = /[A-Z]/;
const PASSWORD_LOWERCASE_PATTERN = /[a-z]/;
const PASSWORD_NUMBER_PATTERN = /[0-9]/;
const PASSWORD_SPECIAL_CHARACTER_PATTERN = /[^\p{L}\p{N}\s]/u;

export function getPasswordPolicyCategoryCount(password: string): number {
  return [
    PASSWORD_UPPERCASE_PATTERN,
    PASSWORD_LOWERCASE_PATTERN,
    PASSWORD_NUMBER_PATTERN,
    PASSWORD_SPECIAL_CHARACTER_PATTERN
  ].filter((pattern) => pattern.test(password)).length;
}

export function isPasswordPolicySatisfied(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    getPasswordPolicyCategoryCount(password) >= PASSWORD_REQUIRED_CATEGORY_COUNT
  );
}

export function getPasswordPolicyErrorMessage(password: string): string | null {
  return isPasswordPolicySatisfied(password) ? null : PASSWORD_POLICY_ERROR_MESSAGE;
}

export type SignupRequest = {
  username: string;
  email: string;
  nickname: string;
  password: string;
  privacyAccepted: boolean;
  termsAccepted: boolean;
};

export type SignupAvailabilityRequest = {
  username?: string | undefined;
  email?: string | undefined;
};

export type SignupAvailabilityResponse = {
  usernameAvailable?: boolean | undefined;
  emailAvailable?: boolean | undefined;
};

export type LoginRequest = {
  username: string;
  password: string;
  rememberMe: boolean;
};

export type PasswordResetRequest = {
  email: string;
};

export type PasswordResetRequestResponse = {
  debugResetToken?: string | undefined;
  debugResetUrl?: string | undefined;
  ok: true;
};

export type PasswordResetConfirmRequest = {
  resetToken: string;
  newPassword: string;
};

export type PasswordResetConfirmResponse = {
  ok: true;
};

export type RefreshTokenRequest = Record<string, never>;

export type LogoutRequest = Record<string, never>;

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

export type ProjectDeletePreviewMode =
  | "plain"
  | "planned"
  | "deployment_history"
  | "active_resources"
  | "blocked_running_deployment"
  | "blocked_multiple_active_deployments";

export type ProjectDeleteAction =
  | "delete_project"
  | "delete_project_only"
  | "destroy_then_delete";

export type DeleteProjectRequest = {
  action: Exclude<ProjectDeleteAction, "destroy_then_delete">;
};

export type ProjectDeletePreview = {
  projectId: string;
  mode: ProjectDeletePreviewMode;
  hasDeploymentHistory: boolean;
  hasPlanHistory: boolean;
  activeDeploymentId: string | null;
  activeDeploymentCount: number;
  activeResourceCount: number;
  latestDeploymentStatus: DeploymentStatus | null;
  message: string;
  availableActions: ProjectDeleteAction[];
};

export type ProjectDeletePreviewResponse = {
  preview: ProjectDeletePreview;
};

export type ProjectDeleteCleanupStatus = "success" | "partial_failed" | "failed";

export type DeleteProjectResponse = {
  deleted: true;
  cleanup: {
    s3Status: ProjectDeleteCleanupStatus;
    failedObjectCount: number;
    message: string | null;
  };
};

export type ArchitectureSource = "manual" | "prompt" | "ai_draft" | "imported";

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

export type ProjectAssetUploadStatus = "pending" | "uploaded";

export type ProjectAsset = {
  id: string;
  projectId: string;
  architectureId: string | null;
  assetType: ProjectAssetType;
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number | null;
  uploadStatus: ProjectAssetUploadStatus;
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
  reverseEngineering?: {
    sourceScanId: string;
    draftId: string;
  } | undefined;
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

export type ConfirmProjectAssetUploadResponse = {
  asset: ProjectAsset;
};

export type TerraformArtifact = ProjectAsset & {
  assetType: "terraform_file";
  architectureId: string;
  uploadStatus: "uploaded";
};

export type SourceRepositoryProvider = "internal" | "github";

export type SourceRepositoryStatus = "active" | "inactive";

export type SourceRepository = {
  id: string;
  projectId: string;
  provider: SourceRepositoryProvider;
  status: SourceRepositoryStatus;
  githubInstallationId: string | null;
  githubRepositoryId: string | null;
  owner: string;
  name: string;
  defaultBranch: string;
  repositoryUrl: string | null;
  visibility: "public" | "private" | "internal" | null;
  archived: boolean;
  disconnectedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type SourceRepositoryListResponse = {
  repositories: SourceRepository[];
};

export type GitHubAppInstallUrlResponse = {
  installUrl: string;
  expiresAt: IsoDateTimeString;
};

export type GitHubAppExistingInstallationCallbackUrlResponse = {
  callbackUrl: string;
  expiresAt: IsoDateTimeString;
};

export type GitHubRepositoryCandidate = {
  githubRepositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  repositoryUrl: string | null;
  visibility: "public" | "private" | "internal";
  archived: boolean;
};

export type ListGitHubInstallationRepositoriesRequest = {
  installationId: string;
  state: string;
};

export type ListGitHubInstallationRepositoriesResponse = {
  projectId: string;
  repositories: GitHubRepositoryCandidate[];
};

export type ConnectGitHubSourceRepositoryRequest = {
  installationId: string;
  githubRepositoryId: string;
  state: string;
};

export type SourceRepositoryResponse = {
  repository: SourceRepository;
};

export type GitCicdHandoffStatus =
  | "draft"
  | "pr_created"
  | "pipeline_running"
  | "pipeline_success"
  | "pipeline_failed"
  | "cancelled";

export type GitCicdHandoffKind = "terraform_iac" | "static_site";

export type GitCicdHandoff = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  handoffKind: GitCicdHandoffKind;
  sourceRepositoryId: string;
  repositoryProvider: SourceRepositoryProvider;
  repositoryOwner: string;
  repositoryName: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitMessage: string | null;
  pullRequestTitle: string | null;
  pullRequestUrl: string | null;
  pullRequestHeadSha: string | null;
  pipelineRunUrl: string | null;
  status: GitCicdHandoffStatus;
  statusMessage: string | null;
  userAcceptedChangeId: string;
  createdByUserId: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type CreateGitCicdHandoffRequest = {
  architectureId: string;
  terraformArtifactId: string;
  handoffKind?: GitCicdHandoffKind | undefined;
  sourceRepositoryId: string;
  targetBranch?: string | undefined;
  sourceBranch?: string | undefined;
  commitMessage?: string | undefined;
  pullRequestTitle?: string | undefined;
  planSummary?: DeploymentPlanSummary | undefined;
  userAcceptedChangeId: string;
};

export type UpdateGitCicdHandoffStatusRequest = {
  status: GitCicdHandoffStatus;
  pullRequestUrl?: string | null | undefined;
  pipelineRunUrl?: string | null | undefined;
  pullRequestHeadSha?: string | null | undefined;
  statusMessage?: string | null | undefined;
};

export type GitCicdHandoffPipelineStatus = {
  id: string;
  projectId: string;
  status: GitCicdHandoffStatus;
  pullRequestUrl: string | null;
  pipelineRunUrl: string | null;
  statusMessage: string | null;
  updatedAt: IsoDateTimeString;
  source: "runtime_cache" | "rds";
};

export type GitCicdHandoffResponse = {
  handoff: GitCicdHandoff;
};

export type GitCicdHandoffListResponse = {
  handoffs: GitCicdHandoff[];
};

export type GitCicdHandoffPipelineStatusResponse = {
  pipelineStatus: GitCicdHandoffPipelineStatus;
};

export type DeploymentStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "DESTROYED";

export type Deployment = DeploymentBlock & {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string | null;
  liveProfile: DeploymentLiveProfile;
  currentPlanArtifactId: string | null;
  currentPlanOperation: "apply" | "destroy" | null;
  stateObjectKey: string | null;
  resultWarningSummary: string | null;
  status: DeploymentStatus;
  activeStage: DeploymentStage | null;
  planSummary: DeploymentPlanSummary | null;
  failureStage: DeploymentFailureStage | null;
  errorSummary: string | null;
  approvedAt: IsoDateTimeString | null;
  approvedByUserId: string | null;
  approvedTerraformArtifactId: string | null;
  approvedPlanArtifactId: string | null;
  approvedTerraformArtifactHash: string | null;
  approvedTfplanHash: string | null;
  approvedAwsAccountId: string | null;
  approvedAwsRegion: string | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  failedAt: IsoDateTimeString | null;
  cancelRequestedAt: IsoDateTimeString | null;
  cancelledAt: IsoDateTimeString | null;
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

export type DeploymentPlanWarningSource =
  | "pre_deployment_check"
  | "terraform_plan"
  | "cost_risk"
  | "approval_snapshot";

export type DeploymentPlanWarningCode =
  | "PUBLIC_RDS"
  | "PUBLIC_SSH"
  | "PUBLIC_S3"
  | "IAM_WILDCARD"
  | "DESTRUCTIVE_CHANGE"
  | "UNSUPPORTED_RESOURCE"
  | "UNKNOWN_TERRAFORM_ACTION"
  | "MISSING_APPROVAL";

export type TerraformSourceLocation = {
  fileName: string;
  line: number;
  column?: number | undefined;
  resourceAddress?: string | undefined;
  terraformBlockType?: string | undefined;
  terraformBlockName?: string | undefined;
};

export type DeploymentPlanWarning = {
  id: string;
  level: DeploymentWarningLevel;
  category?: CheckFindingCategory;
  source: DeploymentPlanWarningSource;
  code: DeploymentPlanWarningCode;
  message: string;
  relatedFindingId?: string;
  relatedResourceId?: string;
  sourceLocation?: TerraformSourceLocation | undefined;
  requiresAcknowledgement: boolean;
  blocksApproval: boolean;
};

export type DeploymentPlanSummary = {
  createCount: number;
  updateCount: number;
  deleteCount: number;
  replaceCount: number;
  blocked: boolean;
  warnings: DeploymentPlanWarning[];
};

export type ApproveDeploymentPlanRequest = {
  acknowledgedWarningIds: string[];
};

export type DeploymentStage = "init" | "validate" | "plan" | "apply" | "destroy";

export type Template = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  architectureJson: ArchitectureJson;
  likeCount: number;
  createdAt: IsoDateTimeString;
};

export type AwsConnectionStatus = "pending" | "verified" | "failed";

export type AwsConnection = {
  id: string;
  userId: string;
  accountId: string | null;
  roleArn: string | null;
  externalId: string;
  region: string;
  status: AwsConnectionStatus;
  lastVerifiedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type DeploymentPlanArtifact = {
  id: string;
  deploymentId: string;
  terraformArtifactId: string;
  terraformArtifactSha256: string | null;
  operation: "apply" | "destroy";
  objectKey: string;
  sha256: string;
  accountId: string;
  region: string;
  createdAt: IsoDateTimeString;
};

export type AwsConnectionListResponse = {
  awsConnections: AwsConnection[];
};

export type ReverseEngineeringScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ReverseEngineeringScanStage =
  | "credential"
  | "region"
  | "provider_api"
  | "normalize"
  | "draft"
  | "analysis"
  | "import_suggestion";

export type ReverseEngineeringScanLogLevel = "INFO" | "WARN" | "ERROR";

export type ReverseEngineeringScan = {
  id: string;
  projectId: string;
  awsConnectionId: string;
  provider: CloudProvider;
  region: string;
  resourceTypes: ReverseEngineeringResourceSelection[];
  status: ReverseEngineeringScanStatus;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  cancelRequestedAt: IsoDateTimeString | null;
  deletedAt: IsoDateTimeString | null;
  errorSummary: string | null;
};

export type DiscoveredResourceRelationshipType = "contains" | "connects_to" | "depends_on";

export type DiscoveredResourceRelationship = {
  type: DiscoveredResourceRelationshipType;
  targetResourceId: string;
  label?: string | undefined;
};

export type ReverseEngineeringImportSuggestionStatus =
  | "ready"
  | "unsupported_resource_type"
  | "manual_review";

export type DiscoveredResource = {
  id: string;
  provider: CloudProvider;
  providerResourceType: string;
  providerResourceId: string;
  region: string;
  displayName: string;
  resourceType: ResourceType;
  config: ResourceConfig;
  relationships?: DiscoveredResourceRelationship[] | undefined;
  analysisExcluded?: boolean | undefined;
  importSuggestionStatus?: ReverseEngineeringImportSuggestionStatus | undefined;
};

export type ReverseEngineeringAnalysisExclusionReason =
  | "unsupported_resource_type"
  | "missing_required_data";

export type ReverseEngineeringAnalysisExclusion = {
  id: string;
  resourceId: string;
  reason: ReverseEngineeringAnalysisExclusionReason;
  message: string;
};

export type ReverseEngineeringDraft = {
  id: string;
  scanId: string;
  architectureJson: ArchitectureJson;
  protectedValueKeys: string[];
  editableValueKeys: string[];
  createdAt: IsoDateTimeString;
};

export type ReverseEngineeringImportSuggestion = {
  id: string;
  resourceId: string;
  status: ReverseEngineeringImportSuggestionStatus;
  handoffReady: boolean;
  terraformAddress?: string | undefined;
  importCommand?: string | undefined;
  terraformBlockDraft?: string | undefined;
  reason?: string | undefined;
};

export type ReverseEngineeringScanErrorReason =
  | "permission_denied"
  | "invalid_region"
  | "expired_credential"
  | "throttled"
  | "provider_error"
  | "unknown";

export type ReverseEngineeringScanError = {
  id: string;
  resourceType: ResourceType | "UNKNOWN";
  stage: ReverseEngineeringScanStage;
  reason: ReverseEngineeringScanErrorReason;
  message: string;
  retryable: boolean;
};

export type ReverseEngineeringScanLogLine = {
  id: string;
  scanId: string;
  sequence: number;
  stage: ReverseEngineeringScanStage;
  level: ReverseEngineeringScanLogLevel;
  message: string;
  createdAt: IsoDateTimeString;
};

export type ReverseEngineeringScanResult = {
  scan: ReverseEngineeringScan;
  discoveredResources: DiscoveredResource[];
  reverseEngineeringDraft: ReverseEngineeringDraft;
  architectureJson: ArchitectureJson;
  findings: CheckFinding[];
  analysisExclusions: ReverseEngineeringAnalysisExclusion[];
  importSuggestions: ReverseEngineeringImportSuggestion[];
  scanErrors: ReverseEngineeringScanError[];
};

export type CreateReverseEngineeringScanRequest = {
  awsConnectionId: string;
  region: string;
  resourceTypes: ReverseEngineeringResourceSelection[];
};

export type ReverseEngineeringScanResponse = {
  scan: ReverseEngineeringScan;
  result?: ReverseEngineeringScanResult | undefined;
};

export type ReverseEngineeringScanListResponse = {
  scans: ReverseEngineeringScan[];
};

export type ReverseEngineeringScanLogListResponse = {
  logs: ReverseEngineeringScanLogLine[];
};

export type CreateDeploymentRequest = {
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string;
  liveProfile?: DeploymentLiveProfile | undefined;
};

export type DeploymentLiveProfile =
  | "practice"
  | "demo_web_service"
  | "demo_web_service_with_rds";

export type DeploymentResponse = {
  deployment: Deployment;
};

export type DeploymentListResponse = {
  deployments: Deployment[];
};

export type RecentSuccessfulDeploymentProject = {
  project: Project;
  deployment: Deployment;
  deployedAt: IsoDateTimeString;
};

export type RecentSuccessfulDeploymentProjectListResponse = {
  items: RecentSuccessfulDeploymentProject[];
};

export type CostProjectEstimate = {
  project: Project;
  costEstimate: CostEstimateResult | null;
};

export type CostProjectEstimateListResponse = {
  period: CostEstimatePeriod;
  expectedUserCount: number;
  region: AwsRegionCode | string;
  totalEstimate: MoneyEstimate;
  totalMonthlyEstimate: MoneyEstimate;
  projects: CostProjectEstimate[];
};

export type DeploymentLogListResponse = {
  logs: DeploymentLog[];
};

export type DeploymentFailureExplanation = {
  deploymentId: string;
  stage: DeploymentFailureStage | null;
  severity: RiskLevel;
  summary: string;
  likelyCause: string;
  nextActions: string[];
  firstErrorLog: string | null;
  cleanupRequired: boolean;
  llmExplanation?: LlmExplanation | undefined;
};

export type DeploymentFailureExplanationResponse = {
  explanation: DeploymentFailureExplanation;
};

export type DeployedResource = {
  id: string;
  deploymentId: string;
  terraformAddress: string;
  terraformType: string;
  providerName: string | null;
  resourceId: string | null;
  region: string;
  createdAt: IsoDateTimeString;
};

export type TerraformOutput = {
  id: string;
  deploymentId: string;
  name: string;
  value: unknown | null;
  sensitive: boolean;
  createdAt: IsoDateTimeString;
};

export type DeploymentResourceListResponse = {
  resources: DeployedResource[];
};

export type TerraformOutputListResponse = {
  outputs: TerraformOutput[];
};

export type CreateAwsConnectionRequest = {
  region: string;
};

export type AwsRolePermissionSetup = {
  verificationActions: string[];
  initialPolicyDocument: Record<string, unknown> | null;
  terraformPolicyDocument: Record<string, unknown> | null;
};

export type AwsRoleSetup = {
  roleName: string;
  trustedPrincipalArn: string;
  externalId: string;
  trustPolicy: Record<string, unknown>;
  permissionSetup: AwsRolePermissionSetup;
};

export type SketchCatchCallerRoleSetup = {
  policyName: string;
  assumableRoleArnPattern: string;
  policyDocument: Record<string, unknown>;
};

export type CreateAwsConnectionResponse = {
  awsConnection: AwsConnection;
  callerPrincipalArn: string;
  recommendedRoleName: string;
  roleSetup: AwsRoleSetup;
  callerRoleSetup: SketchCatchCallerRoleSetup;
  trustPolicyTemplate: Record<string, unknown>;
};

export type TestAwsConnectionRequest = {
  roleArn: string;
};

export type TestAwsConnectionResponse = {
  ok: true;
  accountId: string;
  callerArn: string;
  region: string;
};

export type VerifyAwsConnectionRequest = {
  roleArn: string;
};

export type VerifyAwsConnectionCreatedRoleRequest = {
  accountId: string;
};

export type VerifyAwsConnectionResponse = TestAwsConnectionResponse & {
  awsConnection: AwsConnection;
};

export type AwsConnectionCloudFormationTemplateResponse = {
  roleName: string;
  stackName: string;
  region: string;
  capabilities: ["CAPABILITY_NAMED_IAM"];
  templateBody: string;
  templateUrl: string | null;
  templateUrlExpiresAt: IsoDateTimeString | null;
  launchStackUrl: string | null;
  manualTemplateFallbackAvailable: boolean;
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

export type DeploymentFailureStage =
  | "init"
  | "validate"
  | "plan"
  | "approval"
  | "aws_connection"
  | "mock_run"
  | "apply"
  | "destroy";

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

export type AiResultSource = "prompt" | "github" | "amazon_q" | "template_fallback" | "llm_fallback";

export type AiConfidence = "low" | "medium" | "high";

export type AiProvider = "bedrock" | "amazon_q" | "amazon_transcribe" | "openai" | "fallback";

export type AiProviderService =
  | "bedrock_runtime"
  | "amazon_q_business"
  | "amazon_transcribe"
  | "openai_responses"
  | "rule_fallback";

export type AiBillingMode = "aws_credit_only" | "standard" | "disabled";

export type AiEstimatedUsage = {
  inputCharacters: number;
  inputTokensEstimate: number;
  outputCharacters?: number | undefined;
  outputTokensEstimate?: number | undefined;
};

export type AiProviderMetadata = {
  provider: AiProvider;
  service: AiProviderService;
  model?: string | undefined;
  routeTarget: string;
  cacheHit: boolean;
  cacheKey: string;
  estimatedUsage: AiEstimatedUsage;
  billingMode: AiBillingMode;
  generatedAt: IsoDateTimeString;
};

export type AiResultMetadata = {
  source: AiResultSource;
  confidence: AiConfidence;
  assumptions: string[];
  explanations: string[];
  selectedDraftPattern?: ArchitectureDraftPattern;
  architectureIntent?: ArchitectureIntent;
  servicePurpose?: ArchitectureServicePurpose;
  capabilities?: ArchitectureCapability[];
  requirementFacts?: ArchitectureRequirementFact[];
  operatingProfile?: ArchitectureDraftOperatingProfile;
  guardrailWarnings?: ArchitectureGuardrailWarning[];
};

export type ArchitectureDraftPattern =
  | "static_site"
  | "api_server"
  | "backend_with_db"
  | "server_storage"
  | "serverless_function";

export type ArchitectureServicePurpose =
  | "landing_page"
  | "file_upload_service"
  | "auth_web_service"
  | "reservation_service"
  | "content_board"
  | "api_backend"
  | "data_storage"
  | "unknown";

export type ArchitectureCapability =
  | "static_delivery"
  | "file_upload"
  | "authentication"
  | "relational_data"
  | "admin_workflow"
  | "public_api"
  | "private_user_data"
  | "media_storage";

export type ArchitectureIntentConstraints = {
  budget?: ArchitectureDraftBudgetLevel;
  traffic?: "small" | "growth";
  security?: "basic" | "sensitive";
  computePreference?: "ec2" | "serverless" | "unspecified";
};

export type ArchitectureIntent = {
  servicePurpose: ArchitectureServicePurpose;
  capabilities: ArchitectureCapability[];
  constraints: ArchitectureIntentConstraints;
  confidence: number;
  missingQuestions: string[];
};

export type ArchitectureGuardrailWarningCode =
  | "low_budget_rds_cost"
  | "unsupported_resource_omitted"
  | "unsupported_requirement_substituted"
  | "partial_generation"
  | "guardrail_adjusted_config"
  | "board_replacement_required";

export type ArchitectureGuardrailWarning = {
  code: ArchitectureGuardrailWarningCode;
  message: string;
};

export type ArchitectureDraftBudgetLevel = "low" | "normal";

export type ArchitectureDraftTrafficLevel = "small" | "normal";

export type ArchitectureDraftSecurityPriority = "basic" | "high";

export type ArchitectureRequirementFact =
  | "web_frontend"
  | "static_delivery"
  | "server_runtime"
  | "database"
  | "object_storage"
  | "file_upload"
  | "auth_or_user_data"
  | "serverless_runtime"
  | "network_boundary"
  | "iam_permissions"
  | "observability"
  | "encryption";

export type ArchitectureDraftOperatingProfile = {
  budgetLevel: ArchitectureDraftBudgetLevel;
  trafficLevel: ArchitectureDraftTrafficLevel;
  securityPriority: ArchitectureDraftSecurityPriority;
};

// Architecture Draft는 자연어 요구사항과 확인 질문 답변을 기준으로 결정적으로 생성한다.
export type RequirementInputMode = "text" | "voice";

export type RequirementInput = {
  mode: RequirementInputMode;
  text: string;
  transcriptSource?: "amazon_transcribe" | undefined;
  confirmedByUser: boolean;
};

export type RequirementPromptSource = "text" | "voice_transcript";

export type RequirementPrompt = {
  text: string;
  source: RequirementPromptSource;
  requirementInput: RequirementInput;
  confirmedByUser: boolean;
  confirmedByUserId?: string | undefined;
  confirmedAt: IsoDateTimeString;
};

export type VoiceRequirementMediaFormat =
  | "mp3"
  | "mp4"
  | "wav"
  | "flac"
  | "ogg"
  | "amr"
  | "webm";

export type VoiceRequirementInput = {
  mediaUri: string;
  mediaFormat: VoiceRequirementMediaFormat;
  languageCode?: string | undefined;
};

export type TranscribeConfirmationStatus =
  | "transcribing"
  | "awaiting_user_confirmation"
  | "confirmed"
  | "failed";

export type TranscribeConfirmation = {
  transcriptionJobName: string | null;
  voiceRequirementInput: VoiceRequirementInput | null;
  transcriptText: string | null;
  confirmedText: string | null;
  confirmedByUser: boolean;
  confirmedByUserId?: string | undefined;
  status: TranscribeConfirmationStatus;
  failureReason?: string | undefined;
  providerMetadata: AiProviderMetadata;
};

export type ConfirmTranscribeRequest = {
  transcriptText: string;
  confirmedText: string;
  confirmedByUserId?: string | undefined;
};

export type ConfirmTranscribeResponse = {
  confirmation: TranscribeConfirmation;
  requirementPrompt: RequirementPrompt;
};

export type UserAcceptedChangeTarget =
  | "architecture_draft"
  | "architecture_suggestion"
  | "architecture_patch_preview"
  | "iac_handoff"
  | "git_change"
  | "deployment_action";

export type UserAcceptedChange = {
  target: UserAcceptedChangeTarget;
  acceptedByUserId: string;
  acceptedAt: IsoDateTimeString;
};

export type ArchitecturePatchAction =
  | "add_resource"
  | "remove_resource"
  | "modify_resource"
  | "manual_review";

export type ArchitecturePatchIntent = {
  instruction: string;
  requestedAction: ArchitecturePatchAction;
  targetResourceId?: string | undefined;
  resourceType?: ResourceType | undefined;
  connectionTargetResourceId?: string | undefined;
  skipConnection?: boolean | undefined;
};

export type ArchitecturePatchPreviewChange = {
  action: ArchitecturePatchAction;
  resourceType?: ResourceType | undefined;
  resourceId?: string | undefined;
  summary: string;
};

export type ArchitecturePatchClarificationCandidate = {
  resourceId: string;
  resourceType: ResourceType;
  label: string;
};

export type ArchitecturePatchClarification = {
  status: "needs_clarification";
  intent: ArchitecturePatchIntent;
  question: string;
  candidates: ArchitecturePatchClarificationCandidate[];
  suggestions?: string[] | undefined;
  providerMetadata: AiProviderMetadata;
};

export type ArchitecturePatchPreview = {
  status: "preview";
  intent: ArchitecturePatchIntent;
  baseArchitectureJson: ArchitectureJson;
  proposedArchitectureJson: ArchitectureJson;
  changes: ArchitecturePatchPreviewChange[];
  requiresUserAcceptance: true;
  userAcceptedChange: UserAcceptedChange | null;
  llmExplanation?: LlmExplanation | undefined;
  providerMetadata: AiProviderMetadata;
};

export type ArchitecturePatchPreviewResponse =
  | ArchitecturePatchPreview
  | ArchitecturePatchClarification;

export type CreateArchitecturePatchPreviewRequest = {
  architectureJson: ArchitectureJson;
  instruction: string;
  selectedTargetResourceId?: string | undefined;
  connectionTargetResourceId?: string | undefined;
  skipConnection?: boolean | undefined;
};

export type CreateArchitectureDraftRequest = {
  prompt: string;
};

export type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  metadata: AiResultMetadata;
  llmExplanation?: LlmExplanation | undefined;
};

export type ArchitectureDraftClarification = {
  status: "needs_clarification";
  question: string;
  suggestions: string[];
  providerMetadata: AiProviderMetadata;
};

export type CreateArchitectureDraftResponse =
  | AiArchitectureDraftResult
  | ArchitectureDraftClarification;

export type MoneyEstimate = {
  amount: number;
  currency: "USD" | "KRW";
};

export type CostEstimatePeriod = "day" | "week" | "month";

export type CostPricingSource = "aws_pricing_api" | "fallback";

export type CostEstimateSupportLevel =
  | "aws_pricing_api"
  | "fallback_estimate"
  | "no_direct_cost"
  | "not_estimated";

export type CostUsageAssumption = {
  label: string;
  value: string;
};

export type ResourceCostEstimate = {
  resourceId: string;
  resourceType: ResourceType;
  terraformResourceType?: string | undefined;
  name: string;
  monthlyEstimate: MoneyEstimate;
  periodEstimate: MoneyEstimate;
  supportLevel: CostEstimateSupportLevel;
  supportReason: string;
  costDrivers: string[];
  explanation: string;
  pricingSource?: CostPricingSource | undefined;
  usageAssumptions?: CostUsageAssumption[] | undefined;
  recommendation?: string | undefined;
};

export type CostEstimateRequest = {
  architectureJson: ArchitectureJson;
  period: CostEstimatePeriod;
  expectedUserCount: number;
  region: AwsRegionCode | string;
};

export type CostEstimateResult = {
  totalEstimate: MoneyEstimate;
  totalMonthlyEstimate: MoneyEstimate;
  period: CostEstimatePeriod;
  expectedUserCount: number;
  region: AwsRegionCode | string;
  pricingSource: CostPricingSource;
  fallbackUsed: boolean;
  assumptions: string[];
  resources: ResourceCostEstimate[];
  reviewMessages: string[];
  pricingAssumption: string;
};

export type CheckFindingCategory =
  | "cost"
  | "security"
  | "configuration"
  | "permission"
  | "network"
  | "performance"
  | "availability";

export type AiSafetyExplanation = {
  riskSummary: string;
  whyDangerous: string;
  recommendedFix: string;
  terraformHint?: string | undefined;
  verificationSteps: string[];
  fallbackUsed: boolean;
  fallbackReason?: LlmExplanationFallbackReason | undefined;
  providerMetadata?: AiProviderMetadata | undefined;
};

export type CheckFinding = {
  id: string;
  category: CheckFindingCategory;
  severity: RiskLevel;
  resourceId?: string | undefined;
  sourceLocation?: TerraformSourceLocation | undefined;
  aiSafetyExplanation?: AiSafetyExplanation | undefined;
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

export type ArchitectureSuggestionAction =
  | "modify_resource"
  | "add_resource"
  | "remove_resource"
  | "manual_review";

export type ArchitectureSuggestionCostImpact = "decrease" | "increase" | "neutral" | "unknown";

export type ArchitectureSuggestionQualityImpact = "improve" | "weaken" | "neutral" | "unknown";

export type ArchitectureSuggestionExpectedImpact = {
  cost: ArchitectureSuggestionCostImpact;
  security: ArchitectureSuggestionQualityImpact;
  reliability: ArchitectureSuggestionQualityImpact;
};

export type ArchitectureSuggestion = {
  id: string;
  findingId?: string | undefined;
  title: string;
  targetResourceId?: string | undefined;
  action: ArchitectureSuggestionAction;
  expectedImpact: ArchitectureSuggestionExpectedImpact;
  explanation: string;
};

export type LlmExplanationTarget =
  | "architecture_draft"
  | "design_simulation"
  | "pre_deployment_check"
  | "terraform_error_explanation"
  | "terraform_preview_explanation"
  | "architecture_patch_preview";

export type LlmExplanationFallbackReason =
  | "missing_api_key"
  | "provider_not_configured"
  | "credit_not_confirmed"
  | "daily_limit_exceeded"
  | "timeout"
  | "rate_limited"
  | "invalid_request"
  | "auth_error"
  | "provider_error"
  | "invalid_response";

export type LlmCodeSuggestion = {
  currentCode: string;
  suggestedCode: string;
  rationale: string;
};

export type LlmExplanation = {
  target: LlmExplanationTarget;
  summary: string;
  highlights: string[];
  nextActions: string[];
  fallbackUsed: boolean;
  fallbackReason?: LlmExplanationFallbackReason | undefined;
  codeSuggestion?: LlmCodeSuggestion | undefined;
  wellArchitectedConclusion?: string | undefined;
  providerMetadata?: AiProviderMetadata | undefined;
};

export type AiPreDeploymentAnalysisResult = {
  summary: string;
  totalMonthlyEstimate: MoneyEstimate & {
    pricingAssumption: string;
  };
  resourceCostEstimates: ResourceCostEstimate[];
  findings: CheckFinding[];
  checklist: ChecklistItem[];
  suggestions: ArchitectureSuggestion[];
  llmExplanation?: LlmExplanation | undefined;
};

export type CreateDesignSimulationRequest = {
  architectureJson: ArchitectureJson;
  trafficLevel: ArchitectureDraftTrafficLevel;
  budgetLevel: ArchitectureDraftBudgetLevel;
  period?: CostEstimatePeriod | undefined;
  expectedUserCount?: number | undefined;
  region?: AwsRegionCode | string | undefined;
};

export type DesignSimulationRequestFlowStep = {
  fromResourceId: string;
  toResourceId: string;
  description: string;
};

export type DesignSimulationBottleneck = {
  id: string;
  resourceId: string;
  severity: RiskLevel;
  title: string;
  description: string;
};

export type DesignSimulationFailureScenario = {
  id: string;
  title: string;
  affectedResourceIds: string[];
  description: string;
  mitigation: string;
};

export type DesignSimulationResult = {
  summary: string;
  assumptions: string[];
  requestFlow: DesignSimulationRequestFlowStep[];
  bottlenecks: DesignSimulationBottleneck[];
  failureScenarios: DesignSimulationFailureScenario[];
  costPressure: string[];
  costEstimate?: CostEstimateResult | undefined;
  recommendations: string[];
  llmExplanation?: LlmExplanation | undefined;
};

export type AiPreDeploymentCheckFromDiagramRequest = {
  diagramJson: DiagramJson;
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

export type WellArchitectedPillar =
  | "operational_excellence"
  | "security"
  | "reliability"
  | "performance_efficiency"
  | "cost_optimization"
  | "sustainability";

export type AiWellArchitectedGuidance = {
  pillar: WellArchitectedPillar;
  title: string;
  observation: string;
  recommendation: string;
};

export type AiTerraformSafeFix = {
  applicable: boolean;
  code: string;
  label: string;
  description: string;
};

export type AiTerraformCodeFrameLine = {
  lineNumber: number;
  text: string;
  isErrorLine: boolean;
};

export type AiTerraformCodeSuggestionSource = "rule" | "amazon_q";

export type AiTerraformCodeSuggestion = {
  currentCode: string;
  suggestedCode: string;
  rationale: string;
  source: AiTerraformCodeSuggestionSource;
};

export type AiTerraformDiagnosticExplanation = {
  errorType: string;
  plainExplanation: string;
  fixExplanation: string;
  codeFrame: AiTerraformCodeFrameLine[];
  canApply: boolean;
  codeSuggestion?: AiTerraformCodeSuggestion | undefined;
  line?: number | undefined;
  sourceFileName?: string | undefined;
};

export type AiTerraformErrorExplanationResult = {
  stage: AiTerraformStage;
  category: AiTerraformErrorCategory;
  severity: RiskLevel;
  rawMessage: string;
  summary: string;
  likelyCause: string;
  nextActions: string[];
  wellArchitectedGuidance: AiWellArchitectedGuidance[];
  consensusRecommendation: string;
  safeFix?: AiTerraformSafeFix | undefined;
  diagnosticExplanation?: AiTerraformDiagnosticExplanation | undefined;
  relatedResourceId?: string | undefined;
  llmExplanation?: LlmExplanation | undefined;
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
  llmExplanation?: LlmExplanation | undefined;
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

export type DiagramNodeStyle = {
  textColor?: string | undefined;
  borderColor?: string | undefined;
};

export type AwsRegionCode =
  | "ap-northeast-2"
  | "ap-northeast-1"
  | "ap-southeast-1"
  | "us-east-1"
  | "us-west-2"
  | "eu-west-1"
  | "eu-central-1";

export type DiagramNodeMetadata = {
  parentAreaNodeId?: string | undefined;
  moduleSource?: {
    moduleId: string;
    moduleVersion: string;
    expandedAt: IsoDateTimeString;
  } | undefined;
  reverseEngineering?: {
    source: "aws_scan";
    protectedValueKeys: string[];
    editableValueKeys: string[];
  } | undefined;
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
  metadata?: DiagramNodeMetadata | undefined;
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

export type DiagramVariableBinding = {
  nodeId: string;
  parameterKey: string;
};

export type DiagramVariableSource = "module" | "user";

export type DiagramVariable = {
  id: string;
  name: string;
  type: string;
  value: unknown;
  bindings: DiagramVariableBinding[];
  source: DiagramVariableSource;
};

export type DiagramJson = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport: DiagramViewport;
  variables?: DiagramVariable[] | undefined;
};

export type ProjectDraft = {
  id: string;
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

export type TerraformDiagnosticSeverity = "info" | "warning" | "error";

export type TerraformDiagnostic = {
  severity: TerraformDiagnosticSeverity;
  message: string;
  code?: string | undefined;
  line?: number | undefined;
  sourceFileName?: string | undefined;
  resourceAddress?: string | undefined;
  nodeId?: string | undefined;
};

export type TerraformValidateRequest = {
  terraformCode: string;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
};

export type TerraformValidateResponse = {
  diagnostics: TerraformDiagnostic[];
};

export type TerraformSyncToDiagramRequest = {
  diagramJson: DiagramJson;
  terraformCode: string;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
};

export type TerraformSyncFileInput = {
  fileName: string;
  terraformCode: string;
};

export type TerraformDiagramChangeProposal =
  | {
      kind: "create_candidate";
      identity: TerraformBlockIdentity;
      nodeId?: string | undefined;
      sourceFileName?: string | undefined;
      line?: number | undefined;
      metadata?: DiagramNodeMetadata | undefined;
      position?: DiagramNode["position"] | undefined;
      parameters: DiagramNodeParameters;
    }
  | {
      kind: "delete_candidate";
      identity: TerraformBlockIdentity;
      nodeId: string;
      resourceAddress: string;
    }
  | {
      kind: "rename_candidate";
      from: TerraformBlockIdentity;
      to: TerraformBlockIdentity;
      sourceFileName?: string | undefined;
      line?: number | undefined;
      nodeId: string;
      resourceAddress: string;
    };

export type TerraformSyncToDiagramResponse = {
  diagramJson: DiagramJson;
  diagnostics: TerraformDiagnostic[];
  proposals?: TerraformDiagramChangeProposal[] | undefined;
};
