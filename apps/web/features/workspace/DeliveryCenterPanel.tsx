"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectDeliveryProfile } from "@sketchcatch/types";
import { ExternalLink, GitBranch, RefreshCw } from "lucide-react";
import { ProjectCicdMonitoringSettingsClient } from "../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client";
import { getApiErrorMessage } from "../../lib/api-client";
import { getProjectDeliveryProfile } from "./api";
import { CicdConsoleScreen } from "./CicdConsoleScreen";
import { ProjectDeploymentTargetEditor } from "./delivery/ProjectDeploymentTargetEditor";
import { getDeliveryRepositoryFreshness } from "./delivery-repository-freshness";
import type { LiveObservationSelection } from "./live-observation";
import styles from "./delivery-center.module.css";

type LoadState = "loading" | "idle" | "error";

export function DeliveryCenterPanel({
  onOpenDirectDeployment,
  onOpenLiveObservation,
  projectId
}: {
  readonly onOpenDirectDeployment?: (scope: "application" | "full_stack" | null) => void;
  readonly onOpenLiveObservation?: (selection?: LiveObservationSelection) => void;
  readonly projectId: string;
}) {
  const [profile, setProfile] = useState<ProjectDeliveryProfile | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setMessage("");
    void getProjectDeliveryProfile(projectId)
      .then((nextProfile) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setLoadState("idle");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState("error");
        setMessage(getApiErrorMessage(error, "Delivery 정보를 불러오지 못했습니다."));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  const repositoryHref = useMemo(() => {
    const params = new URLSearchParams({ projectId });
    if (profile?.repositoryAnalysisTarget) {
      params.set("repositoryUrl", profile.repositoryAnalysisTarget.repositoryUrl);
      params.set("defaultBranch", profile.repositoryAnalysisTarget.branch);
    }
    return `/workspace/repository?${params.toString()}`;
  }, [profile?.repositoryAnalysisTarget, projectId]);
  const freshness = getDeliveryRepositoryFreshness(
    profile?.repositoryAnalysisTarget ?? null,
    profile?.sourceRepository ?? null
  );

  if (!profile && loadState === "loading") {
    return (
      <p className={styles.message} role="status">
        Delivery 정보를 불러오는 중입니다.
      </p>
    );
  }
  if (!profile) {
    return (
      <div className={styles.message} role="alert">
        <p>{message}</p>
        <button onClick={reload} type="button">
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <p>Project Delivery</p>
          <h2>Delivery</h2>
        </div>
        <button aria-label="Delivery 정보 새로고침" onClick={reload} type="button">
          <RefreshCw aria-hidden="true" size={16} />
        </button>
      </header>
      <p className={styles.intro}>
        Repository 연결, 감시 경로, 배포 타깃과 CI/CD 실행 상태를 이 프로젝트에서 관리합니다. 설정을
        저장해도 PR 생성이나 배포가 자동 실행되지는 않습니다.
      </p>

      {loadState === "error" ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}

      <section className={styles.card} aria-labelledby="delivery-github-title">
        <div className={styles.cardHeading}>
          <div>
            <span>1</span>
            <h3 id="delivery-github-title">GitHub 연결</h3>
          </div>
          <strong>{profile.githubInstallations.length > 0 ? "연결됨" : "연결 필요"}</strong>
        </div>
        {profile.githubInstallations.length > 0 ? (
          <ul className={styles.accountList}>
            {profile.githubInstallations.map((installation) => (
              <li key={installation.installationId}>
                <span>{installation.accountLogin}</span>
                {installation.htmlUrl ? (
                  <a href={installation.htmlUrl} rel="noreferrer" target="_blank">
                    Repository 권한 추가 <ExternalLink aria-hidden="true" size={13} />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Link
            className={styles.actionLink}
            href="/dashboard/settings#github-account-settings-title"
          >
            GitHub 연결하기
          </Link>
        )}
      </section>

      <section className={styles.card} aria-labelledby="delivery-repository-title">
        <div className={styles.cardHeading}>
          <div>
            <span>2</span>
            <h3 id="delivery-repository-title">Source Repository</h3>
          </div>
          <strong>{profile.sourceRepository ? "연결됨" : "선택 필요"}</strong>
        </div>
        {profile.repositoryAnalysisTarget ? (
          <dl className={styles.definitionList}>
            <div>
              <dt>Board 분석 출처</dt>
              <dd>
                {profile.repositoryAnalysisTarget.owner}/{profile.repositoryAnalysisTarget.name}
              </dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>{profile.repositoryAnalysisTarget.branch}</dd>
            </div>
            <div>
              <dt>분석 SHA</dt>
              <dd>{shortSha(profile.repositoryAnalysisTarget.repositoryRevision)}</dd>
            </div>
            <div>
              <dt>연결 Repository</dt>
              <dd>
                {profile.sourceRepository
                  ? `${profile.sourceRepository.owner}/${profile.sourceRepository.name}`
                  : "아직 연결되지 않음"}
              </dd>
            </div>
          </dl>
        ) : (
          <p>이 Board에 저장된 Repository 분석 출처가 없습니다.</p>
        )}
        {freshness.status === "changed" ? (
          <div className={styles.warning} role="status">
            <strong>최근 인증 분석이 Board 생성 때의 분석과 다릅니다.</strong>
            <p>
              최근 인증 분석 SHA는 {shortSha(freshness.currentRevision)}입니다. 현재 GitHub head를
              자동 조회한 결과는 아니며, Board도 자동 변경하지 않습니다.
            </p>
          </div>
        ) : null}
        <Link className={styles.actionLink} href={repositoryHref}>
          <GitBranch aria-hidden="true" size={15} />
          {profile.sourceRepository ? "Repository 다시 분석" : "Repository 연결"}
        </Link>
      </section>

      <section className={styles.editorSection} aria-labelledby="delivery-monitoring-title">
        <div className={styles.sectionLabel}>
          <span>3</span>
          <h3 id="delivery-monitoring-title">감시 설정</h3>
        </div>
        <ProjectCicdMonitoringSettingsClient projectId={projectId} onSaved={reload} />
      </section>

      <section className={styles.editorSection} aria-labelledby="delivery-target-title">
        <div className={styles.sectionLabel}>
          <span>4</span>
          <h3 id="delivery-target-title">배포 설정</h3>
        </div>
        <ProjectDeploymentTargetEditor
          initialProfile={profile}
          onSaved={reload}
          projectId={projectId}
        />
      </section>

      <section className={styles.card} aria-labelledby="delivery-readiness-title">
        <div className={styles.cardHeading}>
          <div>
            <span>5</span>
            <h3 id="delivery-readiness-title">Readiness</h3>
          </div>
          <strong>
            {profile.readiness.ready
              ? "준비됨"
              : `${profile.readiness.requiredActionCount}개 확인 필요`}
          </strong>
        </div>
        <ul className={styles.readinessList}>
          {profile.readiness.items.map((item) => (
            <li key={item.key} data-ready={item.status === "ready"}>
              <span>{item.label}</span>
              <strong>{item.status === "ready" ? "완료" : "확인 필요"}</strong>
            </li>
          ))}
        </ul>
        {profile.environmentName ? (
          <p>
            GitHub Environment: <strong>{profile.environmentName}</strong>
          </p>
        ) : null}
      </section>

      <section className={styles.execution} aria-labelledby="delivery-execution-title">
        <div className={styles.sectionLabel}>
          <span>6</span>
          <h3 id="delivery-execution-title">CI/CD 실행과 기록</h3>
        </div>
        <CicdConsoleScreen
          isVisible
          onOpenDirectDeployment={onOpenDirectDeployment}
          onOpenLiveObservation={onOpenLiveObservation}
          projectId={projectId}
        />
      </section>
    </div>
  );
}

function shortSha(value: string): string {
  return `${value.slice(0, 10)}…`;
}
