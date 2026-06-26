import type {
  AwsConnectionCloudFormationTemplateResponse,
  CreateAwsConnectionRequest,
  CreateAwsConnectionResponse,
  CreateProjectRequest,
  Project,
  ProjectDetailsResponse,
  ProjectDraftResponse,
  ProjectListResponse,
  ProjectResponse,
  SaveProjectDraftRequest,
  TestAwsConnectionRequest,
  TestAwsConnectionResponse,
  VerifyAwsConnectionRequest,
  VerifyAwsConnectionResponse
} from "../../../../packages/types/src";
import { apiFetch } from "../../lib/api-client";

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
  const response = await apiFetch<ProjectDetailsResponse>(
    `/projects/${encodeURIComponent(projectId)}`,
    {
      auth: true
    }
  );
  return response.project;
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

export async function createAwsConnectionSetup({
  projectId,
  region
}: {
  projectId: string;
} & CreateAwsConnectionRequest): Promise<CreateAwsConnectionResponse> {
  return apiFetch<CreateAwsConnectionResponse>(
    `/projects/${encodeURIComponent(projectId)}/aws-connections`,
    {
      auth: true,
      method: "POST",
      body: {
        region
      }
    }
  );
}

export async function testAwsConnection(
  input: {
    projectId: string;
    connectionId: string;
  } & TestAwsConnectionRequest
): Promise<TestAwsConnectionResponse> {
  return apiFetch<TestAwsConnectionResponse>(
    `/projects/${encodeURIComponent(input.projectId)}/aws-connections/${encodeURIComponent(
      input.connectionId
    )}/test`,
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
  projectId,
  connectionId,
  roleArn
}: {
  projectId: string;
  connectionId: string;
} & VerifyAwsConnectionRequest): Promise<VerifyAwsConnectionResponse> {
  return apiFetch<VerifyAwsConnectionResponse>(
    `/projects/${encodeURIComponent(projectId)}/aws-connections/${encodeURIComponent(connectionId)}/verify`,
    {
      auth: true,
      method: "POST",
      body: {
        roleArn
      }
    }
  );
}

export async function getAwsConnectionCloudFormationTemplate({
  projectId,
  connectionId
}: {
  projectId: string;
  connectionId: string;
}): Promise<AwsConnectionCloudFormationTemplateResponse> {
  return apiFetch<AwsConnectionCloudFormationTemplateResponse>(
    `/projects/${encodeURIComponent(projectId)}/aws-connections/${encodeURIComponent(
      connectionId
    )}/cloudformation-template`,
    {
      auth: true
    }
  );
}
