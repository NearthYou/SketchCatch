import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiPreDeploymentCheckRequest,
  AiPreDeploymentDeepScanResponse,
  AiProviderMetadata,
  AiSafetyExplanation,
  ApplicationRelease,
  ApplicationReleaseListResponse,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  AiTerraformStage,
  AnalyzeSourceRepositoryRequest,
  ApiErrorCode,
  ApiErrorResponse,
  ArchitectureDraftProgressSnapshot,
  ArchitectureDraftStreamEvent,
  ArchitectureJson,
  ArchitecturePatchPreviewResponse,
  ArchitectureSnapshot,
  ApproveDeploymentPlanRequest,
  AwsConnectionCloudFormationTemplateResponse,
  AwsConnectionDeletionPreviewResponse,
  AwsConnection,
  AwsConnectionListResponse,
  AwsCodeConnectionResponse,
  CostEstimatePeriod,
  CostProjectEstimateListResponse,
  CostUsageAnalysisRange,
  CostUsageAnalysisResponse,
  CheckFinding,
  CreateArchitectureSnapshotRequest,
  CreateArchitectureDraftRequest,
  CreateArchitectureDraftResponse,
  CreateGitHubArchitectureDraftRequest,
  CreateGitHubInstallationUserAuthorizationRequest,
  CreateGitHubProjectInstallUrlRequest,
  CreateAwsConnectionRequest,
  CreateAwsConnectionResponse,
  CreateDeploymentRequest,
  CreateGitCicdHandoffRequest,
  ConfirmProjectAssetUploadResponse,
  CreateLiveObservationV2Response,
  CreateArchitecturePatchPreviewRequest,
  CreateDesignSimulationRequest,
  CreateProjectAssetUploadRequest,
  CreateProjectRequest,
  CreateReverseEngineeringScanRequest,
  DeleteProjectRequest,
  DeleteProjectResponse,
  DeleteAwsConnectionRequest,
  DesignSimulationResult,
  DeployedResource,
  Deployment,
  DeploymentFailureExplanation,
  DeploymentFailureExplanationResponse,
  DeploymentListResponse,
  DeploymentLog,
  DeploymentLogListResponse,
  DeploymentLiveObservationArchitectureResponse,
  DeploymentResourceListResponse,
  DeploymentResponse,
  DiagramJson,
  GitCicdHandoff,
  GitCicdHandoffListResponse,
  GitCicdHandoffPipelineStatus,
  GitCicdHandoffPipelineStatusResponse,
  GitCicdHandoffResponse,
  GitCicdGitHubOAuthStartResponse,
  GitCicdMonitoringConfig,
  GitCicdMonitoringConfigResponse,
  GitCicdPipelineLogListResponse,
  GitCicdPipelineProjectRefreshResponse,
  GitCicdPipelineRun,
  GitCicdPipelineRunListResponse,
  GitCicdPipelineRunRefreshResponse,
  GitCicdPipelineRunResponse,
  GitCicdReadinessResponse,
  GitCicdReadinessSnapshot,
  GitCicdReleaseRunResponse,
  GitCicdRepositorySettingsApplyResponse,
  GitCicdAwsRoleDiffApplyResponse,
  GitHubAppExistingInstallationCallbackUrlResponse,
  GitHubAppInstallUrlResponse,
  GitHubInstallationConnection,
  GitHubInstallationUserAuthorizationUrlResponse,
  ListGitHubInstalledRepositoriesResponse,
  ListGitHubInstallationsResponse,
  ListGitHubInstallationRepositoriesRequest,
  ListGitHubInstallationRepositoriesResponse,
  LiveObservationV2Snapshot,
  LiveObservationV2SnapshotResponse,
  Project,
  ProjectAssetUploadResponse,
  ProjectDetailsResponse,
  ProjectDraftResponse,
  ProjectDeletePreviewResponse,
  ProjectListResponse,
  ProjectResponse,
  ProjectDeploymentTarget,
  ProjectDeploymentTargetResponse,
  ProjectBuildEnvironment,
  ProjectBuildEnvironmentResponse,
  PrepareDeploymentRequest,
  PutProjectDeploymentTargetRequest,
  RecommendRepositoryTemplateRequest,
  RecommendRepositoryTemplateResponse,
  RecentSuccessfulDeploymentProject,
  RecentSuccessfulDeploymentProjectListResponse,
  SourceRepository,
  AnalyzeSourceRepositoryResponse,
  SourceRepositoryAnalysisResult,
  SourceRepositoryListResponse,
  SourceRepositoryResponse,
  ConnectGitHubSourceRepositoryRequest,
  ReverseEngineeringScan,
  ReverseEngineeringScanListResponse,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanLogListResponse,
  ReverseEngineeringScanResponse,
  SaveProjectDraftRequest,
  TerraformDiagnostic,
  TerraformOutput,
  TerraformOutputListResponse,
  TestAwsConnectionRequest,
  TestAwsConnectionResponse,
  TerraformGenerateResponse,
  TerraformSyncFileInput,
  TerraformSyncToDiagramResponse,
  TerraformValidateRequest,
  TerraformValidateResponse,
  UpdateGitCicdMonitoringConfigRequest,
  VerifyAwsConnectionCreatedRoleRequest,
  VerifyAwsConnectionRequest,
  VerifyAwsConnectionResponse
} from "../../../../packages/types/src";
import { RESOURCE_TYPES } from "../../../../packages/types/src";
import {
  ApiClientError,
  apiFetch,
  buildApiUrl,
  type ApiRequestContext
} from "../../lib/api-client";
import { readStoredAuthSession } from "../../lib/auth-storage";

const AI_API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api").replace(/\/+$/, "");
const API_ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "not_found",
  "conflict",
  "github_oauth_required",
  "too_many_requests",
  "unprocessable_entity",
  "bad_gateway",
  "service_unavailable",
  "internal_server_error",
  "LIVE_OBSERVATION_DISABLED",
  "LIVE_OBSERVATION_CACHE_UNAVAILABLE",
  "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE",
  "LIVE_OBSERVATION_GONE",
  "LIVE_OBSERVATION_NOT_FOUND",
  "LIVE_OBSERVATION_OUTPUT_INVALID",
  "LIVE_OBSERVATION_RATE_LIMITED"
] as const satisfies readonly ApiErrorCode[];
const API_ERROR_CODE_SET = new Set<string>(API_ERROR_CODES);

type AiTerraformErrorExplanationRequest = {
  readonly diagnostic?: TerraformDiagnostic | undefined;
  readonly stage: AiTerraformStage;
  readonly rawMessage: string;
  readonly relatedResourceId?: string | undefined;
  readonly terraformCodeContext?: string | undefined;
};

type PublicAiRequestOptions = {
  readonly signal?: AbortSignal | undefined;
};

export type ArchitectureDraftStreamOptions = PublicAiRequestOptions & {
  readonly onProgress?:
    | ((snapshot: ArchitectureDraftProgressSnapshot) => void)
    | undefined;
};

type ArchitectureSnapshotResponse = {
  readonly architecture: ArchitectureSnapshot;
};

export async function createProject(input: CreateProjectRequest): Promise<Project> {
  const response = await apiFetch<ProjectResponse>("/projects", {
    auth: true,
    method: "POST",
    body: input
  });

  return response.project;
}

export async function listProjects(): Promise<Project[]> {
  const response = await apiFetch<ProjectListResponse>("/projects", { auth: true });

  return response.projects;
}

export async function getProject(projectId: string): Promise<Project> {
  const response = await getProjectDetails(projectId);
  return response.project;
}

export async function getProjectDeploymentTarget(
  projectId: string
): Promise<ProjectDeploymentTarget | null> {
  const response = await apiFetch<ProjectDeploymentTargetResponse>(
    `/projects/${encodeURIComponent(projectId)}/deployment-target`,
    { auth: true }
  );
  return response.target;
}

export async function putProjectDeploymentTarget(
  projectId: string,
  target: PutProjectDeploymentTargetRequest
): Promise<ProjectDeploymentTarget> {
  const response = await apiFetch<ProjectDeploymentTargetResponse>(
    `/projects/${encodeURIComponent(projectId)}/deployment-target`,
    { auth: true, method: "PUT", body: target }
  );
  if (!response.target) throw new Error("Deployment target response is empty.");
  return response.target;
}

export async function listApplicationReleases(
  projectId: string,
  options: { readonly signal?: AbortSignal | undefined } = {}
): Promise<ApplicationRelease[]> {
  const response = await apiFetch<ApplicationReleaseListResponse>(
    `/projects/${encodeURIComponent(projectId)}/releases`,
    { auth: true, ...(options.signal ? { signal: options.signal } : {}) }
  );
  return response.releases;
}

