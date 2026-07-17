export type CostDashboardTab = "estimate" | "usage";

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
