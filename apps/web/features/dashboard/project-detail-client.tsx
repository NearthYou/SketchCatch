"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import type { Deployment, Project, SourceRepository } from "@sketchcatch/types";
import { getWorkspaceHref } from "../../components/dashboard/api-project-card";
import { getApiErrorMessage } from "../../lib/api-client";
import { getProject, listDeployments, listSourceRepositories } from "../workspace/api";
import {
  formatDateTime,
  getDeploymentStatusLabel,
  getDeploymentTone
} from "./dashboard-overview-parts";

type ProjectDetailState =
  | { readonly status: "loading" }
  | { readonly message: string; readonly status: "error" }
  | {
      readonly deployments: readonly Deployment[];
      readonly project: Project;
      readonly repositories: readonly SourceRepository[];
      readonly status: "ready";
      readonly warning: string | null;
    };

export function ProjectDetailClient({ projectId }: { readonly projectId: string }) {
  const [state, setState] = useState<ProjectDetailState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    // 프로젝트 본체는 필수로, 보조 이력은 부분 실패를 허용해 불러옵니다.
    async function loadProjectDetail(): Promise<void> {
      setState({ status: "loading" });

      try {
        const project = await getProject(projectId);
        const [deploymentsResult, repositoriesResult] = await Promise.allSettled([
          listDeployments(projectId),
          listSourceRepositories(projectId)
        ]);

        if (cancelled) {
          return;
        }

        const warningParts = [
          deploymentsResult.status === "rejected" ? "Deployment 기록" : null,
          repositoriesResult.status === "rejected" ? "Source Repository 연결" : null
        ].filter((value): value is string => value !== null);

        setState({
          deployments:
            deploymentsResult.status === "fulfilled"
              ? [...deploymentsResult.value].sort(
                  (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
                )
              : [],
          project,
          repositories:
            repositoriesResult.status === "fulfilled" ? repositoriesResult.value : [],
          status: "ready",
          warning:
            warningParts.length > 0
              ? `${warningParts.join(", ")}을 불러오지 못했습니다.`
              : null
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            message: getApiErrorMessage(error, "프로젝트 정보를 불러오지 못했습니다."),
            status: "error"
          });
        }
      }
    }

    void loadProjectDetail();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (state.status === "loading") {
    return <p className="dashboardStateBand">프로젝트 정보를 불러오는 중입니다.</p>;
  }

  if (state.status === "error") {
    return (
      <section className="dashboardStateBand">
        <strong>프로젝트를 열지 못했습니다.</strong>
        <p role="alert">{state.message}</p>
      </section>
    );
  }

  const activeRepository = state.repositories.find(
    (repository) => repository.status === "active"
  );

  return (
    <div className="dashboardRouteStack">
      <Link className="dashboardBackLink" href="/dashboard/projects">
        <ArrowLeft aria-hidden="true" size={16} />
        프로젝트 목록
      </Link>
      <header className="dashboardPageHeader dashboardProjectDetailHeader">
        <div>
          <p className="dashboardEyebrow">Project detail</p>
          <h1>{state.project.name}</h1>
          <p>{state.project.description?.trim() || "프로젝트 설명이 없습니다."}</p>
        </div>
        <div className="dashboardHeaderActions">
          <Link
            className="dashboardSecondaryAction"
            href={`/dashboard/projects/${encodeURIComponent(projectId)}/settings`}
          >
            <Settings aria-hidden="true" size={17} />
            Repository 설정
          </Link>
          <Link className="dashboardPrimaryAction" href={getWorkspaceHref(state.project)}>
            <ExternalLink aria-hidden="true" size={17} />
            Architecture Board 열기
          </Link>
        </div>
      </header>

      {state.warning ? (
        <p className="dashboardPartialWarning" role="status">
          {state.warning}
        </p>
      ) : null}

      <dl className="dashboardFactStrip">
        <div>
          <dt>최근 작업</dt>
          <dd>{formatDateTime(state.project.updatedAt)}</dd>
        </div>
        <div>
          <dt>생성</dt>
          <dd>{formatDateTime(state.project.createdAt)}</dd>
        </div>
        <div>
          <dt>Source Repository</dt>
          <dd>{activeRepository ? `${activeRepository.owner}/${activeRepository.name}` : "연결 없음"}</dd>
        </div>
      </dl>

      <section className="dashboardSection" aria-labelledby="project-deployments-title">
        <div className="dashboardSectionHeader">
          <div>
            <p>Deployment history</p>
            <h2 id="project-deployments-title">최근 Deployment</h2>
          </div>
        </div>
        {state.deployments.length > 0 ? (
          <div className="dashboardCompactList">
            {state.deployments.slice(0, 8).map((deployment) => (
              <div className="dashboardActivityRow" key={deployment.id}>
                <span className={`dashboardStatusDot dashboardStatusDot${getDeploymentTone(deployment.status)}`} />
                <div>
                  <strong>{deployment.activeStage ?? "deployment"}</strong>
                  <span>{deployment.failureStage ?? "상태 변경"}</span>
                </div>
                <div className="dashboardActivityMeta">
                  <strong>{getDeploymentStatusLabel(deployment.status)}</strong>
                  <span>{formatDateTime(deployment.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="dashboardInlineEmpty">아직 Deployment 기록이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
