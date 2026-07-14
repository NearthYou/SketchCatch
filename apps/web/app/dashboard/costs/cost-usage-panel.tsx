"use client";

import { AlertTriangle, RefreshCw, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AwsConnection,
  CostUsageAnalysisRange,
  CostUsageAnalysisResponse,
  CostUsageTrendPoint
} from "@sketchcatch/types";
import { ProductState } from "../../../components/ui/ProductState";
import {
  SelectMenu,
  type SelectMenuOption
} from "../../../components/ui/SelectMenu";
import {
  createCostUsageLineChart,
  createCostUsageMonthlyBars,
  createServiceCostBars,
  sumEstimatedMonthlySavings
} from "../../../features/costs/cost-usage-charts";
import {
  formatCostUsageAwsConnectionLabel,
  getVerifiedCostUsageAwsConnections
} from "../../../features/costs/cost-usage-aws-connections";
import {
  COST_USAGE_ALL_PROJECTS_KEY,
  createCostUsageProjectOptions,
  createScopedCostUsageDailyTrend,
  createScopedCostUsageMonthlyComparison,
  createScopedCostUsageMonthlyTrend,
  createScopedCostUsageServiceCosts,
  normalizeCostUsageProjectKey,
  selectCostUsageProject
} from "../../../features/costs/cost-usage-project-view";
import { createCostRequestCoordinator } from "../../../features/costs/cost-request-coordinator";
import { createCostUsageDisplayCopy } from "../../../features/costs/cost-usage-copy";
import { listAwsConnections, listCostUsageAnalysis } from "../../../features/workspace/api";
import { CostMetric, formatUsd } from "./cost-dashboard-presentation";
import styles from "../dashboard-tools.module.css";

type CostLoadState = "loading" | "ready" | "error";

const COST_USAGE_RANGE_OPTIONS: readonly SelectMenuOption[] = [
  { label: "최근 7일", value: "7d" },
  { label: "최근 30일", value: "30d" },
  { label: "이번 달", value: "month_to_date" }
];

