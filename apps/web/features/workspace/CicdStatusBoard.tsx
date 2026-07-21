import Link from "next/link";
import type {
  GitCicdHandoff,
  GitCicdPipelineRun,
  ProjectDeliveryProfile
} from "@sketchcatch/types";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { GitCicdHandoffReadinessItem } from "./cicd-handoff";
import { formatPipelineRunStatus } from "./cicd-delivery-presentation";
import styles from "./delivery-center.module.css";

export function CicdStatusBoard({
  canCreateHandoff,
  currentHandoff,
  deliveryProfile,
  existingHandoff,
  isBusy,
  onOpenCreateReview,
  onOpenDirectDeployment,
  readinessItems,
  runs
}: {
  readonly canCreateHandoff: boolean;
  readonly currentHandoff: GitCicdHandoff | null;
  readonly deliveryProfile: ProjectDeliveryProfile;
  readonly existingHandoff: GitCicdHandoff | null;
  readonly isBusy: boolean;
  readonly onOpenCreateReview: () => void;
  readonly onOpenDirectDeployment?:
    | ((scope: "application" | "full_stack" | null) => void)
    | undefined;
  readonly readinessItems: readonly GitCicdHandoffReadinessItem[];
  readonly runs: readonly GitCicdPipelineRun[];
}) {
  const repository = deliveryProfile.sourceRepository;
  const target = deliveryProfile.deploymentTarget;
  const setupReady = deliveryProfile.readiness.ready;
  const isDeliveryCurrent = repository === null;
  const isSetupCurrent = repository !== null && !setupReady;
  const isHandoffCurrent =
    setupReady &&
    (currentHandoff === null || ["draft", "cancelled"].includes(currentHandoff.status));
  const isPipelineCurrent =
    currentHandoff !== null && !["draft", "cancelled"].includes(currentHandoff.status);
  const pullRequestTone = getPullRequestTone(currentHandoff?.status);
  const relatedRuns = currentHandoff
    ? runs.filter((run) => run.handoffId === currentHandoff.id)
    : runs;
  const latestRun =
    [...relatedRuns].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
    null;
  const pipelineStage = getPipelineStage(latestRun, currentHandoff);
  const nextAction = getNextAction({
    canCreateHandoff,
    currentHandoff,
    existingHandoff,
    readinessItems
  });

  return (
    <section className={styles.statusBoard} aria-labelledby="cicd-status-title">
      <header className={styles.statusBoardHeader}>
        <h3 id="cicd-status-title">배포 상태</h3>
        <div className={styles.statusContext}>
          <strong>
            {repository ? `${repository.owner}/${repository.name}` : "Repository 미연결"}
          </strong>
          <i aria-hidden="true" />
          <span>{repository?.defaultBranch ?? "Branch 미설정"}</span>
          <i aria-hidden="true" />
          <span>
            {target ? `${target.provider.toUpperCase()} ${target.region}` : "Provider 미설정"}
          </span>
        </div>
      </header>

      <div className={styles.statusStages}>
        <StatusStage
          current={isDeliveryCurrent}
          label={isDeliveryCurrent ? "현재 단계 · Delivery 연결" : "Delivery 연결"}
          meta={repository ? `GitHub · ${repository.defaultBranch}` : "Repository 연결 필요"}
          tone={repository ? "success" : "pending"}
          value={repository ? "연결됨" : "연결 필요"}
        />
        <StatusStage
          current={isSetupCurrent}
          label={isSetupCurrent ? "현재 단계 · 배포 준비" : "배포 준비"}
          meta={setupReady ? "필수 요건 충족" : getReadinessMeta(readinessItems)}
          tone={setupReady ? "success" : isSetupCurrent ? "info" : "pending"}
          value={
            setupReady ? "준비 완료" : `${deliveryProfile.readiness.requiredActionCount}개 남음`
          }
        />
        <StatusStage
          current={isHandoffCurrent}
          label={isHandoffCurrent ? "현재 단계 · 배포 PR" : "배포 PR"}
          meta={
            currentHandoff
              ? getPullRequestStageMeta(currentHandoff.status)
              : getReadinessMeta(readinessItems)
          }
          tone={currentHandoff ? pullRequestTone : isHandoffCurrent ? "info" : "pending"}
          value={
            currentHandoff
              ? getPullRequestStageLabel(currentHandoff.status)
              : "대기"
          }
        />
        <StatusStage
          current={isPipelineCurrent}
          label={isPipelineCurrent ? "현재 단계 · Pipeline" : "Pipeline"}
          meta={latestRun ? latestRun.branch : pipelineStage.meta}
          tone={pipelineStage.tone}
          value={pipelineStage.value}
        />
      </div>

      {nextAction ? (
        <div className={styles.statusAction} data-tone={nextAction.tone}>
          <span className={styles.statusActionIcon} aria-hidden="true">
            {nextAction.tone === "warning" ? <AlertTriangle size={16} /> : <ArrowRight size={16} />}
          </span>
          <div>
            <strong>{nextAction.title}</strong>
            <span>{nextAction.description}</span>
          </div>
          <StatusActionControl
            action={nextAction}
            disabled={isBusy}
            onOpenCreateReview={onOpenCreateReview}
            onOpenDirectDeployment={onOpenDirectDeployment}
          />
        </div>
      ) : null}
    </section>
  );
}

