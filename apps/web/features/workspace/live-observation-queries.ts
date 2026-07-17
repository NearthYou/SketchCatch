"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type {
  ApplicationRelease,
  Deployment,
  DeploymentLiveObservationArchitectureResponse,
  TerraformOutput
} from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { APP_QUERY_STALE_TIME_MS } from "../../components/query/create-query-client";
import { queryKeys } from "../../lib/query-keys";
import {
  getLiveObservationArchitecture,
  listApplicationReleases,
  listDeployments,
  listTerraformOutputs
} from "./api";

export type LiveObservationReferenceData = {
  readonly deployments: readonly Deployment[];
  readonly releases: readonly ApplicationRelease[];
};

type LiveObservationReferenceLoaders = {
  readonly loadDeployments: (
    projectId: string,
    signal: AbortSignal
  ) => Promise<Deployment[]>;
  readonly loadReleases: (
    projectId: string,
    signal: AbortSignal
  ) => Promise<ApplicationRelease[]>;
};

type LiveObservationOutputsLoaders = {
  readonly loadOutputs: (
    deploymentId: string,
    signal: AbortSignal
  ) => Promise<TerraformOutput[]>;
};

type LiveObservationArchitectureLoaders = {
  readonly loadArchitecture: (
    deploymentId: string,
    signal: AbortSignal
  ) => Promise<DeploymentLiveObservationArchitectureResponse>;
};

const defaultReferenceLoaders: LiveObservationReferenceLoaders = {
  loadDeployments: (projectId, signal) => listDeployments(projectId, { signal }),
  loadReleases: (projectId, signal) => listApplicationReleases(projectId, { signal })
};

const defaultOutputsLoaders: LiveObservationOutputsLoaders = {
  loadOutputs: (deploymentId, signal) => listTerraformOutputs(deploymentId, { signal })
};

const defaultArchitectureLoaders: LiveObservationArchitectureLoaders = {
  loadArchitecture: (deploymentId, signal) =>
    getLiveObservationArchitecture(deploymentId, signal)
};

export function createLiveObservationReferenceQueryOptions(
  input: { readonly projectId: string; readonly userId: string },
  loaders: LiveObservationReferenceLoaders = defaultReferenceLoaders
) {
  return queryOptions({
    queryFn: async ({ signal }): Promise<LiveObservationReferenceData> => {
      const [deployments, releases] = await Promise.all([
        loaders.loadDeployments(input.projectId, signal),
        loaders.loadReleases(input.projectId, signal)
      ]);

      return { deployments, releases };
    },
    queryKey: queryKeys.liveObservationReference(input.userId, input.projectId),
    staleTime: APP_QUERY_STALE_TIME_MS
  });
}

export function createLiveObservationOutputsQueryOptions(
  input: { readonly deploymentId: string; readonly userId: string },
  loaders: LiveObservationOutputsLoaders = defaultOutputsLoaders
) {
  return queryOptions({
    queryFn: ({ signal }) => loaders.loadOutputs(input.deploymentId, signal),
    queryKey: queryKeys.liveObservationOutputs(input.userId, input.deploymentId),
    staleTime: APP_QUERY_STALE_TIME_MS
  });
}

export function createLiveObservationArchitectureQueryOptions(
  input: { readonly deploymentId: string; readonly userId: string },
  loaders: LiveObservationArchitectureLoaders = defaultArchitectureLoaders
) {
  return queryOptions({
    queryFn: ({ signal }) => loaders.loadArchitecture(input.deploymentId, signal),
    queryKey: queryKeys.liveObservationArchitecture(input.userId, input.deploymentId),
    staleTime: Number.POSITIVE_INFINITY
  });
}

export function useLiveObservationQueries(input: {
  readonly deploymentId: string;
  readonly loadOutputs: boolean;
  readonly projectId: string;
}) {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";
  const authenticated = status === "authenticated" && userId.length > 0;
  const reference = useQuery({
    ...createLiveObservationReferenceQueryOptions({ projectId: input.projectId, userId }),
    enabled: authenticated && input.projectId.length > 0
  });
  const outputs = useQuery({
    ...createLiveObservationOutputsQueryOptions({
      deploymentId: input.deploymentId,
      userId
    }),
    enabled: authenticated && input.loadOutputs && input.deploymentId.length > 0
  });
  const architecture = useQuery({
    ...createLiveObservationArchitectureQueryOptions({
      deploymentId: input.deploymentId,
      userId
    }),
    enabled: authenticated && input.deploymentId.length > 0
  });

  return { architecture, outputs, reference };
}