export async function getProjectDeletePreview(
  projectId: string
): Promise<ProjectDeletePreviewResponse["preview"]> {
  const response = await apiFetch<ProjectDeletePreviewResponse>(
    `/projects/${encodeURIComponent(projectId)}/delete-preview`,
    {
      auth: true
    }
  );

  return response.preview;
}

export async function deleteProject(
  projectId: string,
  action: DeleteProjectRequest["action"] = "delete_project"
): Promise<DeleteProjectResponse> {
  return apiFetch<DeleteProjectResponse>(`/projects/${encodeURIComponent(projectId)}`, {
    auth: true,
    method: "DELETE",
    body: {
      action
    }
  });
}

export async function getProjectDetails(projectId: string): Promise<ProjectDetailsResponse> {
  return apiFetch<ProjectDetailsResponse>(`/projects/${encodeURIComponent(projectId)}`, {
    auth: true
  });
}

export async function getProjectDraft(projectId: string): Promise<ProjectDraftResponse> {
  return apiFetch<ProjectDraftResponse>(`/projects/${encodeURIComponent(projectId)}/draft`, {
    auth: true,
    cache: "no-store"
  });
}

class ProjectThumbnailFetchError extends Error {
  constructor(readonly status: number) {
    super("Project Board 캡처를 불러오지 못했습니다.");
    this.name = "ProjectThumbnailFetchError";
  }
}

// 인증된 Project의 최신 실제 Board 캡처를 raster Blob으로 읽습니다.
export async function fetchProjectThumbnail(projectId: string): Promise<Blob | null> {
  const headers = new Headers({ Accept: "image/webp,image/png" });
  const session = readStoredAuthSession();

  if (session) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(
    buildApiUrl(`/projects/${encodeURIComponent(projectId)}/thumbnail`),
    {
      cache: "no-store",
      credentials: "include",
      headers
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ProjectThumbnailFetchError(response.status);
  }

  return response.blob();
}

export async function saveProjectDraft({
  projectId,
  diagramJson,
  expectedRevision,
  terraformFiles
}: {
  projectId: string;
} & SaveProjectDraftRequest): Promise<ProjectDraftResponse> {
  return apiFetch<ProjectDraftResponse>(`/projects/${encodeURIComponent(projectId)}/draft`, {
    auth: true,
    method: "PUT",
    body: {
      diagramJson,
      expectedRevision,
      ...(terraformFiles !== undefined ? { terraformFiles } : {})
    }
  });
}

export async function createArchitectureSnapshot({
  projectId,
  ...input
}: {
  projectId: string;
} & CreateArchitectureSnapshotRequest): Promise<ArchitectureSnapshot> {
  const response = await apiFetch<ArchitectureSnapshotResponse>(
    `/projects/${encodeURIComponent(projectId)}/architectures`,
    {
      auth: true,
      method: "POST",
      body: input
    }
  );

  return response.architecture;
}

export async function createProjectAssetUpload({
  projectId,
  ...input
}: {
  projectId: string;
} & CreateProjectAssetUploadRequest): Promise<ProjectAssetUploadResponse> {
  return apiFetch<ProjectAssetUploadResponse>(
    `/projects/${encodeURIComponent(projectId)}/assets/presigned-upload`,
    {
      auth: true,
      method: "POST",
      body: input
    }
  );
}

export async function confirmProjectAssetUpload({
  assetId,
  projectId
}: {
  assetId: string;
  projectId: string;
}): Promise<ConfirmProjectAssetUploadResponse["asset"]> {
  const response = await apiFetch<ConfirmProjectAssetUploadResponse>(
    `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/confirm-upload`,
    {
      auth: true,
      method: "POST"
    }
  );

  return response.asset;
}

export async function abortProjectAssetUpload({
  assetId,
  projectId
}: {
  assetId: string;
  projectId: string;
}): Promise<void> {
  await apiFetch<void>(
    `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/abort-upload`,
    {
      auth: true,
      method: "POST"
    }
  );
}

export async function uploadProjectAsset(
  upload: ProjectAssetUploadResponse["upload"],
  content: string | Blob
): Promise<void> {
  const headers = new Headers(upload.headers);
  const isApiUpload = upload.url.startsWith("/api/");
  const uploadUrl = isApiUpload ? buildApiUrl(upload.url.slice(4)) : upload.url;

  if (isApiUpload) {
    const session = readStoredAuthSession();

    if (session) {
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    }
  }

  const response = await fetch(uploadUrl, {
    method: upload.method,
    credentials: isApiUpload ? "include" : "same-origin",
    headers,
    body: content
  });

  if (!response.ok) {
    const contentType = headers.get("Content-Type")?.toLowerCase();

    throw new Error(
      contentType?.startsWith("text/")
        ? "Terraform artifact 업로드에 실패했습니다."
        : "Project asset 업로드에 실패했습니다."
    );
  }
}

export async function generateTerraformCode(
  diagramJson: DiagramJson
): Promise<TerraformGenerateResponse> {
  return apiFetch<TerraformGenerateResponse>("/terraform/generate", {
    auth: true,
    method: "POST",
    body: {
      diagramJson
    }
  });
}

export async function validateTerraformCode(
  input: string | TerraformValidateRequest
): Promise<TerraformValidateResponse> {
  const body = typeof input === "string" ? { terraformCode: input } : input;

  return apiFetch<TerraformValidateResponse>("/terraform/validate", {
    auth: true,
    method: "POST",
    body
  });
}

export async function syncTerraformToDiagram({
  diagramJson,
  terraformCode,
  terraformFiles
}: {
  diagramJson: DiagramJson;
  terraformCode: string;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
}): Promise<TerraformSyncToDiagramResponse> {
  return apiFetch<TerraformSyncToDiagramResponse>("/terraform/sync-to-diagram", {
    auth: true,
    method: "POST",
    body: {
      diagramJson,
      terraformCode,
      ...(terraformFiles !== undefined ? { terraformFiles } : {})
    }
  });
}

// 실제 Workspace AI 패널에서 Requirement Prompt 기반 Architecture Draft를 요청합니다.
export async function createAiArchitectureDraft(
  input: CreateArchitectureDraftRequest,
  options: PublicAiRequestOptions = {}
): Promise<CreateArchitectureDraftResponse> {
  const prompt = input.prompt.trim();

  if (prompt.length === 0) {
    throw new ApiClientError(400, {
      error: "bad_request",
      message: "Requirement Prompt를 먼저 입력해주세요."
    });
  }

  return postPublicAiJson<CreateArchitectureDraftResponse>(
    "/ai/architecture-draft",
    {
      ...input,
      prompt
    },
    options
  );
}

// 새 프로젝트 첫 초안에서만 사용하는 NDJSON progress 경계입니다.
// 기존 JSON 함수는 Repository/기존 프로젝트 호출 호환을 위해 별도로 유지합니다.
export async function createAiArchitectureDraftStream(
  input: CreateArchitectureDraftRequest,
  options: ArchitectureDraftStreamOptions = {}
): Promise<CreateArchitectureDraftResponse> {
  const prompt = input.prompt.trim();

  if (prompt.length === 0) {
    throw new ApiClientError(400, {
      error: "bad_request",
      message: "Requirement Prompt를 먼저 입력해주세요."
    });
  }

  const path = "/ai/architecture-draft/stream";
  const requestContext = createPublicAiRequestContext(path);
  const headers = createPublicAiHeaders("application/x-ndjson");
  let response: Response;

  try {
    response = await fetch(`${AI_API_BASE_URL}${path}`, {
      body: JSON.stringify({ ...input, prompt }),
      credentials: "include",
      headers,
      method: "POST",
      ...(options.signal ? { signal: options.signal } : {})
    });
  } catch (error) {
    if (isPublicAiAbort(error, options.signal)) {
      throw error;
    }

    throw createPublicAiConnectionError(requestContext);
  }

  if (!response.ok) {
    throw await readPublicAiError(response, requestContext);
  }

  return readArchitectureDraftStream(response, requestContext, options.onProgress);
}

export async function analyzePublicSourceRepository(
  input: AnalyzeSourceRepositoryRequest
): Promise<SourceRepositoryAnalysisResult> {
  return postPublicAiJson<SourceRepositoryAnalysisResult>("/ai/source-repository-analysis", input);
}

export async function createGitHubArchitectureDraft(
  input: CreateGitHubArchitectureDraftRequest
): Promise<AiArchitectureDraftResult> {
  return postPublicAiJson<AiArchitectureDraftResult>("/ai/github-architecture-draft", input);
}

export async function createAiArchitecturePatchPreview(
  input: CreateArchitecturePatchPreviewRequest,
  options: PublicAiRequestOptions = {}
): Promise<ArchitecturePatchPreviewResponse> {
  return postPublicAiJson<ArchitecturePatchPreviewResponse>(
    "/ai/architecture-patch-preview",
    {
      architectureJson: input.architectureJson,
      instruction: input.instruction,
      ...(input.selectedTargetResourceId !== undefined
        ? { selectedTargetResourceId: input.selectedTargetResourceId }
        : {}),
      ...(input.connectionTargetResourceId !== undefined
        ? { connectionTargetResourceId: input.connectionTargetResourceId }
        : {}),
      ...(input.skipConnection === true ? { skipConnection: true } : {})
    },
    options
  );
}

// 현재 Architecture Board를 기준으로 Pre-Deployment Check를 실행합니다.
export async function runAiPreDeploymentCheck(
  input: AiPreDeploymentCheckRequest
): Promise<AiPreDeploymentAnalysisResult> {
  return postPublicAiJson<AiPreDeploymentAnalysisResult>("/ai/pre-deployment-check", {
    architectureJson: input.architectureJson,
    ...(input.terraformFiles !== undefined ? { terraformFiles: input.terraformFiles } : {})
  });
}

export async function getAiPreDeploymentDeepScan(
  scanId: string
): Promise<AiPreDeploymentDeepScanResponse> {
  return apiFetch<AiPreDeploymentDeepScanResponse>(
    `/ai/pre-deployment-check/${encodeURIComponent(scanId)}`
  );
}

export async function runAiSafetyFindingExplanation(
  finding: CheckFinding
): Promise<AiSafetyExplanation> {
  return postPublicAiJson<AiSafetyExplanation>("/ai/safety-finding-explanation", { finding });
}

// 현재 Architecture Board와 운영 조건을 기준으로 Design Simulation을 실행합니다.
export async function runAiDesignSimulation(
  input: CreateDesignSimulationRequest
): Promise<DesignSimulationResult> {
  return postPublicAiJson<DesignSimulationResult>("/ai/design-simulation", input);
}

// Terraform Preview 설명은 실제 Terraform 실행 없이 코드 텍스트만 분석합니다.
export async function runAiTerraformPreviewExplanation(
  terraformCode: string,
  options: PublicAiRequestOptions = {}
): Promise<AiTerraformPreviewExplanationResult> {
  return postPublicAiJson<AiTerraformPreviewExplanationResult>(
    "/ai/terraform-preview-explanation",
    {
      terraformCode
    },
    options
  );
}

// Terraform 오류 설명은 Preview 분석과 다른 endpoint로 보내 stage와 원인을 분리합니다.
export async function runAiTerraformErrorExplanation(
  input: AiTerraformErrorExplanationRequest,
  options: PublicAiRequestOptions = {}
): Promise<AiTerraformErrorExplanationResult> {
  return postPublicAiJson<AiTerraformErrorExplanationResult>(
    "/ai/terraform-error-explanation",
    {
      diagnostic: input.diagnostic,
      rawMessage: input.rawMessage,
      relatedResourceId: input.relatedResourceId,
      stage: input.stage,
      terraformCodeContext: input.terraformCodeContext
    },
    options
  );
}

// 인증 없는 gg AI endpoint는 Next rewrite 실패와 분리해 API 서버로 직접 요청합니다.
async function postPublicAiJson<ResponseBody>(
  path: string,
  body: Record<string, unknown>,
  options: PublicAiRequestOptions = {}
): Promise<ResponseBody> {
  const requestContext = createPublicAiRequestContext(path);
  const headers = createPublicAiHeaders("application/json");

  let response: Response;

  try {
    response = await fetch(`${AI_API_BASE_URL}${path}`, {
      body: JSON.stringify(body),
      credentials: "include",
      headers,
      method: "POST",
      ...(options.signal ? { signal: options.signal } : {})
    });
  } catch (error) {
    if (isPublicAiAbort(error, options.signal)) {
      throw error;
    }

    throw createPublicAiConnectionError(requestContext);
  }

  if (!response.ok) {
    throw await readPublicAiError(response, requestContext);
  }

  return response.json() as Promise<ResponseBody>;
}

async function readArchitectureDraftStream(
  response: Response,
  requestContext: ApiRequestContext,
  onProgress: ((snapshot: ArchitectureDraftProgressSnapshot) => void) | undefined
): Promise<CreateArchitectureDraftResponse> {
  if (response.body === null) {
    throw createInvalidArchitectureDraftStreamError(requestContext);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: CreateArchitectureDraftResponse | undefined;
  let terminalSeen = false;
  let completed = false;

  const consumeLine = (line: string): void => {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      return;
    }

    if (terminalSeen) {
      throw createInvalidArchitectureDraftStreamError(requestContext);
    }

    let parsedEvent: unknown;
    try {
      parsedEvent = JSON.parse(trimmedLine) as unknown;
    } catch {
      throw createInvalidArchitectureDraftStreamError(requestContext);
    }

    if (!isArchitectureDraftStreamEvent(parsedEvent)) {
      throw createInvalidArchitectureDraftStreamError(requestContext);
    }
    const event = parsedEvent;

    if (event.type === "progress") {
      onProgress?.(event.snapshot);
      return;
    }

    if (event.type === "result") {
      terminalSeen = true;
      result = event.result;
      return;
    }

    if (event.type === "error") {
      terminalSeen = true;
      throw new ApiClientError(event.error.statusCode, event.error, requestContext);
    }

    throw createInvalidArchitectureDraftStreamError(requestContext);
  };

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        consumeLine(line);
      }
    }

    consumeLine(buffer);
    if (result === undefined) {
      throw createInvalidArchitectureDraftStreamError(requestContext);
    }

    completed = true;
    return result;
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the parse, validation, or abort error that ended consumption.
      }
    }
    reader.releaseLock();
  }
}