function StatusStage({
  current = false,
  label,
  meta,
  tone,
  value
}: {
  readonly current?: boolean | undefined;
  readonly label: string;
  readonly meta: string;
  readonly tone: "success" | "warning" | "info" | "pending";
  readonly value: string;
}) {
  return (
    <div className={styles.statusStage} data-current={current}>
      <span className={styles.statusStageLabel} data-tone={tone}>
        <i aria-hidden="true" />
        {label}
      </span>
      <strong>{value}</strong>
      <span>{meta}</span>
    </div>
  );
}

type NextAction =
  | {
      readonly kind: "direct";
      readonly actionLabel: string;
      readonly description: string;
      readonly scope: "application" | "full_stack" | null;
      readonly title: string;
      readonly tone: "warning";
    }
  | {
      readonly kind: "section";
      readonly actionLabel: string;
      readonly description: string;
      readonly sectionId: string;
      readonly title: string;
      readonly tone: "warning";
    }
  | {
      readonly kind: "link";
      readonly actionLabel: string;
      readonly description: string;
      readonly href: string;
      readonly title: string;
      readonly tone: "warning";
    }
  | {
      readonly kind: "review";
      readonly actionLabel: string;
      readonly description: string;
      readonly title: string;
      readonly tone: "info";
    }
  | {
      readonly kind: "external";
      readonly actionLabel: string;
      readonly description: string;
      readonly href: string;
      readonly title: string;
      readonly tone: "info";
    };

function getNextAction(input: {
  readonly canCreateHandoff: boolean;
  readonly currentHandoff: GitCicdHandoff | null;
  readonly existingHandoff: GitCicdHandoff | null;
  readonly readinessItems: readonly GitCicdHandoffReadinessItem[];
}): NextAction | null {
  const required = input.readinessItems.find((item) => !item.ready);
  if (required?.actionLabel) {
    const description = "현재 배포 PR 생성을 막고 있는 다음 조건입니다.";
    if (
      required.action === "approve_apply_plan" ||
      required.action === "deploy_initial_application"
    ) {
      return {
        kind: "direct",
        actionLabel: required.actionLabel,
        description,
        scope: required.directDeploymentScope,
        title: required.label,
        tone: "warning"
      };
    }
    const sectionId = getReadinessSectionId(required.action);
    if (sectionId) {
      return {
        kind: "section",
        actionLabel: required.actionLabel,
        description,
        sectionId,
        title: required.label,
        tone: "warning"
      };
    }
    if (required.href) {
      return {
        kind: "link",
        actionLabel: required.actionLabel,
        description,
        href: required.href,
        title: required.label,
        tone: "warning"
      };
    }
  }
  if (input.canCreateHandoff && !input.existingHandoff) {
    return {
      kind: "review",
      actionLabel: "PR 생성 전 검토",
      description: "준비된 Workflow와 Terraform 변경을 확인합니다.",
      title: "배포 PR을 생성할 수 있습니다.",
      tone: "info"
    };
  }
  if (input.currentHandoff?.pullRequestUrl) {
    return {
      kind: "external",
      actionLabel: "GitHub PR 열기",
      description: "생성된 변경을 GitHub에서 검토하고 병합합니다.",
      href: input.currentHandoff.pullRequestUrl,
      title: "배포 PR이 생성되었습니다.",
      tone: "info"
    };
  }
  return null;
}