export function CostUsagePanel() {
  const [connections, setConnections] = useState<readonly AwsConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [selectedProjectKey, setSelectedProjectKey] = useState(COST_USAGE_ALL_PROJECTS_KEY);
  const [range, setRange] = useState<CostUsageAnalysisRange>("30d");
  const [data, setData] = useState<CostUsageAnalysisResponse | null>(null);
  const [loadState, setLoadState] = useState<CostLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const requestCoordinatorRef = useRef(createCostRequestCoordinator());
  const projectOptions = useMemo(() => createCostUsageProjectOptions(data?.projectCosts ?? []), [data]);
  const projectSelectOptions = useMemo<readonly SelectMenuOption[]>(
    () => [
      { label: "전체 배포 프로젝트", value: COST_USAGE_ALL_PROJECTS_KEY },
      ...projectOptions.map((project) => ({ label: project.label, value: project.key }))
    ],
    [projectOptions]
  );
  const connectionSelectOptions = useMemo<readonly SelectMenuOption[]>(
    () => connections.length === 0
      ? [{ label: "검증된 연결 없음", value: "" }]
      : connections.map((connection) => ({
          label: formatCostUsageAwsConnectionLabel(connection),
          value: connection.id
        })),
    [connections]
  );
  const selectedProject = useMemo(
    () => selectCostUsageProject(data?.projectCosts ?? [], selectedProjectKey),
    [data, selectedProjectKey]
  );
  const scopedDailyTrend = useMemo(
    () => createScopedCostUsageDailyTrend({
      dailyTrend: data?.dailyTrend ?? [],
      selectedProject,
      totalCostAmount: data?.totalCost.amount ?? 0
    }),
    [data, selectedProject]
  );
  const scopedServiceCosts = useMemo(
    () => createScopedCostUsageServiceCosts({
      resourceCosts: data?.resourceCosts ?? [],
      selectedProject,
      serviceCosts: data?.serviceCosts ?? [],
      totalCostAmount: data?.totalCost.amount ?? 0
    }),
    [data, selectedProject]
  );
  const scopedMonthlyTrend = useMemo(
    () => createScopedCostUsageMonthlyTrend({
      monthlyTrend: data?.monthlyTrend ?? [],
      selectedProject,
      totalCostAmount: data?.totalCost.amount ?? 0
    }),
    [data, selectedProject]
  );
  const scopedMonthlyComparison = useMemo(
    () => data === null
      ? null
      : createScopedCostUsageMonthlyComparison({
          generatedAt: data.generatedAt,
          monthlyComparison: data.monthlyComparison,
          selectedProject,
          totalCostAmount: data.totalCost.amount
        }),
    [data, selectedProject]
  );
  const scopedRecommendations = useMemo(
    () => selectedProject === null
      ? data?.recommendations ?? []
      : (data?.recommendations ?? []).filter((item) => item.projectId === selectedProject.projectId),
    [data, selectedProject]
  );
  const serviceBars = useMemo(() => createServiceCostBars(scopedServiceCosts), [scopedServiceCosts]);
  const monthlyBars = useMemo(() => createCostUsageMonthlyBars(scopedMonthlyTrend), [scopedMonthlyTrend]);
  const monthlyHasEstimate = monthlyBars.some((bar) => bar.isEstimated);
  const monthlyHasActual = monthlyBars.some((bar) => !bar.isEstimated);
  const monthlyScopeLabel = selectedProject
    ? `${selectedProject.projectName} · ${monthlyHasEstimate
        ? monthlyHasActual ? "실측·추정 혼합" : "추정 배분"
        : "태그 실측"}`
    : data?.dataSource === "sample" ? "AWS 계정 전체 · 예시" : "AWS 계정 전체";
  const monthlyEstimateNote = selectedProject && monthlyHasEstimate
    ? "‘추정’으로 표시된 월은 선택 기간의 프로젝트 비용 비율로 배분한 값입니다."
    : data?.dataSource === "sample"
      ? "AWS 실제 사용량을 연결하면 월별 실측 데이터로 교체됩니다."
      : null;
  const savings = useMemo(() => sumEstimatedMonthlySavings(scopedRecommendations), [scopedRecommendations]);
  const currentCost = selectedProject?.amount ?? data?.totalCost.amount;
  const forecastCost = useMemo(
    () => scaleForecast(data, selectedProject?.amount),
    [data, selectedProject]
  );
  const displayCopy = useMemo(
    () => createCostUsageDisplayCopy({
      dataSource: data?.dataSource ?? null,
      hasSelectedProject: selectedProject !== null,
      projectSource: selectedProject?.source
    }),
    [data, selectedProject]
  );

  async function loadCosts(nextRange = range, connectionId = selectedConnectionId): Promise<void> {
    const request = requestCoordinatorRef.current.begin();
    setLoadState("loading");
    setErrorMessage("");
    try {
      const loadedConnections = getVerifiedCostUsageAwsConnections(
        await listAwsConnections({ signal: request.signal })
      );
      if (!request.isCurrent()) return;
      const selectedId = loadedConnections.some((connection) => connection.id === connectionId)
        ? connectionId
        : loadedConnections[0]?.id ?? "";
      const result = await listCostUsageAnalysis({
        range: nextRange,
        ...(selectedId ? { awsConnectionId: selectedId } : {})
      }, { signal: request.signal });
      if (!request.isCurrent()) return;
      setConnections(loadedConnections);
      setSelectedConnectionId(selectedId);
      setSelectedProjectKey((current) => normalizeCostUsageProjectKey(result.projectCosts, current));
      setData(result);
      setLoadState("ready");
    } catch (error) {
      if (request.signal.aborted || !request.isCurrent()) return;
      setErrorMessage(error instanceof Error ? error.message : "실제 사용량을 불러오지 못했습니다.");
      setLoadState("error");
    }
  }

  useEffect(() => () => requestCoordinatorRef.current.dispose(), []);
  useEffect(() => {
    void loadCosts("30d", "");
  }, []);

  if (loadState === "loading" && !data) {
    return <ProductState description="성공 배포 프로젝트의 AWS 사용량을 확인하고 있습니다." kind="loading" title="실제 사용량 불러오는 중" />;
  }

  if (loadState === "error" && !data) {
    return <ProductState action={<button onClick={() => void loadCosts()} type="button">다시 시도</button>} description={errorMessage} kind="error" title="실제 사용량을 불러오지 못했습니다" />;
  }

  if (data?.projectCosts.length === 0) {
    return (
      <ProductState
        action={
          <button
            disabled={loadState === "loading"}
            onClick={() => void loadCosts()}
            type="button"
          >
            {loadState === "loading" ? "새로고침 중" : "새로고침"}
          </button>
        }
        description="프로젝트를 배포하면 AWS Cost Explorer와 CloudWatch 기반 실제 사용량이 여기에 표시됩니다."
        kind="empty"
        title="배포된 프로젝트가 없습니다"
      />
    );
  }

  return (
    <div className={styles.costPanelStack}>
      <div className={styles.costPanelToolbar}>
        <div className={styles.controlRow}>
          <div className={styles.controlField}>
            <span>배포 프로젝트</span>
            <SelectMenu
              ariaLabel="실제 사용량 배포 프로젝트 선택"
              emptyLabel="배포 프로젝트 선택"
              onChange={setSelectedProjectKey}
              options={projectSelectOptions}
              size="large"
              tone="surface"
              value={selectedProjectKey}
            />
          </div>
          <div className={styles.controlField}>
            <span>AWS 연결</span>
            <SelectMenu
              ariaLabel="실제 사용량 AWS 연결 선택"
              emptyLabel="AWS 연결 선택"
              onChange={(id) => {
                setSelectedConnectionId(id);
                void loadCosts(range, id);
              }}
              options={connectionSelectOptions}
              size="large"
              tone="surface"
              value={selectedConnectionId}
            />
          </div>
          <div className={styles.controlField}>
            <span>기간</span>
            <SelectMenu
              ariaLabel="실제 사용량 기간 선택"
              emptyLabel="기간 선택"
              onChange={(value) => {
                const nextRange = value as CostUsageAnalysisRange;
                setRange(nextRange);
                void loadCosts(nextRange);
              }}
              options={COST_USAGE_RANGE_OPTIONS}
              size="large"
              tone="surface"
              value={range}
            />
          </div>
        </div>
        <button
          aria-busy={loadState === "loading"}
          aria-label={loadState === "loading" ? "실제 사용량 새로고침 중" : "실제 사용량 새로고침"}
          className={styles.iconAction}
          data-loading={loadState === "loading"}
          disabled={loadState === "loading"}
          onClick={() => void loadCosts()}
          title={loadState === "loading" ? "새로고침 중" : "새로고침"}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={17} />
        </button>
      </div>

      {displayCopy.sampleNotice ? <p className="dashboardInformationBand" role="status">{displayCopy.sampleNotice}</p> : null}
      {errorMessage ? <p className={styles.errorBand}>{errorMessage}</p> : null}

      <section className={styles.metricGrid}>
        <CostMetric icon={<WalletCards size={18} />} label={selectedProject ? `${selectedProject.projectName} ${displayCopy.metricCostLabel}` : displayCopy.metricCostLabel} value={formatUsd(currentCost)} />
        <CostMetric icon={<TrendingUp size={18} />} label="월말 예상" value={formatUsd(forecastCost)} />
        <CostMetric icon={<AlertTriangle size={18} />} label="절감 가능" value={formatUsd(savings)} />
      </section>

      {scopedMonthlyComparison ? (
        <section className={styles.monthlyComparisonSection}>
          <div className={styles.monthlyComparisonHeader}>
            <div>
              <h2>월별 비교</h2>
              <p>최근 6개월의 월별 비용과 이번 달 예상 비용을 비교합니다.</p>
            </div>
            <span>{monthlyScopeLabel}</span>
          </div>

          <div className={styles.monthlyComparisonGrid}>
            <MonthlySummaryCard label={monthlyHasEstimate ? "전월 비용" : "전월 실제"} note={monthlyHasEstimate ? "추정 포함" : undefined} value={formatUsd(scopedMonthlyComparison.previousMonthActual.amount)} />
            <MonthlySummaryCard label="이번 달 사용" note="집계 중" value={formatUsd(scopedMonthlyComparison.currentMonthToDate.amount)} />
            <MonthlySummaryCard label="월말 예상" value={formatUsd(scopedMonthlyComparison.currentMonthForecast.amount)} />
            <MonthlySummaryCard
              direction={scopedMonthlyComparison.forecastChangeAmount.amount > 0 ? "up" : scopedMonthlyComparison.forecastChangeAmount.amount < 0 ? "down" : "flat"}
              label="전월 대비"
              note={formatComparisonPercentage(scopedMonthlyComparison.forecastChangePercentage)}
              value={formatSignedUsd(scopedMonthlyComparison.forecastChangeAmount.amount)}
            />
          </div>

          <div aria-label="최근 6개월 월별 비용" className={styles.monthlyChartViewport} role="img">
            <div className={styles.monthlyChart}>
              {monthlyBars.map((bar) => (
                <div className={styles.monthlyBar} key={bar.month}>
                  <strong>{formatUsd(bar.amount)}</strong>
                  <div className={styles.monthlyBarTrack}>
                    <i
                      data-partial={bar.isPartial}
                      style={{ height: `${Math.max(bar.amount > 0 ? 4 : 0, bar.heightPercentage)}%` }}
                    />
                  </div>
                  <span>
                    {bar.label}
                    {bar.isPartial || bar.isEstimated
                      ? <small>{[bar.isPartial ? "집계 중" : "", bar.isEstimated ? "추정" : ""].filter(Boolean).join(" · ")}</small>
                      : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {monthlyEstimateNote ? <p className={styles.monthlyEstimateNote}>{monthlyEstimateNote}</p> : null}
        </section>
      ) : null}

      <section className={styles.chartSection}>
        <div><h2>일별 실제 비용</h2><span>{data?.startDate} - {data?.endDate}</span></div>
        {scopedDailyTrend.length === 0
          ? <p>표시할 비용이 없습니다.</p>
          : <CostUsageChart dailyTrend={scopedDailyTrend} />}
      </section>

      <section className={styles.twoColumn}>
        <div className={styles.listSection}><h2>서비스별 실제 비용</h2>{serviceBars.length ? serviceBars.map((service) => <div className={styles.costBar} key={service.label}><span>{service.label}</span><strong>{formatUsd(service.amount)}</strong><i style={{ width: `${Math.min(100, service.percentage)}%` }} /></div>) : <p>선택한 프로젝트의 서비스 비용이 없습니다.</p>}</div>
        <div className={styles.listSection}><h2>절감 제안</h2>{scopedRecommendations.length ? scopedRecommendations.map((item) => <article className={styles.recommendation} key={item.id}><span>{item.severity === "high" ? "높음" : "확인"}</span><strong>{item.title}</strong><p>{item.reason}</p><small>{formatUsd(item.estimatedMonthlySavings.amount)} 절감 예상</small></article>) : <p>현재 절감 제안이 없습니다.</p>}</div>
      </section>
    </div>
  );
}

function CostUsageChart({ dailyTrend }: { readonly dailyTrend: readonly CostUsageTrendPoint[] }) {
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(640);
  const chart = useMemo(
    () => createCostUsageLineChart(dailyTrend, { width: chartWidth }),
    [chartWidth, dailyTrend]
  );

  useEffect(() => {
    const chartElement = chartRef.current;
    if (chartElement === null) return;

    const updateChartWidth = (width: number) => {
      const nextWidth = Math.max(320, Math.round(width));
      setChartWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth);
    };

    updateChartWidth(chartElement.getBoundingClientRect().width);
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry !== undefined) updateChartWidth(entry.contentRect.width);
    });
    resizeObserver.observe(chartElement);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <svg
      aria-label="일별 AWS 실제 비용 추세"
      className={styles.costChart}
      ref={chartRef}
      role="img"
      viewBox={`0 0 ${chart.width} ${chart.height}`}
    >
      <g aria-hidden="true">
        {chart.yTicks.map((tick) => (
          <line
            className={styles.chartGridLine}
            key={`grid-${tick.amount}`}
            x1={chart.plot.left}
            x2={chart.plot.right}
            y1={tick.y}
            y2={tick.y}
          />
        ))}
        <line
          className={styles.chartAxisLine}
          x1={chart.plot.left}
          x2={chart.plot.left}
          y1={chart.plot.top}
          y2={chart.plot.bottom}
        />
        {chart.yTicks.map((tick) => (
          <text
            className={styles.chartAxisLabel}
            dominantBaseline="middle"
            key={`y-${tick.amount}`}
            textAnchor="end"
            x={chart.plot.left - 9}
            y={tick.y}
          >
            {tick.label}
          </text>
        ))}
        {chart.xTicks.map((tick) => (
          <text
            className={styles.chartAxisLabel}
            key={tick.date}
            textAnchor="middle"
            x={tick.x}
            y={chart.height - 7}
          >
            {tick.label}
          </text>
        ))}
      </g>
      <path className={styles.chartLine} d={chart.path} />
      <g>
        {chart.points.map((point) => (
          <circle
            className={styles.chartPoint}
            cx={point.x}
            cy={point.y}
            key={point.date}
            r="2"
          >
            <title>{point.date}: {formatUsd(point.amount)}</title>
          </circle>
        ))}
      </g>
    </svg>
  );
}

function MonthlySummaryCard({
  direction = "flat",
  label,
  note,
  value
}: {
  readonly direction?: "down" | "flat" | "up";
  readonly label: string;
  readonly note?: string | undefined;
  readonly value: string;
}) {
  return (
    <article className={styles.monthlySummaryCard} data-direction={direction}>
      <span>{label}{note ? <small>{note}</small> : null}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatSignedUsd(amount: number): string {
  if (amount === 0) return formatUsd(0);

  return `${amount > 0 ? "+" : "−"}${formatUsd(Math.abs(amount))}`;
}

function formatComparisonPercentage(percentage: number | null): string {
  if (percentage === null) return "비교 데이터 없음";
  if (percentage === 0) return "변동 없음";

  return `${percentage > 0 ? "+" : ""}${percentage.toFixed(1)}%`;
}

function scaleForecast(data: CostUsageAnalysisResponse | null, selectedAmount: number | undefined): number | undefined {
  if (data === null || selectedAmount === undefined) return data?.forecastMonthEndCost.amount;
  if (data.totalCost.amount <= 0) return 0;
  return Math.round((data.forecastMonthEndCost.amount * selectedAmount / data.totalCost.amount + Number.EPSILON) * 100) / 100;
}
