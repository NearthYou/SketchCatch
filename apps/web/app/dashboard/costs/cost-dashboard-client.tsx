"use client";

import { useRef, useState } from "react";
import { CostEstimatePanel } from "./cost-estimate-panel";
import { CostUsagePanel } from "./cost-usage-panel";
import styles from "../dashboard-tools.module.css";

type CostDashboardTab = "estimate" | "usage";

export function CostDashboardClient() {
  const [activeTab, setActiveTab] = useState<CostDashboardTab>("estimate");
  const tabRefs = useRef<Partial<Record<CostDashboardTab, HTMLButtonElement | null>>>({});

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
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Cost management</p>
          <h1>비용 관리</h1>
          <p>프로젝트의 예상 비용과 실제 사용량을 한곳에서 비교하고 관리합니다.</p>
        </div>
      </header>

      <div className={styles.costFolder}>
        <div aria-label="비용 데이터 보기" className={styles.costTabs} role="tablist">
          <button
          aria-controls="cost-panel-estimate"
          aria-selected={activeTab === "estimate"}
          className={styles.costTab}
          id="cost-tab-estimate"
          onClick={() => setActiveTab("estimate")}
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
          onClick={() => setActiveTab("usage")}
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
          {activeTab === "estimate" ? <CostEstimatePanel /> : <CostUsagePanel />}
        </section>
      </div>
    </div>
  );
}
