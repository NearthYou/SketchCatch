"use client";

import { AlertTriangle, RefreshCw, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CostUsageAnalysisRange, CostUsageAnalysisResponse } from "@sketchcatch/types";
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
import { createCostRequestCoordinator } from "../../../features/costs/cost-request-coordinator";
import { listAwsConnections, listCostUsageAnalysis } from "../../../features/workspace/api";
import type { AwsConnection } from "@sketchcatch/types";
import styles from "../dashboard-tools.module.css";

type CostLoadState = "loading" | "ready" | "error";

// 검증된 AWS 연결의 실제 사용 비용과 절감 제안을 기간별로 불러옵니다.
export function CostDashboardClient() {
  const [connections, setConnections] = useState<readonly AwsConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [range, setRange] = useState<CostUsageAnalysisRange>("30d");
  const [data, setData] = useState<CostUsageAnalysisResponse | null>(null);
  const [loadState, setLoadState] = useState<CostLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const requestCoordinatorRef = useRef(createCostRequestCoordinator());
  const chart = useMemo(() => createCostUsageLineChart(data?.dailyTrend ?? []), [data]);
  const serviceBars = useMemo(() => createServiceCostBars(data?.serviceCosts ?? []), [data]);
  const savings = useMemo(
    () => sumEstimatedMonthlySavings(data?.recommendations ?? []),
    [data]
  );

  // 새 조회가 시작되면 이전 요청을 취소하고 가장 최신 응답만 화면에 반영합니다.
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
      setData(result);
      setLoadState("ready");
    } catch (error) {
      if (request.signal.aborted || !request.isCurrent()) return;
      setErrorMessage(error instanceof Error ? error.message : "비용 데이터를 불러오지 못했습니다.");
      setLoadState("error");
    }
  }

  // 화면을 떠날 때 아직 끝나지 않은 비용 요청을 중단합니다.
  useEffect(() => () => requestCoordinatorRef.current.dispose(), []);

  // 화면 진입 시 기본 30일 비용을 한 번 불러옵니다.
  useEffect(() => {
    void loadCosts();
  }, []);

  if (loadState === "loading" && !data) {
    return <ProductState description="AWS 비용 데이터를 확인하고 있습니다." kind="loading" title="비용 불러오는 중" />;
  }

  if (loadState === "error" && !data) {
    return <ProductState action={<button onClick={() => void loadCosts()} type="button">다시 시도</button>} description={errorMessage} kind="error" title="비용을 불러오지 못했습니다" />;
  }

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader">
        <div><p className="dashboardEyebrow">AWS Cost Explorer</p><h1>Costs</h1></div>
        <button className={styles.iconAction} aria-label="비용 새로고침" onClick={() => void loadCosts()} title="새로고침" type="button"><RefreshCw size={17} /></button>
      </header>

      <div className={styles.controlRow}>
        <label><span>AWS 연결</span><select onChange={(event) => { const id = event.target.value; setSelectedConnectionId(id); void loadCosts(range, id); }} value={selectedConnectionId}>{connections.length === 0 ? <option value="">검증된 연결 없음</option> : null}{connections.map((connection) => <option key={connection.id} value={connection.id}>{formatCostUsageAwsConnectionLabel(connection)}</option>)}</select></label>
        <label><span>기간</span><select onChange={(event) => { const next = event.target.value as CostUsageAnalysisRange; setRange(next); void loadCosts(next); }} value={range}><option value="7d">최근 7일</option><option value="30d">최근 30일</option><option value="month_to_date">이번 달</option></select></label>
      </div>

      {data?.dataSource === "sample" ? <p className="dashboardInformationBand" role="status">예시 데이터입니다. 실제 AWS 청구액이 아닙니다.</p> : null}
      {errorMessage ? <p className={styles.errorBand}>{errorMessage}</p> : null}

      <section className={styles.metricGrid}>
        <CostMetric icon={<WalletCards size={18} />} label="현재 비용" value={formatUsd(data?.totalCost.amount)} />
        <CostMetric icon={<TrendingUp size={18} />} label="월말 예상" value={formatUsd(data?.forecastMonthEndCost.amount)} />
        <CostMetric icon={<AlertTriangle size={18} />} label="절감 가능" value={formatUsd(savings)} />
      </section>

      <section className={styles.chartSection}>
        <div><h2>일별 비용</h2><span>{data?.startDate} - {data?.endDate}</span></div>
        {chart.points.length === 0 ? <p>표시할 비용이 없습니다.</p> : <svg aria-label="일별 AWS 비용 추세" role="img" viewBox="0 0 640 200"><path d={chart.path} /><g>{chart.points.map((point) => <circle cx={point.x} cy={point.y} key={point.date} r="4"><title>{point.date}: {formatUsd(point.amount)}</title></circle>)}</g></svg>}
      </section>

      <section className={styles.twoColumn}>
        <div className={styles.listSection}><h2>서비스별 비용</h2>{serviceBars.map((service) => <div className={styles.costBar} key={service.label}><span>{service.label}</span><strong>{formatUsd(service.amount)}</strong><i style={{ width: `${Math.min(100, service.percentage)}%` }} /></div>)}</div>
        <div className={styles.listSection}><h2>절감 제안</h2>{data?.recommendations.length ? data.recommendations.map((item) => <article className={styles.recommendation} key={item.id}><span>{item.severity === "high" ? "높음" : "확인"}</span><strong>{item.title}</strong><p>{item.reason}</p><small>{formatUsd(item.estimatedMonthlySavings.amount)} 절감 예상</small></article>) : <p>현재 절감 제안이 없습니다.</p>}</div>
      </section>
    </div>
  );
}

// 비용 핵심 숫자를 같은 카드 규칙으로 표시합니다.
function CostMetric({ icon, label, value }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string }) {
  return <article className={styles.metricCard}>{icon}<span>{label}</span><strong>{value}</strong></article>;
}

// USD 비용을 소수 둘째 자리까지 읽기 쉬운 통화로 표시합니다.
function formatUsd(amount: number | undefined): string {
  return typeof amount === "number"
    ? new Intl.NumberFormat("ko-KR", { style: "currency", currency: "USD" }).format(amount)
    : "계산 못 함";
}
