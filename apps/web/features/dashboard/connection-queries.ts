"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AwsConnection } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { queryKeys } from "../../lib/query-keys";
import { listAwsConnections, listGitHubAccountInstallations } from "../workspace/api";

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
