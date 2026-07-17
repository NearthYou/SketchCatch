"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../components/auth/auth-provider";
import { queryKeys } from "../../lib/query-keys";
import { loadDashboardOverviewData } from "./dashboard-overview-data";

export function useDashboardOverviewQuery() {
  const { status, user } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    enabled: status === "authenticated" && userId.length > 0,
    queryFn: loadDashboardOverviewData,
    queryKey: queryKeys.dashboardOverview(userId)
  });
}
