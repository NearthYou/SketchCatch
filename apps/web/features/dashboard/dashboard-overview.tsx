"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { getWorkspaceHref } from "../../components/dashboard/api-project-card";
import { ProductState } from "../../components/ui/ProductState";
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

// 프로젝트, 비용, 연결, 배포 상태를 한 번에 모아 Dashboard 행동으로 연결합니다.
export function DashboardOverview() {
  const [state, setState] = useState<DashboardOverviewState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

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
  }, [reloadCount]);

  if (state.status === "loading") {
    return <DashboardOverviewLoading />;
  }

  if (state.status === "error") {
    return (
      <ProductState
        action={
          <button
            className="dashboardSecondaryButton"
            onClick={() => setReloadCount((count) => count + 1)}
            type="button"
          >
            다시 시도
          </button>
        }
        description={state.message}
        kind="error"
        title="Dashboard를 불러오지 못했습니다"
      />
    );
  }

  if (state.status === "empty") {
    return <DashboardOverviewEmpty />;
  }

  const { data } = state;
  const verifiedAwsConnectionCount =
    data.awsConnections?.filter((connection) => connection.status === "verified").length ?? null;
  const latestDeploymentItem = data.recentDeployments[0] ?? null;
  const latestDeployment = latestDeploymentItem?.deployment ?? null;

  return (
    <div className="dashboardOverview">
      <header className="dashboardPageHeader dashboardPageHeaderCompact">
        <div>
          <h1>작업 현황</h1>
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
        <DashboardMetric
          href="/dashboard/projects"
          label="프로젝트"
          value={`${data.projects.length}개`}
        />
        <DashboardMetric
          label="최근 Deployment"
          value={latestDeployment ? getDeploymentStatusLabel(latestDeployment.status) : "없음"}
          detail={latestDeployment ? formatDateTime(latestDeployment.updatedAt) : "실행 기록 없음"}
          href={latestDeploymentItem ? getWorkspaceHref(latestDeploymentItem.project) : undefined}
          tone={latestDeployment ? getDeploymentTone(latestDeployment.status) : "neutral"}
        />
        <DashboardMetric
          label="월 예상 비용"
          value={formatMoney(data.costEstimate?.totalMonthlyEstimate ?? null)}
          href="/dashboard/costs"
        />
        <DashboardMetric
          label="연결 상태"
          value={
            verifiedAwsConnectionCount === null
              ? "확인 불가"
              : `AWS ${verifiedAwsConnectionCount} · Git ${data.connectedRepositoryCount ?? 0}`
          }
          href="/dashboard/settings"
        />
      </section>

      <div className="dashboardOverviewGrid">
        <section className="dashboardSection" aria-labelledby="recent-projects-title">
          <div className="dashboardSectionHeader">
            <div>
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
    </div>
  );
}
