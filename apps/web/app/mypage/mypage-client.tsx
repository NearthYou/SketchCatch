"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Project, RecentSuccessfulDeploymentProject } from "@sketchcatch/types";
import { ApiProjectCard } from "../../components/dashboard/api-project-card";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { filterProjectsByName } from "../../features/projects/project-search";
import { listProjects, listRecentSuccessfulDeploymentProjects } from "../../features/workspace/api";
import { getApiErrorMessage } from "../../lib/api-client";

type MyPageLoadState = "loading" | "ready" | "error";
type RecentDeploymentItem = RecentSuccessfulDeploymentProject;

export function MyPageClient({ searchQuery }: { readonly searchQuery: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentDeploymentItems, setRecentDeploymentItems] = useState<RecentDeploymentItem[]>([]);
  const [loadState, setLoadState] = useState<MyPageLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProjects(): Promise<void> {
      setLoadState("loading");
      setErrorMessage("");

      try {
        const [nextProjects, nextRecentDeploymentItems] = await Promise.all([
          listProjects(),
          listRecentSuccessfulDeploymentProjects()
        ]);

        if (cancelled) {
          return;
        }

        setProjects(nextProjects);
        setRecentDeploymentItems(nextRecentDeploymentItems);
        setLoadState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(getApiErrorMessage(error, "홈 화면 프로젝트를 불러오지 못했습니다."));
        setLoadState("error");
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  const isSearchActive = searchQuery.trim().length > 0;
  const sortedProjects = useMemo(() => [...projects].sort(compareProjectUpdatedAtDesc), [projects]);
  const sortedDeploymentItems = useMemo(
    () => [...recentDeploymentItems].sort(compareRecentDeploymentDesc),
    [recentDeploymentItems]
  );
  const searchMatchedProjects = useMemo(
    () => filterProjectsByName(sortedProjects, searchQuery),
    [searchQuery, sortedProjects]
  );
  const searchMatchedProjectIds = useMemo(
    () => new Set(searchMatchedProjects.map((project) => project.id)),
    [searchMatchedProjects]
  );
  const displayProjects = isSearchActive ? searchMatchedProjects : sortedProjects;
  const recentModifiedProjects = displayProjects.slice(0, 3);
  const displayDeploymentItems = isSearchActive
    ? sortedDeploymentItems.filter((item) => searchMatchedProjectIds.has(item.project.id))
    : sortedDeploymentItems;
  const visibleDeploymentItems = isSearchActive
    ? displayDeploymentItems
    : displayDeploymentItems.slice(0, 6);
  const deploymentItemCount = isSearchActive
    ? visibleDeploymentItems.length
    : recentDeploymentItems.length;

  if (loadState === "loading") {
    return (
      <section className="dashboardPanel" aria-label="홈 화면 프로젝트 로딩">
        <p className="workspaceStateText">프로젝트 정보를 불러오는 중입니다.</p>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="dashboardPanel" aria-label="홈 화면 프로젝트 오류">
        <p className="dashboardMessage" role="alert">
          {errorMessage}
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="dashboardPanel" aria-labelledby="recent-modified-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Recent modified</p>
            <h2 id="recent-modified-title">최근 수정된 항목</h2>
          </div>
        </div>
        {recentModifiedProjects.length === 0 && isSearchActive ? (
          <ProjectSearchEmptyState />
        ) : recentModifiedProjects.length === 0 ? (
          <ProjectEmptyState />
        ) : (
          <div className="dashboardCardGrid dashboardCardGridThree">
            {recentModifiedProjects.map((project) => (
              <ApiProjectCard
                key={project.id}
                project={project}
                timestampLabel="최근 수정 시간"
                timestampValue={project.updatedAt}
                variant="compact"
              />
            ))}
          </div>
        )}
      </section>

      <section className="dashboardPanel" aria-labelledby="recent-deployments-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Recent deployments</p>
            <h2 id="recent-deployments-title">최근 배포한 항목</h2>
          </div>
          <span className="dashboardCountBadge">{deploymentItemCount}개</span>
        </div>
        {visibleDeploymentItems.length === 0 && isSearchActive ? (
          <ProjectSearchEmptyState />
        ) : visibleDeploymentItems.length === 0 ? (
          <DeploymentEmptyState />
        ) : (
          <div className="dashboardCardGrid dashboardCardGridThree">
            {visibleDeploymentItems.map(({ deployment, deployedAt, project }) => (
              <ApiProjectCard
                key={`${project.id}-${deployment.id}`}
                project={project}
                timestampLabel="최근 배포 시간"
                timestampValue={deployedAt}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ProjectEmptyState() {
  return (
    <div className="projectListEmpty">
      <p>아직 생성한 프로젝트가 없습니다.</p>
      <Link className="dashboardTopbarAction" href="/workspace/new">
        <DashboardIcon name="plus" />
        <span>새 설계 시작</span>
      </Link>
    </div>
  );
}

function ProjectSearchEmptyState() {
  return (
    <div className="projectListEmpty">
      <p>일치하는 프로젝트가 없습니다.</p>
      <Link className="dashboardSecondaryButton" href="/mypage">
        <DashboardIcon name="close" />
        <span>검색 해제</span>
      </Link>
    </div>
  );
}

function DeploymentEmptyState() {
  return (
    <div className="projectListEmpty">
      <p>아직 배포한 프로젝트가 없습니다.</p>
    </div>
  );
}

function compareProjectUpdatedAtDesc(left: Project, right: Project): number {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function compareRecentDeploymentDesc(
  left: RecentDeploymentItem,
  right: RecentDeploymentItem
): number {
  return new Date(right.deployedAt).getTime() - new Date(left.deployedAt).getTime();
}
