"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse,
  CostEstimatePeriod,
  CostEstimateSupportLevel,
  CostMetricSeries,
  CostOptimizationRecommendation,
  CostProjectEstimate,
  CostProjectEstimateListResponse,
  CostProjectUsage,
  CostResourceUsage,
  CostServiceUsage,
  CostUsageAnalysisRange,
  CostUsageAnalysisResponse,
  CostUsageTrendPoint,
  CostWasteResourceInsight,
  CreateAwsConnectionResponse,
  ResourceCostEstimate
} from "@sketchcatch/types";
import {
  Activity,
  BarChart3,
  Calculator,
  Cloud,
  ExternalLink,
  LineChart,
  Link,
  RefreshCw
} from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import {
  analyzeCostUsageTrendShape,
  createCostUsageLineChart,
  createServiceCostBars,
  sumEstimatedMonthlySavings
} from "../../features/costs/cost-usage-charts";
import {
  COST_USAGE_ALL_PROJECTS_KEY,
  createScopedCostUsageDailyTrend,
  createScopedCostUsageServiceCosts,
  createCostUsageProjectOptions,
  normalizeCostUsageProjectKey,
  selectCostUsageResourceCosts,
  selectCostUsageProject
} from "../../features/costs/cost-usage-project-view";
import {
  formatCostUsageAwsConnectionLabel,
  getVerifiedCostUsageAwsConnections,
  selectPreferredCostUsageAwsConnection
} from "../../features/costs/cost-usage-aws-connections";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  createAwsConnectionSetup,
  getAwsConnectionCloudFormationTemplate,
  listAwsConnections,
  listCostProjectEstimates,
  listCostUsageAnalysis,
  verifyAwsConnectionCreatedRole
} from "../../features/workspace/api";

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
const COST_USAGE_AWS_REGION = "ap-northeast-2";

