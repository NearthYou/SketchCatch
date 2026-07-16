"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../components/auth/auth-provider";
import { queryKeys } from "../../lib/query-keys";
import { listAwsConnections, listGitHubAccountInstallations } from "../workspace/api";

export function useAwsConnectionsQuery() {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    enabled: status === "authenticated" && userId.length > 0,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => listAwsConnections({ signal }),
    queryKey: queryKeys.awsConnections(userId)
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