function createPublicAiRequestContext(path: string): ApiRequestContext {
  return {
    method: "POST",
    path: new URL(`${AI_API_BASE_URL}${path}`, "http://sketchcatch.local").pathname
  };
}

function createPublicAiHeaders(accept: string): Headers {
  const headers = new Headers({
    Accept: accept,
    "Content-Type": "application/json"
  });
  const session = readStoredAuthSession();

  if (session) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  return headers;
}

function isPublicAiAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

function createPublicAiConnectionError(requestContext: ApiRequestContext): ApiClientError {
  return new ApiClientError(
    0,
    {
      error: "internal_server_error",
      message:
        "API 서버에 연결할 수 없습니다. Docker DB와 API 서버가 켜져 있는지 확인해주세요."
    },
    requestContext
  );
}

function createInvalidArchitectureDraftStreamError(
  requestContext: ApiRequestContext
): ApiClientError {
  return new ApiClientError(
    500,
    {
      error: "internal_server_error",
      message: "아키텍처 생성 응답을 확인하지 못했습니다. 다시 시도해주세요."
    },
    requestContext
  );
}

function isArchitectureDraftStreamEvent(value: unknown): value is ArchitectureDraftStreamEvent {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  if (value.type === "progress") {
    return (
      "snapshot" in value &&
      isArchitectureDraftProgressSnapshot(value.snapshot)
    );
  }

  if (value.type === "result") {
    return "result" in value && isCreateArchitectureDraftResponse(value.result);
  }

  if (value.type === "error") {
    return (
      "error" in value &&
      typeof value.error === "object" &&
      value.error !== null &&
      "statusCode" in value.error &&
      typeof value.error.statusCode === "number" &&
      "error" in value.error &&
      isApiErrorCode(value.error.error) &&
      "message" in value.error &&
      typeof value.error.message === "string"
    );
  }

  return false;
}

function isArchitectureDraftProgressSnapshot(
  value: unknown
): value is ArchitectureDraftProgressSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "sequence" in value &&
    Number.isSafeInteger(value.sequence) &&
    typeof value.sequence === "number" &&
    value.sequence > 0 &&
    "provisionalArchitectureJson" in value &&
    isArchitectureJson(value.provisionalArchitectureJson) &&
    "excludableCandidateIds" in value &&
    isStringArray(value.excludableCandidateIds)
  );
}

