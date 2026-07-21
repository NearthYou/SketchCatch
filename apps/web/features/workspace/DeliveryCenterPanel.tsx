"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Eye, Link2, RefreshCw } from "lucide-react";
import type { GitCicdMonitoredPath, ProjectDeploymentTarget } from "@sketchcatch/types";
import { ProjectCicdMonitoringSettingsClient } from "../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client";
import { CicdAccordionSection } from "./CicdAccordionSection";
import { CicdAutomaticSetupSummary } from "./CicdAutomaticSetupSummary";
import { CicdConsoleScreen, type CicdConsoleScreenHandle } from "./CicdConsoleScreen";
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
  const consoleRef = useRef<CicdConsoleScreenHandle>(null);
  const [isExplicitRefresh, setIsExplicitRefresh] = useState(false);
  const [isConsoleRefreshBusy, setIsConsoleRefreshBusy] = useState(true);
  useEffect(() => setIsConsoleRefreshBusy(true), [projectId]);
  const reload = useCallback(() => {
    void refresh();
  }, [refresh]);
  const refreshAll = useCallback(async (): Promise<void> => {
    const consoleRefresh = consoleRef.current?.refreshAll();
    if (consoleRef.current && !consoleRefresh) return;

    setIsExplicitRefresh(true);
    try {
      if (consoleRefresh) {
        await consoleRefresh;
        return;
      }
      await refresh();
    } finally {
      setIsExplicitRefresh(false);
    }
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
  const repository = profile.sourceRepository;
  const monitoringConfig = profile.monitoringConfig;
  const deploymentTarget = profile.deploymentTarget;
  const monitoringReady =
    profile.readiness.items.find((item) => item.key === "monitoring_config")?.status === "ready";
  const isFullRefreshUnavailable =
    isExplicitRefresh || isConsoleRefreshBusy || loadState === "loading";
  const githubAccount = profile.githubInstallations.find(
    (installation) => installation.installationId === repository?.githubInstallationId
  );
  const setupContent = (
    <>
      <CicdAccordionSection
        icon={<Link2 size={17} />}
        id="cicd-source-repository"
        metadata={
          <AccordionFacts
            facts={[
              ["GitHub", githubAccount?.accountLogin ?? "연결 필요"],
              ["Repository", repository ? `${repository.owner}/${repository.name}` : "미설정"],
              ["Branch", repository?.defaultBranch ?? "미설정"]
            ]}
          />
        }
        statusLabel={repository ? "연결됨" : "연결 필요"}
        statusTone={repository ? "success" : "warning"}
        title="Delivery 연결"
      >
        <DeliveryConnectionSummary
          accountLogins={profile.githubInstallations.map(
            (installation) => installation.accountLogin
          )}
          profile={profile}
          repositoryHref={repositoryHref}
          showHeader={false}
        />
      </CicdAccordionSection>

      <CicdAccordionSection
        icon={<Eye size={17} />}
        id="project-cicd-settings-title"
        metadata={
          <AccordionFacts
            facts={[
              ["모니터링", monitoringConfig?.enabled ? "사용" : "중지"],
              ["Branch", monitoringConfig?.monitorBranch ?? "미설정"],
              ["감시 경로", formatMonitoredPath(monitoringConfig?.appPath)]
            ]}
          />
        }
        statusLabel={monitoringReady ? "저장됨" : "설정 필요"}
        statusTone={monitoringReady ? "success" : "warning"}
        title="GitOps 감시 설정"
      >
        <ProjectCicdMonitoringSettingsClient
          headingLevel={4}
          onSaved={reload}
          profile={profile}
          projectId={projectId}
          showHeading={false}
        />
      </CicdAccordionSection>

      <CicdAccordionSection
        icon={<Crosshair size={17} />}
        id="deployment-target-title"
        metadata={
          <AccordionFacts
            facts={[
              ["Provider", deploymentTarget?.provider.toUpperCase() ?? "미설정"],
              ["Region", deploymentTarget?.region ?? "미설정"],
              ["실행 방식", getRuntimeTargetLabel(deploymentTarget)]
            ]}
          />
        }
        statusLabel={deploymentTarget ? "저장됨" : "설정 필요"}
        statusTone={deploymentTarget ? "success" : "warning"}
        title="프로젝트 배포 타깃"
      >
        <ProjectDeploymentTargetEditor
          headingLevel={4}
          onSaved={handleDeploymentTargetSaved}
          profile={profile}
          projectId={projectId}
          showAutomaticSummary={false}
          showHeading={false}
        />
        <section className={styles.automaticSetupSection}>
          <h4>감지된 배포 정보</h4>
          <CicdAutomaticSetupSummary profile={profile} />
        </section>
      </CicdAccordionSection>
    </>
  );

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <h2>CI/CD</h2>
          </div>
          <span>{formatCheckedAt(profile.readiness.checkedAt)}</span>
        </div>
        <div className={styles.headerActions}>
          <button
            disabled={isFullRefreshUnavailable}
            onClick={() => void refreshAll()}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} />
            {isExplicitRefresh ? "새로고침 중" : "전체 새로고침"}
          </button>
        </div>
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
        onRefreshBusyChange={setIsConsoleRefreshBusy}
        onRefreshDeliveryProfile={refresh}
        projectId={projectId}
        readinessRefreshRequestId={readinessRefreshRequestId}
        ref={consoleRef}
        setupContent={setupContent}
      />
    </div>
  );
}

function AccordionFacts({
  facts
}: {
  readonly facts: readonly (readonly [label: string, value: string])[];
}) {
  return (
    <dl className={styles.accordionSummaryFacts}>
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatMonitoredPath(path: GitCicdMonitoredPath | undefined): string {
  if (!path) return "미설정";
  return path.mode === "repository_root" ? "저장소 루트" : path.path;
}

function getRuntimeTargetLabel(target: ProjectDeploymentTarget | null): string {
  if (!target) return "미설정";
  return (
    (
      {
        ec2_asg: "EC2 Auto Scaling",
        ecs_fargate: "ECS Fargate",
        lambda: "Lambda",
        static_site: "Static Site"
      } as const
    )[target.runtimeTargetKind] ?? "미설정"
  );
}

function formatCheckedAt(value: string): string {
  return `최근 확인 ${new Date(value).toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul"
  })}`;
}