function StatusActionControl({
  action,
  disabled,
  onOpenCreateReview,
  onOpenDirectDeployment
}: {
  readonly action: NextAction;
  readonly disabled: boolean;
  readonly onOpenCreateReview: () => void;
  readonly onOpenDirectDeployment?:
    | ((scope: "application" | "full_stack" | null) => void)
    | undefined;
}) {
  if (action.kind === "section") {
    return (
      <button
        className={styles.statusActionControl}
        disabled={disabled}
        onClick={() => openAccordionSection(action.sectionId)}
        type="button"
      >
        {action.actionLabel}
      </button>
    );
  }
  if (action.kind === "link") {
    return (
      <Link className={styles.statusActionControl} href={action.href}>
        {action.actionLabel}
      </Link>
    );
  }
  if (action.kind === "external") {
    return (
      <a className={styles.statusActionControl} href={action.href} rel="noreferrer" target="_blank">
        {action.actionLabel}
      </a>
    );
  }
  return (
    <button
      className={styles.statusActionControl}
      disabled={disabled || (action.kind === "direct" && !onOpenDirectDeployment)}
      onClick={() =>
        action.kind === "review" ? onOpenCreateReview() : onOpenDirectDeployment?.(action.scope)
      }
      type="button"
    >
      {action.actionLabel}
    </button>
  );
}

function getReadinessSectionId(action: GitCicdHandoffReadinessItem["action"]): string | null {
  switch (action) {
    case "select_repository":
      return "cicd-source-repository";
    case "confirm_monitoring_config":
      return "project-cicd-settings-title";
    case "select_aws_connection":
    case "confirm_build_config":
    case "inspect_runtime_outputs":
    case "inspect_output_url":
      return "deployment-target-title";
    default:
      return null;
  }
}

function openAccordionSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  const toggle = section?.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (!section || !toggle) return;
  if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  window.requestAnimationFrame(() => toggle.focus());
}

function getReadinessMeta(items: readonly GitCicdHandoffReadinessItem[]): string {
  return items.find((item) => !item.ready)?.statusLabel ?? "PR 생성 가능";
}

function getPullRequestStageLabel(status: GitCicdHandoff["status"]): string {
  if (status === "cancelled") return "취소됨";
  if (status === "draft") return "준비 중";
  return "PR 생성됨";
}

function getPullRequestStageMeta(status: GitCicdHandoff["status"]): string {
  if (status === "cancelled") return "새 PR 생성 필요";
  if (status === "draft") return "변경 준비 중";
  return "GitHub PR 생성 완료";
}

function getPullRequestTone(
  status: GitCicdHandoff["status"] | undefined
): "success" | "warning" | "info" | "pending" {
  if (!status) return "pending";
  if (status === "cancelled") return "warning";
  if (status === "draft") return "info";
  return "success";
}

function getPipelineTone(
  status: GitCicdPipelineRun["status"]
): "success" | "warning" | "info" | "pending" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled") return "warning";
  if (status === "running" || status === "queued" || status === "detected") return "info";
  return "pending";
}

function getPipelineStage(
  run: GitCicdPipelineRun | null,
  handoff: GitCicdHandoff | null
): {
  readonly meta: string;
  readonly tone: "success" | "warning" | "info" | "pending";
  readonly value: string;
} {
  if (run) {
    return {
      meta: run.branch,
      tone: getPipelineTone(run.status),
      value: formatPipelineRunStatus(run.status)
    };
  }
  switch (handoff?.status) {
    case "pipeline_running":
      return { meta: "GitHub Actions", tone: "info", value: "실행 중" };
    case "pipeline_success":
      return { meta: "GitHub Actions", tone: "success", value: "배포 성공" };
    case "pipeline_failed":
      return { meta: "GitHub Actions", tone: "warning", value: "실패" };
    case "cancelled":
      return { meta: "PR 취소됨", tone: "warning", value: "실행 없음" };
    default:
      return { meta: "PR 생성 후 실행", tone: "pending", value: "실행 없음" };
  }
}
