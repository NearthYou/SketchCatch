"use client";

import {
  keepPreviousData,
  queryOptions,
  useQueries,
  useQuery
} from "@tanstack/react-query";
import type { AwsCodeConnectionResponse, AwsConnection } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { queryKeys } from "../../lib/query-keys";
import {
  listAwsConnections,
  listAwsConnectionSettings,
  listGitHubAccountInstallations,
  getAwsCodeConnection,
  refreshAwsCodeConnection
} from "../workspace/api";

export const SETTINGS_CONNECTION_STALE_TIME_MS = 5 * 60_000;
export const SETTINGS_CONNECTION_GC_TIME_MS = 30 * 60_000;

type AwsCodeConnectionLoader = {
  readonly load: (awsConnectionId: string) => Promise<AwsCodeConnectionResponse>;
};

const defaultAwsCodeConnectionLoader: AwsCodeConnectionLoader = {
  load: async (awsConnectionId) => {
    const savedConnection = await getAwsCodeConnection(awsConnectionId);
    if (!savedConnection.codeConnection) {
      return savedConnection;
    }

    try {
      return await refreshAwsCodeConnection(awsConnectionId);
    } catch {
      return savedConnection;
    }
  }
};

export function createAwsCodeConnectionQueryOptions(
  input: { readonly awsConnectionId: string; readonly userId: string },
  loader: AwsCodeConnectionLoader = defaultAwsCodeConnectionLoader
) {
  return queryOptions({
    gcTime: SETTINGS_CONNECTION_GC_TIME_MS,
    queryFn: () => loader.load(input.awsConnectionId),
    queryKey: queryKeys.awsCodeConnection(input.userId, input.awsConnectionId),
    staleTime: SETTINGS_CONNECTION_STALE_TIME_MS
  });
}

export function useAwsConnectionsQuery(options: { readonly includeUnverified?: boolean } = {}) {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";
  const includeUnverified = options.includeUnverified ?? false;
  return useQuery<AwsConnection[]>({
    enabled: status === "authenticated" && userId.length > 0,
    // 복구 화면의 전체 상태 목록은 기본 verified-only 화면의 이전 데이터로 쓰지 않습니다.
    ...(includeUnverified ? { placeholderData: keepPreviousData } : {}),
    queryFn: ({ signal }) => listAwsConnections({ includeUnverified, signal }),
    queryKey: queryKeys.awsConnections(userId, includeUnverified)
  });
}

export function useAwsConnectionSettingsQuery() {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    enabled: status === "authenticated" && userId.length > 0,
    gcTime: SETTINGS_CONNECTION_GC_TIME_MS,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => listAwsConnectionSettings({ signal }),
    queryKey: queryKeys.awsConnectionSettings(userId),
    staleTime: SETTINGS_CONNECTION_STALE_TIME_MS
  });
}

export function useGitHubInstallationsQuery() {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    enabled: status === "authenticated" && userId.length > 0,
    gcTime: SETTINGS_CONNECTION_GC_TIME_MS,
    placeholderData: keepPreviousData,
    queryFn: listGitHubAccountInstallations,
    queryKey: queryKeys.githubInstallations(userId),
    staleTime: SETTINGS_CONNECTION_STALE_TIME_MS
  });
}

export function useAwsCodeConnectionsQueries(awsConnectionIds: readonly string[]) {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQueries({
    queries: awsConnectionIds.map((awsConnectionId) => ({
      ...createAwsCodeConnectionQueryOptions({ awsConnectionId, userId }),
      enabled: status === "authenticated" && userId.length > 0
    }))
  });
}
