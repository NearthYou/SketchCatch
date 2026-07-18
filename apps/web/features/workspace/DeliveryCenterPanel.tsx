"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ProjectDeliveryProfile } from "@sketchcatch/types";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  RefreshCw,
  Settings2,
  Workflow
} from "lucide-react";
import { ProjectCicdMonitoringSettingsClient } from "../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client";
import { getApiErrorMessage } from "../../lib/api-client";
import { getProjectDeliveryProfile } from "./api";
import { CicdConsoleScreen } from "./CicdConsoleScreen";
import { createGitCicdReadinessNavigation } from "./cicd-handoff";
import { ProjectDeploymentTargetEditor } from "./delivery/ProjectDeploymentTargetEditor";
import { getDeliveryRepositoryFreshness } from "./delivery-repository-freshness";
import type { LiveObservationSelection } from "./live-observation";
import styles from "./delivery-center.module.css";

type LoadState = "loading" | "idle" | "error";

export function DeliveryCenterPanel({
  onOpenDirectDeployment,
  onOpenLiveObservation,
  projectId,
  readinessRefreshRequestId = 0
}: {
  readonly onOpenDirectDeployment?: (scope: "application" | "full_stack" | null) => void;
  readonly onOpenLiveObservation?: (selection?: LiveObservationSelection) => void;
  readonly projectId: string;
  readonly readinessRefreshRequestId?: number | undefined;
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
  }, [projectId, readinessRefreshRequestId, reloadKey]);

  const repositoryHref =
    createGitCicdReadinessNavigation({
      projectId,
      readinessAction: "select_repository"
    }).href ?? `/dashboard/projects/${encodeURIComponent(projectId)}/repository`;
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
        <div className={styles.titleBlock}>
          <span className={styles.titleIcon} aria-hidden="true">
            <Workflow size={18} />
          </span>
          <div>
            <p>Project Delivery</p>
            <h2>CI/CD Delivery</h2>
            <span>Repository 연결부터 배포 준비와 Pipeline 실행까지 한곳에서 관리합니다.</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <a
            aria-label={`${profile.readiness.ready ? "배포 준비 완료" : `${profile.readiness.requiredActionCount}개 확인 필요`} — 배포 PR 준비로 이동`}
            className={styles.overallStatus}
            data-ready={profile.readiness.ready}
            href="#cicd-pr-readiness"
          >
            {profile.readiness.ready ? (
              <CheckCircle2 aria-hidden="true" size={15} />
            ) : (
              <AlertCircle aria-hidden="true" size={15} />
            )}
            {profile.readiness.ready
              ? "배포 준비 완료"
              : `${profile.readiness.requiredActionCount}개 확인 필요`}
          </a>
          <button aria-label="Delivery 정보 새로고침" onClick={reload} type="button">
            <RefreshCw aria-hidden="true" size={16} />
          </button>
        </div>
      </header>

      <nav className={styles.sectionNavigation} aria-label="CI/CD Delivery 섹션">
        <a href="#delivery-connections">연결</a>
        <a href="#delivery-configuration">Pipeline 설정</a>
        <a href="#delivery-execution">실행 기록</a>
      </nav>

      {loadState === "error" ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}

      <section
        className={styles.sectionGroup}
        id="delivery-connections"
        aria-labelledby="delivery-connections-title"
      >
        <div className={styles.groupHeading}>
          <div>
            <p>연결</p>
            <h3 id="delivery-connections-title">코드와 계정을 연결하세요</h3>
          </div>
          <span>PR과 Pipeline이 사용할 정확한 Repository를 확인합니다.</span>
        </div>

        <div className={styles.connectionGrid}>
          <article className={styles.card} aria-labelledby="delivery-github-title">
            <div className={styles.cardHeading}>
              <h4 id="delivery-github-title">GitHub 계정</h4>
              <strong data-ready={profile.githubInstallations.length > 0}>
                {profile.githubInstallations.length > 0 ? "연결됨" : "연결 필요"}
              </strong>
            </div>
            <p>Repository 권한과 CI/CD Pull Request 생성에 사용합니다.</p>
            {profile.githubInstallations.length > 0 ? (
              <ul className={styles.accountList}>
                {profile.githubInstallations.map((installation) => (
                  <li key={installation.installationId}>
                    <span>{installation.accountLogin}</span>
                    {installation.htmlUrl ? (
                      <a href={installation.htmlUrl} rel="noreferrer" target="_blank">
                        권한 관리 <ExternalLink aria-hidden="true" size={13} />
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
          </article>

          <article className={styles.card} aria-labelledby="delivery-repository-title">
            <div className={styles.cardHeading}>
              <h4 id="delivery-repository-title">Source Repository</h4>
              <strong data-ready={Boolean(profile.sourceRepository)}>
                {profile.sourceRepository ? "연결됨" : "선택 필요"}
              </strong>
            </div>
            {profile.repositoryAnalysisTarget ? (
              <dl className={styles.definitionList}>
                <div>
                  <dt>분석 출처</dt>
                  <dd>
                    {profile.repositoryAnalysisTarget.owner}/{profile.repositoryAnalysisTarget.name}
                  </dd>
                </div>
                <div>
                  <dt>Branch · SHA</dt>
                  <dd>
                    {profile.repositoryAnalysisTarget.branch} ·{" "}
                    {shortSha(profile.repositoryAnalysisTarget.repositoryRevision)}
                  </dd>
                </div>
                <div>
                  <dt>배포 Repository</dt>
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
                <strong>최근 인증 분석과 Board의 분석 SHA가 다릅니다.</strong>
                <p>
                  최근 인증 분석 SHA는 {shortSha(freshness.currentRevision)}입니다. Board는 자동으로
                  변경되지 않습니다.
                </p>
              </div>
            ) : null}
            <Link className={styles.actionLink} href={repositoryHref}>
              <GitBranch aria-hidden="true" size={15} />
              {profile.sourceRepository ? "Repository 다시 분석" : "Repository 연결"}
            </Link>
          </article>
        </div>
      </section>

      <section
        className={styles.sectionGroup}
        id="delivery-configuration"
        aria-labelledby="delivery-configuration-title"
      >
        <div className={styles.groupHeading}>
          <div>
            <p>Pipeline 설정</p>
            <h3 id="delivery-configuration-title">변경 감시와 배포 위치를 정하세요</h3>
          </div>
          <span>저장만으로 PR 생성이나 배포가 실행되지는 않습니다.</span>
        </div>
        <div className={styles.settingsStack}>
          <div className={styles.editorSection}>
            <ProjectCicdMonitoringSettingsClient projectId={projectId} onSaved={reload} />
          </div>
          <div className={styles.editorSection}>
            <ProjectDeploymentTargetEditor
              initialProfile={profile}
              onSaved={reload}
              projectId={projectId}
            />
          </div>
        </div>
      </section>

      <section
        className={`${styles.sectionGroup} ${styles.execution}`}
        id="delivery-execution"
        aria-labelledby="delivery-execution-title"
      >
        <div className={styles.groupHeading}>
          <div>
            <p>실행 기록</p>
            <h3 id="delivery-execution-title">Pull Request와 Pipeline을 관리하세요</h3>
          </div>
          <span className={styles.executionHint}>
            <Settings2 aria-hidden="true" size={15} /> 설정 변경은 위에서 저장합니다.
          </span>
        </div>
        <CicdConsoleScreen
          isVisible
          onOpenDirectDeployment={onOpenDirectDeployment}
          onOpenLiveObservation={onOpenLiveObservation}
          projectId={projectId}
          readinessRefreshRequestId={readinessRefreshRequestId + reloadKey}
        />
      </section>
    </div>
  );
}

function shortSha(value: string): string {
  return `${value.slice(0, 10)}…`;
}
