"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Project } from "@sketchcatch/types";
import { ApiProjectCard } from "../../components/dashboard/api-project-card";
import { getApiErrorMessage } from "../../lib/api-client";
import { listProjects } from "../../features/workspace/api";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";

type ProjectsLoadState = "loading" | "ready" | "error";

export function ProjectsClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadState, setLoadState] = useState<ProjectsLoadState>("loading");
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

        setErrorMessage(getApiErrorMessage(error, "프로젝트 목록을 불러오지 못했습니다."));
        setLoadState("error");
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadState === "loading") {
    return (
      <section className="dashboardPanel" aria-label="프로젝트 목록 로딩">
        <p className="workspaceStateText">프로젝트 목록을 불러오는 중입니다.</p>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="dashboardPanel" aria-label="프로젝트 목록 오류">
        <p className="dashboardMessage" role="alert">
          {errorMessage}
        </p>
      </section>
    );
  }

  return (
    <section className="dashboardPanel" aria-labelledby="all-projects-title">
      <div className="dashboardPanelHeader">
        <div>
          <p className="dashboardPanelKicker">All projects</p>
          <h2 id="all-projects-title">내 프로젝트 전부</h2>
        </div>
        <span className="dashboardCountBadge">{projects.length}개</span>
      </div>

      {projects.length === 0 ? (
        <div className="projectListEmpty">
          <p>아직 생성한 프로젝트가 없습니다.</p>
          <Link className="dashboardTopbarAction" href="/workspace/new">
            <DashboardIcon name="plus" />
            <span>새 설계 시작</span>
          </Link>
        </div>
      ) : (
        <div className="dashboardCardGrid">
          {projects.map((project) => (
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
  );
}