function isCreateArchitectureDraftResponse(
  value: unknown
): value is CreateArchitectureDraftResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if ("status" in value) {
    return (
      value.status === "needs_clarification" &&
      "question" in value &&
      typeof value.question === "string" &&
      "suggestions" in value &&
      isStringArray(value.suggestions) &&
      "providerMetadata" in value &&
      isAiProviderMetadata(value.providerMetadata)
    );
  }

  return (
    "architectureJson" in value &&
    isArchitectureJson(value.architectureJson) &&
    "title" in value &&
    typeof value.title === "string" &&
    "metadata" in value &&
    isArchitectureDraftMetadata(value.metadata) &&
    (!("diagramJson" in value) ||
      value.diagramJson === undefined ||
      isDiagramJson(value.diagramJson)) &&
    (!("llmExplanation" in value) ||
      value.llmExplanation === undefined ||
      isLlmExplanation(value.llmExplanation))
  );
}

function isArchitectureDraftMetadata(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    typeof value.source === "string" &&
    "confidence" in value &&
    (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high") &&
    "assumptions" in value &&
    isStringArray(value.assumptions) &&
    "explanations" in value &&
    isStringArray(value.explanations) &&
    (!("guardrailWarnings" in value) ||
      value.guardrailWarnings === undefined ||
      (Array.isArray(value.guardrailWarnings) &&
        value.guardrailWarnings.every(
          (warning) =>
            isRecord(warning) &&
            typeof warning.code === "string" &&
            typeof warning.message === "string"
        ))) &&
    (!("capabilities" in value) ||
      value.capabilities === undefined ||
      isStringArray(value.capabilities)) &&
    (!("requirementFacts" in value) ||
      value.requirementFacts === undefined ||
      isStringArray(value.requirementFacts)) &&
    (!("architectureIntent" in value) ||
      value.architectureIntent === undefined ||
      isRecord(value.architectureIntent)) &&
    (!("operatingProfile" in value) ||
      value.operatingProfile === undefined ||
      isRecord(value.operatingProfile))
  );
}

function isLlmExplanation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.target === "string" &&
    typeof value.summary === "string" &&
    isStringArray(value.highlights) &&
    isStringArray(value.nextActions) &&
    typeof value.fallbackUsed === "boolean" &&
    (value.fallbackReason === undefined || typeof value.fallbackReason === "string") &&
    (value.wellArchitectedConclusion === undefined ||
      typeof value.wellArchitectedConclusion === "string") &&
    (value.codeSuggestion === undefined ||
      (isRecord(value.codeSuggestion) &&
        typeof value.codeSuggestion.currentCode === "string" &&
        typeof value.codeSuggestion.suggestedCode === "string" &&
        typeof value.codeSuggestion.rationale === "string")) &&
    (value.providerMetadata === undefined || isAiProviderMetadata(value.providerMetadata))
  );
}

function isAiProviderMetadata(value: unknown): value is AiProviderMetadata {
  return (
    isRecord(value) &&
    (value.provider === "bedrock" ||
      value.provider === "amazon_q" ||
      value.provider === "amazon_transcribe" ||
      value.provider === "openai" ||
      value.provider === "fallback") &&
    (value.service === "bedrock_runtime" ||
      value.service === "amazon_q_business" ||
      value.service === "amazon_transcribe" ||
      value.service === "openai_responses" ||
      value.service === "rule_fallback") &&
    (value.model === undefined || typeof value.model === "string") &&
    typeof value.routeTarget === "string" &&
    typeof value.cacheHit === "boolean" &&
    typeof value.cacheKey === "string" &&
    isEstimatedUsage(value.estimatedUsage) &&
    (value.billingMode === "aws_credit_only" ||
      value.billingMode === "standard" ||
      value.billingMode === "disabled") &&
    (value.attempts === undefined ||
      (Array.isArray(value.attempts) &&
        value.attempts.every(
          (attempt) =>
            isRecord(attempt) &&
            typeof attempt.provider === "string" &&
            typeof attempt.service === "string" &&
            (attempt.status === "succeeded" ||
              attempt.status === "fallback" ||
              attempt.status === "skipped" ||
              attempt.status === "failed") &&
            (attempt.fallbackReason === undefined ||
              typeof attempt.fallbackReason === "string")
        ))) &&
    typeof value.generatedAt === "string"
  );
}

function isEstimatedUsage(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.inputCharacters) &&
    isFiniteNumber(value.inputTokensEstimate) &&
    (value.outputCharacters === undefined || isFiniteNumber(value.outputCharacters)) &&
    (value.outputTokensEstimate === undefined || isFiniteNumber(value.outputTokensEstimate))
  );
}

function isArchitectureJson(value: unknown): value is ArchitectureJson {
  if (
    typeof value !== "object" ||
    value === null ||
    !("nodes" in value) ||
    !Array.isArray(value.nodes) ||
    !("edges" in value) ||
    !Array.isArray(value.edges)
  ) {
    return false;
  }

  return (
    value.nodes.every(
      (node) =>
        typeof node === "object" &&
        node !== null &&
        "id" in node &&
        typeof node.id === "string" &&
        "type" in node &&
        isResourceType(node.type) &&
        (!("label" in node) || node.label === undefined || typeof node.label === "string") &&
        "positionX" in node &&
        typeof node.positionX === "number" &&
        Number.isFinite(node.positionX) &&
        "positionY" in node &&
        typeof node.positionY === "number" &&
        Number.isFinite(node.positionY) &&
        "config" in node &&
        typeof node.config === "object" &&
        node.config !== null &&
        !Array.isArray(node.config)
    ) &&
    value.edges.every(
      (edge) =>
        typeof edge === "object" &&
        edge !== null &&
        "id" in edge &&
        typeof edge.id === "string" &&
        "sourceId" in edge &&
        typeof edge.sourceId === "string" &&
        "targetId" in edge &&
        typeof edge.targetId === "string" &&
        (!("label" in edge) || edge.label === undefined || typeof edge.label === "string")
    )
  );
}

function isDiagramJson(value: unknown): value is DiagramJson {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isDiagramNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isDiagramEdge) &&
    isDiagramViewport(value.viewport) &&
    (value.variables === undefined || Array.isArray(value.variables)) &&
    (value.presentation === undefined || isRecord(value.presentation))
  );
}

function isDiagramNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    (value.kind === "resource" || value.kind === "design") &&
    isDiagramPoint(value.position) &&
    isDiagramSize(value.size) &&
    typeof value.label === "string" &&
    typeof value.locked === "boolean" &&
    isFiniteNumber(value.zIndex) &&
    (value.iconUrl === undefined || typeof value.iconUrl === "string") &&
    (value.rotation === undefined || isFiniteNumber(value.rotation)) &&
    (value.style === undefined || isRecord(value.style)) &&
    (value.metadata === undefined || isRecord(value.metadata)) &&
    (value.parameters === undefined || isDiagramNodeParameters(value.parameters))
  );
}

function isDiagramNodeParameters(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.resourceType === "string" &&
    typeof value.resourceName === "string" &&
    typeof value.fileName === "string" &&
    isRecord(value.values) &&
    (value.terraformBlockType === undefined || typeof value.terraformBlockType === "string") &&
    (value.terraformSourceAuthority === undefined ||
      value.terraformSourceAuthority === "workspace-seed") &&
    (value.invalid === undefined || typeof value.invalid === "boolean")
  );
}

function isDiagramEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sourceNodeId === "string" &&
    typeof value.targetNodeId === "string" &&
    (value.sourceHandleId === undefined || typeof value.sourceHandleId === "string") &&
    (value.targetHandleId === undefined || typeof value.targetHandleId === "string") &&
    (value.label === undefined || typeof value.label === "string") &&
    (value.type === undefined || typeof value.type === "string") &&
    (value.style === undefined || isRecord(value.style)) &&
    (value.metadata === undefined || isRecord(value.metadata)) &&
    (value.route === undefined || isRecord(value.route)) &&
    (value.zIndex === undefined || isFiniteNumber(value.zIndex))
  );
}

function isDiagramViewport(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.zoom);
}

