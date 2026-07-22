"use client";

import { useQuery } from "@tanstack/react-query";
import type { Project } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { queryKeys } from "../../lib/query-keys";
import {
  listProjects,
  listRecentSuccessfulDeploymentProjects
} from "../workspace/api";

export type ProjectsQueryData = {
  readonly deploymentStatusByProjectId: Readonly<Record<string, boolean>>;
  readonly projects: readonly Project[];
};

export function useProjectsQuery() {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    enabled: status === "authenticated" && userId.length > 0,
    queryFn: loadProjectsQueryData,
    queryKey: queryKeys.projects(userId)
  });
}

export function removeProjectFromQueryData(
  data: ProjectsQueryData,
  projectId: string
): ProjectsQueryData {
  const deploymentStatusByProjectId = { ...data.deploymentStatusByProjectId };

  delete deploymentStatusByProjectId[projectId];

  return {
    deploymentStatusByProjectId,
    projects: data.projects.filter((project) => project.id !== projectId)
  };
}

async function loadProjectsQueryData(): Promise<ProjectsQueryData> {
  const [projects, recentDeploymentItems] = await Promise.all([
    listProjects(),
    listRecentSuccessfulDeploymentProjects()
  ]);
  const deployedProjectIds = new Set(recentDeploymentItems.map((item) => item.project.id));

  return {
    deploymentStatusByProjectId: Object.fromEntries(
      projects.map((project) => [project.id, deployedProjectIds.has(project.id)] as const)
    ),
    projects
  };
}
