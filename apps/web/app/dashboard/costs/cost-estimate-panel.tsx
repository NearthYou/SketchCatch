"use client";

import { Calculator, FolderKanban, RefreshCw, ServerCog } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CostEstimatePeriod,
  CostProjectEstimateListResponse
} from "@sketchcatch/types";
import { ProductState } from "../../../components/ui/ProductState";
import {
  countEstimatableCostProjects,
  selectUndeployedCostProjects,
  sumCostProjectEstimates
} from "../../../features/costs/cost-estimate-project-view";
import { createCostRequestCoordinator } from "../../../features/costs/cost-request-coordinator";
import { listCostProjectEstimates } from "../../../features/workspace/api";
import { CostMetric, formatUsd } from "./cost-dashboard-presentation";
import styles from "../dashboard-tools.module.css";

type CostLoadState = "loading" | "ready" | "error";

export function CostEstimatePanel() {
  const [period, setPeriod] = useState<CostEstimatePeriod>("month");
  const [expectedUserCount, setExpectedUserCount] = useState(1000);
  const [data, setData] = useState<CostProjectEstimateListResponse | null>(null);
  const [loadState, setLoadState] = useState<CostLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const requestCoordinatorRef = useRef(createCostRequestCoordinator());
  const projects = useMemo(
    () => selectUndeployedCostProjects(data?.projects ?? []),
    [data]
  );
  const periodTotal = useMemo(
    () => sumCostProjectEstimates(projects, "totalEstimate"),
    [projects]
  );
  const monthlyTotal = useMemo(
    () => sumCostProjectEstimates(projects, "totalMonthlyEstimate"),
    [projects]
  );
  const estimatableCount = useMemo(() => countEstimatableCostProjects(projects), [projects]);

  async function loadEstimates(
    nextPeriod = period,
    nextExpectedUserCount = expectedUserCount
  ): Promise<void> {
    const request = requestCoordinatorRef.current.begin();
    setLoadState("loading");
    setErrorMessage("");

    try {
      const result = await listCostProjectEstimates(
        {
          expectedUserCount: nextExpectedUserCount,
          period: nextPeriod
        },
        { signal: request.signal }
      );
      if (!request.isCurrent()) return;
      setData(result);
      setLoadState("ready");
    } catch (error) {
      if (request.signal.aborted || !request.isCurrent()) return;
      setErrorMessage(error instanceof Error ? error.message : "예상 비용을 불러오지 못했습니다.");
      setLoadState("error");
    }
  }

  useEffect(() => () => requestCoordinatorRef.current.dispose(), []);
  useEffect(() => {
    void loadEstimates("month", 1000);
  }, []);

  if (loadState === "loading" && !data) {
    return <ProductState description="프로젝트 아키텍처를 기준으로 예상 비용을 계산하고 있습니다." kind="loading" title="예상 비용 계산 중" />;
  }

  if (loadState === "error" && !data) {
    return <ProductState action={<button onClick={() => void loadEstimates()} type="button">다시 시도</button>} description={errorMessage} kind="error" title="예상 비용을 불러오지 못했습니다" />;
  }

  return (
    <div className={styles.costPanelStack}>
      <div className={styles.costPanelToolbar}>
        <div className={styles.controlRow}>
          <label>
            <span>예상 사용자</span>
            <select
              onChange={(event) => {
                const count = Number(event.target.value);
                setExpectedUserCount(count);
                void loadEstimates(period, count);
              }}
              value={expectedUserCount}
            >
              <option value={1000}>월 1,000명</option>
              <option value={10000}>월 10,000명</option>
              <option value={100000}>월 100,000명</option>
            </select>
          </label>
          <label>
            <span>표시 기간</span>
            <select
              onChange={(event) => {
                const nextPeriod = event.target.value as CostEstimatePeriod;
                setPeriod(nextPeriod);
                void loadEstimates(nextPeriod);
              }}
              value={period}
            >
              <option value="day">하루</option>
              <option value="week">일주일</option>
              <option value="month">한 달</option>
            </select>
          </label>
        </div>
        <button className={styles.iconAction} aria-label="예상 비용 새로고침" onClick={() => void loadEstimates()} title="새로고침" type="button"><RefreshCw size={17} /></button>
      </div>

      {errorMessage ? <p className={styles.errorBand}>{errorMessage}</p> : null}

      <section className={styles.metricGrid}>
        <CostMetric icon={<Calculator size={18} />} label={`${getPeriodLabel(period)} 예상 비용`} value={formatUsd(periodTotal.amount)} />
        <CostMetric icon={<ServerCog size={18} />} label="월 환산 예상 비용" value={formatUsd(monthlyTotal.amount)} />
        <CostMetric icon={<FolderKanban size={18} />} label="비용 계산 가능 프로젝트" value={`${estimatableCount} / ${projects.length}`} />
      </section>

      {projects.length === 0 ? (
        <ProductState description="현재 모든 프로젝트가 배포됐거나 아직 프로젝트가 없습니다." kind="empty" title="예상 비용을 볼 미배포 프로젝트가 없습니다" />
      ) : (
        <section className={styles.costProjectGrid} aria-label="미배포 프로젝트 예상 비용">
          {projects.map(({ costEstimate, project }) => (
            <article className={styles.costProjectCard} key={project.id}>
              <div>
                <span className={styles.statusBadge}>배포 전</span>
                <h2>{project.name}</h2>
                <p>{project.description || "저장된 아키텍처를 기준으로 비용을 계산합니다."}</p>
              </div>
              {costEstimate === null ? (
                <div className={styles.costUnavailable}>
                  <strong>계산 준비 필요</strong>
                  <span>아키텍처를 저장하면 예상 비용이 표시됩니다.</span>
                </div>
              ) : (
                <div className={styles.projectCostValue}>
                  <span>{getPeriodLabel(period)} 예상</span>
                  <strong>{formatUsd(costEstimate.totalEstimate.amount)}</strong>
                  <small>{costEstimate.resources.length}개 리소스 · {costEstimate.pricingSource === "aws_pricing_api" ? "AWS Pricing API" : "보수적 추정 단가"}</small>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function getPeriodLabel(period: CostEstimatePeriod): string {
  return period === "day" ? "하루" : period === "week" ? "일주일" : "한 달";
}
