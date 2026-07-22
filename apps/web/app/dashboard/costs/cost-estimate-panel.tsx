"use client";

import { Calculator, FolderKanban, RefreshCw, ServerCog } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  CostEstimatePeriod,
  CostProjectEstimateListResponse
} from "@sketchcatch/types";
import { ProductState } from "../../../components/ui/ProductState";
import {
  SelectMenu,
  type SelectMenuOption
} from "../../../components/ui/SelectMenu";
import {
  countEstimatableCostProjects,
  selectUndeployedCostProjects,
  sumCostProjectEstimates
} from "../../../features/costs/cost-estimate-project-view";
import {
  MAX_EXPECTED_USER_COUNT,
  MIN_EXPECTED_USER_COUNT,
  normalizeExpectedUserCount
} from "../../../features/costs/cost-estimate-input";
import { useCostEstimateQuery } from "../../../features/costs/cost-queries";
import { CostMetric, formatUsd } from "./cost-dashboard-presentation";
import styles from "../dashboard-tools.module.css";

const COST_ESTIMATE_PERIOD_OPTIONS: readonly SelectMenuOption[] = [
  { label: "하루", value: "day" },
  { label: "일주일", value: "week" },
  { label: "한 달", value: "month" }
];

export function CostEstimatePanel({
  expectedUserCount,
  expectedUserCountInput,
  onExpectedUserCountChange,
  onExpectedUserCountInputChange,
  onPeriodChange,
  period
}: {
  readonly expectedUserCount: number;
  readonly expectedUserCountInput: string;
  readonly onExpectedUserCountChange: (value: number) => void;
  readonly onExpectedUserCountInputChange: (value: string) => void;
  readonly onPeriodChange: (period: CostEstimatePeriod) => void;
  readonly period: CostEstimatePeriod;
}) {
  const [expectedUserCountError, setExpectedUserCountError] = useState("");
  const estimateQuery = useCostEstimateQuery({ expectedUserCount, period });
  const data: CostProjectEstimateListResponse | null = estimateQuery.data ?? null;
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

  function applyExpectedUserCount(): void {
    const normalized = normalizeExpectedUserCount(expectedUserCountInput);

    if (normalized === null) {
      setExpectedUserCountError("1명 이상 1,000,000명 이하로 입력해 주세요.");
      return;
    }

    setExpectedUserCountError("");
    onExpectedUserCountChange(normalized);
    onExpectedUserCountInputChange(String(normalized));
  }

  if (estimateQuery.isPending && !data) {
    return <ProductState description="프로젝트 아키텍처를 기준으로 예상 비용을 계산하고 있습니다." kind="loading" title="예상 비용 계산 중" />;
  }

  if (estimateQuery.isError && !data) {
    return <ProductState action={<button onClick={() => void estimateQuery.refetch()} type="button">다시 시도</button>} description={estimateQuery.error instanceof Error ? estimateQuery.error.message : "예상 비용을 불러오지 못했습니다."} kind="error" title="예상 비용을 불러오지 못했습니다" />;
  }

  return (
    <div className={styles.costPanelStack}>
      <div className={styles.costPanelToolbar}>
        <div className={styles.controlRow}>
          <label>
            <span>예상 사용자</span>
            <input
              aria-describedby={expectedUserCountError ? "expected-user-count-error" : undefined}
              aria-invalid={expectedUserCountError ? true : undefined}
              inputMode="numeric"
              max={MAX_EXPECTED_USER_COUNT}
              min={MIN_EXPECTED_USER_COUNT}
              onBlur={applyExpectedUserCount}
              onChange={(event) => {
                onExpectedUserCountInputChange(event.target.value);
                setExpectedUserCountError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              step={1}
              type="number"
              value={expectedUserCountInput}
            />
            {expectedUserCountError ? (
              <small className={styles.fieldError} id="expected-user-count-error" role="alert">
                {expectedUserCountError}
              </small>
            ) : null}
          </label>
          <div className={styles.controlField}>
            <span>표시 기간</span>
            <SelectMenu
              ariaLabel="예상 비용 표시 기간 선택"
              emptyLabel="표시 기간 선택"
              onChange={(value) => {
                const nextPeriod = value as CostEstimatePeriod;
                onPeriodChange(nextPeriod);
              }}
              options={COST_ESTIMATE_PERIOD_OPTIONS}
              size="large"
              tone="surface"
              value={period}
            />
          </div>
        </div>
        <button
          aria-busy={estimateQuery.isFetching}
          aria-label={estimateQuery.isFetching ? "예상 비용 새로고침 중" : "예상 비용 새로고침"}
          className={styles.iconAction}
          data-loading={estimateQuery.isFetching}
          disabled={estimateQuery.isFetching}
          onClick={() => void estimateQuery.refetch()}
          title={estimateQuery.isFetching ? "새로고침 중" : "새로고침"}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={17} />
        </button>
      </div>

      {estimateQuery.isError ? <p className={styles.errorBand}>{estimateQuery.error instanceof Error ? estimateQuery.error.message : "예상 비용을 갱신하지 못했습니다."}</p> : null}

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