function isDiagramPoint(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isDiagramSize(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.width) && isFiniteNumber(value.height);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isResourceType(value: unknown): boolean {
  return typeof value === "string" && (RESOURCE_TYPES as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// API 서버의 JSON 오류를 공용 에러 타입으로 유지해 화면별 메시지 fallback에 덮이지 않게 합니다.
async function readPublicAiError(
  response: Response,
  requestContext: ApiRequestContext
): Promise<ApiClientError> {
  const requestId = response.headers.get("x-request-id")?.trim();
  const responseContext: ApiRequestContext = requestId
    ? { ...requestContext, requestId }
    : requestContext;

  try {
    const body: unknown = await response.json();

    if (isPublicAiErrorBody(body)) {
      return new ApiClientError(response.status, body, responseContext);
    }
  } catch {
    // Fall through to a typed fallback error below.
  }

  return new ApiClientError(
    response.status,
    {
      error: response.status >= 500 ? "internal_server_error" : "bad_request",
      message: `API 요청 실패: ${response.status}`
    },
    responseContext
  );
}

// API 오류 응답에서 표준 error/message 필드가 있는 경우에만 사용자 메시지로 사용합니다.
function isPublicAiErrorBody(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    "message" in value &&
    isApiErrorCode(value.error) &&
    typeof value.message === "string"
  );
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && API_ERROR_CODE_SET.has(value);
}

export async function createAwsConnectionSetup({
  region
}: CreateAwsConnectionRequest): Promise<CreateAwsConnectionResponse> {
  return apiFetch<CreateAwsConnectionResponse>("/aws/connections", {
    auth: true,
    method: "POST",
    body: {
      region
    }
  });
}

export async function listAwsConnections(
  options: { readonly signal?: AbortSignal | undefined } = {}
): Promise<AwsConnection[]> {
  const response = await listAwsConnectionSettings(options);

  return response.awsConnections;
}

export async function listAwsConnectionSettings(
  options: { readonly signal?: AbortSignal | undefined } = {}
): Promise<AwsConnectionListResponse> {
  const response = await apiFetch<AwsConnectionListResponse>("/aws/connections", {
    auth: true,
    ...(options.signal ? { signal: options.signal } : {})
  });

  return response;
}

export async function testAwsConnection(
  input: {
    connectionId: string;
  } & TestAwsConnectionRequest
): Promise<TestAwsConnectionResponse> {
  return apiFetch<TestAwsConnectionResponse>(
    `/aws/connections/${encodeURIComponent(input.connectionId)}/test`,
    {
      auth: true,
      method: "POST",
      body: {
        roleArn: input.roleArn
      }
    }
  );
}

export async function verifyAwsConnection({
  connectionId,
  roleArn
}: {
  connectionId: string;
} & VerifyAwsConnectionRequest): Promise<VerifyAwsConnectionResponse> {
  return apiFetch<VerifyAwsConnectionResponse>(
    `/aws/connections/${encodeURIComponent(connectionId)}/verify`,
    {
      auth: true,
      method: "POST",
      body: {
        roleArn
      }
    }
  );
}

export async function verifyAwsConnectionCreatedRole({
  connectionId,
  accountId
}: {
  connectionId: string;
} & VerifyAwsConnectionCreatedRoleRequest): Promise<VerifyAwsConnectionResponse> {
  return apiFetch<VerifyAwsConnectionResponse>(
    `/aws/connections/${encodeURIComponent(connectionId)}/verify-created-role`,
    {
      auth: true,
      method: "POST",
      body: {
        accountId
      }
    }
  );
}

export async function getAwsConnectionDeletionPreview(
  connectionId: string
): Promise<AwsConnectionDeletionPreviewResponse> {
  return apiFetch<AwsConnectionDeletionPreviewResponse>(
    `/aws/connections/${encodeURIComponent(connectionId)}/deletion-preview`,
    { auth: true }
  );
}

export async function deleteAwsConnection(
  connectionId: string,
  input: DeleteAwsConnectionRequest
): Promise<void> {
  await apiFetch<void>(`/aws/connections/${encodeURIComponent(connectionId)}`, {
    auth: true,
    method: "DELETE",
    body: input
  });
}

export async function getAwsCodeConnection(
  connectionId: string
): Promise<AwsCodeConnectionResponse> {
  return apiFetch<AwsCodeConnectionResponse>(
    `/aws/connections/${encodeURIComponent(connectionId)}/codeconnection`,
    { auth: true }
  );
}

export async function createAwsCodeConnection(
  connectionId: string
): Promise<AwsCodeConnectionResponse> {
  return apiFetch<AwsCodeConnectionResponse>(
    `/aws/connections/${encodeURIComponent(connectionId)}/codeconnection`,
    { auth: true, method: "POST" }
  );
}

export async function refreshAwsCodeConnection(
  connectionId: string
): Promise<AwsCodeConnectionResponse> {
  return apiFetch<AwsCodeConnectionResponse>(
    `/aws/connections/${encodeURIComponent(connectionId)}/codeconnection/refresh`,
    { auth: true, method: "POST" }
  );
}

export async function getAwsConnectionCloudFormationTemplate({
  connectionId
}: {
  connectionId: string;
}): Promise<AwsConnectionCloudFormationTemplateResponse> {
  return apiFetch<AwsConnectionCloudFormationTemplateResponse>(
    `/aws/connections/${encodeURIComponent(connectionId)}/cloudformation-template`,
    {
      auth: true
    }
  );
}

export async function createReverseEngineeringScan({
  projectId,
  ...input
}: {
  projectId: string;
} & CreateReverseEngineeringScanRequest): Promise<ReverseEngineeringScanResponse> {
  return apiFetch<ReverseEngineeringScanResponse>(
    `/projects/${encodeURIComponent(projectId)}/reverse-engineering/scans`,
    {
      auth: true,
      method: "POST",
      body: input
    }
  );
}

// 새 프로젝트를 만들기 전 AWS를 먼저 읽어 보드 후보만 받아옵니다.
export async function createReverseEngineeringPreviewScan(
  input: CreateReverseEngineeringScanRequest
): Promise<ReverseEngineeringScanResponse> {
  return apiFetch<ReverseEngineeringScanResponse>("/reverse-engineering/scans/preview", {
    auth: true,
    method: "POST",
    body: input
  });
}

export async function listReverseEngineeringScans(
  projectId: string
): Promise<ReverseEngineeringScan[]> {
  const response = await apiFetch<ReverseEngineeringScanListResponse>(
    `/projects/${encodeURIComponent(projectId)}/reverse-engineering/scans`,
    {
      auth: true
    }
  );

  return response.scans;
}

export async function getReverseEngineeringScan({
  projectId,
  scanId
}: {
  projectId: string;
  scanId: string;
}): Promise<ReverseEngineeringScanResponse> {
  return apiFetch<ReverseEngineeringScanResponse>(
    `/projects/${encodeURIComponent(projectId)}/reverse-engineering/scans/${encodeURIComponent(scanId)}`,
    {
      auth: true
    }
  );
}

// 실행 중인 스캔에 취소 요청을 보내고, 서버가 기록한 최신 상태를 받습니다.
export async function cancelReverseEngineeringScan({
  projectId,
  scanId
}: {
  projectId: string;
  scanId: string;
}): Promise<ReverseEngineeringScan> {
  const response = await apiFetch<ReverseEngineeringScanResponse>(
    `/projects/${encodeURIComponent(projectId)}/reverse-engineering/scans/${encodeURIComponent(scanId)}/cancel`,
    {
      auth: true,
      method: "POST"
    }
  );

  return response.scan;
}

// 저장된 스캔 기록만 지우고, 사용자가 적용한 보드 저장본은 건드리지 않습니다.
export async function deleteReverseEngineeringScan({
  projectId,
  scanId
}: {
  projectId: string;
  scanId: string;
}): Promise<void> {
  await apiFetch<void>(
    `/projects/${encodeURIComponent(projectId)}/reverse-engineering/scans/${encodeURIComponent(scanId)}`,
    {
      auth: true,
      method: "DELETE"
    }
  );
}

export async function listReverseEngineeringScanLogs({
  projectId,
  scanId
}: {
  projectId: string;
  scanId: string;
}): Promise<ReverseEngineeringScanLogLine[]> {
  const response = await apiFetch<ReverseEngineeringScanLogListResponse>(
    `/projects/${encodeURIComponent(projectId)}/reverse-engineering/scans/${encodeURIComponent(scanId)}/logs`,
    {
      auth: true
    }
  );

  return response.logs;
}

export async function createDeployment({
  projectId,
  architectureId,
  terraformArtifactId,
  awsConnectionId,
  liveProfile,
  scope,
  targetKind,
  source
}: {
  projectId: string;
} & CreateDeploymentRequest): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/projects/${encodeURIComponent(projectId)}/deployments`,
    {
      auth: true,
      method: "POST",
      body: {
        architectureId,
        terraformArtifactId,
        awsConnectionId,
        ...(liveProfile !== undefined ? { liveProfile } : {}),
        ...(scope !== undefined ? { scope } : {}),
        ...(targetKind !== undefined ? { targetKind } : {}),
        ...(source !== undefined ? { source } : {})
      }
    }
  );

  return response.deployment;
}

export async function prepareDeployment({
  projectId,
  architectureId,
  terraformArtifactId,
  awsConnectionId,
  draftRevision,
  scope
}: {
  projectId: string;
} & PrepareDeploymentRequest): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/projects/${encodeURIComponent(projectId)}/deployments/prepare`,
    {
      auth: true,
      method: "POST",
      body: {
        architectureId,
        terraformArtifactId,
        awsConnectionId,
        draftRevision,
        scope
      }
    }
  );

  return response.deployment;
}

