"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CostEstimatePeriod, CostUsageAnalysisRange } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { queryKeys } from "../../lib/query-keys";
import { listCostProjectEstimates, listCostUsageAnalysis } from "../workspace/api";

export function useCostEstimateQuery(input: {
  readonly expectedUserCount: number;
  readonly period: CostEstimatePeriod;
}) {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    enabled: status === "authenticated" && userId.length > 0,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => listCostProjectEstimates(input, { signal }),
    queryKey: queryKeys.costEstimates(userId, input.period, input.expectedUserCount)
  });
}

export function useCostUsageQuery(input: {
  readonly connectionId: string;
  readonly enabled: boolean;
  readonly range: CostUsageAnalysisRange;
}) {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    enabled: input.enabled && status === "authenticated" && userId.length > 0,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      listCostUsageAnalysis(
        {
          range: input.range,
          ...(input.connectionId ? { awsConnectionId: input.connectionId } : {})
        },
        { signal }
      ),
    queryKey: queryKeys.costUsage(userId, input.range, input.connectionId)
  });
}
