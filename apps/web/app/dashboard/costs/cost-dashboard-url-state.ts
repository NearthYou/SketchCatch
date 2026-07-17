import type { CostEstimatePeriod } from "@sketchcatch/types";
import { normalizeExpectedUserCount } from "../../../features/costs/cost-estimate-input";

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
