import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  AiTerraformStage,
  ApiErrorCode,
  ApiErrorResponse,
  ArchitectureJson,
  ArchitectureSnapshot,
  AwsConnectionCloudFormationTemplateResponse,
  AwsConnection,
  AwsConnectionListResponse,
  CostEstimatePeriod,
  CostProjectEstimateListResponse,
  CreateArchitectureSnapshotRequest,
  CreateArchitectureDraftRequest,
  CreateAwsConnectionRequest,
  CreateAwsConnectionResponse,
  CreateDeploymentRequest,
  ConfirmProjectAssetUploadResponse,
  CreateDesignSimulationRequest,
  CreateProjectAssetUploadRequest,
  CreateProjectRequest,
  CreateReverseEngineeringScanRequest,
  DeleteProjectRequest,
  DeleteProjectResponse,
  DesignSimulationResult,
  DeployedResource,
  Deployment,
  DeploymentFailureExplanation,
  DeploymentFailureExplanationResponse,
  DeploymentListResponse,
  DeploymentLog,
  DeploymentLogListResponse,
  DeploymentResourceListResponse,
  DeploymentResponse,
  DiagramJson,
  GitCicdHandoff,
  GitCicdHandoffListResponse,
  GitCicdHandoffPipelineStatus,
  GitCicdHandoffPipelineStatusResponse,
  Project,
  ProjectAssetUploadResponse,
  ProjectDetailsResponse,
  ProjectDraftResponse,
  ProjectDeletePreviewResponse,
  ProjectListResponse,
  ProjectResponse,
  RecentSuccessfulDeploymentProject,
  RecentSuccessfulDeploymentProjectListResponse,
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
  VerifyAwsConnectionCreatedRoleRequest,
  VerifyAwsConnectionRequest,
  VerifyAwsConnectionResponse
} from "../../../../packages/types/src";
import { ApiClientError, apiFetch, buildApiUrl } from "../../lib/api-client";
import { readStoredAuthSession } from "../../lib/auth-storage";

const AI_API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api"
).replace(/\/+$/, "");

type AiTerraformErrorExplanationRequest = {
  readonly diagnostic?: TerraformDiagnostic | undefined;
  readonly stage: AiTerraformStage;
  readonly rawMessage: string;
  readonly relatedResourceId?: string | undefined;
  readonly terraformCodeContext?: string | undefined;
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
    auth: true
  });
}