export async function getProjectBuildEnvironment(
  projectId: string
): Promise<ProjectBuildEnvironment | null> {
  const response = await apiFetch<ProjectBuildEnvironmentResponse>(
    `/projects/${encodeURIComponent(projectId)}/build-environment`,
    { auth: true }
  );

  return response.buildEnvironment;
}

export async function prepareProjectBuildEnvironment(
  projectId: string
): Promise<ProjectBuildEnvironment> {
  const response = await apiFetch<ProjectBuildEnvironmentResponse>(
    `/projects/${encodeURIComponent(projectId)}/build-environment/prepare`,
    { auth: true, method: "POST" }
  );

  if (!response.buildEnvironment) {
    throw new Error("빌드 환경 준비 결과를 확인하지 못했습니다.");
  }

  return response.buildEnvironment;
}

export async function verifyProjectRepositoryAccess(
  projectId: string
): Promise<ProjectBuildEnvironment> {
  const response = await apiFetch<ProjectBuildEnvironmentResponse>(
    `/projects/${encodeURIComponent(projectId)}/build-environment/verify-repository-access`,
    { auth: true, method: "POST" }
  );

  if (!response.buildEnvironment) {
    throw new Error("GitHub repository 접근 검증 결과를 확인하지 못했습니다.");
  }

  return response.buildEnvironment;
}

export async function listDeployments(
  projectId: string,
  options: { readonly signal?: AbortSignal | undefined } = {}
): Promise<Deployment[]> {
  const response = await apiFetch<DeploymentListResponse>(
    `/projects/${encodeURIComponent(projectId)}/deployments`,
    {
      auth: true,
      ...(options.signal ? { signal: options.signal } : {})
    }
  );

  return response.deployments;
}

export async function createLiveObservation(
  deploymentId: string,
  signal?: AbortSignal
): Promise<CreateLiveObservationV2Response> {
  return apiFetch<CreateLiveObservationV2Response>(
    `/deployments/${encodeURIComponent(deploymentId)}/live-observations`,
    { auth: true, method: "POST", ...(signal ? { signal } : {}) }
  );
}

export function getLiveObservationArchitecture(
  deploymentId: string,
  signal?: AbortSignal
): Promise<DeploymentLiveObservationArchitectureResponse> {
  return apiFetch(
    `/deployments/${encodeURIComponent(deploymentId)}/live-observation-architecture`,
    { auth: true, ...(signal ? { signal } : {}) }
  );
}

export async function getLiveObservationSnapshot(
  deploymentId: string,
  observationId: string,
  signal?: AbortSignal
): Promise<LiveObservationV2Snapshot> {
  const response = await apiFetch<LiveObservationV2SnapshotResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/live-observations/${encodeURIComponent(observationId)}`,
    { auth: true, ...(signal ? { signal } : {}) }
  );

  return response.snapshot;
}

export async function stopLiveObservation(
  deploymentId: string,
  observationId: string,
  signal?: AbortSignal
): Promise<LiveObservationV2Snapshot> {
  const response = await apiFetch<LiveObservationV2SnapshotResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/live-observations/${encodeURIComponent(observationId)}/stop`,
    { auth: true, method: "POST", ...(signal ? { signal } : {}) }
  );

  return response.snapshot;
}

export type LiveObservationStreamFailure = Readonly<{
  error: unknown;
  retryCount: number;
  source: "stream" | "snapshot-poll";
}>;

export async function pollLiveObservationSnapshots(input: {
  readonly deploymentId: string;
  readonly intervalMs?: number | undefined;
  readonly observationId: string;
  readonly signal: AbortSignal;
  readonly onError?: ((failure: LiveObservationStreamFailure) => void) | undefined;
  readonly onSnapshot: (snapshot: LiveObservationV2Snapshot) => void;
}): Promise<void> {
  let retryCount = 0;

  while (!input.signal.aborted) {
    try {
      const snapshot = await getLiveObservationSnapshot(
        input.deploymentId,
        input.observationId,
        input.signal
      );
      input.onSnapshot(snapshot);
      retryCount = 0;
      if (snapshot.status !== "active") {
        return;
      }
    } catch (error) {
      if (input.signal.aborted) {
        return;
      }
      input.onError?.({ error, retryCount, source: "snapshot-poll" });
      retryCount += 1;
    }

    await waitForRetry(input.intervalMs ?? 2_000, input.signal);
  }
}

export async function streamLiveObservationSnapshots(input: {
  readonly deploymentId: string;
  readonly observationId: string;
  readonly signal: AbortSignal;
  readonly onError?: ((failure: LiveObservationStreamFailure) => void) | undefined;
  readonly onSnapshot: (snapshot: LiveObservationV2Snapshot) => void;
  readonly retryBaseDelayMs?: number | undefined;
}): Promise<void> {
  let retryCount = 0;

  while (!input.signal.aborted) {
    try {
      const finalStatus = await readLiveObservationSnapshotStream(input);
      if (finalStatus && finalStatus !== "active") {
        return;
      }
    } catch (error) {
      if (input.signal.aborted) {
        return;
      }
      input.onError?.({ error, retryCount, source: "stream" });
    }

    try {
      const snapshot = await getLiveObservationSnapshot(
        input.deploymentId,
        input.observationId,
        input.signal
      );
      input.onSnapshot(snapshot);
      if (snapshot.status !== "active") {
        return;
      }
    } catch (error) {
      if (input.signal.aborted) {
        return;
      }
      input.onError?.({ error, retryCount, source: "snapshot-poll" });
    }

    const baseDelay = input.retryBaseDelayMs ?? 1_000;
    const delayMs = Math.min(baseDelay * 2 ** retryCount, 8_000);
    retryCount += 1;
    await waitForRetry(delayMs, input.signal);
  }
}

async function readLiveObservationSnapshotStream(input: {
  readonly deploymentId: string;
  readonly observationId: string;
  readonly signal: AbortSignal;
  readonly onSnapshot: (snapshot: LiveObservationV2Snapshot) => void;
}): Promise<LiveObservationV2Snapshot["status"] | null> {
  const session = readStoredAuthSession();
  const headers = new Headers({ Accept: "text/event-stream" });
  if (session) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(
    buildApiUrl(
      `/deployments/${encodeURIComponent(input.deploymentId)}/live-observations/${encodeURIComponent(input.observationId)}/stream`
    ),
    {
      credentials: "include",
      headers,
      signal: input.signal
    }
  );

  if (!response.ok || !response.body) {
    throw new Error("Live Observation stream request failed");
  }

  let finalStatus: LiveObservationV2Snapshot["status"] | null = null;
  await readSseStream(response.body, (rawEvent) => {
    const snapshot = parseLiveObservationSnapshotEvent(rawEvent);
    if (snapshot) {
      finalStatus = snapshot.status;
      input.onSnapshot(snapshot);
    }
  });
  return finalStatus;
}

export async function listGitCicdHandoffs(projectId: string): Promise<GitCicdHandoff[]> {
  const response = await apiFetch<GitCicdHandoffListResponse>(
    `/projects/${encodeURIComponent(projectId)}/git-cicd-handoffs`,
    {
      auth: true
    }
  );

  return response.handoffs;
}

export async function getGitCicdMonitoringConfig(
  projectId: string,
  sourceRepositoryId: string
): Promise<GitCicdMonitoringConfig> {
  const response = await apiFetch<GitCicdMonitoringConfigResponse>(
    `/projects/${encodeURIComponent(projectId)}/source-repositories/${encodeURIComponent(
      sourceRepositoryId
    )}/cicd-monitoring`,
    { auth: true }
  );

  return response.config;
}

export async function refreshGitCicdReadiness(
  projectId: string
): Promise<GitCicdReadinessSnapshot> {
  const response = await apiFetch<GitCicdReadinessResponse>(
    `/projects/${encodeURIComponent(projectId)}/git-cicd/readiness/refresh`,
    { auth: true, method: "POST" }
  );

  return response.readiness;
}