export function CostsClient() {
  const [activeTab, setActiveTab] = useState<CostTab>("usage");
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
  const [usageProjectKeyInput, setUsageProjectKeyInput] = useState(
    COST_USAGE_ALL_PROJECTS_KEY
  );
  const [appliedUsageProjectKey, setAppliedUsageProjectKey] = useState(
    COST_USAGE_ALL_PROJECTS_KEY
  );
  const [usageData, setUsageData] = useState<CostUsageAnalysisResponse | null>(null);
  const [usageState, setUsageState] = useState<CostPageState>("loading");
  const [usageErrorMessage, setUsageErrorMessage] = useState("");
  const [usageReloadKey, setUsageReloadKey] = useState(0);
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [selectedUsageAwsConnectionId, setSelectedUsageAwsConnectionId] = useState<string | null>(
    null
  );
  const [awsConnectionState, setAwsConnectionState] = useState<CostPageState>("idle");
  const [awsConnectionErrorMessage, setAwsConnectionErrorMessage] = useState("");
  const [awsSetup, setAwsSetup] = useState<CreateAwsConnectionResponse | null>(null);
  const [awsConnectionTemplate, setAwsConnectionTemplate] =
    useState<AwsConnectionCloudFormationTemplateResponse | null>(null);
  const [awsAccountIdInput, setAwsAccountIdInput] = useState("");
  const [awsConnectionActionMessage, setAwsConnectionActionMessage] = useState("");
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
  const verifiedUsageAwsConnections = useMemo(
    () => getVerifiedCostUsageAwsConnections(awsConnections),
    [awsConnections]
  );
  const selectedUsageAwsConnection = useMemo(
    () => selectPreferredCostUsageAwsConnection(awsConnections, selectedUsageAwsConnectionId),
    [awsConnections, selectedUsageAwsConnectionId]
  );

  useEffect(() => {
    if (activeTab !== "estimate") {
      return undefined;
    }

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
          return (
            candidateProjectId !== null &&
            result.projects.some((item) => item.project.id === candidateProjectId)
              ? candidateProjectId
              : result.projects[0]?.project.id ?? null
          );
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
  }, [activeTab, appliedQuery]);

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
          ...(selectedUsageAwsConnection === null
            ? {}
            : {
                awsConnectionId: selectedUsageAwsConnection.id
              }),
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
  }, [
    activeTab,
    appliedUsageRange,
    selectedUsageAwsConnection?.id,
    usageReloadKey
  ]);

  useEffect(() => {
    if (activeTab !== "usage") {
      return undefined;
    }

    let ignore = false;

    async function loadAwsConnectionList(): Promise<void> {
      setAwsConnectionState("loading");
      setAwsConnectionErrorMessage("");

      try {
        const nextConnections = await listAwsConnections();

        if (ignore) {
          return;
        }

        setAwsConnections(nextConnections);
        setSelectedUsageAwsConnectionId((currentConnectionId) =>
          selectPreferredCostUsageAwsConnection(nextConnections, currentConnectionId)?.id ?? null
        );
        setAwsConnectionState("idle");
      } catch (error) {
        if (ignore) {
          return;
        }

        setAwsConnectionState("error");
        setAwsConnectionErrorMessage(
          getApiErrorMessage(error, "AWS 연결 목록을 불러오지 못했습니다.")
        );
      }
    }

    void loadAwsConnectionList();

    return () => {
      ignore = true;
    };
  }, [activeTab]);

  useEffect(() => {
    function handlePopState(): void {
      setSelectedProjectId(readSelectedProjectIdFromLocation());
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    writeSelectedProjectIdToLocation(selectedProjectId);
  }, [selectedProjectId]);

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
    setAppliedUsageProjectKey(usageProjectKeyInput);
  }

  function selectUsageProject(projectKey: string): void {
    setUsageProjectKeyInput(projectKey);
    setAppliedUsageProjectKey(projectKey);
  }

  async function refreshAwsConnections(): Promise<void> {
    setAwsConnectionState("loading");
    setAwsConnectionErrorMessage("");

    try {
      const nextConnections = await listAwsConnections();

      setAwsConnections(nextConnections);
      setSelectedUsageAwsConnectionId((currentConnectionId) =>
        selectPreferredCostUsageAwsConnection(nextConnections, currentConnectionId)?.id ?? null
      );
      setAwsConnectionState("idle");
    } catch (error) {
      setAwsConnectionState("error");
      setAwsConnectionErrorMessage(
        getApiErrorMessage(error, "AWS 연결 목록을 불러오지 못했습니다.")
      );
    }
  }

  async function startUsageAwsSetup(): Promise<void> {
    const launchWindow = openAwsConsolePlaceholder();
    let didLaunchConsole = false;

    setAwsConnectionState("loading");
    setAwsConnectionErrorMessage("");
    setAwsConnectionActionMessage("");

    try {
      const setupResponse = await createAwsConnectionSetup({
        region: COST_USAGE_AWS_REGION
      });
      const templateResponse = await getAwsConnectionCloudFormationTemplate({
        connectionId: setupResponse.awsConnection.id
      });

      setAwsSetup(setupResponse);
      setAwsConnectionTemplate(templateResponse);
      setAwsConnections((currentConnections) => [
        setupResponse.awsConnection,
        ...currentConnections.filter(
          (connection) => connection.id !== setupResponse.awsConnection.id
        )
      ]);
      setAwsAccountIdInput("");
      setAwsConnectionActionMessage(
        "AWS 콘솔에서 Stack 생성이 끝나면 Account ID를 입력해 연결을 검증하세요."
      );
      setAwsConnectionState("idle");

      if (templateResponse.launchStackUrl) {
        openAwsConsoleUrl(templateResponse.launchStackUrl, launchWindow);
        didLaunchConsole = true;
      }
    } catch (error) {
      setAwsConnectionState("error");
      setAwsConnectionErrorMessage(
        getApiErrorMessage(error, "AWS 연결 설정을 시작하지 못했습니다.")
      );
    } finally {
      if (!didLaunchConsole) {
        launchWindow?.close();
      }
    }
  }

  async function openUsageAwsTemplate(): Promise<void> {
    const activeSetupConnection = awsSetup?.awsConnection;

    if (activeSetupConnection === undefined) {
      return;
    }

    const launchWindow = openAwsConsolePlaceholder();
    let didLaunchConsole = false;

    setAwsConnectionState("loading");
    setAwsConnectionErrorMessage("");

    try {
      const templateResponse = await getAwsConnectionCloudFormationTemplate({
        connectionId: activeSetupConnection.id
      });

      setAwsConnectionTemplate(templateResponse);
      setAwsConnectionState("idle");

      if (templateResponse.launchStackUrl) {
        openAwsConsoleUrl(templateResponse.launchStackUrl, launchWindow);
        didLaunchConsole = true;
      }
    } catch (error) {
      setAwsConnectionState("error");
      setAwsConnectionErrorMessage(
        getApiErrorMessage(error, "CloudFormation 템플릿을 불러오지 못했습니다.")
      );
    } finally {
      if (!didLaunchConsole) {
        launchWindow?.close();
      }
    }
  }

  async function verifyUsageAwsConnection(): Promise<void> {
    const activeSetupConnection = awsSetup?.awsConnection;
    const accountId = awsAccountIdInput.trim();

    if (activeSetupConnection === undefined || !/^\d{12}$/.test(accountId)) {
      setAwsConnectionActionMessage("AWS Account ID 12자리를 입력해주세요.");
      return;
    }

    setAwsConnectionState("loading");
    setAwsConnectionErrorMessage("");
    setAwsConnectionActionMessage("");

    try {
      const response = await verifyAwsConnectionCreatedRole({
        accountId,
        connectionId: activeSetupConnection.id
      });

      setAwsConnections((currentConnections) => {
        if (currentConnections.some((connection) => connection.id === response.awsConnection.id)) {
          return currentConnections.map((connection) =>
            connection.id === response.awsConnection.id ? response.awsConnection : connection
          );
        }

        return [response.awsConnection, ...currentConnections];
      });
      setSelectedUsageAwsConnectionId(response.awsConnection.id);
      setAwsSetup(null);
      setAwsConnectionTemplate(null);
      setAwsAccountIdInput(response.awsConnection.accountId ?? "");
      setAwsConnectionActionMessage("AWS 연결이 검증되었습니다. 실제 사용량 분석을 다시 불러옵니다.");
      setAwsConnectionState("idle");
      setUsageReloadKey((currentKey) => currentKey + 1);
    } catch (error) {
      setAwsConnectionState("error");
      setAwsConnectionErrorMessage(
        getApiErrorMessage(error, "AWS 연결 검증 저장에 실패했습니다.")
      );
    }
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
    <div className="designCostPage">
      <div className="designCostViewBar">
        <div className="costTabs" role="tablist" aria-label="비용 관리 보기">
          <button
            aria-selected={activeTab === "estimate"}
            className="costTabButton"
            onClick={() => setActiveTab("estimate")}
            role="tab"
            type="button"
          >
            <Calculator size={16} aria-hidden="true" />
            예상 비용
          </button>
          <button
            aria-selected={activeTab === "usage"}
            className="costTabButton"
            onClick={() => setActiveTab("usage")}
            role="tab"
            type="button"
          >
            <Activity size={16} aria-hidden="true" />
            실제 사용량
          </button>
        </div>
        <p className="designCostViewNote">두 값은 목적이 달라 직접 비교하지 않습니다.</p>
      </div>

      {activeTab === "estimate" ? (
        <>
          <section className="dashboardPanel costOverviewPanel costHeroPanel" aria-labelledby="cost-control-title">
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
                <div className="costSummaryMeta">
                  <span>{selectedCostTotals.selectedProjectCount}개 선택</span>
                  <span>월 환산 {formatUsd(totalMonthlyAmount)}</span>
                  <span>일 평균 약 {formatUsd(dailyAverageAmount)}</span>
                </div>
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
          appliedUsageProjectKey={appliedUsageProjectKey}
          applyUsageRange={applyUsageRange}
          awsAccountIdInput={awsAccountIdInput}
          awsConnectionActionMessage={awsConnectionActionMessage}
          awsConnectionErrorMessage={awsConnectionErrorMessage}
          awsConnectionState={awsConnectionState}
          awsConnectionTemplate={awsConnectionTemplate}
          awsSetup={awsSetup}
          onAwsAccountIdInputChange={setAwsAccountIdInput}
          onOpenAwsTemplate={openUsageAwsTemplate}
          onRefreshAwsConnections={refreshAwsConnections}
          onSelectedAwsConnectionChange={(connectionId) =>
            setSelectedUsageAwsConnectionId(connectionId.length === 0 ? null : connectionId)
          }
          onStartAwsSetup={startUsageAwsSetup}
          onVerifyAwsConnection={verifyUsageAwsConnection}
          refreshUsage={() => setUsageReloadKey((currentKey) => currentKey + 1)}
          selectedAwsConnection={selectedUsageAwsConnection}
          selectedAwsConnectionId={selectedUsageAwsConnection?.id ?? ""}
          selectUsageProject={selectUsageProject}
          setAppliedUsageProjectKey={setAppliedUsageProjectKey}
          setUsageProjectKeyInput={setUsageProjectKeyInput}
          setUsageRangeInput={setUsageRangeInput}
          usageData={usageData}
          usageErrorMessage={usageErrorMessage}
          usageProjectKeyInput={usageProjectKeyInput}
          usageRangeInput={usageRangeInput}
          usageState={usageState}
          verifiedAwsConnections={verifiedUsageAwsConnections}
        />
      )}
    </div>
  );
}