export async function saveProjectDraft({
  projectId,
  diagramJson
}: {
  projectId: string;
} & SaveProjectDraftRequest): Promise<ProjectDraftResponse> {
  return apiFetch<ProjectDraftResponse>(`/projects/${encodeURIComponent(projectId)}/draft`, {
    auth: true,
    method: "PUT",
    body: {
      diagramJson
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
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: content
  });

  if (!response.ok) {
    throw new Error("Terraform artifact 업로드에 실패했습니다.");
  }
}

export async function generateTerraformCode(diagramJson: DiagramJson): Promise<string> {
  const response = await apiFetch<TerraformGenerateResponse>("/terraform/generate", {
    auth: true,
    method: "POST",
    body: {
      diagramJson
    }
  });

  return response.terraformCode;
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
  input: CreateArchitectureDraftRequest
): Promise<AiArchitectureDraftResult> {
  return postPublicAiJson<AiArchitectureDraftResult>("/ai/architecture-draft", input);
}

// 현재 Architecture Board를 기준으로 Pre-Deployment Check를 실행합니다.
export async function runAiPreDeploymentCheck(
  architectureJson: ArchitectureJson
): Promise<AiPreDeploymentAnalysisResult> {
  return postPublicAiJson<AiPreDeploymentAnalysisResult>("/ai/pre-deployment-check", {
    architectureJson
  });
}

// 현재 Architecture Board와 운영 조건을 기준으로 Design Simulation을 실행합니다.
export async function runAiDesignSimulation(
  input: CreateDesignSimulationRequest
): Promise<DesignSimulationResult> {
  return postPublicAiJson<DesignSimulationResult>("/ai/design-simulation", input);
}

// Terraform Preview 설명은 실제 Terraform 실행 없이 코드 텍스트만 분석합니다.
export async function runAiTerraformPreviewExplanation(
  terraformCode: string
): Promise<AiTerraformPreviewExplanationResult> {
  return postPublicAiJson<AiTerraformPreviewExplanationResult>(
    "/ai/terraform-preview-explanation",
    {
      terraformCode
    }
  );
}

// Terraform 오류 설명은 Preview 분석과 다른 endpoint로 보내 stage와 원인을 분리합니다.
export async function runAiTerraformErrorExplanation(
  input: AiTerraformErrorExplanationRequest
): Promise<AiTerraformErrorExplanationResult> {
  return postPublicAiJson<AiTerraformErrorExplanationResult>("/ai/terraform-error-explanation", {
    diagnostic: input.diagnostic,
    rawMessage: input.rawMessage,
    relatedResourceId: input.relatedResourceId,
    stage: input.stage,
    terraformCodeContext: input.terraformCodeContext
  });
}

// 인증 없는 gg AI endpoint는 Next rewrite 실패와 분리해 API 서버로 직접 요청합니다.
async function postPublicAiJson<ResponseBody>(
  path: string,
  body: Record<string, unknown>
): Promise<ResponseBody> {
  const response = await fetch(`${AI_API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw await readPublicAiError(response);
  }

  return response.json() as Promise<ResponseBody>;
}

// API 서버의 JSON 오류를 공용 에러 타입으로 유지해 화면별 메시지 fallback에 덮이지 않게 합니다.
async function readPublicAiError(response: Response): Promise<ApiClientError> {
  try {
    const body: unknown = await response.json();

    if (isPublicAiErrorBody(body)) {
      return new ApiClientError(response.status, body);
    }
  } catch {
    // Fall through to a typed fallback error below.
  }

  return new ApiClientError(response.status, {
    error: response.status >= 500 ? "internal_server_error" : "bad_request",
    message: `API 요청 실패: ${response.status}`
  });
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
  return (
    value === "bad_request" ||
    value === "unauthorized" ||
    value === "not_found" ||
    value === "conflict" ||
    value === "too_many_requests" ||
    value === "internal_server_error"
  );
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

export async function listAwsConnections(): Promise<AwsConnection[]> {
  const response = await apiFetch<AwsConnectionListResponse>("/aws/connections", {
    auth: true
  });

  return response.awsConnections;
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

export async function deleteAwsConnection(connectionId: string): Promise<void> {
  await apiFetch<void>(`/aws/connections/${encodeURIComponent(connectionId)}`, {
    auth: true,
    method: "DELETE"
  });
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

export async function listReverseEngineeringScans(projectId: string): Promise<ReverseEngineeringScan[]> {
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
  awsConnectionId
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
        awsConnectionId
      }
    }
  );

  return response.deployment;
}

export async function listDeployments(projectId: string): Promise<Deployment[]> {
  const response = await apiFetch<DeploymentListResponse>(
    `/projects/${encodeURIComponent(projectId)}/deployments`,
    {
      auth: true
    }
  );

  return response.deployments;
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

export async function listCostProjectEstimates(input: {
  expectedUserCount: number;
  period: CostEstimatePeriod;
  region?: string | undefined;
}): Promise<CostProjectEstimateListResponse> {
  const params = new URLSearchParams({
    expectedUserCount: String(input.expectedUserCount),
    period: input.period,
    region: input.region ?? "ap-northeast-2"
  });

  return apiFetch<CostProjectEstimateListResponse>(`/costs/projects?${params.toString()}`, {
    auth: true
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

export async function approveDeploymentPlan(deploymentId: string): Promise<Deployment> {
  const response = await apiFetch<DeploymentResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/approve`,
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

export async function listTerraformOutputs(deploymentId: string): Promise<TerraformOutput[]> {
  const response = await apiFetch<TerraformOutputListResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/outputs`,
    {
      auth: true
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
