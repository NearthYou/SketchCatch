"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  CostEstimateSupportLevel,
  CostEstimatePeriod,
  CostProjectEstimateListResponse,
  ResourceCostEstimate
} from "@sketchcatch/types";
import { Calculator, RefreshCw } from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { getApiErrorMessage } from "../../lib/api-client";
import { listCostProjectEstimates } from "../../features/workspace/api";

type CostPageState = "idle" | "loading" | "error";

type AppliedCostQuery = {
  readonly expectedUserCount: number;
  readonly period: CostEstimatePeriod;
};

const COST_PERIOD_OPTIONS = [
  { label: "하루", value: "day" },
  { label: "일주일", value: "week" },
  { label: "1개월", value: "month" }
] as const satisfies readonly { readonly label: string; readonly value: CostEstimatePeriod }[];

const DEFAULT_COST_QUERY: AppliedCostQuery = {
  expectedUserCount: 1000,
  period: "month"
};

export function CostsClient() {
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
  const selectedProject = useMemo(
    () => costData?.projects.find((item) => item.project.id === selectedProjectId) ?? costData?.projects[0] ?? null,
    [costData, selectedProjectId]
  );

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
    function handlePopState(): void {
      setSelectedProjectId(readSelectedProjectIdFromLocation());
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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

  const totalEstimateAmount = costData?.totalEstimate.amount ?? 0;
  const totalMonthlyAmount = costData?.totalMonthlyEstimate.amount ?? 0;
  const dailyAverageAmount = totalMonthlyAmount / 30;

  return (
    <>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Cost management</p>
          <h1>비용관리</h1>
        </div>
      </div>

      <section className="dashboardPanel costControlPanel" aria-labelledby="cost-control-title">
        <div>
          <p className="dashboardPanelKicker">Estimate settings</p>
          <h2 id="cost-control-title">예상 비용 조건</h2>
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
      </section>

      <section className="dashboardPanel costSummaryPanel" aria-labelledby="cost-summary-title">
        <div>
          <p className="dashboardPanelKicker">Running deployments</p>
          <h2 id="cost-summary-title">켜둔 배포 프로젝트 예상 비용 합계</h2>
        </div>
        <div className="costSummaryAmount">
          <span>{getPeriodLabel(appliedQuery.period)} 예상 비용</span>
          <strong>{formatUsd(totalEstimateAmount)}</strong>
          <p>
            월 환산 {formatUsd(totalMonthlyAmount)} · 일 평균 약 {formatUsd(dailyAverageAmount)}
          </p>
        </div>
      </section>

      <section className="dashboardPanel" aria-labelledby="active-deployment-cost-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Active costs</p>
            <h2 id="active-deployment-cost-title">실행 중 배포 프로젝트</h2>
          </div>
          <span className="dashboardCountBadge">{costData?.projects.length ?? 0}개</span>
        </div>
        {state === "loading" ? <CostStatus message="비용 데이터를 불러오는 중입니다." /> : null}
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
          <CostStatus message="실행 중인 배포 프로젝트가 없습니다." />
        ) : null}
        {state === "idle" && costData !== null && costData.projects.length > 0 ? (
          <div className="dashboardTable">
            <div className="dashboardTableHeader">
              <span>프로젝트</span>
              <span>클라우드</span>
              <span>리소스</span>
              <span>{getPeriodLabel(appliedQuery.period)} 예상 비용</span>
            </div>
            {costData.projects.map((item) => (
              <button
                aria-pressed={selectedProject?.project.id === item.project.id}
                className="dashboardTableRow costProjectRow"
                key={item.project.id}
                onClick={() => selectProject(item.project.id, setSelectedProjectId)}
                type="button"
              >
                <strong>{item.project.name}</strong>
                <span>AWS</span>
                <span>{formatResourceTypes(item.costEstimate?.resources ?? [])}</span>
                <span>{formatUsd(item.costEstimate?.totalEstimate.amount ?? 0)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {selectedProject?.costEstimate != null ? (
        <section className="dashboardPanel costDetailPanel" aria-labelledby="cost-detail-title">
          <div className="dashboardPanelHeader">
            <div>
              <p className="dashboardPanelKicker">Resource details</p>
              <h2 id="cost-detail-title">{selectedProject.project.name} 비용 근거</h2>
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
                    <strong>{formatResourceMonthlyAmount(resource)}</strong>
                  </span>
                </summary>
                <p>{resource.explanation}</p>
                <p className="costResourceSupportReason">{resource.supportReason}</p>
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

      <section className="dashboardPanel costNoticePanel" aria-labelledby="cost-notice-title">
        <DashboardIcon name="shield" />
        <div>
          <h2 id="cost-notice-title">현재 비용은 추정치입니다</h2>
          <p>
            예상 사용자 수는 실제 사용량이 아니라 요청량과 저장량을 추정하기 위한 입력값입니다.
          </p>
        </div>
      </section>
    </>
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
    return "리소스 없음";
  }

  const visibleTypes = uniqueTypes.slice(0, 3).join(", ");

  return uniqueTypes.length > 3 ? `${visibleTypes} 외 ${uniqueTypes.length - 3}개` : visibleTypes;
}

function getResourceDisplayType(resource: ResourceCostEstimate): string {
  return resource.terraformResourceType ?? resource.resourceType;
}

function formatResourceMonthlyAmount(resource: ResourceCostEstimate): string {
  if (resource.supportLevel === "not_estimated") {
    return "산정 미지원";
  }

  return `${formatUsd(resource.monthlyEstimate.amount)} / month`;
}

function getCostSupportLabel(supportLevel: CostEstimateSupportLevel): string {
  switch (supportLevel) {
    case "aws_pricing_api":
      return "AWS Pricing API";
    case "fallback_estimate":
      return "Fallback estimate";
    case "no_direct_cost":
      return "직접 비용 없음";
    case "not_estimated":
      return "산정 미지원";
  }
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

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