export async function updateGitCicdMonitoringConfig(
  projectId: string,
  sourceRepositoryId: string,
  request: UpdateGitCicdMonitoringConfigRequest
): Promise<GitCicdMonitoringConfig> {
  const response = await apiFetch<GitCicdMonitoringConfigResponse>(
    `/projects/${encodeURIComponent(projectId)}/source-repositories/${encodeURIComponent(
      sourceRepositoryId
    )}/cicd-monitoring`,
    {
      auth: true,
      method: "PUT",
      body: request
    }
  );

  return response.config;
}

export async function listGitCicdPipelineRuns(
  projectId: string,
  options: {
    readonly cursor?: string | undefined;
    readonly limit?: number | undefined;
  } = {}
): Promise<GitCicdPipelineRunListResponse> {
  const params = new URLSearchParams();
  if (options.cursor !== undefined) {
    params.set("cursor", options.cursor);
  }
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";

  return apiFetch<GitCicdPipelineRunListResponse>(
    `/projects/${encodeURIComponent(projectId)}/git-cicd-pipeline-runs${query}`,
    { auth: true }
  );
}

export async function refreshProjectGitCicdPipelineRuns(
  projectId: string
): Promise<GitCicdPipelineProjectRefreshResponse> {
  return apiFetch<GitCicdPipelineProjectRefreshResponse>(
    `/projects/${encodeURIComponent(projectId)}/git-cicd-pipeline-runs/refresh`,
    { auth: true, method: "POST" }
  );
}

export async function getGitCicdPipelineRun(pipelineRunId: string): Promise<GitCicdPipelineRun> {
  const response = await apiFetch<GitCicdPipelineRunResponse>(
    `/git-cicd-pipeline-runs/${encodeURIComponent(pipelineRunId)}`,
    { auth: true }
  );

  return response.run;
}

export async function retryGitCicdFrontendRelease(
  pipelineRunId: string
): Promise<GitCicdReleaseRunResponse["run"]> {
  const response = await apiFetch<GitCicdReleaseRunResponse>(
    `/git-cicd/release-runs/${encodeURIComponent(pipelineRunId)}/frontend/retry`,
    { auth: true, method: "POST" }
  );
  return response.run;
}

export async function listGitCicdPipelineLogs(
  pipelineRunId: string,
  sinceSequence: number
): Promise<GitCicdPipelineLogListResponse> {
  const params = new URLSearchParams({ sinceSequence: String(sinceSequence) });
  return apiFetch<GitCicdPipelineLogListResponse>(
    `/git-cicd-pipeline-runs/${encodeURIComponent(pipelineRunId)}/logs?${params.toString()}`,
    { auth: true }
  );
}

export async function refreshGitCicdPipelineRun(
  pipelineRunId: string
): Promise<GitCicdPipelineRunRefreshResponse> {
  return apiFetch<GitCicdPipelineRunRefreshResponse>(
    `/git-cicd-pipeline-runs/${encodeURIComponent(pipelineRunId)}/refresh`,
    {
      auth: true,
      method: "POST"
    }
  );
}

export async function createGitCicdHandoff({
  projectId,
  ...input
}: {
  projectId: string;
} & CreateGitCicdHandoffRequest): Promise<GitCicdHandoff> {
  const response = await apiFetch<GitCicdHandoffResponse>(
    `/projects/${encodeURIComponent(projectId)}/git-cicd-handoffs`,
    {
      auth: true,
      method: "POST",
      body: input
    }
  );

  return response.handoff;
}

export async function applyGitCicdRepositorySettings(
  handoffId: string
): Promise<GitCicdRepositorySettingsApplyResponse> {
  return apiFetch<GitCicdRepositorySettingsApplyResponse>(
    `/git-cicd-handoffs/${encodeURIComponent(handoffId)}/repository-settings/apply`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );
}

export async function createGitCicdGitHubOAuthStartUrl(
  handoffId: string
): Promise<GitCicdGitHubOAuthStartResponse> {
  return apiFetch<GitCicdGitHubOAuthStartResponse>(
    `/git-cicd-handoffs/${encodeURIComponent(handoffId)}/github-oauth/start`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );
}

export async function applyGitCicdRepositorySettingsWithGitHubOAuth(
  handoffId: string
): Promise<GitCicdRepositorySettingsApplyResponse> {
  return apiFetch<GitCicdRepositorySettingsApplyResponse>(
    `/git-cicd-handoffs/${encodeURIComponent(
      handoffId
    )}/repository-settings/apply-with-github-oauth`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );
}

export async function applyGitCicdAwsRoleDiff(
  handoffId: string
): Promise<GitCicdAwsRoleDiffApplyResponse> {
  return apiFetch<GitCicdAwsRoleDiffApplyResponse>(
    `/git-cicd-handoffs/${encodeURIComponent(handoffId)}/aws-role-diff/apply`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );
}

export async function listSourceRepositories(projectId: string): Promise<SourceRepository[]> {
  const response = await apiFetch<SourceRepositoryListResponse>(
    `/projects/${encodeURIComponent(projectId)}/source-repositories`,
    {
      auth: true
    }
  );

  return response.repositories;
}

// 연결된 Source Repository의 최신 정적 분석을 실행하고 저장된 AI Handoff를 반환합니다.
export async function analyzeSourceRepository(
  projectId: string,
  sourceRepositoryId: string
): Promise<AnalyzeSourceRepositoryResponse> {
  return apiFetch<AnalyzeSourceRepositoryResponse>(
    `/projects/${encodeURIComponent(projectId)}/source-repositories/${encodeURIComponent(sourceRepositoryId)}/analyze`,
    {
      auth: true,
      method: "POST"
    }
  );
}

export async function recommendRepositoryTemplate({
  projectId,
  sourceRepositoryId,
  ...input
}: {
  projectId: string;
  sourceRepositoryId: string;
} & RecommendRepositoryTemplateRequest): Promise<RecommendRepositoryTemplateResponse> {
  return apiFetch<RecommendRepositoryTemplateResponse>(
    `/projects/${encodeURIComponent(projectId)}/source-repositories/${encodeURIComponent(
      sourceRepositoryId
    )}/template-recommendation`,
    {
      auth: true,
      method: "POST",
      body: input
    }
  );
}

export async function createGitHubSourceRepositoryInstallUrl(
  projectId: string,
  input: CreateGitHubProjectInstallUrlRequest
): Promise<GitHubAppInstallUrlResponse> {
  return apiFetch<GitHubAppInstallUrlResponse>(
    `/projects/${encodeURIComponent(projectId)}/source-repositories/github/install-url`,
    {
      auth: true,
      method: "POST",
      body: input
    }
  );
}

export async function createGitHubAccountInstallUrl(): Promise<GitHubAppInstallUrlResponse> {
  return apiFetch<GitHubAppInstallUrlResponse>("/source-repositories/github/install-url", {
    auth: true,
    method: "POST"
  });
}

export async function listGitHubAccountInstallations(): Promise<GitHubInstallationConnection[]> {
  const response = await apiFetch<ListGitHubInstallationsResponse>(
    "/source-repositories/github/installations",
    { auth: true }
  );

  return response.installations;
}

export async function createGitHubExistingInstallationCallbackUrl(
  projectId: string,
  sourceRepositoryId?: string
): Promise<GitHubAppExistingInstallationCallbackUrlResponse> {
  const path = sourceRepositoryId
    ? `/projects/${encodeURIComponent(projectId)}/source-repositories/github/${encodeURIComponent(
        sourceRepositoryId
      )}/existing-installation-callback-url`
    : `/projects/${encodeURIComponent(projectId)}/source-repositories/github/existing-installation-callback-url`;

  return apiFetch<GitHubAppExistingInstallationCallbackUrlResponse>(path, {
    auth: true,
    method: "POST"
  });
}

export async function listGitHubInstalledRepositories(
  projectId: string
): Promise<ListGitHubInstalledRepositoriesResponse> {
  return apiFetch<ListGitHubInstalledRepositoriesResponse>(
    `/projects/${encodeURIComponent(projectId)}/source-repositories/github/installed-repositories`,
    {
      auth: true,
      method: "POST"
    }
  );
}

export async function listGitHubInstallationRepositories(
  input: ListGitHubInstallationRepositoriesRequest
): Promise<ListGitHubInstallationRepositoriesResponse> {
  return apiFetch<ListGitHubInstallationRepositoriesResponse>(
    "/source-repositories/github/installation-repositories",
    {
      auth: true,
      method: "POST",
      body: input
    }
  );
}

