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
  DashboardSelectField,
  type DashboardSelectOption
} from "../../../components/ui/DashboardSelectField";
import {
  createCostUsageLineChart,
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

const COST_USAGE_RANGE_OPTIONS: readonly DashboardSelectOption[] = [
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
  const projectSelectOptions = useMemo<readonly DashboardSelectOption[]>(
    () => [
      { label: "전체 배포 프로젝트", value: COST_USAGE_ALL_PROJECTS_KEY },
      ...projectOptions.map((project) => ({ label: project.label, value: project.key }))
    ],
    [projectOptions]
  );
  const connectionSelectOptions = useMemo<readonly DashboardSelectOption[]>(
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
  const scopedRecommendations = useMemo(
    () => selectedProject === null
      ? data?.recommendations ?? []
      : (data?.recommendations ?? []).filter((item) => item.projectId === selectedProject.projectId),
    [data, selectedProject]
  );
  const serviceBars = useMemo(() => createServiceCostBars(scopedServiceCosts), [scopedServiceCosts]);
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
          <DashboardSelectField
            ariaLabel="실제 사용량 배포 프로젝트 선택"
            className={styles.controlField}
            emptyLabel="배포 프로젝트 선택"
            label="배포 프로젝트"
            onChange={setSelectedProjectKey}
            options={projectSelectOptions}
            value={selectedProjectKey}
          />
          <DashboardSelectField
            ariaLabel="실제 사용량 AWS 연결 선택"
            className={styles.controlField}
            emptyLabel="AWS 연결 선택"
            label="AWS 연결"
            onChange={(id) => {
              setSelectedConnectionId(id);
              void loadCosts(range, id);
            }}
            options={connectionSelectOptions}
            value={selectedConnectionId}
          />
          <DashboardSelectField
            ariaLabel="실제 사용량 기간 선택"
            className={styles.controlField}
            emptyLabel="기간 선택"
            label="기간"
            onChange={(value) => {
              const nextRange = value as CostUsageAnalysisRange;
              setRange(nextRange);
              void loadCosts(nextRange);
            }}
            options={COST_USAGE_RANGE_OPTIONS}
            value={range}
          />
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

function scaleForecast(data: CostUsageAnalysisResponse | null, selectedAmount: number | undefined): number | undefined {
  if (data === null || selectedAmount === undefined) return data?.forecastMonthEndCost.amount;
  if (data.totalCost.amount <= 0) return 0;
  return Math.round((data.forecastMonthEndCost.amount * selectedAmount / data.totalCost.amount + Number.EPSILON) * 100) / 100;
}