function CostUsageAnalysisTab({
  appliedUsageRange,
  appliedUsageProjectKey,
  applyUsageRange,
  awsAccountIdInput,
  awsConnectionActionMessage,
  awsConnectionErrorMessage,
  awsConnectionState,
  awsConnectionTemplate,
  awsSetup,
  onAwsAccountIdInputChange,
  onOpenAwsTemplate,
  onRefreshAwsConnections,
  onSelectedAwsConnectionChange,
  onStartAwsSetup,
  onVerifyAwsConnection,
  refreshUsage,
  selectedAwsConnection,
  selectedAwsConnectionId,
  selectUsageProject,
  setAppliedUsageProjectKey,
  setUsageProjectKeyInput,
  setUsageRangeInput,
  usageData,
  usageErrorMessage,
  usageProjectKeyInput,
  usageRangeInput,
  usageState,
  verifiedAwsConnections
}: {
  readonly appliedUsageRange: CostUsageAnalysisRange;
  readonly appliedUsageProjectKey: string;
  readonly applyUsageRange: () => void;
  readonly awsAccountIdInput: string;
  readonly awsConnectionActionMessage: string;
  readonly awsConnectionErrorMessage: string;
  readonly awsConnectionState: CostPageState;
  readonly awsConnectionTemplate: AwsConnectionCloudFormationTemplateResponse | null;
  readonly awsSetup: CreateAwsConnectionResponse | null;
  readonly onAwsAccountIdInputChange: (value: string) => void;
  readonly onOpenAwsTemplate: () => void;
  readonly onRefreshAwsConnections: () => void;
  readonly onSelectedAwsConnectionChange: (connectionId: string) => void;
  readonly onStartAwsSetup: () => void;
  readonly onVerifyAwsConnection: () => void;
  readonly refreshUsage: () => void;
  readonly selectedAwsConnection: AwsConnection | null;
  readonly selectedAwsConnectionId: string;
  readonly selectUsageProject: (projectKey: string) => void;
  readonly setAppliedUsageProjectKey: (projectKey: string | ((currentKey: string) => string)) => void;
  readonly setUsageProjectKeyInput: (projectKey: string | ((currentKey: string) => string)) => void;
  readonly setUsageRangeInput: (range: CostUsageAnalysisRange) => void;
  readonly usageData: CostUsageAnalysisResponse | null;
  readonly usageErrorMessage: string;
  readonly usageProjectKeyInput: string;
  readonly usageRangeInput: CostUsageAnalysisRange;
  readonly usageState: CostPageState;
  readonly verifiedAwsConnections: readonly AwsConnection[];
}) {
  const projectCosts = usageData?.projectCosts ?? [];
  const projectOptions = useMemo(
    () => createCostUsageProjectOptions(projectCosts),
    [projectCosts]
  );
  const selectableProjectCosts = useMemo(
    () => projectOptions.map((projectOption) => projectOption.project),
    [projectOptions]
  );
  const selectedUsageProject = useMemo(
    () => selectCostUsageProject(selectableProjectCosts, appliedUsageProjectKey),
    [appliedUsageProjectKey, selectableProjectCosts]
  );
  const scopedWasteResources = useMemo(
    () => getScopedWasteResources(usageData?.wasteResources ?? [], selectedUsageProject),
    [selectedUsageProject, usageData?.wasteResources]
  );
  const scopedRecommendations = useMemo(
    () => getScopedRecommendations(usageData?.recommendations ?? [], selectedUsageProject),
    [selectedUsageProject, usageData?.recommendations]
  );
  const scopedResourceCosts = useMemo(
    () => selectCostUsageResourceCosts(usageData?.resourceCosts ?? [], selectedUsageProject),
    [selectedUsageProject, usageData?.resourceCosts]
  );
  const scopedServiceCosts = useMemo(
    () =>
      createScopedCostUsageServiceCosts({
        resourceCosts: usageData?.resourceCosts ?? [],
        selectedProject: selectedUsageProject,
        serviceCosts: usageData?.serviceCosts ?? [],
        totalCostAmount: usageData?.totalCost.amount ?? 0
      }),
    [
      selectedUsageProject,
      usageData?.resourceCosts,
      usageData?.serviceCosts,
      usageData?.totalCost.amount
    ]
  );
  const serviceBars = useMemo(
    () => createServiceCostBars(scopedServiceCosts),
    [scopedServiceCosts]
  );
  const scopedDailyTrend = useMemo(
    () =>
      createScopedCostUsageDailyTrend({
        dailyTrend: usageData?.dailyTrend ?? [],
        selectedProject: selectedUsageProject,
        totalCostAmount: usageData?.totalCost.amount ?? 0
      }),
    [selectedUsageProject, usageData?.dailyTrend, usageData?.totalCost.amount]
  );
  const lineChart = useMemo(
    () => createCostUsageLineChart(scopedDailyTrend),
    [scopedDailyTrend]
  );
  const trendInsight = useMemo(
    () => analyzeCostUsageTrendShape(scopedDailyTrend),
    [scopedDailyTrend]
  );
  const selectedUsageAmount = selectedUsageProject?.amount ?? usageData?.totalCost.amount ?? 0;
  const selectedUsageLabel = selectedUsageProject?.projectName ?? "전체 프로젝트";
  const reviewableMonthlySavings = sumEstimatedMonthlySavings(scopedRecommendations);

  useEffect(() => {
    setUsageProjectKeyInput((currentKey) =>
      normalizeCostUsageProjectKey(selectableProjectCosts, currentKey)
    );
    setAppliedUsageProjectKey((currentKey) =>
      normalizeCostUsageProjectKey(selectableProjectCosts, currentKey)
    );
  }, [selectableProjectCosts, setAppliedUsageProjectKey, setUsageProjectKeyInput]);

  return (
    <>
      <section className="dashboardPanel costOverviewPanel costHeroPanel costUsageHeroPanel" aria-labelledby="cost-usage-control-title">
        <div className="costOverviewSettings">
          <div className="costPanelTitle">
            <p className="dashboardPanelKicker">Actual usage</p>
            <h2 id="cost-usage-control-title">사용량 분석</h2>
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
            <label className="costField costUsageProjectSelect">
              <span>비용 범위</span>
              <select
                onChange={(event) => setUsageProjectKeyInput(event.target.value)}
                value={usageProjectKeyInput}
              >
                <option value={COST_USAGE_ALL_PROJECTS_KEY}>전체 프로젝트</option>
                {projectOptions.map((project) => (
                  <option key={project.key} value={project.key}>
                    {project.label} · {formatUsd(project.amount)}
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
            <h2 id="cost-usage-summary-title">
              {selectedUsageProject === null ? "현재 사용 비용" : "프로젝트 사용 비용"}
            </h2>
          </div>
          <div className="costSummaryAmount">
            <span>{selectedUsageLabel}</span>
            <strong>{formatUsd(selectedUsageAmount)}</strong>
            <div className="costSummaryMeta">
              <span>{getUsageRangeLabel(appliedUsageRange)}</span>
              <span>
                {selectedUsageProject === null
                  ? formatDateRange(usageData?.startDate ?? "-", usageData?.endDate ?? "-")
                  : `${formatPercent(selectedUsageProject.percentage)} · ${getProjectUsageSourceLabel(selectedUsageProject)}`}
              </span>
            </div>
          </div>
        </div>
      </section>

      <CostUsageAwsConnectionPanel
        awsAccountIdInput={awsAccountIdInput}
        awsConnectionActionMessage={awsConnectionActionMessage}
        awsConnectionErrorMessage={awsConnectionErrorMessage}
        awsConnectionState={awsConnectionState}
        awsConnectionTemplate={awsConnectionTemplate}
        awsSetup={awsSetup}
        onAwsAccountIdInputChange={onAwsAccountIdInputChange}
        onOpenAwsTemplate={onOpenAwsTemplate}
        onRefreshAwsConnections={onRefreshAwsConnections}
        onSelectedAwsConnectionChange={onSelectedAwsConnectionChange}
        onStartAwsSetup={onStartAwsSetup}
        onVerifyAwsConnection={onVerifyAwsConnection}
        selectedAwsConnection={selectedAwsConnection}
        selectedAwsConnectionId={selectedAwsConnectionId}
        verifiedAwsConnections={verifiedAwsConnections}
      />

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
                {selectedUsageProject === null
                  ? formatDateRange(usageData.startDate, usageData.endDate)
                  : selectedUsageProject.projectName}
              </span>
            </div>
            <div className="costUsageMetricGrid">
              <CostMetricCard
                icon={<LineChart size={18} aria-hidden="true" />}
                label={selectedUsageProject === null ? "총 실제 비용" : "프로젝트 실제 비용"}
                value={formatUsd(selectedUsageAmount)}
              />
              <CostMetricCard
                icon={<Activity size={18} aria-hidden="true" />}
                label={selectedUsageProject === null ? "분석 기간" : "전체 대비"}
                value={
                  selectedUsageProject === null
                    ? getUsageRangeLabel(appliedUsageRange)
                    : formatPercent(selectedUsageProject.percentage)
                }
              />
              <CostMetricCard
                icon={<BarChart3 size={18} aria-hidden="true" />}
                label={selectedUsageProject === null ? "프로젝트 수" : "산정 리소스"}
                value={
                  selectedUsageProject === null
                    ? `${usageData.projectCosts.length}개`
                    : `${selectedUsageProject.resourceCount}개`
                }
              />
              <CostMetricCard
                icon={<Calculator size={18} aria-hidden="true" />}
                label="검토 가능한 절감액"
                value={formatUsd(reviewableMonthlySavings)}
              />
            </div>
          </section>

          <div className="designCostChartGrid">
            <section className="dashboardPanel costChartPanel" aria-labelledby="cost-daily-chart-title">
              <div className="dashboardPanelHeader">
                <div>
                  <p className="dashboardPanelKicker">Daily trend</p>
                  <h2 id="cost-daily-chart-title">일별 비용 추세</h2>
                </div>
                <span className="dashboardCountBadge">
                  {selectedUsageProject === null ? `${usageData.dailyTrend.length}일` : "프로젝트 추세"}
                </span>
              </div>
              {scopedDailyTrend.length === 0 ? (
                <CostStatus message="표시할 일별 비용 데이터가 없습니다." />
              ) : (
                <>
                  <DailyCostLineChart chart={lineChart} dailyTrend={scopedDailyTrend} />
                  <CostTrendInsightCard insight={trendInsight} selectedProject={selectedUsageProject} />
                </>
              )}
            </section>

            <section className="dashboardPanel costChartPanel" aria-labelledby="cost-service-chart-title">
              <div className="dashboardPanelHeader">
                <div>
                  <p className="dashboardPanelKicker">Service costs</p>
                  <h2 id="cost-service-chart-title">서비스별 비용</h2>
                </div>
                <span className="dashboardCountBadge">
                  {`${scopedServiceCosts.length}개`}
                </span>
              </div>
              <ServiceCostBars bars={serviceBars} serviceCosts={scopedServiceCosts} />
            </section>
          </div>

          <section className="dashboardPanel costProjectPanel" aria-labelledby="cost-usage-project-title">
            <div className="dashboardPanelHeader">
              <div>
                <p className="dashboardPanelKicker">Project usage</p>
                <h2 id="cost-usage-project-title">프로젝트별 실제 비용</h2>
              </div>
              <span className="dashboardCountBadge">{projectOptions.length}개</span>
            </div>
            <ProjectUsageTable
              onSelectedProjectChange={selectUsageProject}
              projectCosts={selectableProjectCosts}
              selectedProjectKey={appliedUsageProjectKey}
            />
          </section>

          {selectedUsageProject === null ? (
            <section className="dashboardPanel costProjectPanel">
              <CostStatus message="프로젝트를 선택하면 리소스별 비용, 낭비 리소스, 절감 추천을 확인할 수 있습니다." />
            </section>
          ) : (
            <>
              <section className="dashboardPanel costProjectPanel" aria-labelledby="cost-resource-usage-title">
                <div className="dashboardPanelHeader">
                  <div>
                    <p className="dashboardPanelKicker">Resource billing</p>
                    <h2 id="cost-resource-usage-title">리소스별 비용</h2>
                  </div>
                  <span className="dashboardCountBadge">{scopedResourceCosts.length}개</span>
                </div>
                <ResourceUsageTable
                  resourceCosts={scopedResourceCosts}
                  selectedProject={selectedUsageProject}
                />
              </section>

              <section className="dashboardPanel costRecommendationPanel" aria-labelledby="cost-waste-title">
                <div className="dashboardPanelHeader">
                  <div>
                    <p className="dashboardPanelKicker">Waste detection</p>
                    <h2 id="cost-waste-title">낭비 리소스</h2>
                  </div>
                  <span className="dashboardCountBadge">{scopedWasteResources.length}개</span>
                </div>
                <WasteResourceList metricSeries={usageData.metricSeries} wasteResources={scopedWasteResources} />
              </section>

              <section className="dashboardPanel costRecommendationPanel" aria-labelledby="cost-recommendation-title">
                <div className="dashboardPanelHeader">
                  <div>
                    <p className="dashboardPanelKicker">Optimization</p>
                    <h2 id="cost-recommendation-title">절감 추천</h2>
                  </div>
                  <span className="dashboardCountBadge">{scopedRecommendations.length}개</span>
                </div>
                <RecommendationList recommendations={scopedRecommendations} />
              </section>
            </>
          )}
        </>
      ) : null}
    </>
  );
}

function CostUsageAwsConnectionPanel({
  awsAccountIdInput,
  awsConnectionActionMessage,
  awsConnectionErrorMessage,
  awsConnectionState,
  awsConnectionTemplate,
  awsSetup,
  onAwsAccountIdInputChange,
  onOpenAwsTemplate,
  onRefreshAwsConnections,
  onSelectedAwsConnectionChange,
  onStartAwsSetup,
  onVerifyAwsConnection,
  selectedAwsConnection,
  selectedAwsConnectionId,
  verifiedAwsConnections
}: {
  readonly awsAccountIdInput: string;
  readonly awsConnectionActionMessage: string;
  readonly awsConnectionErrorMessage: string;
  readonly awsConnectionState: CostPageState;
  readonly awsConnectionTemplate: AwsConnectionCloudFormationTemplateResponse | null;
  readonly awsSetup: CreateAwsConnectionResponse | null;
  readonly onAwsAccountIdInputChange: (value: string) => void;
  readonly onOpenAwsTemplate: () => void;
  readonly onRefreshAwsConnections: () => void;
  readonly onSelectedAwsConnectionChange: (connectionId: string) => void;
  readonly onStartAwsSetup: () => void;
  readonly onVerifyAwsConnection: () => void;
  readonly selectedAwsConnection: AwsConnection | null;
  readonly selectedAwsConnectionId: string;
  readonly verifiedAwsConnections: readonly AwsConnection[];
}) {
  const isBusy = awsConnectionState === "loading";
  const hasVerifiedConnections = verifiedAwsConnections.length > 0;
  const setupConnection = awsSetup?.awsConnection ?? null;
  const accountIdIsValid = /^\d{12}$/.test(awsAccountIdInput.trim());

  return (
    <section
      className={
        selectedAwsConnection === null
          ? "costAwsConnectionPanel"
          : "costAwsConnectionPanel isVerified"
      }
      aria-labelledby="cost-aws-connection-title"
    >
      <div className="costAwsConnectionHeader">
        <span className="costAwsConnectionIcon">
          <Cloud size={18} aria-hidden="true" />
        </span>
        <div>
          <h3 id="cost-aws-connection-title">AWS 계정 연결</h3>
          <p>검증된 연결을 선택하면 Cost Explorer와 CloudWatch 기준으로 실제 비용을 조회합니다.</p>
        </div>
      </div>

      <div className="costAwsConnectionControls">
        <label className="costField costAwsConnectionSelect">
          <span>조회 계정</span>
          <select
            disabled={!hasVerifiedConnections || isBusy}
            onChange={(event) => onSelectedAwsConnectionChange(event.target.value)}
            value={selectedAwsConnectionId}
          >
            <option value="">검증된 AWS 연결 없음</option>
            {verifiedAwsConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {formatCostUsageAwsConnectionLabel(connection)}
              </option>
            ))}
          </select>
        </label>
        <div className="costAwsConnectionActions">
          <button
            className="dashboardSecondaryButton"
            disabled={isBusy}
            onClick={() => void onRefreshAwsConnections()}
            type="button"
          >
            <RefreshCw size={14} aria-hidden="true" />
            새로고침
          </button>
          <button
            className="dashboardSecondaryButton"
            disabled={isBusy}
            onClick={() => void onStartAwsSetup()}
            type="button"
          >
            <Link size={14} aria-hidden="true" />
            AWS 연결 시작
          </button>
        </div>
      </div>

      {selectedAwsConnection !== null ? (
        <dl className="costAwsConnectionInfo">
          <div>
            <dt>Account ID</dt>
            <dd>{selectedAwsConnection.accountId ?? "-"}</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{selectedAwsConnection.region}</dd>
          </div>
          <div>
            <dt>Verified</dt>
            <dd>{formatAwsConnectionDate(selectedAwsConnection.lastVerifiedAt)}</dd>
          </div>
        </dl>
      ) : null}

      {awsConnectionState === "loading" ? <p className="costAwsConnectionNote">AWS 연결을 처리하는 중입니다.</p> : null}
      {awsConnectionState === "error" && awsConnectionErrorMessage.length > 0 ? (
        <p className="costErrorMessage" role="alert">
          {awsConnectionErrorMessage}
        </p>
      ) : null}
      {awsConnectionActionMessage.length > 0 ? (
        <p className="costAwsConnectionNote">{awsConnectionActionMessage}</p>
      ) : null}

      {setupConnection !== null ? (
        <div className="costAwsSetupPanel">
          <div className="costAwsSetupHeader">
            <div>
              <strong>CloudFormation Stack 생성 후 검증</strong>
              <p>새 탭에서 Stack을 생성한 뒤 AWS Account ID 12자리를 입력하세요.</p>
            </div>
            <button
              className="dashboardSecondaryButton"
              disabled={isBusy}
              onClick={() => void onOpenAwsTemplate()}
              type="button"
            >
              <ExternalLink size={14} aria-hidden="true" />
              AWS 콘솔 열기
            </button>
          </div>

          <dl className="costAwsSetupMeta">
            <div>
              <dt>External ID</dt>
              <dd>{setupConnection.externalId}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{awsConnectionTemplate?.roleName ?? awsSetup?.roleSetup.roleName ?? "-"}</dd>
            </div>
          </dl>

          <div className="costAwsVerifyRow">
            <label className="costField">
              <span>AWS Account ID</span>
              <input
                inputMode="numeric"
                maxLength={12}
                onChange={(event) => onAwsAccountIdInputChange(event.target.value)}
                placeholder="123456789012"
                value={awsAccountIdInput}
              />
            </label>
            <button
              className="primaryButton costAwsVerifyButton"
              disabled={!accountIdIsValid || isBusy}
              onClick={() => void onVerifyAwsConnection()}
              type="button"
            >
              검증
            </button>
          </div>

          {awsConnectionTemplate?.manualTemplateFallbackAvailable ? (
            <details className="costAwsSetupFallback">
              <summary>CloudFormation 템플릿 직접 보기</summary>
              <textarea
                className="costAwsTemplateArea"
                readOnly
                value={awsConnectionTemplate.templateBody}
              />
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
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
  const middleAmount = chart.maxAmount / 2;

  return (
    <div className="costLineChart" aria-label="일별 비용 추세 그래프">
      <div className="costLineChartPlot">
        <div className="costLineChartYAxis" aria-hidden="true">
          <span>{formatUsd(chart.maxAmount)}</span>
          <span>{formatUsd(middleAmount)}</span>
          <span>{formatUsd(0)}</span>
        </div>
        <svg className="costLineChartSvg" preserveAspectRatio="none" viewBox="0 0 640 180">
          <path
            className="costLineChartGrid"
            d="M 0 0 L 640 0 M 0 45 L 640 45 M 0 90 L 640 90 M 0 135 L 640 135 M 0 180 L 640 180"
          />
          <path className="costLineChartPath" d={chart.path} />
          {chart.points.map((point) => (
            <circle cx={point.x} cy={point.y} key={`${point.date}-${point.amount}`} r="4" />
          ))}
        </svg>
      </div>
      <div className="costLineChartMeta">
        <span>{dailyTrend[0]?.date ?? "-"}</span>
        <strong>최고 {formatUsd(chart.maxAmount)}</strong>
        <span>{dailyTrend[dailyTrend.length - 1]?.date ?? "-"}</span>
      </div>
    </div>
  );
}

function CostTrendInsightCard({
  insight,
  selectedProject
}: {
  readonly insight: ReturnType<typeof analyzeCostUsageTrendShape>;
  readonly selectedProject: CostProjectUsage | null;
}) {
  return (
    <div className={`costTrendInsight costTrendInsight-${insight.severity}`}>
      <strong>{insight.title}</strong>
      <span>{insight.message}</span>
      {selectedProject === null ? null : (
        <small>
          프로젝트별 일별 Cost Explorer 태그 데이터가 없으면 전체 계정 추세를 프로젝트 비용 비중으로
          환산합니다.
        </small>
      )}
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
      <div className="costServiceStackedBar" aria-label="서비스별 비용 비중">
        {serviceCosts.map((service, index) => (
          <span
            aria-label={`${service.service} ${formatPercent(service.percentage)}`}
            className={`costServiceStackedSegment costServiceStackedSegment-${index % 6}`}
            key={service.service}
            style={{ width: `${Math.max(service.percentage, 0.8)}%` }}
            title={`${service.service} ${formatPercent(service.percentage)}`}
          />
        ))}
      </div>
      {bars.map((bar, index) => (
        <div className="costServiceBarRow" key={bar.label}>
          <div className="costServiceBarMeta">
            <div className="costServiceBarLabel">
              <span
                aria-hidden="true"
                className={`costServiceColorSwatch costServiceStackedSegment-${index % 6}`}
              />
              <span className="costServiceBarName">{bar.label}</span>
            </div>
            <strong>{formatUsd(bar.amount)}</strong>
          </div>
          <small>{formatPercent(bar.percentage)}</small>
        </div>
      ))}
    </div>
  );
}

function ResourceUsageTable({
  resourceCosts,
  selectedProject
}: {
  readonly resourceCosts: readonly CostResourceUsage[];
  readonly selectedProject: CostProjectUsage | null;
}) {
  if (resourceCosts.length === 0) {
    return (
      <CostStatus
        message={
          selectedProject === null
            ? "표시할 배포 리소스별 비용 데이터가 없습니다."
            : "선택한 프로젝트의 배포 리소스별 비용 데이터가 없습니다."
        }
      />
    );
  }

  return (
    <div className="dashboardTable costResourceUsageTable">
      <div className="dashboardTableHeader">
        <span>리소스</span>
        <span>서비스</span>
        <span>비용</span>
        <span>근거</span>
      </div>
      {resourceCosts.map((resource) => (
        <div className="dashboardTableRow" key={resource.id}>
          <strong>
            {resource.resourceName}
            <small>{resource.terraformAddress}</small>
          </strong>
          <span>{resource.service}</span>
          <span>{formatUsd(resource.amount)}</span>
          <span>{getResourceUsageSourceLabel(resource.source)}</span>
        </div>
      ))}
    </div>
  );
}

function ProjectUsageTable({
  onSelectedProjectChange,
  projectCosts,
  selectedProjectKey
}: {
  readonly onSelectedProjectChange: (projectKey: string) => void;
  readonly projectCosts: readonly CostProjectUsage[];
  readonly selectedProjectKey: string;
}) {
  const projectOptions = createCostUsageProjectOptions(projectCosts);

  if (projectCosts.length === 0) {
    return <CostStatus message="표시할 프로젝트별 비용 데이터가 없습니다." />;
  }

  return (
    <div className="dashboardTable costUsageProjectTable">
      <div className="dashboardTableHeader">
        <span>프로젝트</span>
        <span>비용</span>
        <span>비중</span>
      </div>
      {projectOptions.map((option) => (
        <button
          aria-pressed={selectedProjectKey === option.key}
          className="dashboardTableRow costUsageProjectRow"
          key={option.key}
          onClick={() => onSelectedProjectChange(option.key)}
          type="button"
        >
          <strong>{option.label}</strong>
          <span>{formatUsd(option.amount)}</span>
          <span>{formatPercent(option.percentage)}</span>
        </button>
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

function openAwsConsolePlaceholder(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }

  const launchWindow = window.open("", "_blank");

  if (launchWindow === null) {
    return null;
  }

  launchWindow.opener = null;
  launchWindow.document.title = "SketchCatch AWS 연결 준비";
  launchWindow.document.body.style.fontFamily = "system-ui, sans-serif";
  launchWindow.document.body.style.padding = "24px";
  launchWindow.document.body.textContent = "AWS 콘솔 연결을 준비하는 중입니다.";

  return launchWindow;
}

function openAwsConsoleUrl(url: string, targetWindow: Window | null): void {
  if (targetWindow !== null && !targetWindow.closed) {
    targetWindow.location.href = url;
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function formatAwsConnectionDate(value: string | null): string {
  if (value === null) {
    return "-";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsedDate);
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

function getResourceUsageSourceLabel(source: CostResourceUsage["source"]): string {
  switch (source) {
    case "cost_explorer_resource":
      return "리소스 실제 청구";
    case "deployed_resource_estimate":
      return "배포 리소스 배분";
    case "sample":
      return "샘플";
  }
}

function getScopedWasteResources(
  wasteResources: readonly CostWasteResourceInsight[],
  selectedProject: CostProjectUsage | null
): readonly CostWasteResourceInsight[] {
  if (selectedProject === null) {
    return wasteResources;
  }

  if (selectedProject.projectId === null) {
    return [];
  }

  return wasteResources.filter((resource) => resource.projectId === selectedProject.projectId);
}

function getScopedRecommendations(
  recommendations: readonly CostOptimizationRecommendation[],
  selectedProject: CostProjectUsage | null
): readonly CostOptimizationRecommendation[] {
  if (selectedProject === null) {
    return recommendations;
  }

  if (selectedProject.projectId === null) {
    return [];
  }

  return recommendations.filter(
    (recommendation) => recommendation.projectId === selectedProject.projectId
  );
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
