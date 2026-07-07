"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  CostEstimatePeriod,
  CostEstimateSupportLevel,
  CostMetricSeries,
  CostOptimizationRecommendation,
  CostProjectEstimate,
  CostProjectEstimateListResponse,
  CostProjectUsage,
  CostServiceUsage,
  CostUsageAnalysisRange,
  CostUsageAnalysisResponse,
  CostUsageTrendPoint,
  CostWasteResourceInsight,
  ResourceCostEstimate
} from "@sketchcatch/types";
import { Activity, BarChart3, Calculator, LineChart, PiggyBank, RefreshCw } from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import {
  createCostUsageLineChart,
  createServiceCostBars,
  sumEstimatedMonthlySavings
} from "../../features/costs/cost-usage-charts";
import { getApiErrorMessage } from "../../lib/api-client";
import { listCostProjectEstimates, listCostUsageAnalysis } from "../../features/workspace/api";

type CostPageState = "idle" | "loading" | "error";
type CostTab = "estimate" | "usage";

type AppliedCostQuery = {
  readonly expectedUserCount: number;
  readonly period: CostEstimatePeriod;
};

const COST_PERIOD_OPTIONS = [
  { label: "하루", value: "day" },
  { label: "일주일", value: "week" },
  { label: "1개월", value: "month" }
] as const satisfies readonly { readonly label: string; readonly value: CostEstimatePeriod }[];

const COST_USAGE_RANGE_OPTIONS = [
  { label: "최근 7일", value: "7d" },
  { label: "최근 30일", value: "30d" },
  { label: "이번 달", value: "month_to_date" }
] as const satisfies readonly { readonly label: string; readonly value: CostUsageAnalysisRange }[];

const DEFAULT_COST_QUERY: AppliedCostQuery = {
  expectedUserCount: 1000,
  period: "month"
};

