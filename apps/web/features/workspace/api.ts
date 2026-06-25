import type {
  CreateProjectRequest,
  Project,
  ProjectDetailsResponse,
  ProjectDraftResponse,
  ProjectListResponse,
  ProjectResponse,
  SaveProjectDraftRequest
} from "../../../../packages/types/src";

const DEFAULT_API_BASE_URL = "/api";

export async function createProject(input: CreateProjectRequest): Promise<Project> {
  const response = await apiFetch<ProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify(input)
  });

  return response.project;
}

export async function listProjects(): Promise<Project[]> {
  const response = await apiFetch<ProjectListResponse>("/projects");

  return response.projects;
}

export async function getProject(projectId: string): Promise<Project> {
  const response = await apiFetch<ProjectDetailsResponse>(`/projects/${encodeURIComponent(projectId)}`);
  return response.project;
}

export async function getProjectDraft(projectId: string): Promise<ProjectDraftResponse> {
  return apiFetch<ProjectDraftResponse>(`/projects/${encodeURIComponent(projectId)}/draft`);
}

export async function saveProjectDraft({
  projectId,
  diagramJson
}: {
  projectId: string;
} & SaveProjectDraftRequest): Promise<ProjectDraftResponse> {
  return apiFetch<ProjectDraftResponse>(`/projects/${encodeURIComponent(projectId)}/draft`, {
    method: "PUT",
    body: JSON.stringify({
      diagramJson
    })
  });
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    const errorMessage = await readApiErrorMessage(response);
    throw new ApiError(errorMessage ?? `API request failed with ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

async function readApiErrorMessage(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}
