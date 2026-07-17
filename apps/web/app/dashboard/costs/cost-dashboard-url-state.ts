import type { CostEstimatePeriod, CostUsageAnalysisRange } from "@sketchcatch/types";
import { normalizeExpectedUserCount } from "../../../features/costs/cost-estimate-input";
import { COST_USAGE_ALL_PROJECTS_KEY } from "../../../features/costs/cost-usage-project-view";

export type CostDashboardTab = "estimate" | "usage";
export const DEFAULT_EXPECTED_USER_COUNT = 1000;

type CostDashboardSearchParams = {
  readonly get: (name: string) => string | null;
  readonly toString: () => string;
};

export function parseCostDashboardTab(searchParams: CostDashboardSearchParams): CostDashboardTab {
  return searchParams.get("tab") === "usage" ? "usage" : "estimate";
}

export function writeCostDashboardTab(
  searchParams: CostDashboardSearchParams,
  tab: CostDashboardTab
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());

  if (tab === "estimate") {
    next.delete("tab");
  } else {
    next.set("tab", tab);
  }

  return next;
}

export function parseCostEstimatePeriod(
  searchParams: CostDashboardSearchParams
): CostEstimatePeriod {
  const period = searchParams.get("period");
  return period === "day" || period === "week" ? period : "month";
}

export function writeCostEstimatePeriod(
  searchParams: CostDashboardSearchParams,
  period: CostEstimatePeriod
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());

  if (period === "month") {
    next.delete("period");
  } else {
    next.set("period", period);
  }

  return next;
}

export function parseExpectedUserCount(searchParams: CostDashboardSearchParams): number {
  const value = searchParams.get("users");
  return value === null
    ? DEFAULT_EXPECTED_USER_COUNT
    : (normalizeExpectedUserCount(value) ?? DEFAULT_EXPECTED_USER_COUNT);
}

export function writeExpectedUserCount(
  searchParams: CostDashboardSearchParams,
  expectedUserCount: number
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());

  if (expectedUserCount === DEFAULT_EXPECTED_USER_COUNT) {
    next.delete("users");
  } else {
    next.set("users", String(expectedUserCount));
  }

  return next;
}

export function parseCostUsageConnectionId(searchParams: CostDashboardSearchParams): string {
  return searchParams.get("connection")?.trim() ?? "";
}

export function writeCostUsageConnectionId(
  searchParams: CostDashboardSearchParams,
  connectionId: string
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());
  const normalizedConnectionId = connectionId.trim();

  if (normalizedConnectionId) {
    next.set("connection", normalizedConnectionId);
  } else {
    next.delete("connection");
  }

  return next;
}

export function parseCostUsageProjectKey(searchParams: CostDashboardSearchParams): string {
  return searchParams.get("project")?.trim() || COST_USAGE_ALL_PROJECTS_KEY;
}

export function writeCostUsageProjectKey(
  searchParams: CostDashboardSearchParams,
  projectKey: string
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());
  const normalizedProjectKey = projectKey.trim();

  if (!normalizedProjectKey || normalizedProjectKey === COST_USAGE_ALL_PROJECTS_KEY) {
    next.delete("project");
  } else {
    next.set("project", normalizedProjectKey);
  }

  return next;
}

export function parseCostUsageRange(
  searchParams: CostDashboardSearchParams
): CostUsageAnalysisRange {
  const range = searchParams.get("range");
  return range === "7d" || range === "month_to_date" ? range : "30d";
}

export function writeCostUsageRange(
  searchParams: CostDashboardSearchParams,
  range: CostUsageAnalysisRange
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());

  if (range === "30d") {
    next.delete("range");
  } else {
    next.set("range", range);
  }

  return next;
}
