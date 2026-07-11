"use client";

import Link from "next/link";
import { ArrowRight, Cloud, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { getWorkspaceHref } from "../../components/dashboard/api-project-card";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  type DashboardOverviewData,
  loadDashboardOverviewData
} from "./dashboard-overview-data";
import {
  DashboardMetric,
  DashboardOverviewEmpty,
  DashboardOverviewLoading,
  formatDateTime,
  formatMoney,
  getDeploymentStatusLabel,
  getDeploymentTone,
  ProjectOverviewRow
} from "./dashboard-overview-parts";

type DashboardOverviewState =
  | { readonly status: "loading" }
  | { readonly message: string; readonly status: "error" }
  | { readonly data: DashboardOverviewData; readonly status: "empty" | "ready" };

export function DashboardOverview() {
  const [state, setState] = useState<DashboardOverviewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    // 화면이 살아 있는 동안만 비동기 결과를 반영합니다.
    async function loadOverview(): Promise<void> {
      setState({ status: "loading" });

      try {
        const data = await loadDashboardOverviewData();

        if (!cancelled) {
          setState({ data, status: data.projects.length === 0 ? "empty" : "ready" });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            message: getApiErrorMessage(error, "Dashboard 데이터를 불러오지 못했습니다."),
            status: "error"
          });
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <DashboardOverviewLoading />;
  }

  if (state.status === "error") {
    return (
      <section className="dashboardStateBand" aria-label="Dashboard 오류">
        <span>데이터를 불러오지 못했습니다.</span>
        <p role="alert">{state.message}</p>
      </section>
    );
  }

  if (state.status === "empty") {
    return <DashboardOverviewEmpty />;
  }

  const { data } = state;
  const verifiedAwsConnectionCount =
    data.awsConnections?.filter((connection) => connection.status === "verified").length ?? null;
  const fallbackEstimateCount =
    data.costEstimate?.projects.filter((item) => item.costEstimate?.fallbackUsed).length ?? null;
  const latestDeployment = data.recentDeployments[0]?.deployment ?? null;

  return (
    <div className="dashboardOverview">
      <header className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Operations overview</p>
          <h1>작업 현황</h1>
          <p>Practice Architecture와 Deployment 상태를 한곳에서 확인합니다.</p>
        </div>
      </header>

      {data.partialWarnings.length > 0 ? (
        <section className="dashboardPartialWarning" aria-label="일부 데이터 로딩 실패">
          <strong>일부 데이터만 표시하고 있습니다.</strong>
          <ul>
            {data.partialWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="dashboardMetricStrip" aria-label="Dashboard 핵심 지표">
        <DashboardMetric label="프로젝트" value={`${data.projects.length}개`} detail="전체 프로젝트" />
        <DashboardMetric
          label="최근 Deployment"
          value={latestDeployment ? getDeploymentStatusLabel(latestDeployment.status) : "없음"}
          detail={latestDeployment ? formatDateTime(latestDeployment.updatedAt) : "실행 기록 없음"}
          tone={latestDeployment ? getDeploymentTone(latestDeployment.status) : "neutral"}
        />
        <DashboardMetric
          label="월 예상 비용"
          value={formatMoney(data.costEstimate?.totalMonthlyEstimate ?? null)}
          detail={
            fallbackEstimateCount === null
              ? "불러오지 못함"
              : fallbackEstimateCount > 0
                ? `fallback 추정 ${fallbackEstimateCount}개 프로젝트`
                : "지원 가능한 가격 근거 사용"
          }
        />
        <DashboardMetric
          label="연결 상태"
          value={
            verifiedAwsConnectionCount === null
              ? "확인 불가"
              : `AWS ${verifiedAwsConnectionCount} · Git ${data.connectedRepositoryCount ?? 0}`
          }
          detail="검증된 Role과 활성 Repository"
        />
      </section>

      <div className="dashboardOverviewGrid">
        <section className="dashboardSection" aria-labelledby="recent-projects-title">
          <div className="dashboardSectionHeader">
            <div>
              <p>Recently updated</p>
              <h2 id="recent-projects-title">최근 프로젝트</h2>
            </div>
            <Link href="/dashboard/projects">
              전체 보기 <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>
          <div className="dashboardCompactList">
            {data.projects.slice(0, 5).map((project) => (
              <ProjectOverviewRow key={project.id} project={project} />
            ))}
          </div>
        </section>

        <section className="dashboardSection" aria-labelledby="recent-deployments-title">
          <div className="dashboardSectionHeader">
            <div>
              <p>Deployment activity</p>
              <h2 id="recent-deployments-title">최근 Deployment</h2>
            </div>
          </div>
          {data.recentDeployments.length > 0 ? (
            <div className="dashboardCompactList">
              {data.recentDeployments.map(({ deployment, project }) => (
                <Link
                  className="dashboardActivityRow"
                  href={getWorkspaceHref(project)}
                  key={deployment.id}
                >
                  <span className={`dashboardStatusDot dashboardStatusDot${getDeploymentTone(deployment.status)}`} />
                  <div>
                    <strong>{project.name}</strong>
                    <span>{deployment.activeStage ?? "deployment"}</span>
                  </div>
                  <div className="dashboardActivityMeta">
                    <strong>{getDeploymentStatusLabel(deployment.status)}</strong>
                    <span>{formatDateTime(deployment.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="dashboardInlineEmpty">아직 Deployment 기록이 없습니다.</p>
          )}
        </section>
      </div>

      <section className="dashboardConnectionBand" aria-labelledby="connections-title">
        <div>
          <p>Connections</p>
          <h2 id="connections-title">외부 연결</h2>
        </div>
        <div className="dashboardConnectionItem">
          <Cloud aria-hidden="true" size={20} />
          <div>
            <strong>AWS Role</strong>
            <span>
              {verifiedAwsConnectionCount === null
                ? "상태를 확인하지 못했습니다."
                : `검증된 연결 ${verifiedAwsConnectionCount}개`}
            </span>
          </div>
          <Link href="/dashboard/settings">설정</Link>
        </div>
        <div className="dashboardConnectionItem">
          <GitBranch aria-hidden="true" size={20} />
          <div>
            <strong>Source Repository</strong>
            <span>활성 연결 {data.connectedRepositoryCount ?? 0}개</span>
          </div>
          <Link href="/dashboard/projects">프로젝트별 설정</Link>
        </div>
      </section>
    </div>
  );
}
