"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ProjectCicdMonitoringSettingsClient } from "../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client";
import { CicdAutomaticSetupSummary } from "./CicdAutomaticSetupSummary";
import { CicdConsoleScreen } from "./CicdConsoleScreen";
import { CicdLoadingState } from "./CicdLoadingState";
import { CicdRepositoryConnectionForm } from "./CicdRepositoryConnectionForm";
import type { CicdSetupDrawerId } from "./cicd-readiness-presentation";
import { CicdSettingsDrawer } from "./CicdSettingsDrawer";
import { ProjectDeploymentTargetEditor } from "./delivery/ProjectDeploymentTargetEditor";
import { useProjectDeliveryProfile } from "./delivery/use-project-delivery-profile";
import type { LiveObservationSelection } from "./live-observation";
import styles from "./delivery-center.module.css";

export function DeliveryCenterPanel({
  onDeploymentTargetSaved,
  onLastRefreshedAtChange,
  onOpenDirectDeployment,
  onOpenLiveObservation,
  onRefreshBusyChange,
  projectId,
  readinessRefreshRequestId = 0
}: {
  readonly onDeploymentTargetSaved?: (() => void) | undefined;
  readonly onLastRefreshedAtChange?: ((value: string | null) => void) | undefined;
  readonly onOpenDirectDeployment?: (scope: "application" | "full_stack" | null) => void;
  readonly onOpenLiveObservation?: (selection?: LiveObservationSelection) => void;
  readonly onRefreshBusyChange?: ((isBusy: boolean) => void) | undefined;
  readonly projectId: string;
  readonly readinessRefreshRequestId?: number | undefined;
}) {
  const {
    profile,
    status: loadState,
    errorMessage: message,
    refresh
  } = useProjectDeliveryProfile(projectId, readinessRefreshRequestId);
  const [activeDrawer, setActiveDrawer] = useState<CicdSetupDrawerId | null>(null);

  useEffect(() => setActiveDrawer(null), [projectId]);
  useEffect(() => {
    onLastRefreshedAtChange?.(profile?.readiness.checkedAt ?? null);
  }, [onLastRefreshedAtChange, profile?.readiness.checkedAt]);
  useEffect(() => () => onLastRefreshedAtChange?.(null), [onLastRefreshedAtChange]);

  const reload = useCallback(() => {
    void refresh();
  }, [refresh]);

  function handleMonitoringSaved(): void {
    setActiveDrawer(null);
    void refresh();
  }

  function handleRepositorySaved(): void {
    setActiveDrawer(null);
    void refresh();
  }

  function handleDeploymentTargetSaved(): void {
    setActiveDrawer(null);
    void refresh();
    onDeploymentTargetSaved?.();
  }

  if (!profile && loadState === "loading") {
    return (
      <div className={styles.root}>
        <header className={styles.header}>
          <h2>CI/CD 준비</h2>
        </header>
        <CicdLoadingState />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className={styles.root}>
        <header className={styles.header}>
          <h2>CI/CD 준비</h2>
        </header>
        <div className={styles.message} role="alert">
          <p>{message}</p>
          <button onClick={reload} type="button">
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const drawer = getDrawerContent(activeDrawer, {
    repository: (
      <CicdRepositoryConnectionForm
        onCancel={() => setActiveDrawer(null)}
        onSaved={handleRepositorySaved}
        profile={profile}
        projectId={projectId}
      />
    ),
    monitoring: (
      <ProjectCicdMonitoringSettingsClient
        headingLevel={4}
        onSaved={handleMonitoringSaved}
        profile={profile}
        projectId={projectId}
        showHeading={false}
      />
    ),
    target: (
      <div className={styles.drawerFormContent}>
        <ProjectDeploymentTargetEditor
          headingLevel={4}
          onSaved={handleDeploymentTargetSaved}
          profile={profile}
          projectId={projectId}
          showAutomaticSummary={false}
          showHeading={false}
        />
        <section className={styles.automaticSetupSection}>
          <h4>자동 확인 결과</h4>
          <CicdAutomaticSetupSummary profile={profile} />
        </section>
      </div>
    )
  });

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h2>CI/CD 준비</h2>
      </header>

      {loadState === "error" ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}

      <CicdConsoleScreen
        deliveryProfile={profile}
        deliveryProfileErrorMessage={message}
        isVisible
        isDeliveryProfileRefreshing={loadState === "loading"}
        onOpenDirectDeployment={onOpenDirectDeployment}
        onOpenLiveObservation={onOpenLiveObservation}
        onOpenSetup={setActiveDrawer}
        onRefreshBusyChange={onRefreshBusyChange}
        onRefreshDeliveryProfile={refresh}
        projectId={projectId}
        readinessRefreshRequestId={readinessRefreshRequestId}
      />

      {drawer ? (
        <CicdSettingsDrawer
          description={drawer.description}
          onClose={() => setActiveDrawer(null)}
          title={drawer.title}
        >
          {drawer.content}
        </CicdSettingsDrawer>
      ) : null}
    </div>
  );
}

function getDrawerContent(
  activeDrawer: CicdSetupDrawerId | null,
  content: Readonly<Record<CicdSetupDrawerId, ReactNode>>
): { readonly title: string; readonly description: string; readonly content: ReactNode } | null {
  if (!activeDrawer) return null;
  const copy = {
    repository: {
      title: "GitHub 저장소 연결",
      description: "GitHub 계정, Repository와 기본 Branch를 선택합니다."
    },
    monitoring: {
      title: "변경 감지 설정",
      description: "배포를 감지할 Branch와 앱·인프라 경로를 확인합니다."
    },
    target: {
      title: "AWS 배포 대상",
      description: "AWS 계정, Region, 실행 방식과 빌드 설정을 저장합니다."
    }
  } as const;
  return { ...copy[activeDrawer], content: content[activeDrawer] };
}
