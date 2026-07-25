"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Project } from "@sketchcatch/types";
import { ArrowUpDown, ChevronRight, Clock3, FolderKanban, RefreshCw, Search } from "lucide-react";
import {
  formatProjectDate,
  getWorkspaceHref
} from "../../components/dashboard/api-project-card";
import { getApiErrorMessage } from "../../lib/api-client";
import { listProjects } from "../workspace/api";
import { filterProjectsByName } from "./project-search";
import { sortProjectsByMode, type ProjectSortMode } from "./project-sort";

type ProjectListState = "loading" | "ready" | "error";

export function DesignProjectsView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<ProjectSortMode>("recent_work");
  const [loadState, setLoadState] = useState<ProjectListState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const visibleProjects = useMemo(() => {
    const sortedProjects = sortProjectsByMode(projects, sortMode);

    return filterProjectsByName(sortedProjects, searchQuery);
  }, [projects, searchQuery, sortMode]);

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
  }, [reloadKey]);

  return (
    <div className="designDashboardStack designProjectsView">
      <section className="designDashboardPanel" aria-labelledby="project-list-title">
        <div className="designDashboardPanelHeader designDashboardPanelHeaderSplit">
          <div>
            <h2 id="project-list-title">내 프로젝트</h2>
            <p>직접 만든 프로젝트를 원하는 기준으로 정렬해 확인합니다.</p>
          </div>
          <label className="designDashboardSearch">
            <Search aria-hidden="true" size={16} />
            <span className="designDashboardSrOnly">프로젝트 검색</span>
            <input
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="프로젝트 검색"
              type="search"
              value={searchQuery}
            />
          </label>
        </div>

        {loadState === "loading" ? (
          <ProjectListStatus message="프로젝트를 불러오는 중입니다." />
        ) : null}

        {loadState === "error" ? (
          <ProjectListStatus
            action={
              <button
                className="designDashboardSecondaryAction"
                onClick={() => setReloadKey((currentKey) => currentKey + 1)}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={15} />
                다시 불러오기
              </button>
            }
            message={errorMessage}
          />
        ) : null}

        {loadState === "ready" && projects.length === 0 ? (
          <ProjectListStatus message="아직 생성한 프로젝트가 없습니다." />
        ) : null}

        {loadState === "ready" && projects.length > 0 && visibleProjects.length === 0 ? (
          <ProjectListStatus message={`“${searchQuery.trim()}”과 일치하는 프로젝트가 없습니다.`} />
        ) : null}

        {loadState === "ready" && visibleProjects.length > 0 ? (
          <>
            <div className="designProjectsResultMeta" aria-live="polite">
              <span>{visibleProjects.length}개 프로젝트</span>
              <label className="designProjectsSort">
                <ArrowUpDown aria-hidden="true" size={15} />
                <span className="designDashboardSrOnly">프로젝트 정렬</span>
                <select
                  aria-label="프로젝트 정렬"
                  onChange={(event) => setSortMode(event.target.value as ProjectSortMode)}
                  value={sortMode}
                >
                  <option value="recent_work">최근 작업 순</option>
                  <option value="recent_created">생성 순</option>
                </select>
              </label>
            </div>
            <div className="designDashboardProjectList designProjectsList">
              {visibleProjects.map((project) => (
                <Link
                  aria-label={`${project.name} 프로젝트 열기`}
                  className="designDashboardProjectRow designProjectsRow"
                  href={getWorkspaceHref(project)}
                  key={project.id}
                >
                  <div className="designProjectsIdentity">
                    <span className="designDashboardIconPlate">
                      <FolderKanban aria-hidden="true" size={17} />
                    </span>
                    <div>
                      <strong>{project.name}</strong>
                      <p>{project.description?.trim() || "프로젝트 설명이 없습니다."}</p>
                    </div>
                  </div>
                  <span className="designProjectsDate">
                    <Clock3 aria-hidden="true" size={15} />
                    최근 작업 {formatProjectDate(project.updatedAt)}
                  </span>
                  <span className="designProjectsDate">생성 {formatProjectDate(project.createdAt)}</span>
                  <span className="designProjectsOpen">
                    열기
                    <ChevronRight aria-hidden="true" size={17} />
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function ProjectListStatus({
  action,
  message
}: {
  readonly action?: ReactNode;
  readonly message: string;
}) {
  return (
    <div className="designProjectsStatus" role="status">
      <p>{message}</p>
      {action}
    </div>
  );
}
