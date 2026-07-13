"use client";

import { AlertTriangle, RefreshCw, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AwsConnection, CostUsageAnalysisRange, CostUsageAnalysisResponse } from "@sketchcatch/types";
import { ProductState } from "../../../components/ui/ProductState";
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
import { listAwsConnections, listCostUsageAnalysis } from "../../../features/workspace/api";
import styles from "../dashboard-tools.module.css";

type CostLoadState = "loading" | "ready" | "error";

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
  const chart = useMemo(() => createCostUsageLineChart(scopedDailyTrend), [scopedDailyTrend]);
  const serviceBars = useMemo(() => createServiceCostBars(scopedServiceCosts), [scopedServiceCosts]);
  const savings = useMemo(() => sumEstimatedMonthlySavings(scopedRecommendations), [scopedRecommendations]);
  const currentCost = selectedProject?.amount ?? data?.totalCost.amount;
  const forecastCost = useMemo(
    () => scaleForecast(data, selectedProject?.amount),
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
    return <ProductState description="프로젝트를 배포하면 AWS Cost Explorer와 CloudWatch 기반 실제 사용량이 여기에 표시됩니다." kind="empty" title="배포된 프로젝트가 없습니다" />;
  }

  return (
    <div className={styles.costPanelStack}>
      <div className={styles.costPanelToolbar}>
        <div className={styles.controlRow}>
          <label><span>배포 프로젝트</span><select onChange={(event) => setSelectedProjectKey(event.target.value)} value={selectedProjectKey}><option value={COST_USAGE_ALL_PROJECTS_KEY}>전체 배포 프로젝트</option>{projectOptions.map((project) => <option key={project.key} value={project.key}>{project.label}</option>)}</select></label>
          <label><span>AWS 연결</span><select onChange={(event) => { const id = event.target.value; setSelectedConnectionId(id); void loadCosts(range, id); }} value={selectedConnectionId}>{connections.length === 0 ? <option value="">검증된 연결 없음</option> : null}{connections.map((connection) => <option key={connection.id} value={connection.id}>{formatCostUsageAwsConnectionLabel(connection)}</option>)}</select></label>
          <label><span>기간</span><select onChange={(event) => { const next = event.target.value as CostUsageAnalysisRange; setRange(next); void loadCosts(next); }} value={range}><option value="7d">최근 7일</option><option value="30d">최근 30일</option><option value="month_to_date">이번 달</option></select></label>
        </div>
        <button className={styles.iconAction} aria-label="실제 사용량 새로고침" onClick={() => void loadCosts()} title="새로고침" type="button"><RefreshCw size={17} /></button>
      </div>

      {data?.dataSource === "sample" ? <p className="dashboardInformationBand" role="status">예시 데이터입니다. 실제 AWS 청구액이 아니며, 검증된 AWS 연결 후 실제 사용량으로 전환됩니다.</p> : null}
      {errorMessage ? <p className={styles.errorBand}>{errorMessage}</p> : null}

      <section className={styles.metricGrid}>
        <CostMetric icon={<WalletCards size={18} />} label={selectedProject ? `${selectedProject.projectName} 실제 비용` : "배포 프로젝트 실제 비용"} value={formatUsd(currentCost)} />
        <CostMetric icon={<TrendingUp size={18} />} label="월말 예상" value={formatUsd(forecastCost)} />
        <CostMetric icon={<AlertTriangle size={18} />} label="절감 가능" value={formatUsd(savings)} />
      </section>

      <section className={styles.chartSection}>
        <div><h2>일별 실제 비용</h2><span>{data?.startDate} - {data?.endDate}</span></div>
        {chart.points.length === 0 ? <p>표시할 비용이 없습니다.</p> : <svg aria-label="일별 AWS 실제 비용 추세" role="img" viewBox="0 0 640 200"><path d={chart.path} /><g>{chart.points.map((point) => <circle cx={point.x} cy={point.y} key={point.date} r="4"><title>{point.date}: {formatUsd(point.amount)}</title></circle>)}</g></svg>}
      </section>

      <section className={styles.twoColumn}>
        <div className={styles.listSection}><h2>서비스별 실제 비용</h2>{serviceBars.length ? serviceBars.map((service) => <div className={styles.costBar} key={service.label}><span>{service.label}</span><strong>{formatUsd(service.amount)}</strong><i style={{ width: `${Math.min(100, service.percentage)}%` }} /></div>) : <p>선택한 프로젝트의 서비스 비용이 없습니다.</p>}</div>
        <div className={styles.listSection}><h2>절감 제안</h2>{scopedRecommendations.length ? scopedRecommendations.map((item) => <article className={styles.recommendation} key={item.id}><span>{item.severity === "high" ? "높음" : "확인"}</span><strong>{item.title}</strong><p>{item.reason}</p><small>{formatUsd(item.estimatedMonthlySavings.amount)} 절감 예상</small></article>) : <p>현재 절감 제안이 없습니다.</p>}</div>
      </section>
    </div>
  );
}

function CostMetric({ icon, label, value }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string }) {
  return <article className={styles.metricCard}>{icon}<span>{label}</span><strong>{value}</strong></article>;
}

function scaleForecast(data: CostUsageAnalysisResponse | null, selectedAmount: number | undefined): number | undefined {
  if (data === null || selectedAmount === undefined) return data?.forecastMonthEndCost.amount;
  if (data.totalCost.amount <= 0) return 0;
  return Math.round((data.forecastMonthEndCost.amount * selectedAmount / data.totalCost.amount + Number.EPSILON) * 100) / 100;
}

function formatUsd(amount: number | undefined): string {
  return typeof amount === "number"
    ? new Intl.NumberFormat("ko-KR", { style: "currency", currency: "USD" }).format(amount)
    : "계산 못 함";
}
