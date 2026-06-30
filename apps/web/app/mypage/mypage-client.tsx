"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Project } from "@sketchcatch/types";
import { ApiProjectCard } from "../../components/dashboard/api-project-card";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { filterProjectsByName } from "../../features/projects/project-search";
import { deleteProject, listProjects } from "../../features/workspace/api";
import { getApiErrorMessage } from "../../lib/api-client";

type MyPageLoadState = "loading" | "ready" | "error";

export function MyPageClient({ searchQuery }: { readonly searchQuery: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadState, setLoadState] = useState<MyPageLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

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

  const isSearchActive = searchQuery.trim().length > 0;
  const sortedProjects = useMemo(() => [...projects].sort(compareProjectUpdatedAtDesc), [projects]);
  const searchMatchedProjects = useMemo(
    () => filterProjectsByName(sortedProjects, searchQuery),
    [searchQuery, sortedProjects]
  );
  const displayProjects = isSearchActive ? searchMatchedProjects : sortedProjects;
  const recentModifiedProjects = displayProjects.slice(0, 3);
  const visibleProjects = isSearchActive ? displayProjects : displayProjects.slice(0, 6);
  const projectCount = isSearchActive ? visibleProjects.length : projects.length;

  async function handleDeleteProject(project: Project): Promise<void> {
    const confirmed = window.confirm(
      `'${project.name}' 프로젝트를 삭제할까요?\n\nSketchCatch의 프로젝트 기록만 삭제되며, 이미 AWS에 생성된 리소스는 삭제되지 않습니다.`
    );

    if (!confirmed) {
      return;
    }

    setDeleteErrorMessage("");
    setDeletingProjectId(project.id);

    try {
      await deleteProject(project.id);
      setProjects((currentProjects) =>
        currentProjects.filter((currentProject) => currentProject.id !== project.id)
      );
    } catch (error) {
      setDeleteErrorMessage(getApiErrorMessage(error, "프로젝트를 삭제하지 못했습니다."));
    } finally {
      setDeletingProjectId(null);
    }
  }

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

      <section className="dashboardPanel" aria-labelledby="my-projects-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">My projects</p>
            <h2 id="my-projects-title">내 프로젝트</h2>
          </div>
          <span className="dashboardCountBadge">{projectCount}개</span>
        </div>
        {deleteErrorMessage ? (
          <p className="dashboardMessage" role="alert">
            {deleteErrorMessage}
          </p>
        ) : null}
        {visibleProjects.length === 0 && isSearchActive ? (
          <ProjectSearchEmptyState />
        ) : visibleProjects.length === 0 ? (
          <ProjectEmptyState />
        ) : (
          <div className="dashboardCardGrid dashboardCardGridThree">
            {visibleProjects.map((project) => (
              <ApiProjectCard
                isDeleting={deletingProjectId === project.id}
                key={project.id}
                onDelete={handleDeleteProject}
                project={project}
                timestampLabel="최근 수정 시간"
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

function compareProjectUpdatedAtDesc(left: Project, right: Project): number {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}
