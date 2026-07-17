"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CostEstimatePeriod, CostUsageAnalysisRange } from "@sketchcatch/types";
import { COST_USAGE_ALL_PROJECTS_KEY } from "../../../features/costs/cost-usage-project-view";
import { CostEstimatePanel } from "./cost-estimate-panel";
import { CostUsagePanel } from "./cost-usage-panel";
import {
  parseCostEstimatePeriod,
  parseCostDashboardTab,
  parseCostUsageConnectionId,
  parseExpectedUserCount,
  writeCostEstimatePeriod,
  writeCostDashboardTab,
  writeCostUsageConnectionId,
  writeExpectedUserCount,
  type CostDashboardTab
} from "./cost-dashboard-url-state";
import styles from "../dashboard-tools.module.css";

export function CostDashboardClient() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<CostDashboardTab>(() =>
    parseCostDashboardTab(searchParams)
  );
  const [estimatePeriod, setEstimatePeriod] = useState<CostEstimatePeriod>(() =>
    parseCostEstimatePeriod(searchParams)
  );
  const [expectedUserCount, setExpectedUserCount] = useState(() =>
    parseExpectedUserCount(searchParams)
  );
  const [expectedUserCountInput, setExpectedUserCountInput] = useState(() =>
    String(parseExpectedUserCount(searchParams))
  );
  const expectedUserCountRef = useRef(expectedUserCount);
  const [selectedConnectionId, setSelectedConnectionId] = useState(() =>
    parseCostUsageConnectionId(searchParams)
  );
  const [selectedProjectKey, setSelectedProjectKey] = useState(COST_USAGE_ALL_PROJECTS_KEY);
  const [usageRange, setUsageRange] = useState<CostUsageAnalysisRange>("30d");
  const tabRefs = useRef<Partial<Record<CostDashboardTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    setActiveTab(parseCostDashboardTab(searchParams));
    setEstimatePeriod(parseCostEstimatePeriod(searchParams));
    setSelectedConnectionId(parseCostUsageConnectionId(searchParams));
    const nextExpectedUserCount = parseExpectedUserCount(searchParams);

    if (expectedUserCountRef.current !== nextExpectedUserCount) {
      expectedUserCountRef.current = nextExpectedUserCount;
      setExpectedUserCount(nextExpectedUserCount);
      setExpectedUserCountInput(String(nextExpectedUserCount));
    }
  }, [searchParams]);

  const pushCostSearchParams = useCallback(
    (nextSearchParams: URLSearchParams): void => {
      const nextQuery = nextSearchParams.toString();
      router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  const changeActiveTab = useCallback(
    (nextTab: CostDashboardTab): void => {
      setActiveTab(nextTab);
      const nextSearchParams = writeCostDashboardTab(searchParams, nextTab);
      pushCostSearchParams(nextSearchParams);
    },
    [pushCostSearchParams, searchParams]
  );

  const changeEstimatePeriod = useCallback(
    (nextPeriod: CostEstimatePeriod): void => {
      setEstimatePeriod(nextPeriod);
      pushCostSearchParams(writeCostEstimatePeriod(searchParams, nextPeriod));
    },
    [pushCostSearchParams, searchParams]
  );

  const changeExpectedUserCount = useCallback(
    (nextExpectedUserCount: number): void => {
      expectedUserCountRef.current = nextExpectedUserCount;
      setExpectedUserCount(nextExpectedUserCount);
      pushCostSearchParams(writeExpectedUserCount(searchParams, nextExpectedUserCount));
    },
    [pushCostSearchParams, searchParams]
  );

  const changeSelectedConnection = useCallback(
    (nextConnectionId: string): void => {
      setSelectedConnectionId(nextConnectionId);
      pushCostSearchParams(writeCostUsageConnectionId(searchParams, nextConnectionId));
    },
    [pushCostSearchParams, searchParams]
  );

  function selectTabFromKeyboard(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: CostDashboardTab
  ): void {
    const tabs: readonly CostDashboardTab[] = ["estimate", "usage"];
    const currentIndex = tabs.indexOf(currentTab);
    const nextTab =
      event.key === "Home"
        ? tabs[0]
        : event.key === "End"
          ? tabs[tabs.length - 1]
          : event.key === "ArrowRight"
            ? tabs[(currentIndex + 1) % tabs.length]
            : event.key === "ArrowLeft"
              ? tabs[(currentIndex - 1 + tabs.length) % tabs.length]
              : undefined;

    if (nextTab === undefined) return;
    event.preventDefault();
    changeActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderCompact">
        <div>
          <h1>비용 관리</h1>
        </div>
      </header>

      <div className={styles.costFolder}>
        <div aria-label="비용 데이터 보기" className={styles.costTabs} role="tablist">
          <button
          aria-controls="cost-panel-estimate"
          aria-selected={activeTab === "estimate"}
          className={styles.costTab}
          id="cost-tab-estimate"
          onClick={() => changeActiveTab("estimate")}
          onKeyDown={(event) => selectTabFromKeyboard(event, "estimate")}
          ref={(element) => {
            tabRefs.current.estimate = element;
          }}
          role="tab"
          tabIndex={activeTab === "estimate" ? 0 : -1}
          type="button"
        >
          <strong>예상 비용</strong>
          </button>
          <button
          aria-controls="cost-panel-usage"
          aria-selected={activeTab === "usage"}
          className={styles.costTab}
          id="cost-tab-usage"
          onClick={() => changeActiveTab("usage")}
          onKeyDown={(event) => selectTabFromKeyboard(event, "usage")}
          ref={(element) => {
            tabRefs.current.usage = element;
          }}
          role="tab"
          tabIndex={activeTab === "usage" ? 0 : -1}
          type="button"
        >
          <strong>실제 사용량</strong>
          </button>
        </div>

        <section
          aria-labelledby={`cost-tab-${activeTab}`}
          className={styles.costFolderPanel}
          id={`cost-panel-${activeTab}`}
          role="tabpanel"
        >
          {activeTab === "estimate" ? (
            <CostEstimatePanel
              expectedUserCount={expectedUserCount}
              expectedUserCountInput={expectedUserCountInput}
              onExpectedUserCountChange={changeExpectedUserCount}
              onExpectedUserCountInputChange={setExpectedUserCountInput}
              onPeriodChange={changeEstimatePeriod}
              period={estimatePeriod}
            />
          ) : (
            <CostUsagePanel
              onConnectionChange={changeSelectedConnection}
              onProjectChange={setSelectedProjectKey}
              onRangeChange={setUsageRange}
              range={usageRange}
              selectedConnectionId={selectedConnectionId}
              selectedProjectKey={selectedProjectKey}
            />
          )}
        </section>
      </div>
    </div>
  );
}
