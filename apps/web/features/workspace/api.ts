import type {
  AwsConnectionCloudFormationTemplateResponse,
  AwsConnection,
  AwsConnectionListResponse,
  CreateAwsConnectionRequest,
  CreateAwsConnectionResponse,
  CreateDeploymentRequest,
  CreateProjectRequest,
  DeployedResource,
  Deployment,
  DeploymentListResponse,
  DeploymentLog,
  DeploymentLogListResponse,
  DeploymentResourceListResponse,
  DeploymentResponse,
  DiagramJson,
  Project,
  ProjectDetailsResponse,
  ProjectDraftResponse,
  ProjectListResponse,
  ProjectResponse,
  SaveProjectDraftRequest,
  TerraformOutput,
  TerraformOutputListResponse,
  TestAwsConnectionRequest,
  TestAwsConnectionResponse,
  TerraformGenerateResponse,
  TerraformSyncToDiagramResponse,
  TerraformValidateResponse,
  VerifyAwsConnectionCreatedRoleRequest,
  VerifyAwsConnectionRequest,
  VerifyAwsConnectionResponse
} from "../../../../packages/types/src";
import { apiFetch, buildApiUrl } from "../../lib/api-client";
import { readStoredAuthSession } from "../../lib/auth-storage";

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

export async function getProjectDetails(projectId: string): Promise<ProjectDetailsResponse> {
  return apiFetch<ProjectDetailsResponse>(
    `/projects/${encodeURIComponent(projectId)}`,
    {
      auth: true
    }
  );
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

export async function validateTerraformCode(terraformCode: string): Promise<TerraformValidateResponse> {
  return apiFetch<TerraformValidateResponse>("/terraform/validate", {
    auth: true,
    method: "POST",
    body: {
      terraformCode
    }
  });
}

export async function syncTerraformToDiagram({
  diagramJson,
  terraformCode
}: {
  diagramJson: DiagramJson;
  terraformCode: string;
}): Promise<TerraformSyncToDiagramResponse> {
  return apiFetch<TerraformSyncToDiagramResponse>("/terraform/sync-to-diagram", {
    auth: true,
    method: "POST",
    body: {
      diagramJson,
      terraformCode
    }
  });
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
