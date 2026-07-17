"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { useAuth } from "../../components/auth/auth-provider";
import { queryKeys } from "../../lib/query-keys";
import { fetchProjectThumbnail } from "../workspace/api";
import { loadProjectThumbnail } from "./project-thumbnail-loader";

export const PROJECT_THUMBNAIL_STALE_TIME_MS = 5 * 60_000;
export const PROJECT_THUMBNAIL_GC_TIME_MS = 30 * 60_000;

type ProjectThumbnailLoader = {
  readonly fetchThumbnail: (projectId: string, signal: AbortSignal) => Promise<Blob | null>;
};

const defaultProjectThumbnailLoader: ProjectThumbnailLoader = {
  fetchThumbnail: (projectId, signal) => fetchProjectThumbnail(projectId, { signal })
};

export function createProjectThumbnailQueryOptions(
  input: { readonly projectId: string; readonly userId: string },
  loader: ProjectThumbnailLoader = defaultProjectThumbnailLoader
) {
  return queryOptions({
    gcTime: PROJECT_THUMBNAIL_GC_TIME_MS,
    queryFn: ({ signal }) =>
      loadProjectThumbnail({
        fetchThumbnail: (projectId) => loader.fetchThumbnail(projectId, signal),
        isCancelled: () => signal.aborted,
        projectId: input.projectId
      }),
    queryKey: queryKeys.projectThumbnail(input.userId, input.projectId),
    staleTime: PROJECT_THUMBNAIL_STALE_TIME_MS
  });
}

export function useProjectThumbnailQuery(projectId: string) {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    ...createProjectThumbnailQueryOptions({ projectId, userId }),
    enabled: status === "authenticated" && userId.length > 0 && projectId.length > 0
  });
}
