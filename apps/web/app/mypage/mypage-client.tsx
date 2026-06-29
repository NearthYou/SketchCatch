"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Project } from "@sketchcatch/types";
import { ApiProjectCard } from "../../components/dashboard/api-project-card";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { listProjects } from "../../features/workspace/api";
import { getApiErrorMessage } from "../../lib/api-client";

type MyPageLoadState = "loading" | "ready" | "error";

export function MyPageClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadState, setLoadState] = useState<MyPageLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProjects(): Promise<void> {
      setLoadState("loading");
      setErrorMessage("");

      try {
        const nextProjects = await listProjects();

        if (cancelled) {
          return;
        }

        setProjects(nextProjects);
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

  const recentModifiedProjects = useMemo(
    () => [...projects].sort(compareProjectCreatedAtDesc).slice(0, 3),
    [projects]
  );
  const visibleProjects = useMemo(
    () => [...projects].sort(compareProjectUpdatedAtDesc).slice(0, 6),
    [projects]
  );

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
      <div className="dashboardStatGrid dashboardStatGridCompact" aria-label="홈 요약">
        <article>
          <DashboardIcon name="folder" />
          <span>전체 프로젝트</span>
          <strong>{projects.length}</strong>
        </article>
        <article>
          <DashboardIcon name="clock" />
          <span>최근 수정</span>
          <strong>{recentModifiedProjects.length}</strong>
        </article>
        <article>
          <DashboardIcon name="check" />
          <span>DB 저장</span>
          <strong>ON</strong>
        </article>
      </div>

      <section className="dashboardPanel" aria-labelledby="recent-modified-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Recent modified</p>
            <h2 id="recent-modified-title">최근 수정된 항목</h2>
          </div>
          <span className="dashboardCountBadge">최대 3개</span>
        </div>
        {recentModifiedProjects.length === 0 ? (
          <ProjectEmptyState />
        ) : (
          <div className="dashboardCardGrid dashboardCardGridThree">
            {recentModifiedProjects.map((project) => (
              <ApiProjectCard
                key={project.id}
                project={project}
                timestampLabel="생성"
                timestampValue={project.createdAt}
                variant="compact"
              />
            ))}
          </div>
        )}
      </section>

      <section className="dashboardPanel" aria-labelledby="my-projects-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">My projects</p>
            <h2 id="my-projects-title">내 프로젝트</h2>
          </div>
          <span className="dashboardCountBadge">{projects.length}개</span>
        </div>
        {visibleProjects.length === 0 ? (
          <ProjectEmptyState />
        ) : (
          <div className="dashboardCardGrid">
            {visibleProjects.map((project) => (
              <ApiProjectCard
                key={project.id}
                project={project}
                timestampLabel="수정"
                timestampValue={project.updatedAt}
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

function compareProjectCreatedAtDesc(left: Project, right: Project): number {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function compareProjectUpdatedAtDesc(left: Project, right: Project): number {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}
