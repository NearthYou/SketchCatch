// allow: SIZE_OK - shared package root contract; splitting needs a separate repo-wide migration.
import { AVAILABLE_BRAINBOARD_TEMPLATE_IDS } from "./brainboard-templates/ids.ts";
import type { AvailableBrainboardTemplateId } from "./brainboard-templates/ids.ts";
import { TEMPLATE_IDS } from "./template-definitions.ts";
import type { TemplateId } from "./template-definitions.ts";

export type IsoDateTimeString = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "github_oauth_required"
  | "too_many_requests"
  | "unprocessable_entity"
  | "bad_gateway"
  | "service_unavailable"
  | "internal_server_error"
  | "LIVE_OBSERVATION_CACHE_UNAVAILABLE"
  | "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE"
  | "LIVE_OBSERVATION_GONE"
  | "LIVE_OBSERVATION_NOT_FOUND"
  | "LIVE_OBSERVATION_OUTPUT_INVALID"
  | "LIVE_OBSERVATION_RATE_LIMITED";

export type ApiErrorResponse = {
  error: ApiErrorCode;
  message: string;
};

export type LoginLockedErrorResponse = ApiErrorResponse & {
  error: "too_many_requests";
  lockedUntil: IsoDateTimeString;
};

export const RESOURCE_TYPES = [
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "NETWORK_ACL",
  "NETWORK_ACL_RULE",
  "VPC_PEERING_CONNECTION",
  "NAT_GATEWAY",
  "EC2",
  "AUTO_SCALING_GROUP",
  "AUTO_SCALING_POLICY",
  "LAUNCH_TEMPLATE",
  "KEY_PAIR",
  "ELASTIC_IP",
  "EBS_VOLUME",
  "VOLUME_ATTACHMENT",
  "EFS_FILE_SYSTEM",
  "EFS_MOUNT_TARGET",
  "EFS_ACCESS_POINT",
  "RDS",
  "RDS_READ_REPLICA",
  "RDS_CLUSTER",
  "RDS_CLUSTER_INSTANCE",
  "S3",
  "DYNAMODB_TABLE",
  "ELASTICACHE_REDIS",
  "ELASTICACHE_SUBNET_GROUP",
  "ELASTICACHE_PARAMETER_GROUP",
  "SECURITY_GROUP",
  "CLOUDFRONT",
  "LOAD_BALANCER_TARGET_GROUP",
  "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT",
  "ROUTE53_RECORD",
  "ROUTE53_ZONE",
  "WAF_WEB_ACL",
  "WAF_WEB_ACL_ASSOCIATION",
  "LOAD_BALANCER",
  "LOAD_BALANCER_LISTENER",
  "LAMBDA",
  "LAMBDA_ALIAS",
  "LAMBDA_EVENT_SOURCE_MAPPING",
  "AMI",
  "IAM_ROLE",
  "IAM_POLICY",
  "IAM_INSTANCE_PROFILE",
  "KMS_KEY",
  "KMS_ALIAS",
  "ACM_CERTIFICATE",
  "ACM_CERTIFICATE_VALIDATION",
  "COGNITO_USER_POOL",
  "COGNITO_USER_POOL_CLIENT",
  "AMPLIFY_APP",
  "DB_SUBNET_GROUP",
  "SECRETS_MANAGER_SECRET",
  "VPC_ENDPOINT",
  "CLOUDWATCH_LOG_GROUP",
  "CLOUDWATCH_LOG_STREAM",
  "CLOUDWATCH_METRIC_ALARM",
  "CLOUDWATCH_DASHBOARD",
  "CLOUDWATCH_LOG_RESOURCE_POLICY",
  "CLOUDTRAIL",
  "XRAY_GROUP",
  "XRAY_SAMPLING_RULE",
  "AWS_CALLER_IDENTITY",
  "SSM_PARAMETER",
  "API_GATEWAY_REST_API",
  "API_GATEWAY_AUTHORIZER",
  "API_GATEWAY_WEBSOCKET_API",
  "API_GATEWAY_RESOURCE",
  "API_GATEWAY_METHOD",
  "API_GATEWAY_INTEGRATION",
  "API_GATEWAY_DEPLOYMENT",
  "API_GATEWAY_STAGE",
  "API_GATEWAY_V2_ROUTE",
  "API_GATEWAY_V2_INTEGRATION",
  "API_GATEWAY_V2_STAGE",
  "LAMBDA_PERMISSION",
  "SNS_TOPIC",
  "SNS_TOPIC_SUBSCRIPTION",
  "SQS_QUEUE",
  "EVENTBRIDGE_RULE",
  "EVENTBRIDGE_TARGET",
  "EVENTBRIDGE_PERMISSION",
  "SCHEDULER_SCHEDULE",
  "STEP_FUNCTIONS_STATE_MACHINE",
  "CODEBUILD_PROJECT",
  "CODEDEPLOY_APP",
  "CODEDEPLOY_DEPLOYMENT_GROUP",
  "CODEPIPELINE",
  "CODESTAR_CONNECTION",
  "ECR_REPOSITORY",
  "ECR_LIFECYCLE_POLICY",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "APPLICATION_AUTO_SCALING_TARGET",
  "APPLICATION_AUTO_SCALING_POLICY",
  "ECS_TASK_DEFINITION",
  "ECS_CAPACITY_PROVIDER",
  "EKS_CLUSTER",
  "EKS_NODE_GROUP",
  "EKS_ADDON",
  "KUBERNETES_NAMESPACE",
  "KUBERNETES_DEPLOYMENT",
  "KUBERNETES_SERVICE",
  "CONFIG_CONFIGURATION_RECORDER",
  "CONFIG_DELIVERY_CHANNEL",
  "CONFIG_RULE",
  "SHIELD_PROTECTION",
  "GUARDDUTY_DETECTOR",
  "UNKNOWN"
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ReverseEngineeringResourceSelection = "ALL" | ResourceType;

export type CloudProvider = "aws" | "kubernetes";

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

export type ProjectDeleteAction = "delete_project" | "delete_project_only" | "destroy_then_delete";

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
  reverseEngineering?:
    | {
        sourceScanId: string;
        draftId: string;
      }
    | undefined;
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

export type TerraformArtifactBundle = {
  schemaVersion: 1;
  files: Array<{
    fileName: string;
    terraformCode: string;
  }>;
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
  analysis: SourceRepositoryAnalysis | null;
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

export const REPOSITORY_ANALYSIS_TEMPLATE_IDS = [
  ...TEMPLATE_IDS,
  ...AVAILABLE_BRAINBOARD_TEMPLATE_IDS
] as const;

export type RepositoryAnalysisTemplateId = TemplateId | AvailableBrainboardTemplateId;

export type RepositoryAnalysisEvidenceFile = {
  path: string;
  found: boolean;
};

export type AnalyzeSourceRepositoryRequest = {
  repositoryUrl: string;
  defaultBranch?: string | undefined;
};

export type SourceRepositoryAnalysisResult = {
  repositoryUrl: string;
  defaultBranch: string;
  availableBranches: string[];
  evidenceFiles: RepositoryAnalysisEvidenceFile[];
  detectedSignals: string[];
  recommendedTemplateId: RepositoryAnalysisTemplateId | null;
  recommendationReason: string;
  aiHandoff?: RepositoryAnalysisAiHandoff | undefined;
};

export type CreateGitHubArchitectureDraftRequest = AnalyzeSourceRepositoryRequest & {
  selectedTemplateId: RepositoryAnalysisTemplateId;
};

export type ListGitHubInstallationRepositoriesRequest = {
  installationId: string;
  state: string;
};

export type CreateGitHubInstallationUserAuthorizationRequest =
  ListGitHubInstallationRepositoriesRequest;

export type GitHubInstallationUserAuthorizationUrlResponse = {
  authorizationUrl: string;
  expiresAt: IsoDateTimeString;
};

export type GitHubRepositorySelection = "all" | "selected";
export type GitHubInstallationConnectionStatus = "active" | "disconnected";

export type GitHubInstallationConnection = {
  installationId: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: GitHubRepositorySelection | null;
  repositoryCount: number;
  htmlUrl: string | null;
};

export type ListGitHubInstallationsResponse = {
  installations: GitHubInstallationConnection[];
};

export type ListGitHubInstallationRepositoriesResponse =
  | { scope: "account" }
  | {
      scope: "project";
      projectId: string;
      repositories: GitHubRepositoryCandidate[];
    };

export type GitHubInstalledRepositoryCandidate = GitHubRepositoryCandidate & {
  installationId: string;
  installationAccountLogin: string;
  installationAccountType: string | null;
  installationRepositorySelection: "all" | "selected" | null;
  connectedSourceRepositoryId: string | null;
  connectedStatus: "active" | "inactive" | null;
};

export type ListGitHubInstalledRepositoriesResponse = {
  projectId: string;
  state: string;
  expiresAt: IsoDateTimeString;
  repositories: GitHubInstalledRepositoryCandidate[];
};

export type ConnectGitHubSourceRepositoryRequest = {
  installationId: string;
  githubRepositoryId: string;
  state: string;
};

export type SourceRepositoryResponse = {
  repository: SourceRepository;
};

export const REPOSITORY_EVIDENCE_KINDS = [
  "repository_tree",
  "package_json",
  "lockfile",
  "dockerfile",
  "framework_config",
  "static_output",
  "readme"
] as const;

export type RepositoryEvidenceKind = (typeof REPOSITORY_EVIDENCE_KINDS)[number];

export type RepositoryApplicationUnitKind = "frontend" | "backend" | "fullstack" | "unknown";

export type RepositoryAnalysisEvidence = {
  readonly kind: RepositoryEvidenceKind;
  readonly path: string;
  readonly applicationUnitId: string | null;
  readonly signals: readonly string[];
};

export const REPOSITORY_ARCHITECTURE_FACT_KINDS = [
  "frontend_delivery",
  "backend_runtime",
  "container_registry",
  "traffic_entry",
  "observability",
  "ci_cd",
  "health_check",
  "transport_security",
  "runtime_scale",
  "excluded_capability",
  "infrastructure_definition"
] as const;

export type RepositoryArchitectureFactKind = (typeof REPOSITORY_ARCHITECTURE_FACT_KINDS)[number];

export type RepositoryArchitectureFact = {
  readonly kind: RepositoryArchitectureFactKind;
  readonly value: string;
  readonly sourcePath: string;
};

export type RepositoryApplicationUnit = {
  readonly id: string;
  readonly rootPath: string;
  readonly kind: RepositoryApplicationUnitKind;
  readonly frameworks: readonly string[];
  readonly evidencePaths: readonly string[];
};

export const REPOSITORY_DEPLOYMENT_TYPES = ["ec2_vm", "container", "serverless"] as const;

export type RepositoryDeploymentType = (typeof REPOSITORY_DEPLOYMENT_TYPES)[number];

export type RepositoryAnalysisQuestionOption = {
  readonly value: string;
  readonly label: string;
};

export type RepositoryAnalysisQuestion = {
  readonly id: string;
  readonly prompt: string;
  readonly answerType: "single_select" | "boolean" | "free_text";
  readonly options?: readonly RepositoryAnalysisQuestionOption[] | undefined;
  readonly required: boolean;
  readonly reason: string;
};

export type RepositoryAnalysisAnswer = {
  readonly questionId: string;
  readonly value: string | boolean;
};

export type RepositoryTemplateRecommendationCandidate = {
  readonly templateId: RepositoryAnalysisTemplateId;
  readonly displayTitle: string;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly questions?: readonly RepositoryAnalysisQuestion[] | undefined;
};

export type RepositoryTemplateRecommendationResult = {
  readonly deploymentType: RepositoryDeploymentType;
  readonly usesCiCd: boolean;
  readonly candidates: readonly RepositoryTemplateRecommendationCandidate[];
  readonly rankingSource?: "ai" | "deterministic" | undefined;
  readonly fallbackReason?: "not_configured" | "provider_error" | "invalid_response" | undefined;
};

export type RecommendRepositoryTemplateRequest = {
  readonly deploymentType: RepositoryDeploymentType;
  readonly usesCiCd: boolean;
  readonly answers: readonly RepositoryAnalysisAnswer[];
};

export type RecommendRepositoryTemplateResponse = {
  readonly sourceRepositoryId: string;
  readonly repositoryRevision: string;
  readonly recommendation: RepositoryTemplateRecommendationResult;
};

type RepositoryAnalysisAiHandoffBase = {
  readonly applicationUnits: readonly RepositoryApplicationUnit[];
  readonly evidence: readonly RepositoryAnalysisEvidence[];
  readonly architectureFacts?: readonly RepositoryArchitectureFact[] | undefined;
  readonly missingEvidence: readonly RepositoryEvidenceKind[];
  readonly deploymentTypeDefault?: RepositoryDeploymentType | null | undefined;
  readonly usesCiCdDefault?: boolean | null | undefined;
  readonly questions?: readonly RepositoryAnalysisQuestion[] | undefined;
  readonly recommendation?: RepositoryTemplateRecommendationResult | undefined;
};

export type RepositoryAnalysisAiHandoff =
  | (RepositoryAnalysisAiHandoffBase & {
      readonly status: "template_selected";
      readonly templateId: RepositoryAnalysisTemplateId;
      readonly selectionReasons: readonly string[];
    })
  | (RepositoryAnalysisAiHandoffBase & {
      readonly status: "template_selection_failed";
      readonly templateId: null;
      readonly mismatchReasons: readonly string[];
    });

export type AnalyzeSourceRepositoryResponse = {
  readonly sourceRepositoryId: string;
  readonly repositoryRevision: string;
  readonly analyzedAt: IsoDateTimeString;
  readonly aiHandoff: RepositoryAnalysisAiHandoff;
};

export type SourceRepositoryAnalysis = Omit<AnalyzeSourceRepositoryResponse, "sourceRepositoryId">;

export type GitCicdMonitoringValidationStatus = "required" | "valid" | "invalid";

export type GitCicdMonitoredPath = {
  mode: "repository_root" | "subdirectory";
  path: string;
};

export type GitCicdMonitoringConfig = {
  sourceRepositoryId: string;
  enabled: boolean;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  validationStatus: GitCicdMonitoringValidationStatus;
  validationMessage: string | null;
  validatedAt: IsoDateTimeString | null;
  updatedAt: IsoDateTimeString;
};

export type GitCicdPipelineRunStatus =
  | "detected"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type GitCicdPipelineChangeScope = "app" | "infra" | "app_and_infra";

export type GitCicdPipelineStageKind =
  | "detect"
  | "app_build"
  | "artifact_publish"
  | "infra_plan"
  | "infra_apply"
  | "app_deploy"
  | "verify";

export type GitCicdPipelineStageStatus =
  | "not_started"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";

export type GitCicdPipelineStage = {
  id: string;
  pipelineRunId: string;
  kind: GitCicdPipelineStageKind;
  status: GitCicdPipelineStageStatus;
  runUrl: string | null;
  startedAt: IsoDateTimeString | null;
  finishedAt: IsoDateTimeString | null;
};

export type GitCicdPipelineRun = {
  id: string;
  projectId: string;
  sourceRepositoryId: string;
  handoffId: string | null;
  commitSha: string;
  commitMessage: string;
  branch: string;
  changeScope: GitCicdPipelineChangeScope;
  status: GitCicdPipelineRunStatus;
  statusMessage: string | null;
  pipelineRunUrl: string | null;
  appUrl: string | null;
  apiUrl: string | null;
  startedAt: IsoDateTimeString | null;
  finishedAt: IsoDateTimeString | null;
  upstreamOrderingToken: string;
  logRevision: string;
  lastRefreshedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  stages: GitCicdPipelineStage[];
  release?: ApplicationRelease | null;
};

export type GitCicdPipelineLog = {
  id: string;
  pipelineRunId: string;
  stageId: string | null;
  sequence: number;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: IsoDateTimeString;
};

export type UpdateGitCicdMonitoringConfigRequest = {
  enabled: boolean;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  userAcceptedChangeId: string;
};

export type GitCicdMonitoringConfigResponse = {
  config: GitCicdMonitoringConfig;
};

export type GitCicdPipelineRunListResponse = {
  runs: GitCicdPipelineRun[];
  nextCursor: string | null;
};

export type GitCicdPipelineRunResponse = {
  run: GitCicdPipelineRun;
};

export type GitCicdPipelineRunRefreshResponse = {
  run: GitCicdPipelineRun;
  stale: boolean;
  errorMessage: string | null;
};

export type GitCicdPipelineRefreshTargetResult = {
  sourceRepositoryId: string;
  stale: boolean;
  errorMessage: string | null;
};

export type GitCicdPipelineProjectRefreshResponse = {
  runs: GitCicdPipelineRun[];
  targets: GitCicdPipelineRefreshTargetResult[];
  stale: boolean;
};

export type GitCicdPipelineLogListResponse = {
  logs: GitCicdPipelineLog[];
  nextSequence: number;
};

export type GitCicdHandoffStatus =
  | "draft"
  | "pr_created"
  | "pipeline_running"
  | "pipeline_success"
  | "pipeline_failed"
  | "cancelled";

export type GitCicdHandoffKind = "terraform_iac" | "static_site";

export type GitCicdDeploymentMode = "terraform_iac" | "static_site" | "infra_and_app";

export type GitCicdPipelineDetailStatus =
  | "not_started"
  | "waiting_for_merge"
  | "waiting_for_approval"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type GitCicdRepositorySettingsPreview = {
  environmentName: string;
  variables: Record<string, string>;
  secrets: string[];
  workflowFiles: string[];
};

export type GitCicdAwsRoleDiff = {
  roleArn: string | null;
  repository: string;
  targetBranch: string;
  environmentName: string;
  requiredTrustConditions: Record<string, string>;
  approved: boolean;
  approvedByUserId: string | null;
  approvedAt: IsoDateTimeString | null;
  applied?: boolean | undefined;
  appliedAt?: IsoDateTimeString | null | undefined;
  verified?: boolean | undefined;
};

export type GitCicdHandoff = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  handoffKind: GitCicdHandoffKind;
  sourceDeploymentId: string | null;
  deploymentMode: GitCicdDeploymentMode;
  requiresEnvironmentApproval: boolean;
  sourceRepositoryId: string;
  repositoryProvider: SourceRepositoryProvider;
  repositoryOwner: string;
  repositoryName: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitMessage: string | null;
  pullRequestTitle: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  pullRequestHeadSha: string | null;
  mergeCommitSha: string | null;
  environmentName: string;
  pipelineRunUrl: string | null;
  infraPipelineRunUrl: string | null;
  infraPipelineStatus: GitCicdPipelineDetailStatus;
  appPipelineRunUrl: string | null;
  appPipelineStatus: GitCicdPipelineDetailStatus;
  destroyPipelineRunUrl: string | null;
  destroyPipelineStatus: GitCicdPipelineDetailStatus;
  staticSiteUrl: string | null;
  apiBaseUrl: string | null;
  repositorySettingsPreview: GitCicdRepositorySettingsPreview | null;
  awsRoleDiff: GitCicdAwsRoleDiff | null;
  githubOAuthRequired: boolean;
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
  sourceDeploymentId: string;
  deploymentMode?: GitCicdDeploymentMode | undefined;
  sourceRepositoryId: string;
  targetBranch?: string | undefined;
  sourceBranch?: string | undefined;
  commitMessage?: string | undefined;
  pullRequestTitle?: string | undefined;
  environmentName?: string | undefined;
  rdsEnabled?: boolean | undefined;
  awsRegion?: string | undefined;
  awsRoleArn?: string | null | undefined;
  tfStateBucket?: string | undefined;
  releaseBucket?: string | undefined;
  staticSiteUrl?: string | null | undefined;
  apiBaseUrl?: string | null | undefined;
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
  pullRequestNumber: number | null;
  mergeCommitSha: string | null;
  pipelineRunUrl: string | null;
  infraPipelineRunUrl: string | null;
  infraPipelineStatus: GitCicdPipelineDetailStatus;
  appPipelineRunUrl: string | null;
  appPipelineStatus: GitCicdPipelineDetailStatus;
  destroyPipelineRunUrl: string | null;
  destroyPipelineStatus: GitCicdPipelineDetailStatus;
  environmentName: string;
  staticSiteUrl: string | null;
  apiBaseUrl: string | null;
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

export type DeploymentTargetProvider = "aws";
export type RuntimeTargetKind = "ecs_fargate" | "lambda" | "ec2_asg" | "static_site";
export type DeploymentRolloutStrategy = "all_at_once";
export type DeploymentScope = "infrastructure" | "application" | "full_stack";
export type DeploymentSource = "direct" | "gitops";
export type DeploymentConsolePhase = "validation" | "approval" | "deployment";

export type BuildEvidenceKind =
  | "dockerfile"
  | "package_manifest"
  | "sam_template"
  | "appspec"
  | "static_output";

export type BuildEvidence = {
  kind: BuildEvidenceKind;
  path: string;
};

export type BuildInstallPreset =
  | "none"
  | "pnpm_frozen_lockfile"
  | "npm_ci"
  | "yarn_frozen_lockfile";

export type BuildExecutionPreset =
  | "docker_build"
  | "pnpm_build"
  | "npm_build"
  | "yarn_build"
  | "sam_build"
  | "codedeploy_bundle"
  | "static_export";

export type ConfirmedBuildConfig = {
  sourceRoot: string;
  evidence: BuildEvidence[];
  installPreset: BuildInstallPreset;
  buildPreset: BuildExecutionPreset;
  artifactOutputPath: string | null;
  runtimeEntrypoint: string | null;
  healthCheckPath: string | null;
  dockerfilePath: string | null;
  packageManifestPath: string | null;
  samTemplatePath: string | null;
  appSpecPath: string | null;
  staticOutputPath: string | null;
  exactSemVerTag: string | null;
  manifestVersion: string | null;
  confirmedCommitSha: string;
  confirmedAt: IsoDateTimeString;
};

export type EcsGitOpsReleaseEvidence = {
  schemaVersion: 1;
  runtimeTargetKind: "ecs_fargate";
  outcome: "succeeded" | "rolled_back" | "failed";
  commitSha: string;
  imageDigest: string;
  imageUri: string;
  clusterName: string;
  serviceName: string;
  containerName: string;
  taskDefinitionArn: string;
  previousTaskDefinitionArn: string;
  restoredTaskDefinitionArn?: string | undefined;
  outputUrl: string;
};

export type LambdaGitOpsReleaseEvidence = {
  schemaVersion: 1;
  runtimeTargetKind: "lambda";
  outcome: "succeeded" | "rolled_back" | "failed";
  commitSha: string;
  artifactDigest: string;
  artifactUri: string;
  functionName: string;
  aliasName: string;
  publishedVersion: string;
  previousVersion: string;
  activeVersion: string;
  deploymentId: string;
  deploymentConfigName: "CodeDeployDefault.LambdaAllAtOnce";
  outputUrl: string;
};

export type Ec2AsgGitOpsReleaseEvidence = {
  schemaVersion: 1;
  runtimeTargetKind: "ec2_asg";
  outcome: "succeeded" | "rolled_back" | "failed";
  failureReason: "codedeploy_failure" | "instance_failure" | "health_check_failure" | null;
  commitSha: string;
  artifactDigest: string;
  artifactUri: string;
  artifactVersionId: string;
  previousArtifactUri: string;
  previousArtifactVersionId: string;
  codeDeployApplicationName: string;
  codeDeployDeploymentGroupName: string;
  autoScalingGroupName: string;
  deploymentId: string;
  activeDeploymentId: string;
  deploymentConfigName: "CodeDeployDefault.AllAtOnce";
  targetInstanceCount: number;
  succeededInstanceCount: number;
  outputUrl: string;
};

export type StaticSiteGitOpsReleaseEvidence = {
  schemaVersion: 1;
  runtimeTargetKind: "static_site";
  outcome: "succeeded" | "failed";
  failureReason:
    | "distribution_update_failure"
    | "invalidation_failure"
    | "health_check_failure"
    | null;
  commitSha: string;
  artifactDigest: string;
  manifestUri: string;
  manifestVersionId: string;
  releasePrefix: string;
  previousReleasePrefix: string;
  activeReleasePrefix: string;
  hostingBucketName: string;
  cloudFrontDistributionId: string;
  cloudFrontOriginId: string;
  distributionEtag: string;
  invalidationId: string | null;
  fileCount: number;
  outputUrl: string;
};

export type GitOpsReleaseEvidence =
  | EcsGitOpsReleaseEvidence
  | LambdaGitOpsReleaseEvidence
  | Ec2AsgGitOpsReleaseEvidence
  | StaticSiteGitOpsReleaseEvidence;

export type EcsFargateRuntimeConfig = {
  runtimeTargetKind: "ecs_fargate";
  codeBuildProjectName: string;
  ecrRepositoryName: string;
  clusterName: string;
  serviceName: string;
  containerName: string;
  outputUrl: string;
};

export type LambdaRuntimeConfig = {
  runtimeTargetKind: "lambda";
  codeBuildProjectName?: string | undefined;
  functionLogicalId: string;
  functionName: string;
  aliasName: string;
  codeDeployApplicationName: string;
  codeDeployDeploymentGroupName: string;
  outputUrl: string;
};

export type Ec2AsgRuntimeConfig = {
  runtimeTargetKind: "ec2_asg";
  codeBuildProjectName?: string | undefined;
  codeDeployApplicationName: string;
  codeDeployDeploymentGroupName: string;
  autoScalingGroupName: string;
  outputUrl: string;
};

export type StaticSiteRuntimeConfig = {
  runtimeTargetKind: "static_site";
  codeBuildProjectName?: string | undefined;
  hostingBucketName: string;
  cloudFrontDistributionId: string;
  cloudFrontOriginId: string;
  outputUrl: string;
};

export type ProjectDeploymentRuntimeConfig =
  | EcsFargateRuntimeConfig
  | LambdaRuntimeConfig
  | Ec2AsgRuntimeConfig
  | StaticSiteRuntimeConfig;

export type ProjectDeploymentTarget = {
  projectId: string;
  provider: DeploymentTargetProvider;
  connectionId: string;
  region: string;
  runtimeTargetKind: RuntimeTargetKind;
  confirmedBuildConfig: ConfirmedBuildConfig | null;
  runtimeConfig: ProjectDeploymentRuntimeConfig | null;
  rolloutStrategy: DeploymentRolloutStrategy;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type PutProjectDeploymentTargetRequest = Omit<
  ProjectDeploymentTarget,
  "projectId" | "confirmedBuildConfig" | "runtimeConfig" | "createdAt" | "updatedAt"
> & {
  confirmedBuildConfig: ConfirmedBuildConfig;
  runtimeConfig: ProjectDeploymentRuntimeConfig | null;
};

export type ProjectDeploymentTargetResponse = {
  target: ProjectDeploymentTarget | null;
};

export type ApplicationReleaseStatus =
  | "pending"
  | "building"
  | "deploying"
  | "succeeded"
  | "failed"
  | "rolled_back"
  | "cancelled";

export type ApplicationReleaseProviderRevision = {
  provider: DeploymentTargetProvider;
  resourceType: string;
  revisionId: string;
  artifactReference: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type ApplicationRelease = {
  id: string;
  projectId: string;
  deploymentId: string | null;
  pipelineRunId: string | null;
  source: DeploymentSource;
  runtimeTargetKind: RuntimeTargetKind;
  version: string;
  commitSha: string;
  artifactDigestAlgorithm: "sha256";
  artifactDigest: string;
  providerRevision: ApplicationReleaseProviderRevision | null;
  outputUrl: string | null;
  status: ApplicationReleaseStatus;
  healthEvidence: JsonValue | null;
  rollbackEvidence: JsonValue | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type ApplicationReleaseResponse = {
  release: ApplicationRelease;
};

export type ApplicationReleaseListResponse = {
  releases: ApplicationRelease[];
};

export type DeploymentNotificationSource = "direct_deployment" | "gitops_pipeline";
export type DeploymentNotificationStatus = "succeeded" | "failed" | "cancelled";

export type DeploymentNotification = {
  id: string;
  projectId: string;
  source: DeploymentNotificationSource;
  sourceId: string;
  status: DeploymentNotificationStatus;
  title: string;
  body: string;
  actionUrl: string;
  readAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
};

export type DeploymentNotificationListResponse = {
  notifications: DeploymentNotification[];
  unreadCount: number;
};

export type WebPushPublicConfigResponse = {
  enabled: boolean;
  vapidPublicKey: string | null;
};

export type WebPushSubscriptionInput = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

export type WebPushSubscriptionResponse = {
  subscriptionId: string;
  expiresAt: IsoDateTimeString | null;
};

export type GitCicdGitHubOAuthStartResponse = {
  authorizationUrl: string;
  expiresAt: IsoDateTimeString;
};

export type GitCicdRepositorySettingsApplyResponse = {
  applied: boolean;
  environmentName: string;
  variables: string[];
  secrets: string[];
  workflowFiles: string[];
  githubOAuthRequired: boolean;
};

export type GitCicdAwsRoleDiffApplyResponse = {
  applied: boolean;
  roleArn: string;
  repository: string;
  environmentName: string;
  appliedAt: IsoDateTimeString;
  verified: boolean;
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
  scope: DeploymentScope;
  targetKind: RuntimeTargetKind | null;
  source: DeploymentSource;
  releaseId: string | null;
  consolePhase?: DeploymentConsolePhase | undefined;
  preparedDraftRevision?: number | null | undefined;
  preparedSnapshotHash?: string | null | undefined;
  approvedPreparedSnapshotHash?: string | null | undefined;
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
  | "TRIVY_MISCONFIGURATION"
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

export { AVAILABLE_BRAINBOARD_TEMPLATE_IDS, BRAINBOARD_TEMPLATE_IDS } from "./brainboard-templates/ids.ts";
export type { AvailableBrainboardTemplateId, BrainboardTemplateId } from "./brainboard-templates/ids.ts";
export {
  BRAINBOARD_TEMPLATE_AUTHOR,
  BRAINBOARD_TEMPLATE_PROVIDER,
  brainboardTemplateManifest
} from "./brainboard-templates/manifest.ts";
export type { BrainboardTemplateManifestEntry } from "./brainboard-templates/manifest.ts";
export { adaptBrainboardTemplateSource } from "./brainboard-templates/adapter.ts";
export type { AdaptedBrainboardTemplate } from "./brainboard-templates/adapter.ts";
export type {
  BrainboardFailedCaptureAttempt,
  BrainboardFailedCaptureEvidence,
  BrainboardFailedCaptureOrigin,
  BrainboardSourceArrowDirection,
  BrainboardSourceEdge,
  BrainboardSourceNode,
  BrainboardSourcePoint,
  BrainboardSourcePresentationNode,
  BrainboardSourceResourceAddressMapping,
  BrainboardSourceResourceNode,
  BrainboardSourceSize,
  BrainboardSourceValue,
  BrainboardSourceViewport,
  BrainboardTemplateCaptureStatus,
  BrainboardTemplateEvidence,
  BrainboardTemplateOrigin,
  BrainboardTemplateSource,
  BrainboardTerraformFile,
  BrainboardTerraformWorkspaceOmission,
  BrainboardTerraformWorkspaceSeed
} from "./brainboard-templates/source-types.ts";
export { validateBrainboardTemplateSource } from "./brainboard-templates/validate-source.ts";
export type {
  BrainboardSourceValidationError,
  BrainboardSourceValidationErrorCode,
  BrainboardSourceValidationResult
} from "./brainboard-templates/validate-source.ts";
export {
  brainboardFailedCaptureEvidence,
  brainboardTemplateEvidence,
  brainboardTemplateRegistry
} from "./brainboard-templates/registry.ts";
export type { BrainboardTemplateRegistryEntry } from "./brainboard-templates/registry.ts";
export {
  awsKubernetesNativeCnisSource,
  brainboardTemplateSources,
  trainingAwsOnboardingSource
} from "./brainboard-templates/sources/index.ts";
export { defineCapturedBrainboardTemplate } from "./brainboard-templates/sources/define-source.ts";
export type {
  BrainboardCapturedNode,
  BrainboardPresentationNodeBinding,
  BrainboardResourceNodeBinding,
  BrainboardSourceNodeBinding,
  CapturedBrainboardTemplateDefinition
} from "./brainboard-templates/sources/define-source.ts";

export {
  buildTemplateDiagramJson,
  getTemplateDefinitionById,
  REPOSITORY_TEMPLATE_IDS,
  TEMPLATE_IDS,
  templateDefinitions
} from "./template-definitions.ts";
export type {
  BuildTemplateDiagramInput,
  RepositoryTemplateId,
  TemplateDefinition,
  TemplateId,
  TemplateParameterDefinition,
  TemplateProvider,
  TemplateRelationship,
  TemplateResourceDefinition
} from "./template-definitions.ts";

export {
  createTerraformProviderFiles,
  isTerraformDeployableNode
} from "./terraform-provider-files.ts";

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
  scope?: DeploymentScope | undefined;
  targetKind?: RuntimeTargetKind | null | undefined;
  source?: DeploymentSource | undefined;
};

export type PrepareDeploymentRequest = {
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string;
  draftRevision: number;
  scope: DeploymentScope | "auto";
};

export type DeploymentLiveProfile = "practice" | "demo_web_service" | "demo_web_service_with_rds";

export type DeploymentLiveObservationAwsAdapterV1 = {
  kind: "aws-live-observation";
  version: 1;
  payload: {
    cloudFrontDistributionId: string;
    loadBalancerArn: string;
    targetGroupArn: string;
    autoScalingGroupName: string;
  };
};

export type DeploymentLiveObservationAwsAdapterV2 = {
  kind: "aws-live-observation";
  version: 2;
  payload: {
    trafficHostname: string;
    loadBalancerDnsName: string;
    loadBalancerArn: string;
    targetGroupArn: string;
    logGroupNames?: string[] | undefined;
    capacityTarget:
      | {
          kind: "asg";
          autoScalingGroupName: string;
        }
      | {
          kind: "ecs_fargate";
          clusterName: string;
          serviceName: string;
          maxCapacity: number;
        };
  };
};

export type DeploymentLiveObservationManifestV2 = {
  schemaVersion: 2;
  provider: "aws";
  provenance: {
    deploymentId: string;
    terraformArtifactSha256: string;
    awsConnectionId: string;
    region: string;
    verifiedAt: IsoDateTimeString;
  };
  endpoints: {
    audienceBaseUrl: string;
    trafficUrl: string;
  };
  pressure: {
    metric: "requests_per_target_per_minute";
    target: 60;
    windowSeconds: 60;
  };
  adapter: {
    kind: "aws-live-observation";
  } & (DeploymentLiveObservationAwsAdapterV1 | DeploymentLiveObservationAwsAdapterV2);
};

export type DeploymentLiveObservationManifestStatus = "valid" | "manifest_invalid";

export type DeploymentLiveObservationManifestRecord = {
  deploymentId: string;
  schemaVersion: 2;
  status: DeploymentLiveObservationManifestStatus;
  manifest: DeploymentLiveObservationManifestV2 | null;
  invalidReason: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type LiveObservationStatus = "active" | "stopped" | "expired";

export type LiveObservationPressureLevel = "normal" | "warning" | "high" | "critical";

export type LiveObservationProviderState = "available" | "delayed" | "unavailable";

/** @deprecated Use LiveObservationProviderState. */
export type LiveObservationAwsState = LiveObservationProviderState;

export type LiveObservationProviderSnapshot = {
  requests: number | null;
  errorRate: number | null;
  p95LatencyMs: number | null;
  availability: number | null;
  capacity: {
    desired: number | null;
    running: number | null;
    healthy: number | null;
    max: number | null;
  };
  logs: Array<{
    timestamp: IsoDateTimeString;
    message: string;
  }>;
  observedAt: IsoDateTimeString | null;
  state: LiveObservationProviderState;
};

export type LiveObservationSession = {
  id: string;
  deploymentId: string;
  status: LiveObservationStatus;
  audienceUrl: string;
  trafficApiUrl: string;
  createdAt: IsoDateTimeString;
  expiresAt: IsoDateTimeString;
};

export type LiveObservationSnapshot = {
  observationId: string;
  status: LiveObservationStatus;
  live: {
    acceptedEventCount: number;
    rollingRequestsPerSecond: number;
    projectedRequestsPerMinute: number;
    pressurePercent: number;
    pressureLevel: LiveObservationPressureLevel;
    observedAt: IsoDateTimeString;
  };
  cloudWatch: {
    state: LiveObservationProviderState;
    requestCountPerTarget: number | null;
    periodSeconds: 60;
    observedAt: IsoDateTimeString | null;
    delayedBySeconds: number | null;
    errorCode: string | null;
  };
  capacity: {
    state: LiveObservationProviderState;
    desiredCapacity: number | null;
    currentInstanceCount: number | null;
    inServiceInstanceCount: number | null;
    maxCapacity: number | null;
    instances: Array<{
      instanceId: string;
      lifecycleState: string;
      healthStatus: string;
    }>;
    latestActivity: {
      statusCode: string;
      description: string;
      startedAt: IsoDateTimeString;
      endedAt: IsoDateTimeString | null;
    } | null;
    observedAt: IsoDateTimeString | null;
    errorCode: string | null;
  };
};

export type CreateLiveObservationResponse = {
  session: LiveObservationSession;
  snapshot: LiveObservationSnapshot;
};

export type LiveObservationSnapshotResponse = {
  snapshot: LiveObservationSnapshot;
};

export type StopLiveObservationResponse = {
  snapshot: LiveObservationSnapshot;
};

export type CollectLiveObservationEventRequest = {
  eventId: string;
};

export type CollectLiveObservationEventResponse = {
  accepted: boolean;
  acceptedEventCount: number;
};

export type LiveObservationV2Session = {
  id: string;
  deploymentId: string;
  status: LiveObservationStatus;
  audienceUrl: string;
  createdAt: IsoDateTimeString;
  expiresAt: IsoDateTimeString;
};

export type LiveObservationV2Snapshot = {
  observationId: string;
  status: LiveObservationStatus;
  live: {
    acceptedEventCount: number;
    rollingRequestsPerSecond: number;
    projectedRequestsPerMinute: number;
    pressurePercent: number;
    pressureLevel: LiveObservationPressureLevel;
    observedAt: IsoDateTimeString;
  };
  latestObservation: {
    observedAt: IsoDateTimeString;
    payload: LiveObservationProviderSnapshot;
  } | null;
  terminalAt: IsoDateTimeString | null;
};

export type CreateLiveObservationV2Response = {
  session: LiveObservationV2Session;
  snapshot: LiveObservationV2Snapshot;
};

export type LiveObservationV2SnapshotResponse = {
  snapshot: LiveObservationV2Snapshot;
};

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

export type CostProjectDeploymentState = "deployed" | "not_deployed";

export type CostProjectEstimate = {
  project: Project;
  costEstimate: CostEstimateResult | null;
  deploymentState: CostProjectDeploymentState;
};

export type CostProjectEstimateListResponse = {
  period: CostEstimatePeriod;
  expectedUserCount: number;
  region: AwsRegionCode | string;
  totalEstimate: MoneyEstimate;
  totalMonthlyEstimate: MoneyEstimate;
  projects: CostProjectEstimate[];
};

export type CostUsageAnalysisRange = "7d" | "30d" | "month_to_date";

export type CostUsageDataSource = "aws_cost_explorer" | "sample";

export type CostProjectUsageSource = "cost_explorer_tag" | "deployed_resource_estimate" | "sample";

export type CostUsageTrendPoint = {
  date: string;
  amount: number;
};

export type CostUsageMonthlyPoint = {
  month: string;
  amount: number;
  isPartial: boolean;
  isEstimated: boolean;
};

export type CostUsageMonthlyComparison = {
  previousMonthActual: MoneyEstimate;
  currentMonthToDate: MoneyEstimate;
  currentMonthForecast: MoneyEstimate;
  forecastChangeAmount: MoneyEstimate;
  forecastChangePercentage: number | null;
};

export type CostServiceUsage = {
  service: string;
  amount: number;
  percentage: number;
};

export type CostProjectUsage = {
  projectId: string | null;
  projectName: string;
  amount: number;
  percentage: number;
  source: CostProjectUsageSource;
  resourceCount: number;
  monthlyTrend: CostUsageMonthlyPoint[];
};

export type CostResourceUsageSource =
  | "cost_explorer_resource"
  | "deployed_resource_estimate"
  | "sample";

export type CostResourceUsage = {
  id: string;
  projectId?: string | undefined;
  projectName?: string | undefined;
  resourceId: string | null;
  resourceName: string;
  resourceType: string;
  service: string;
  terraformAddress: string;
  amount: number;
  percentage: number;
  source: CostResourceUsageSource;
};

export type CostMetricSeriesPoint = {
  timestamp: IsoDateTimeString;
  value: number;
};

export type CostMetricSeries = {
  id: string;
  label: string;
  unit: string;
  points: CostMetricSeriesPoint[];
};

export type CostWasteResourceInsight = {
  id: string;
  resourceId: string | null;
  resourceName: string;
  resourceType: string;
  service: string;
  projectId?: string | undefined;
  projectName?: string | undefined;
  metricName: string;
  averageValue: number;
  unit: string;
  finding: string;
  estimatedMonthlyWaste: MoneyEstimate;
};

export type CostOptimizationRecommendation = {
  id: string;
  targetType: "resource" | "project" | "service";
  severity: RiskLevel;
  title: string;
  estimatedMonthlySavings: MoneyEstimate;
  reason: string;
  actionLabel: string;
  resourceId?: string | undefined;
  projectId?: string | undefined;
  service?: string | undefined;
};

export type CostUsageAnalysisResponse = {
  range: CostUsageAnalysisRange;
  generatedAt: IsoDateTimeString;
  startDate: string;
  endDate: string;
  currency: "USD";
  dataSource: CostUsageDataSource;
  fallbackUsed: boolean;
  totalCost: MoneyEstimate;
  forecastMonthEndCost: MoneyEstimate;
  dailyTrend: CostUsageTrendPoint[];
  monthlyTrend: CostUsageMonthlyPoint[];
  monthlyComparison: CostUsageMonthlyComparison;
  serviceCosts: CostServiceUsage[];
  projectCosts: CostProjectUsage[];
  resourceCosts: CostResourceUsage[];
  wasteResources: CostWasteResourceInsight[];
  recommendations: CostOptimizationRecommendation[];
  metricSeries: CostMetricSeries[];
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

export type AiResultSource =
  | "prompt"
  | "github"
  | "amazon_q"
  | "template_fallback"
  | "llm_fallback";

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

export type VoiceRequirementMediaFormat = "mp3" | "mp4" | "wav" | "flac" | "ogg" | "amr" | "webm";

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

export type ArchitecturePatchPlanAction = "modify_resource" | "remove_resource" | "add_resource";

export type ArchitecturePatchPlanOperationType =
  | "set_value"
  | "increase_one_step"
  | "decrease_one_step"
  | "enable"
  | "disable"
  | "rename";

export type ArchitecturePatchPlanStatus = "planned" | "needs_clarification" | "unsupported";

export type ArchitecturePatchPlanOperation = {
  op: ArchitecturePatchPlanOperationType;
  path: string;
  value: string | number | boolean | null;
};

export type ArchitecturePatchPlan = {
  status: ArchitecturePatchPlanStatus;
  action: ArchitecturePatchPlanAction | null;
  target: {
    resourceType: ResourceType | null;
    resourceId: string | null;
    label: string | null;
  };
  candidateResourceIds: string[];
  operations: ArchitecturePatchPlanOperation[];
  preserve: string[];
  clarificationQuestion: string | null;
  confidence: number;
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
  patchPlan?: ArchitecturePatchPlan | undefined;
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
  patchPlan?: ArchitecturePatchPlan | undefined;
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
  templateId?: TemplateId | undefined;
  dynamicQuestionAnswers?:
    | readonly {
        questionId: string;
        question: string;
        answer: string;
      }[]
    | undefined;
  templateFallback?: Record<string, unknown> | undefined;
  repositoryEvidence?:
    | {
        mode: "strict";
        facts: readonly RepositoryArchitectureFact[];
        repositoryName?: string | undefined;
      }
    | undefined;
  repositoryAnalysis?:
    | {
        projectId: string;
        sourceRepositoryId: string;
      }
    | undefined;
};

export const ARCHITECTURE_DRAFT_PROGRESS_STAGES = [
  "preparing_requirements",
  "normalizing_requirements",
  "querying_amazon_q",
  "validating_architecture",
  "building_diagram"
] as const;

export type ArchitectureDraftProgressStage = (typeof ARCHITECTURE_DRAFT_PROGRESS_STAGES)[number];

export type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  diagramJson?: DiagramJson | undefined;
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

export type ArchitectureDraftStreamEvent =
  | {
      type: "progress";
      stage: ArchitectureDraftProgressStage;
    }
  | {
      type: "result";
      result: CreateArchitectureDraftResponse;
    }
  | {
      type: "error";
      error: ApiErrorResponse & {
        statusCode: number;
      };
    };

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
  riskFamily?: string | undefined;
  trivyRuleIds?: string[] | undefined;
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
  deepScan?:
    | {
        status: "not_required" | "running" | "complete" | "failed";
        scanId?: string | undefined;
        message?: string | undefined;
      }
    | undefined;
  llmExplanation?: LlmExplanation | undefined;
};

export type AiPreDeploymentDeepScanResponse = {
  status: "running" | "complete" | "failed";
  analysis?: AiPreDeploymentAnalysisResult | undefined;
  message?: string | undefined;
};

export type AiPreDeploymentCheckRequest = {
  architectureJson: ArchitectureJson;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
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
  wellArchitectedGuidance: AiWellArchitectedGuidance[];
  consensusRecommendation: string;
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
export type DiagramNodeBorderStyle = "solid" | "dashed" | "dotted";

export type DiagramNodeStyle = {
  textColor?: string | undefined;
  borderColor?: string | undefined;
  borderStyle?: DiagramNodeBorderStyle | undefined;
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
  areaAutoSizeBaseline?:
    | {
        position: {
          x: number;
          y: number;
        };
        size: {
          width: number;
          height: number;
        };
      }
    | undefined;
  /** Limits a resource's area-frame rendering to an authored presentation, not every catalog use. */
  presentationArea?: boolean | undefined;
  /** Lets Web materialization reuse an exact Resource Panel item for a parameterless Template Design node. */
  presentationCatalogItemId?: string | undefined;
  liveObservationRole?:
    | "traffic-source"
    | "traffic-hop"
    | "capacity-controller"
    | "capacity-unit"
    | "support"
    | undefined;
  moduleSource?:
    | {
        moduleId: string;
        moduleVersion: string;
        expandedAt: IsoDateTimeString;
      }
    | undefined;
  reverseEngineering?:
    | {
        source: "aws_scan";
        protectedValueKeys: string[];
        editableValueKeys: string[];
      }
    | undefined;
};

export type DiagramNodeParameters = {
  terraformBlockType?: TerraformBlockType | undefined;
  /** Exact Terraform files, rather than palette defaults, are authoritative for this node. */
  terraformSourceAuthority?: "workspace-seed" | undefined;
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
  rotation?: number | undefined;
  style?: DiagramNodeStyle | undefined;
  metadata?: DiagramNodeMetadata | undefined;
  parameters?: DiagramNodeParameters | undefined;
};

export type DiagramEdgeStyle = {
  color?: string | undefined;
  lineStyle?: "solid" | "dashed" | "dotted" | undefined;
  width?: "thin" | "medium" | "thick" | undefined;
  animated?: boolean | undefined;
};

export type DiagramEdgeMetadata = {
  managedBy?: "parameter-reference" | undefined;
  parameterPath?: string | undefined;
  /** Controls Board presentation without removing the underlying IaC relationship. */
  presentationRole?: "primary" | "detail" | "summary" | undefined;
};

export type DiagramPoint = {
  x: number;
  y: number;
};

export type DiagramBounds = DiagramPoint & {
  width: number;
  height: number;
};

export type DiagramEdgeArrowDirection =
  | "source-to-target"
  | "target-to-source"
  | "bidirectional"
  | "none";

export type DiagramEdgeRoute = {
  svgPath: string;
  sourcePoint: DiagramPoint;
  targetPoint: DiagramPoint;
  waypoints: DiagramPoint[];
  labelPosition?: DiagramPoint | undefined;
  arrowDirection?: DiagramEdgeArrowDirection | undefined;
  arrowAngle?: number | undefined;
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
  metadata?: DiagramEdgeMetadata | undefined;
  route?: DiagramEdgeRoute | undefined;
  zIndex?: number | undefined;
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

export type DiagramGeometryPolicy = "catalog-normalized" | "source-exact";

export type DiagramPresentation = {
  geometryPolicy: DiagramGeometryPolicy;
  sourceViewBox?: DiagramBounds | undefined;
  initialViewportPending?: boolean | undefined;
  terraformSourceFingerprint?: string | undefined;
};

export type DiagramJson = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport: DiagramViewport;
  variables?: DiagramVariable[] | undefined;
  presentation?: DiagramPresentation | undefined;
};

export type ProjectDraft = {
  id: string;
  projectId: string;
  diagramJson: DiagramJson;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
  revision: number;
  serverSavedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type SaveProjectDraftRequest = {
  diagramJson: DiagramJson;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
};

export type ProjectDraftResponse = {
  draft: ProjectDraft | null;
};

export type TerraformGenerateRequest = {
  diagramJson: DiagramJson;
};

export type TerraformGenerateResponse = {
  terraformCode: string;
  architectureDiagnostics: ArchitectureDiagnostic[];
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
  core?: boolean | undefined;
  sensitive: boolean;
  description?: string | undefined;
  inputKind: ParameterInputKind;
  options?: string[] | undefined;
  referenceTargetTypes?: string[] | undefined;
  referenceAttribute?: string | undefined;
  referenceAttributesByTargetType?: Record<string, string> | undefined;
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

export type ArchitectureValidationMode = "contextual" | "preview" | "pre_deployment";

export type ArchitectureDiagnosticSeverity = "info" | "warning" | "error";

export type ArchitectureDiagnosticRemediation = {
  label: string;
  action: "focus-resource" | "open-parameter" | "open-guidance";
  parameterPath?: string | undefined;
};

export type ArchitectureDiagnostic = {
  source: "architecture-rule";
  code: string;
  severity: ArchitectureDiagnosticSeverity;
  ruleId: string;
  resourceNodeId: string;
  relatedNodeIds: readonly string[];
  summary: string;
  message: string;
  remediation: readonly ArchitectureDiagnosticRemediation[];
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
  preservedResourceAddresses?: string[] | undefined;
  proposals?: TerraformDiagramChangeProposal[] | undefined;
};
