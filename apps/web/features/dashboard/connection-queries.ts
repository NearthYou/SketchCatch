"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AwsConnection,
  AwsImportAccessNextAction,
  AwsImportAccessState
} from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { queryKeys } from "../../lib/query-keys";
import {
  getAwsImportAccessState,
  listAwsConnections,
  listAwsConnectionSettings,
  listGitHubAccountInstallations,
  type AwsImportAccessSafeResponse
} from "../workspace/api";

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
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => listAwsConnectionSettings({ signal }),
    queryKey: queryKeys.awsConnectionSettings(userId)
  });
}

export type AwsImportAccessQueryState = {
  readonly connectionId: string;
  readonly operationId: string;
  readonly nextAction: AwsImportAccessNextAction | null;
  readonly state: AwsImportAccessState;
};

// gg: signed URL이 섞여 와도 query cache에는 safe 상태 필드만 복사합니다.
export function toAwsImportAccessQueryState(
  response: AwsImportAccessSafeResponse
): AwsImportAccessQueryState {
  const state = response.state;
  return {
    connectionId: response.connectionId,
    operationId: response.operationId,
    nextAction: response.nextAction,
    state: {
      connectionId: state.connectionId,
      status: state.status,
      nextAction: state.nextAction,
      cleanupAvailable: state.cleanupAvailable,
      coreReady: state.coreReady,
      limitedServiceLabels: [...state.limitedServiceLabels],
      lastCheckedAt: state.lastCheckedAt,
      operationId: state.operationId,
      safeSummary: state.safeSummary
    }
  };
}

// gg: signed Console URL은 query cache에 넣지 않고 GET의 safe 상태만 연결별로 보관합니다.
export function useAwsImportAccessQuery(connectionId: string) {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery<AwsImportAccessQueryState>({
    enabled: status === "authenticated" && userId.length > 0 && connectionId.length > 0,
    queryFn: async () => toAwsImportAccessQueryState(
      await getAwsImportAccessState(connectionId)
    ),
    queryKey: queryKeys.awsImportAccess(userId, connectionId)
  });
}

export function useGitHubInstallationsQuery() {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    enabled: status === "authenticated" && userId.length > 0,
    placeholderData: keepPreviousData,
    queryFn: listGitHubAccountInstallations,
    queryKey: queryKeys.githubInstallations(userId)
  });
}