export async function createGitHubInstallationUserAuthorization(
  input: CreateGitHubInstallationUserAuthorizationRequest
): Promise<GitHubInstallationUserAuthorizationUrlResponse> {
  return apiFetch<GitHubInstallationUserAuthorizationUrlResponse>(
    "/source-repositories/github/user-authorization-url",
    {
      auth: true,
      method: "POST",
      body: input
    }
  );
}

export async function connectGitHubSourceRepository({
  projectId,
  ...input
}: {
  projectId: string;
} & ConnectGitHubSourceRepositoryRequest): Promise<SourceRepository> {
  const response = await apiFetch<SourceRepositoryResponse>(
    `/projects/${encodeURIComponent(projectId)}/source-repositories/github`,
    {
      auth: true,
      method: "POST",
      body: input
    }
  );

  return response.repository;
}

export async function getGitCicdHandoffPipelineStatus(
  handoffId: string
): Promise<GitCicdHandoffPipelineStatus> {
  const response = await apiFetch<GitCicdHandoffPipelineStatusResponse>(
    `/git-cicd-handoffs/${encodeURIComponent(handoffId)}/pipeline-status`,
    {
      auth: true
    }
  );

  return response.pipelineStatus;
}

export async function listRecentSuccessfulDeploymentProjects(): Promise<
  RecentSuccessfulDeploymentProject[]
> {
  const response = await apiFetch<RecentSuccessfulDeploymentProjectListResponse>(
    "/deployments/recent-successful-projects",
    {
      auth: true
    }
  );

  return response.items;
}

export async function listCostProjectEstimates(
  input: {
    expectedUserCount: number;
    period: CostEstimatePeriod;
    region?: string | undefined;
  },
  options: { readonly signal?: AbortSignal | undefined } = {}
): Promise<CostProjectEstimateListResponse> {
  const params = new URLSearchParams({
    expectedUserCount: String(input.expectedUserCount),
    period: input.period,
    region: input.region ?? "ap-northeast-2"
  });

  return apiFetch<CostProjectEstimateListResponse>(`/costs/projects?${params.toString()}`, {
    auth: true,
    ...(options.signal ? { signal: options.signal } : {})
  });
}

export async function listCostUsageAnalysis(
  input: {
    awsConnectionId?: string | undefined;
    projectId?: string | undefined;
    range: CostUsageAnalysisRange;
  },
  options: { readonly signal?: AbortSignal | undefined } = {}
): Promise<CostUsageAnalysisResponse> {
  const params = new URLSearchParams({
    range: input.range
  });

  if (input.awsConnectionId !== undefined) {
    params.set("awsConnectionId", input.awsConnectionId);
  }

  if (input.projectId !== undefined) {
    params.set("projectId", input.projectId);
  }

  return apiFetch<CostUsageAnalysisResponse>(`/costs/usage?${params.toString()}`, {
    auth: true,
    ...(options.signal ? { signal: options.signal } : {})
  });
}

export async function runDeploymentInit(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/init`,
    {
      auth: true,
      method: "POST"
    }
  );

  return response.deployment;
}

export async function runDeploymentPlan(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/plan`,
    {
      auth: true,
      method: "POST"
    }
  );

  return response.deployment;
}

export async function prepareInfrastructureRollback(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/infrastructure-rollback`,
    { auth: true, method: "POST" }
  );

  return response.deployment;
}

export async function retryDeploymentFrontend(deploymentId: string): Promise<void> {
  await apiFetch<void>(
    `/deployments/${encodeURIComponent(deploymentId)}/application-release/frontend/retry`,
    { auth: true, method: "POST" }
  );
}

export async function approveDeploymentPlan(
  deploymentId: string,
  acknowledgedWarningIds: ApproveDeploymentPlanRequest["acknowledgedWarningIds"] = []
): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/approve`,
    {
      auth: true,
      method: "POST",
      body: {
        acknowledgedWarningIds
      }
    }
  );

  return response.deployment;
}

export async function revokeDeploymentApproval(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/revoke-approval`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );

  return response.deployment;
}

export async function runDeploymentApply(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/apply`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );

  return response.deployment;
}

export async function executeDeployment(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/execute`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );

  return response.deployment;
}

export async function runDeploymentDestroyPlan(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/destroy/plan`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );

  return response.deployment;
}

export async function runDeploymentDestroy(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/destroy`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );

  return response.deployment;
}

export async function cancelDeployment(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/cancel`,
    {
      auth: true,
      method: "POST",
      body: {}
    }
  );

  return response.deployment;
}

export async function listDeploymentLogs(deploymentId: string): Promise<DeploymentLog[]> {
  const response = await apiFetch<DeploymentLogListResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/logs`,
    {
      auth: true
    }
  );

  return response.logs;
}

export async function getDeploymentFailureExplanation(
  deploymentId: string
): Promise<DeploymentFailureExplanation> {
  const response = await apiFetch<DeploymentFailureExplanationResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/failure-explanation`,
    {
      auth: true
    }
  );

  return response.explanation;
}

export async function streamDeploymentLogs(input: {
  deploymentId: string;
  sinceSequence: number;
  signal: AbortSignal;
  onLog: (log: DeploymentLog) => void;
}): Promise<void> {
  const session = readStoredAuthSession();
  const headers = new Headers({
    Accept: "text/event-stream"
  });

  if (session) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(
    buildApiUrl(
      `/deployments/${encodeURIComponent(input.deploymentId)}/logs/stream?sinceSequence=${input.sinceSequence}`
    ),
    {
      credentials: "include",
      headers,
      signal: input.signal
    }
  );

  if (!response.ok) {
    throw new Error("Deployment log stream request failed");
  }

  if (!response.body) {
    return;
  }

  await readDeploymentLogStream(response.body, input.onLog);
}

export async function listDeploymentResources(deploymentId: string): Promise<DeployedResource[]> {
  const response = await apiFetch<DeploymentResourceListResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/resources`,
    {
      auth: true
    }
  );

  return response.resources;
}

export async function listTerraformOutputs(
  deploymentId: string,
  options: { readonly signal?: AbortSignal | undefined } = {}
): Promise<TerraformOutput[]> {
  const response = await apiFetch<TerraformOutputListResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/outputs`,
    {
      auth: true,
      ...(options.signal ? { signal: options.signal } : {})
    }
  );

  return response.outputs;
}

async function readDeploymentLogStream(
  body: ReadableStream<Uint8Array>,
  onLog: (log: DeploymentLog) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = drainSseBuffer(buffer, onLog);
  }

  buffer += decoder.decode();
  drainSseBuffer(`${buffer}\n\n`, onLog);
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (rawEvent: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    buffer = drainRawSseEvents(buffer, onEvent);
  }

  buffer += decoder.decode();
  drainRawSseEvents(`${buffer}\n\n`, onEvent);
}

function drainRawSseEvents(buffer: string, onEvent: (rawEvent: string) => void): string {
  let nextBuffer = buffer;
  let separatorIndex = nextBuffer.indexOf("\n\n");

  while (separatorIndex >= 0) {
    onEvent(nextBuffer.slice(0, separatorIndex));
    nextBuffer = nextBuffer.slice(separatorIndex + 2);
    separatorIndex = nextBuffer.indexOf("\n\n");
  }

  return nextBuffer;
}

function parseLiveObservationSnapshotEvent(rawEvent: string): LiveObservationV2Snapshot | null {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (eventName !== "snapshot" || dataLines.length === 0) {
    return null;
  }

  return JSON.parse(dataLines.join("\n")) as LiveObservationV2Snapshot;
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0 || signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = globalThis.setTimeout(finish, delayMs);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

function drainSseBuffer(buffer: string, onLog: (log: DeploymentLog) => void): string {
  let nextBuffer = buffer.replace(/\r\n/g, "\n");
  let separatorIndex = nextBuffer.indexOf("\n\n");

  while (separatorIndex >= 0) {
    const rawEvent = nextBuffer.slice(0, separatorIndex);
    nextBuffer = nextBuffer.slice(separatorIndex + 2);
    separatorIndex = nextBuffer.indexOf("\n\n");

    const log = parseDeploymentLogEvent(rawEvent);

    if (log) {
      onLog(log);
    }
  }

  return nextBuffer;
}

function parseDeploymentLogEvent(rawEvent: string): DeploymentLog | null {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (eventName !== "log" || dataLines.length === 0) {
    return null;
  }

  return JSON.parse(dataLines.join("\n")) as DeploymentLog;
}
