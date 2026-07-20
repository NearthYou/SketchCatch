"use client";

import { useCallback } from "react";
import {
  RefreshCw,
  Workflow
} from "lucide-react";
import { ProjectCicdMonitoringSettingsClient } from "../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client";
import { CicdConsoleScreen } from "./CicdConsoleScreen";
import { ProjectDeploymentTargetEditor } from "./delivery/ProjectDeploymentTargetEditor";
import { DeliveryConnectionSummary } from "./delivery/DeliveryConnectionSummary";
import { useProjectDeliveryProfile } from "./delivery/use-project-delivery-profile";
import type { LiveObservationSelection } from "./live-observation";
import styles from "./delivery-center.module.css";

export function DeliveryCenterPanel({
  onDeploymentTargetSaved,
  onOpenDirectDeployment,
  onOpenLiveObservation,
  projectId,
  readinessRefreshRequestId = 0
}: {
  readonly onDeploymentTargetSaved?: (() => void) | undefined;
  readonly onOpenDirectDeployment?: (scope: "application" | "full_stack" | null) => void;
  readonly onOpenLiveObservation?: (selection?: LiveObservationSelection) => void;
  readonly projectId: string;
  readonly readinessRefreshRequestId?: number | undefined;
}) {
  const {
    profile,
    status: loadState,
    errorMessage: message,
    refresh
  } = useProjectDeliveryProfile(projectId, readinessRefreshRequestId);
  const reload = useCallback(() => {
    void refresh();
  }, [refresh]);

  function handleDeploymentTargetSaved(): void {
    void refresh();
    onDeploymentTargetSaved?.();
  }

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
  const repositoryReturnSearch = new URLSearchParams({
    projectId,
    deploymentView: "cicd",
    readinessKey: "source_repository"
  });
  const repositorySearch = new URLSearchParams({
    returnTo: `/workspace?${repositoryReturnSearch.toString()}`,
    readinessKey: "source_repository"
  });
  const repositoryHref = `/dashboard/projects/${encodeURIComponent(projectId)}/repository?${repositorySearch.toString()}`;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.titleIcon} aria-hidden="true">
            <Workflow size={18} />
          </span>
          <div>
            <h2>CI/CD</h2>
            <span>배포 준비를 확인하고 PR과 Pipeline을 관리합니다.</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button onClick={reload} type="button">
            <RefreshCw aria-hidden="true" size={16} />
            준비 상태 새로고침
          </button>
        </div>
      </header>

      <nav className={styles.sectionNavigation} aria-label="CI/CD 섹션">
        <a href="#cicd-setup">배포 준비</a>
        <a href="#cicd-handoff">배포 PR</a>
        <a href="#cicd-pipeline">Pipeline</a>
      </nav>

      {loadState === "error" ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}

      <section
        className={styles.sectionGroup}
        id="cicd-setup"
        aria-labelledby="cicd-setup-title"
      >
        <div className={styles.groupHeading}>
          <div>
            <h3 id="cicd-setup-title">배포 준비</h3>
          </div>
          <span>Repository, 변경 감시와 배포 위치를 확인합니다.</span>
        </div>

        <div className={styles.connectionGrid}>
          <DeliveryConnectionSummary
            accountLogins={profile.githubInstallations.map(
              (installation) => installation.accountLogin
            )}
            profile={profile}
            repositoryHref={repositoryHref}
          />
        </div>
        <div className={styles.settingsStack}>
          <div className={styles.editorSection}>
            <ProjectCicdMonitoringSettingsClient
              profile={profile}
              projectId={projectId}
              onSaved={reload}
            />
          </div>
          <div className={styles.editorSection}>
            <ProjectDeploymentTargetEditor
              profile={profile}
              onSaved={handleDeploymentTargetSaved}
              projectId={projectId}
            />
          </div>
        </div>
      </section>

      <CicdConsoleScreen
        deliveryProfile={profile}
        deliveryProfileErrorMessage={message}
        isVisible
        isDeliveryProfileRefreshing={loadState === "loading"}
        onRefreshDeliveryProfile={refresh}
        onOpenDirectDeployment={onOpenDirectDeployment}
        onOpenLiveObservation={onOpenLiveObservation}
        projectId={projectId}
        readinessRefreshRequestId={readinessRefreshRequestId}
      />
    </div>
  );
}