export function CostsClient() {
  const [activeTab, setActiveTab] = useState<CostTab>("estimate");
  const [periodInput, setPeriodInput] = useState<CostEstimatePeriod>(DEFAULT_COST_QUERY.period);
  const [expectedUserCountInput, setExpectedUserCountInput] = useState(
    String(DEFAULT_COST_QUERY.expectedUserCount)
  );
  const [appliedQuery, setAppliedQuery] = useState<AppliedCostQuery>(DEFAULT_COST_QUERY);
  const [costData, setCostData] = useState<CostProjectEstimateListResponse | null>(null);
  const [state, setState] = useState<CostPageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [formErrorMessage, setFormErrorMessage] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() =>
    readSelectedProjectIdFromLocation()
  );
  const [includedProjectIds, setIncludedProjectIds] = useState<readonly string[] | null>(null);
  const [usageRangeInput, setUsageRangeInput] = useState<CostUsageAnalysisRange>("30d");
  const [appliedUsageRange, setAppliedUsageRange] = useState<CostUsageAnalysisRange>("30d");
  const [usageData, setUsageData] = useState<CostUsageAnalysisResponse | null>(null);
  const [usageState, setUsageState] = useState<CostPageState>("loading");
  const [usageErrorMessage, setUsageErrorMessage] = useState("");
  const [usageReloadKey, setUsageReloadKey] = useState(0);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const selectedProject = useMemo(
    () => costData?.projects.find((item) => item.project.id === selectedProjectId) ?? costData?.projects[0] ?? null,
    [costData, selectedProjectId]
  );
  const projectIds = useMemo(
    () => costData?.projects.map((item) => item.project.id) ?? [],
    [costData]
  );
  const includedProjectIdSet = useMemo(
    () => new Set(includedProjectIds ?? projectIds),
    [includedProjectIds, projectIds]
  );
  const selectedCostTotals = useMemo(
    () => calculateSelectedCostTotals(costData?.projects ?? [], includedProjectIdSet),
    [costData, includedProjectIdSet]
  );
  const includedVisibleProjectCount = projectIds.filter((projectId) =>
    includedProjectIdSet.has(projectId)
  ).length;
  const allProjectsIncluded = projectIds.length > 0 && includedVisibleProjectCount === projectIds.length;
  const someProjectsIncluded = includedVisibleProjectCount > 0 && !allProjectsIncluded;

  useEffect(() => {
    let ignore = false;

    async function loadCostData(): Promise<void> {
      setState("loading");
      setErrorMessage("");

      try {
        const result = await listCostProjectEstimates({
          expectedUserCount: appliedQuery.expectedUserCount,
          period: appliedQuery.period
        });

        if (ignore) {
          return;
        }

        setCostData(result);
        setState("idle");
        setIncludedProjectIds((currentProjectIds) => {
          const nextProjectIds = result.projects.map((item) => item.project.id);

          if (currentProjectIds === null) {
            return nextProjectIds;
          }

          const nextProjectIdSet = new Set(nextProjectIds);

          return currentProjectIds.filter((projectId) => nextProjectIdSet.has(projectId));
        });
        setSelectedProjectId((currentProjectId) => {
          const urlProjectId = readSelectedProjectIdFromLocation();
          const candidateProjectId = currentProjectId ?? urlProjectId;
          const nextProjectId =
            candidateProjectId !== null &&
            result.projects.some((item) => item.project.id === candidateProjectId)
              ? candidateProjectId
              : result.projects[0]?.project.id ?? null;

          writeSelectedProjectIdToLocation(nextProjectId);

          return nextProjectId;
        });
      } catch (error) {
        if (ignore) {
          return;
        }

        setState("error");
        setErrorMessage(getApiErrorMessage(error, "비용 데이터를 불러오지 못했습니다."));
      }
    }

    void loadCostData();

    return () => {
      ignore = true;
    };
  }, [appliedQuery]);

  useEffect(() => {
    if (activeTab !== "usage") {
      return undefined;
    }

    let ignore = false;

    async function loadUsageData(): Promise<void> {
      setUsageState("loading");
      setUsageErrorMessage("");

      try {
        const result = await listCostUsageAnalysis({
          range: appliedUsageRange
        });

        if (ignore) {
          return;
        }

        setUsageData(result);
        setUsageState("idle");
      } catch (error) {
        if (ignore) {
          return;
        }

        setUsageState("error");
        setUsageErrorMessage(getApiErrorMessage(error, "사용량 분석 데이터를 불러오지 못했습니다."));
      }
    }

    void loadUsageData();

    return () => {
      ignore = true;
    };
  }, [activeTab, appliedUsageRange, usageReloadKey]);

  useEffect(() => {
    function handlePopState(): void {
      setSelectedProjectId(readSelectedProjectIdFromLocation());
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (selectAllCheckboxRef.current === null) {
      return;
    }

    selectAllCheckboxRef.current.indeterminate = someProjectsIncluded;
  }, [someProjectsIncluded]);

  function applyCostQuery(): void {
    const expectedUserCount = parseExpectedUserCount(expectedUserCountInput);

    if (expectedUserCount === null) {
      setFormErrorMessage("예상 사용자 수는 1명 이상 1,000,000명 이하로 입력해주세요.");
      return;
    }

    setFormErrorMessage("");
    setAppliedQuery({
      expectedUserCount,
      period: periodInput
    });
  }

  function applyUsageRange(): void {
    setAppliedUsageRange(usageRangeInput);
  }

  function toggleIncludedProject(projectId: string): void {
    setIncludedProjectIds((currentProjectIds) => {
      const includedIds = new Set(currentProjectIds ?? projectIds);

      if (includedIds.has(projectId)) {
        includedIds.delete(projectId);
      } else {
        includedIds.add(projectId);
      }

      return [...includedIds];
    });
  }

  function toggleAllIncludedProjects(): void {
    setIncludedProjectIds(allProjectsIncluded ? [] : projectIds);
  }

  const totalEstimateAmount = selectedCostTotals.totalEstimateAmount;
  const totalMonthlyAmount = selectedCostTotals.totalMonthlyAmount;
  const dailyAverageAmount = totalMonthlyAmount / 30;

  return (
    <>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Cost management</p>
          <h1>비용관리</h1>
        </div>
      </div>

      <div className="costTabs" role="tablist" aria-label="비용 관리 보기">
        <button
          aria-selected={activeTab === "estimate"}
          className="costTabButton"
          onClick={() => setActiveTab("estimate")}
          role="tab"
          type="button"
        >
          <Calculator size={16} aria-hidden="true" />
          예상 비용 계산
        </button>
        <button
          aria-selected={activeTab === "usage"}
          className="costTabButton"
          onClick={() => setActiveTab("usage")}
          role="tab"
          type="button"
        >
          <Activity size={16} aria-hidden="true" />
          사용량 분석
        </button>
      </div>

      {activeTab === "estimate" ? (
        <>
          <section className="dashboardPanel costOverviewPanel" aria-labelledby="cost-control-title">
            <div className="costOverviewSettings">
              <div className="costPanelTitle">
                <p className="dashboardPanelKicker">Estimate settings</p>
                <h2 id="cost-control-title">예상 비용 계산 조건</h2>
              </div>
              <div className="costControlGrid">
                <label className="costField">
                  <span>기간</span>
                  <select
                    onChange={(event) => setPeriodInput(event.target.value as CostEstimatePeriod)}
                    value={periodInput}
                  >
                    {COST_PERIOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="costField">
                  <span>예상 사용자 수</span>
                  <input
                    inputMode="numeric"
                    max={1_000_000}
                    min={1}
                    onChange={(event) => setExpectedUserCountInput(event.target.value)}
                    type="number"
                    value={expectedUserCountInput}
                  />
                </label>
                <button className="primaryButton costApplyButton" onClick={applyCostQuery} type="button">
                  <Calculator size={16} aria-hidden="true" />
                  적용
                </button>
              </div>
              {formErrorMessage.length > 0 ? (
                <p className="costErrorMessage" role="alert">
                  {formErrorMessage}
                </p>
              ) : null}
            </div>

            <div className="costSummaryCard" aria-labelledby="cost-summary-title">
              <div className="costPanelTitle">
                <p className="dashboardPanelKicker">Cost overview</p>
                <h2 id="cost-summary-title">예상 합계</h2>
              </div>
              <div className="costSummaryAmount">
                <span>{getPeriodLabel(appliedQuery.period)} 예상 비용</span>
                <strong>{formatUsd(totalEstimateAmount)}</strong>
                <p>
                  {selectedCostTotals.selectedProjectCount}개 선택 · 월 환산 {formatUsd(totalMonthlyAmount)} · 일 평균 약{" "}
                  {formatUsd(dailyAverageAmount)}
                </p>
              </div>
            </div>
          </section>

          <section className="dashboardPanel costProjectPanel" aria-labelledby="cost-project-title">
            <div className="dashboardPanelHeader">
              <div>
                <p className="dashboardPanelKicker">Project costs</p>
                <h2 id="cost-project-title">내 프로젝트 예상 비용</h2>
              </div>
              <span className="dashboardCountBadge">{costData?.projects.length ?? 0}개</span>
            </div>
            {state === "loading" ? <CostStatus message="예상 비용 데이터를 불러오는 중입니다." /> : null}
            {state === "error" ? (
              <CostStatus
                action={
                  <button className="dashboardSecondaryButton" onClick={() => setAppliedQuery({ ...appliedQuery })} type="button">
                    <RefreshCw size={14} aria-hidden="true" />
                    다시 불러오기
                  </button>
                }
                message={errorMessage}
              />
            ) : null}
            {state === "idle" && costData !== null && costData.projects.length === 0 ? (
              <CostStatus message="프로젝트가 없습니다." />
            ) : null}
            {state === "idle" && costData !== null && costData.projects.length > 0 ? (
              <div className="dashboardTable">
                <div className="dashboardTableHeader">
                  <label className="costProjectNameCell costProjectHeaderCell">
                    <input
                      ref={selectAllCheckboxRef}
                      aria-label="전체 프로젝트 합계에 포함"
                      checked={allProjectsIncluded}
                      className="costProjectCheckbox"
                      onChange={toggleAllIncludedProjects}
                      type="checkbox"
                    />
                    <span>프로젝트</span>
                  </label>
                  <span>클라우드</span>
                  <span>리소스</span>
                  <span>{getPeriodLabel(appliedQuery.period)} 예상 비용</span>
                </div>
                {costData.projects.map((item) => (
                  <div
                    data-selected={selectedProject?.project.id === item.project.id ? "true" : undefined}
                    className="dashboardTableRow costProjectRow"
                    key={item.project.id}
                  >
                    <div className="costProjectNameCell">
                      <input
                        aria-label={`${item.project.name} 합계에 포함`}
                        checked={includedProjectIdSet.has(item.project.id)}
                        className="costProjectCheckbox"
                        onChange={() => toggleIncludedProject(item.project.id)}
                        type="checkbox"
                      />
                      <button
                        aria-pressed={selectedProject?.project.id === item.project.id}
                        className="costProjectNameButton"
                        onClick={() => selectProject(item.project.id, setSelectedProjectId)}
                        type="button"
                      >
                        <strong>{item.project.name}</strong>
                      </button>
                    </div>
                    <span>{item.costEstimate === null ? "-" : "AWS"}</span>
                    <span>{formatResourceTypes(item.costEstimate?.resources ?? [])}</span>
                    <span>{formatProjectCostAmount(item.costEstimate)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {selectedProject?.costEstimate != null ? (
            <section className="dashboardPanel costDetailPanel" aria-labelledby="cost-detail-title">
              <div className="dashboardPanelHeader">
                <div>
                  <p className="dashboardPanelKicker">Resource details</p>
                  <h2 id="cost-detail-title">{selectedProject.project.name} 예상 비용 근거</h2>
                </div>
                <span className="dashboardCountBadge">
                  {formatUsd(selectedProject.costEstimate.totalEstimate.amount)}
                </span>
              </div>
              <div className="costReviewMessages">
                {selectedProject.costEstimate.reviewMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
              <div className="costResourceList">
                {selectedProject.costEstimate.resources.map((resource, index) => (
                  <details className="costResourceDetails" key={resource.resourceId} open={index === 0}>
                    <summary>
                      <span className="costResourceSummaryTitle">
                        <span>{resource.name}</span>
                        <small>{getResourceDisplayType(resource)}</small>
                      </span>
                      <span className="costResourceSummaryMeta">
                        <span className={getCostSupportBadgeClassName(resource.supportLevel)}>
                          {getCostSupportLabel(resource.supportLevel)}
                        </span>
                        <strong>
                          {formatResourceEstimateAmount(
                            resource,
                            selectedProject.costEstimate?.period ?? appliedQuery.period
                          )}
                        </strong>
                      </span>
                    </summary>
                    <p>{resource.explanation}</p>
                    {shouldShowCostSupportReason(resource) ? (
                      <p className="costResourceSupportReason">{resource.supportReason}</p>
                    ) : null}
                    <ul>
                      {resource.costDrivers.map((driver) => (
                        <li key={`${resource.resourceId}-${driver}`}>{driver}</li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {selectedProject !== null && selectedProject.costEstimate === null ? (
            <section className="dashboardPanel costDetailPanel" aria-labelledby="cost-detail-title">
              <div className="dashboardPanelHeader">
                <div>
                  <p className="dashboardPanelKicker">Resource details</p>
                  <h2 id="cost-detail-title">{selectedProject.project.name} 예상 비용 근거</h2>
                </div>
                <span className="dashboardCountBadge">준비 필요</span>
              </div>
              <CostStatus message="아직 예상 비용을 산정할 아키텍처 스냅샷이 없습니다." />
            </section>
          ) : null}

          <section className="dashboardPanel costNoticePanel" aria-labelledby="cost-notice-title">
            <DashboardIcon name="shield" />
            <div>
              <h2 id="cost-notice-title">예상 비용은 추정치입니다</h2>
              <p>
                예상 사용자 수는 실제 사용량이 아니라 배포 전 요청량과 저장량을 추정하기 위한 입력값입니다.
              </p>
            </div>
          </section>
        </>
      ) : (
        <CostUsageAnalysisTab
          appliedUsageRange={appliedUsageRange}
          applyUsageRange={applyUsageRange}
          refreshUsage={() => setUsageReloadKey((currentKey) => currentKey + 1)}
          setUsageRangeInput={setUsageRangeInput}
          usageData={usageData}
          usageErrorMessage={usageErrorMessage}
          usageRangeInput={usageRangeInput}
          usageState={usageState}
        />
      )}
    </>
  );
}

function CostUsageAnalysisTab({
  appliedUsageRange,
  applyUsageRange,
  refreshUsage,
  setUsageRangeInput,
  usageData,
  usageErrorMessage,
  usageRangeInput,
  usageState
}: {
  readonly appliedUsageRange: CostUsageAnalysisRange;
  readonly applyUsageRange: () => void;
  readonly refreshUsage: () => void;
  readonly setUsageRangeInput: (range: CostUsageAnalysisRange) => void;
  readonly usageData: CostUsageAnalysisResponse | null;
  readonly usageErrorMessage: string;
  readonly usageRangeInput: CostUsageAnalysisRange;
  readonly usageState: CostPageState;
}) {
  const lineChart = useMemo(
    () => createCostUsageLineChart(usageData?.dailyTrend ?? []),
    [usageData]
  );
  const serviceBars = useMemo(
    () => createServiceCostBars(usageData?.serviceCosts ?? []),
    [usageData]
  );
  const monthlySavings = useMemo(
    () => sumEstimatedMonthlySavings(usageData?.recommendations ?? []),
    [usageData]
  );

  return (
    <>
      <section className="dashboardPanel costOverviewPanel" aria-labelledby="cost-usage-control-title">
        <div className="costOverviewSettings">
          <div className="costPanelTitle">
            <p className="dashboardPanelKicker">Actual usage</p>
            <h2 id="cost-usage-control-title">실제 사용량 분석 조건</h2>
          </div>
          <div className="costControlGrid costUsageControlGrid">
            <label className="costField">
              <span>분석 기간</span>
              <select
                onChange={(event) => setUsageRangeInput(event.target.value as CostUsageAnalysisRange)}
                value={usageRangeInput}
              >
                {COST_USAGE_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="primaryButton costApplyButton" onClick={applyUsageRange} type="button">
              <BarChart3 size={16} aria-hidden="true" />
              적용
            </button>
          </div>
        </div>

        <div className="costSummaryCard" aria-labelledby="cost-usage-summary-title">
          <div className="costPanelTitle">
            <p className="dashboardPanelKicker">Actual cost</p>
            <h2 id="cost-usage-summary-title">현재 사용 비용</h2>
          </div>
          <div className="costSummaryAmount">
            <span>{getUsageRangeLabel(appliedUsageRange)} 실제 비용</span>
            <strong>{formatUsd(usageData?.totalCost.amount ?? 0)}</strong>
            <p>
              월말 예상 {formatUsd(usageData?.forecastMonthEndCost.amount ?? 0)} · 절감 후보{" "}
              {formatUsd(monthlySavings)}
            </p>
          </div>
        </div>
      </section>

      {usageState === "loading" ? (
        <section className="dashboardPanel costProjectPanel">
          <CostStatus message="실제 사용량 분석 데이터를 불러오는 중입니다." />
        </section>
      ) : null}

      {usageState === "error" ? (
        <section className="dashboardPanel costProjectPanel">
          <CostStatus
            action={
              <button className="dashboardSecondaryButton" onClick={refreshUsage} type="button">
                <RefreshCw size={14} aria-hidden="true" />
                다시 불러오기
              </button>
            }
            message={usageErrorMessage}
          />
        </section>
      ) : null}

      {usageState === "idle" && usageData !== null ? (
        <>
          <section className="dashboardPanel costUsageMetricPanel" aria-labelledby="cost-usage-metrics-title">
            <div className="dashboardPanelHeader">
              <div>
                <p className="dashboardPanelKicker">Usage overview</p>
                <h2 id="cost-usage-metrics-title">사용량 요약</h2>
              </div>
              <span className="dashboardCountBadge">
                {formatDateRange(usageData.startDate, usageData.endDate)}
              </span>
            </div>
            <div className="costUsageMetricGrid">
              <CostMetricCard
                icon={<LineChart size={18} aria-hidden="true" />}
                label="총 실제 비용"
                value={formatUsd(usageData.totalCost.amount)}
              />
              <CostMetricCard
                icon={<Activity size={18} aria-hidden="true" />}
                label="월말 예상"
                value={formatUsd(usageData.forecastMonthEndCost.amount)}
              />
              <CostMetricCard
                icon={<PiggyBank size={18} aria-hidden="true" />}
                label="예상 절감"
                value={formatUsd(monthlySavings)}
              />
            </div>
          </section>

          <section className="dashboardPanel costChartPanel" aria-labelledby="cost-daily-chart-title">
            <div className="dashboardPanelHeader">
              <div>
                <p className="dashboardPanelKicker">Daily trend</p>
                <h2 id="cost-daily-chart-title">일별 비용 추세</h2>
              </div>
              <span className="dashboardCountBadge">{usageData.dailyTrend.length}일</span>
            </div>
            {usageData.dailyTrend.length === 0 ? (
              <CostStatus message="표시할 일별 비용 데이터가 없습니다." />
            ) : (
              <DailyCostLineChart chart={lineChart} dailyTrend={usageData.dailyTrend} />
            )}
          </section>

          <section className="dashboardPanel costChartPanel" aria-labelledby="cost-service-chart-title">
            <div className="dashboardPanelHeader">
              <div>
                <p className="dashboardPanelKicker">Service costs</p>
                <h2 id="cost-service-chart-title">서비스별 비용</h2>
              </div>
              <span className="dashboardCountBadge">{usageData.serviceCosts.length}개</span>
            </div>
            <ServiceCostBars bars={serviceBars} serviceCosts={usageData.serviceCosts} />
          </section>

          <section className="dashboardPanel costProjectPanel" aria-labelledby="cost-usage-project-title">
            <div className="dashboardPanelHeader">
              <div>
                <p className="dashboardPanelKicker">Project usage</p>
                <h2 id="cost-usage-project-title">프로젝트별 실제 비용</h2>
              </div>
              <span className="dashboardCountBadge">{usageData.projectCosts.length}개</span>
            </div>
            <ProjectUsageTable projectCosts={usageData.projectCosts} />
          </section>

          <section className="dashboardPanel costRecommendationPanel" aria-labelledby="cost-waste-title">
            <div className="dashboardPanelHeader">
              <div>
                <p className="dashboardPanelKicker">Waste detection</p>
                <h2 id="cost-waste-title">낭비 리소스</h2>
              </div>
              <span className="dashboardCountBadge">{usageData.wasteResources.length}개</span>
            </div>
            <WasteResourceList metricSeries={usageData.metricSeries} wasteResources={usageData.wasteResources} />
          </section>

          <section className="dashboardPanel costRecommendationPanel" aria-labelledby="cost-recommendation-title">
            <div className="dashboardPanelHeader">
              <div>
                <p className="dashboardPanelKicker">Optimization</p>
                <h2 id="cost-recommendation-title">절감 추천</h2>
              </div>
              <span className="dashboardCountBadge">{usageData.recommendations.length}개</span>
            </div>
            <RecommendationList recommendations={usageData.recommendations} />
          </section>
        </>
      ) : null}
    </>
  );
}

function CostMetricCard({
  icon,
  label,
  value
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="costMetricCard">
      <span className="costMetricIcon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DailyCostLineChart({
  chart,
  dailyTrend
}: {
  readonly chart: ReturnType<typeof createCostUsageLineChart>;
  readonly dailyTrend: readonly CostUsageTrendPoint[];
}) {
  return (
    <div className="costLineChart" aria-label="일별 비용 추세 그래프">
      <svg className="costLineChartSvg" preserveAspectRatio="none" viewBox="0 0 640 180">
        <path className="costLineChartGrid" d="M 0 45 L 640 45 M 0 90 L 640 90 M 0 135 L 640 135" />
        <path className="costLineChartPath" d={chart.path} />
        {chart.points.map((point) => (
          <circle cx={point.x} cy={point.y} key={`${point.date}-${point.amount}`} r="4" />
        ))}
      </svg>
      <div className="costLineChartMeta">
        <span>{dailyTrend[0]?.date ?? "-"}</span>
        <strong>최고 {formatUsd(chart.maxAmount)}</strong>
        <span>{dailyTrend[dailyTrend.length - 1]?.date ?? "-"}</span>
      </div>
    </div>
  );
}

function ServiceCostBars({
  bars,
  serviceCosts
}: {
  readonly bars: ReturnType<typeof createServiceCostBars>;
  readonly serviceCosts: readonly CostServiceUsage[];
}) {
  if (serviceCosts.length === 0) {
    return <CostStatus message="표시할 서비스별 비용 데이터가 없습니다." />;
  }

  return (
    <div className="costServiceBars">
      {bars.map((bar) => (
        <div className="costServiceBarRow" key={bar.label}>
          <div className="costServiceBarMeta">
            <span>{bar.label}</span>
            <strong>{formatUsd(bar.amount)}</strong>
          </div>
          <div className="costServiceBarTrack" aria-hidden="true">
            <span style={{ width: `${bar.widthPercentage}%` }} />
          </div>
          <small>{formatPercent(bar.percentage)}</small>
        </div>
      ))}
    </div>
  );
}

function ProjectUsageTable({
  projectCosts
}: {
  readonly projectCosts: readonly CostProjectUsage[];
}) {
  if (projectCosts.length === 0) {
    return <CostStatus message="표시할 프로젝트별 비용 데이터가 없습니다." />;
  }

  return (
    <div className="dashboardTable costUsageProjectTable">
      <div className="dashboardTableHeader">
        <span>프로젝트</span>
        <span>비용</span>
        <span>비중</span>
        <span>근거</span>
      </div>
      {projectCosts.map((project) => (
        <div className="dashboardTableRow" key={project.projectId ?? project.projectName}>
          <strong>{project.projectName}</strong>
          <span>{formatUsd(project.amount)}</span>
          <span>{formatPercent(project.percentage)}</span>
          <span>{getProjectUsageSourceLabel(project)}</span>
        </div>
      ))}
    </div>
  );
}

function WasteResourceList({
  metricSeries,
  wasteResources
}: {
  readonly metricSeries: readonly CostMetricSeries[];
  readonly wasteResources: readonly CostWasteResourceInsight[];
}) {
  if (wasteResources.length === 0) {
    return <CostStatus message="탐지된 낭비 리소스가 없습니다." />;
  }

  return (
    <div className="costWasteList">
      {wasteResources.map((resource) => (
        <article className="costWasteItem" key={resource.id}>
          <div>
            <strong>{resource.resourceName}</strong>
            <span>{resource.service}</span>
          </div>
          <p>{resource.finding}</p>
          <div className="costWasteMeta">
            <span>{resource.metricName}</span>
            <span>{formatMetricValue(resource.averageValue, resource.unit)}</span>
            <strong>{formatUsd(resource.estimatedMonthlyWaste.amount)} / 월</strong>
          </div>
        </article>
      ))}
      {metricSeries.length > 0 ? (
        <div className="costMetricSeriesPreview">
          {metricSeries.slice(0, 3).map((series) => (
            <span key={series.id}>
              {series.label}: {formatMetricSeriesLastValue(series)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RecommendationList({
  recommendations
}: {
  readonly recommendations: readonly CostOptimizationRecommendation[];
}) {
  if (recommendations.length === 0) {
    return <CostStatus message="현재 추천할 절감 항목이 없습니다." />;
  }

  return (
    <div className="costRecommendationList">
      {recommendations.map((recommendation) => (
        <article className="costRecommendationItem" key={recommendation.id}>
          <div className="costRecommendationHeader">
            <span className={getRecommendationSeverityClassName(recommendation.severity)}>
              {getRecommendationSeverityLabel(recommendation.severity)}
            </span>
            <strong>{formatUsd(recommendation.estimatedMonthlySavings.amount)} / 월</strong>
          </div>
          <h3>{recommendation.title}</h3>
          <p>{recommendation.reason}</p>
          <span className="costRecommendationAction">{recommendation.actionLabel}</span>
        </article>
      ))}
    </div>
  );
}

function CostStatus({
  action,
  message
}: {
  readonly action?: ReactNode;
  readonly message: string;
}) {
  return (
    <div className="costStatus">
      <p>{message}</p>
      {action}
    </div>
  );
}

function calculateSelectedCostTotals(
  projects: readonly CostProjectEstimate[],
  includedProjectIdSet: ReadonlySet<string>
): {
  readonly selectedProjectCount: number;
  readonly totalEstimateAmount: number;
  readonly totalMonthlyAmount: number;
} {
  const selectedProjects = projects.filter((item) => includedProjectIdSet.has(item.project.id));

  return {
    selectedProjectCount: selectedProjects.length,
    totalEstimateAmount: roundUsd(
      selectedProjects.reduce((sum, item) => sum + (item.costEstimate?.totalEstimate.amount ?? 0), 0)
    ),
    totalMonthlyAmount: roundUsd(
      selectedProjects.reduce((sum, item) => sum + (item.costEstimate?.totalMonthlyEstimate.amount ?? 0), 0)
    )
  };
}

function parseExpectedUserCount(value: string): number | null {
  const parsedValue = Number.parseInt(value.replace(/,/g, ""), 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 1 || parsedValue > 1_000_000) {
    return null;
  }

  return parsedValue;
}

function readSelectedProjectIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get("projectId");
}

function selectProject(
  projectId: string,
  setSelectedProjectId: (projectId: string) => void
): void {
  setSelectedProjectId(projectId);
  writeSelectedProjectIdToLocation(projectId);
}

function writeSelectedProjectIdToLocation(projectId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (projectId === null) {
    url.searchParams.delete("projectId");
  } else {
    url.searchParams.set("projectId", projectId);
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function formatResourceTypes(resources: readonly ResourceCostEstimate[]): string {
  const uniqueTypes = [...new Set(resources.map((resource) => getResourceDisplayType(resource)))];

  if (uniqueTypes.length === 0) {
    return "산정 준비 필요";
  }

  const visibleTypes = uniqueTypes.slice(0, 3).join(", ");

  return uniqueTypes.length > 3 ? `${visibleTypes} 외 ${uniqueTypes.length - 3}개` : visibleTypes;
}

function formatProjectCostAmount(costEstimate: CostProjectEstimate["costEstimate"]): string {
  if (costEstimate === null) {
    return "산정 준비 필요";
  }

  return formatUsd(costEstimate.totalEstimate.amount);
}

function getResourceDisplayType(resource: ResourceCostEstimate): string {
  return resource.terraformResourceType ?? resource.resourceType;
}

function formatResourceEstimateAmount(
  resource: ResourceCostEstimate,
  period: CostEstimatePeriod
): string {
  if (resource.supportLevel === "not_estimated") {
    return "산정 미지원";
  }

  return `${formatUsd(resource.periodEstimate.amount)} / ${getPeriodLabel(period)}`;
}

function getCostSupportLabel(supportLevel: CostEstimateSupportLevel): string {
  switch (supportLevel) {
    case "aws_pricing_api":
      return "AWS Pricing API";
    case "fallback_estimate":
      return "추정";
    case "no_direct_cost":
      return "직접 비용 없음";
    case "not_estimated":
      return "산정 미지원";
  }
}

function shouldShowCostSupportReason(resource: ResourceCostEstimate): boolean {
  return resource.supportLevel === "no_direct_cost" || resource.supportLevel === "not_estimated";
}

function getCostSupportBadgeClassName(supportLevel: CostEstimateSupportLevel): string {
  const supportClassNames = {
    aws_pricing_api: "costSupportBadge costSupportBadgeAwsPricingApi",
    fallback_estimate: "costSupportBadge costSupportBadgeFallbackEstimate",
    no_direct_cost: "costSupportBadge costSupportBadgeNoDirectCost",
    not_estimated: "costSupportBadge costSupportBadgeNotEstimated"
  } satisfies Record<CostEstimateSupportLevel, string>;

  return supportClassNames[supportLevel];
}

function getProjectUsageSourceLabel(project: CostProjectUsage): string {
  switch (project.source) {
    case "cost_explorer_tag":
      return "프로젝트 태그";
    case "deployed_resource_estimate":
      return `${project.resourceCount}개 리소스 근사`;
    case "sample":
      return "샘플";
  }
}

function getRecommendationSeverityLabel(severity: CostOptimizationRecommendation["severity"]): string {
  switch (severity) {
    case "high":
      return "높음";
    case "medium":
      return "중간";
    case "low":
      return "낮음";
  }
}

function getRecommendationSeverityClassName(
  severity: CostOptimizationRecommendation["severity"]
): string {
  return `costRecommendationSeverity costRecommendationSeverity${capitalizeSeverity(severity)}`;
}

function capitalizeSeverity(severity: CostOptimizationRecommendation["severity"]): string {
  switch (severity) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

function getPeriodLabel(period: CostEstimatePeriod): string {
  switch (period) {
    case "day":
      return "하루";
    case "week":
      return "일주일";
    case "month":
      return "월";
  }
}

function getUsageRangeLabel(range: CostUsageAnalysisRange): string {
  switch (range) {
    case "7d":
      return "최근 7일";
    case "30d":
      return "최근 30일";
    case "month_to_date":
      return "이번 달";
  }
}

function formatDateRange(startDate: string, endDate: string): string {
  return `${startDate} ~ ${endDate}`;
}

function formatMetricValue(value: number, unit: string): string {
  return `${value.toFixed(1)} ${unit}`;
}

function formatMetricSeriesLastValue(series: CostMetricSeries): string {
  const lastPoint = series.points[series.points.length - 1];

  if (lastPoint === undefined) {
    return "-";
  }

  return `${lastPoint.value.toFixed(1)} ${series.unit}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
