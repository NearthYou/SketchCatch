import Link from "next/link";
import type {
  GitCicdHandoff,
  GitCicdMonitoringConfig,
  GitCicdReadinessSnapshot,
  SourceRepository
} from "@sketchcatch/types";
import type { GitCicdHandoffReadinessItem } from "./cicd-handoff";
import { groupGitCicdReadiness } from "./cicd-delivery-presentation";
import handoffStyles from "./cicd-handoff.module.css";
import styles from "./workspace.module.css";

export function CicdHandoffPanel({
  canCreateHandoff,
  commandCopyState,
  currentHandoff,
  existingHandoff,
  handoffErrorMessage,
  handoffs,
  infrastructureDeploymentCommand,
  isHandoffBusy,
  isHandoffReviewOpen,
  isReadinessRefreshing,
  monitoringConfig,
  onApplyAwsRoleDiff,
  onApplyRepositorySettings,
  onCloseCreateReview,
  onCopyInfrastructureCommand,
  onCreateHandoff,
  onOpenCreateReview,
  onOpenDirectDeployment,
  onRefreshReadiness,
  onSelectHandoff,
  readiness,
  readinessErrorMessage,
  readinessItems,
  repository
}: {
  readonly canCreateHandoff: boolean;
  readonly commandCopyState: "idle" | "copied" | "failed";
  readonly currentHandoff: GitCicdHandoff | null;
  readonly existingHandoff: GitCicdHandoff | null;
  readonly handoffErrorMessage: string;
  readonly handoffs: readonly GitCicdHandoff[];
  readonly infrastructureDeploymentCommand: string;
  readonly isHandoffBusy: boolean;
  readonly isHandoffReviewOpen: boolean;
  readonly isReadinessRefreshing: boolean;
  readonly monitoringConfig: GitCicdMonitoringConfig | null;
  readonly onApplyAwsRoleDiff: (handoffId: string) => void;
  readonly onApplyRepositorySettings: (handoffId: string) => void;
  readonly onCloseCreateReview: () => void;
  readonly onCopyInfrastructureCommand: () => void;
  readonly onCreateHandoff: () => void;
  readonly onOpenCreateReview: () => void;
  readonly onOpenDirectDeployment?: (
    (scope: "application" | "full_stack" | null) => void
  ) | undefined;
  readonly onRefreshReadiness: () => void;
  readonly onSelectHandoff: (handoffId: string) => void;
  readonly readiness: GitCicdReadinessSnapshot;
  readonly readinessErrorMessage: string;
  readonly readinessItems: readonly GitCicdHandoffReadinessItem[];
  readonly repository: SourceRepository | null;
}) {
  const readinessGroup = groupGitCicdReadiness(readinessItems);

  return (
    <section className={handoffStyles.panel} id="cicd-handoff" aria-labelledby="cicd-handoff-title">
      <header className={handoffStyles.header}>
        <div>
          <h3 id="cicd-handoff-title">배포 PR</h3>
          <p>Workflow와 Terraform 변경을 검토한 뒤 Pull Request를 생성합니다.</p>
        </div>
        <span data-status={currentHandoff?.status ?? "draft"}>
          {getGitCicdHandoffLabel(currentHandoff?.status)}
        </span>
      </header>

      <p className={styles.deploymentHint}>
        이 PR은 이미 배포된 앱의 후속 변경을 자동 배포하도록 Workflow와 Repository 설정을
        설치합니다. PR merge만으로 최초 앱 배포를 시작하지 않습니다.
      </p>

      <div
        className={handoffStyles.readiness}
        id="cicd-pr-readiness"
        aria-label="CI/CD PR 준비 상태"
      >
        <div className={handoffStyles.readinessHeader}>
          <div>
            <strong>준비 상태</strong>
            <p>필요한 설정을 저장한 뒤 준비 상태를 다시 확인합니다.</p>
          </div>
          <span data-ready={readiness.ready}>
            {readinessGroup.remainingLabel}
          </span>
        </div>
        {isReadinessRefreshing ? (
          <p className={handoffStyles.readinessLoading} role="status">
            완료 상태 확인 중
          </p>
        ) : readinessErrorMessage ? (
          <div className={handoffStyles.readinessError} role="alert">
            <span>{readinessErrorMessage}</span>
            <button
              className={styles.deploymentSecondaryButton}
              onClick={onRefreshReadiness}
              type="button"
            >
              상태 새로고침
            </button>
          </div>
        ) : null}
        {readinessGroup.required.length > 0 ? (
          <ul className={handoffStyles.readinessList}>
            {readinessGroup.required.map((item) => (
              <ReadinessRow
                item={item}
                key={item.key}
                onOpenDirectDeployment={onOpenDirectDeployment}
              />
            ))}
          </ul>
        ) : null}
        {readinessGroup.completedCount > 0 ? (
          <details className={handoffStyles.completedReadiness}>
            <summary>{readinessGroup.completedCount}개 완료</summary>
            <ul className={handoffStyles.readinessList}>
              {readinessGroup.completed.map((item) => (
                <ReadinessRow
                  item={item}
                  key={item.key}
                  onOpenDirectDeployment={onOpenDirectDeployment}
                />
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {handoffErrorMessage ? (
        <p className={styles.deploymentStageAlert} role="alert">
          {handoffErrorMessage}
        </p>
      ) : null}

      {existingHandoff ? (
        <p className={handoffStyles.notice}>
          이 승인 Plan으로 만든 PR이 이미 있습니다.
          {existingHandoff.pullRequestUrl ? (
            <a href={existingHandoff.pullRequestUrl} rel="noreferrer" target="_blank">
              GitHub에서 PR 열기
            </a>
          ) : null}
        </p>
      ) : null}

      {!isHandoffReviewOpen ? (
        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canCreateHandoff}
          onClick={onOpenCreateReview}
          type="button"
        >
          PR 생성 전 검토
        </button>
      ) : (
        <div className={handoffStyles.review} role="group" aria-label="CI/CD PR 생성 확인">
          <strong>PR 생성 전 검토</strong>
          <dl className={handoffStyles.reviewFacts}>
            <div>
              <dt>Repository</dt>
              <dd>{repository ? `${repository.owner}/${repository.name}` : "미설정"}</dd>
            </div>
            <div>
              <dt>Target branch</dt>
              <dd>{monitoringConfig?.monitorBranch ?? "미설정"}</dd>
            </div>
            <div>
              <dt>승인된 Plan</dt>
              <dd>{readiness.approvedApplyPlanArtifactId?.slice(0, 12) ?? "없음"}</dd>
            </div>
          </dl>
          <ul>
            <li>배포 workflow와 Terraform 파일을 새 branch에 commit합니다.</li>
            <li>Repository 설정과 AWS Role 변경은 PR 생성 후 각각 다시 승인합니다.</li>
          </ul>
          <div>
            <button
              className={styles.deploymentSecondaryButton}
              disabled={isHandoffBusy}
              onClick={onCloseCreateReview}
              type="button"
            >
              취소
            </button>
            <button
              className={styles.deploymentPrimaryButton}
              disabled={!canCreateHandoff}
              onClick={onCreateHandoff}
              type="button"
            >
              {isHandoffBusy ? "PR 생성 중" : "CI/CD PR 생성"}
            </button>
          </div>
        </div>
      )}

      {handoffs.length > 1 ? (
        <label className={styles.cicdRunSelect}>
          이전 handoff
          <select
            onChange={(event) => onSelectHandoff(event.target.value)}
            value={currentHandoff?.id ?? ""}
          >
            {handoffs.map((handoff) => (
              <option key={handoff.id} value={handoff.id}>
                {handoff.repositoryOwner}/{handoff.repositoryName} · {getGitCicdHandoffLabel(handoff.status)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {currentHandoff ? (
        <>
          <div className={handoffStyles.result}>
            <div>
              <strong>{currentHandoff.repositoryOwner}/{currentHandoff.repositoryName}</strong>
              <span>{currentHandoff.targetBranch}</span>
            </div>
            {currentHandoff.statusMessage ? <p>{currentHandoff.statusMessage}</p> : null}
            <div className={handoffStyles.actions}>
              {currentHandoff.pullRequestUrl ? (
                <a
                  className={styles.deploymentPrimaryButton}
                  href={currentHandoff.pullRequestUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  GitHub Pull Request 열기
                </a>
              ) : null}
              {currentHandoff.repositorySettingsPreview ? (
                <button
                  className={styles.deploymentSecondaryButton}
                  disabled={isHandoffBusy}
                  onClick={() => onApplyRepositorySettings(currentHandoff.id)}
                  type="button"
                >
                  Repository 설정 적용
                </button>
              ) : null}
              {currentHandoff.awsRoleDiff && !currentHandoff.awsRoleDiff.applied ? (
                <button
                  className={styles.deploymentSecondaryButton}
                  disabled={isHandoffBusy}
                  onClick={() => onApplyAwsRoleDiff(currentHandoff.id)}
                  type="button"
                >
                  AWS Role 변경 적용
                </button>
              ) : null}
            </div>
          </div>
          <section className={handoffStyles.commandCard} aria-labelledby="infra-command-title">
            <div>
              <h4 id="infra-command-title">인프라 배포 명령</h4>
            </div>
            <p>
              설치 PR이 병합된 뒤 이 명령을 실행하면 Terraform Plan을 확인한 같은 job에서
              Apply까지 진행합니다. 명령 실행 자체가 Apply 승인입니다.
            </p>
            <div className={handoffStyles.commandRow}>
              <code>{infrastructureDeploymentCommand}</code>
              <button
                className={styles.deploymentSecondaryButton}
                onClick={onCopyInfrastructureCommand}
                type="button"
              >
                {commandCopyState === "copied"
                  ? "복사 완료"
                  : commandCopyState === "failed"
                    ? "복사 다시 시도"
                    : "명령 복사"}
              </button>
            </div>
            <span aria-live="polite">
              {commandCopyState === "copied"
                ? "명령을 복사했습니다."
                : commandCopyState === "failed"
                  ? "자동 복사에 실패했습니다. 명령을 직접 선택해 복사해 주세요."
                  : ""}
            </span>
          </section>
        </>
      ) : null}
    </section>
  );
}

function ReadinessRow({
  item,
  onOpenDirectDeployment
}: {
  readonly item: GitCicdHandoffReadinessItem;
  readonly onOpenDirectDeployment?: (
    (scope: "application" | "full_stack" | null) => void
  ) | undefined;
}) {
  return (
    <li data-ready={item.ready}>
      <div className={handoffStyles.readinessItemContent}>
        <div>
          <strong>{item.label}</strong>
          <span>{item.statusLabel}</span>
        </div>
        <p>{item.description}</p>
        {item.details ? (
          <ul className={handoffStyles.readinessDetails}>
            {item.details.map((detail) => (
              <li data-ready={detail.ready} key={detail.key}>
                <span>{detail.label}</span>
                <strong>{detail.ready ? "완료" : "설정 필요"}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {!item.ready &&
      (item.action === "approve_apply_plan" || item.action === "deploy_initial_application") ? (
        <button
          className={styles.deploymentSecondaryButton}
          onClick={() => onOpenDirectDeployment?.(item.directDeploymentScope)}
          disabled={!onOpenDirectDeployment}
          type="button"
        >
          {item.actionLabel}
        </button>
      ) : !item.ready && item.href ? (
        <Link className={styles.deploymentSecondaryButton} href={item.href}>
          {item.actionLabel}
        </Link>
      ) : null}
    </li>
  );
}

function getGitCicdHandoffLabel(status: GitCicdHandoff["status"] | undefined): string {
  switch (status) {
    case "pr_created":
      return "PR 생성됨";
    case "pipeline_running":
      return "Pipeline 실행 중";
    case "pipeline_success":
      return "배포 성공";
    case "pipeline_failed":
      return "Pipeline 실패";
    case "cancelled":
      return "취소됨";
    default:
      return "준비 전";
  }
}
