import type { ReactNode } from "react";
import type {
  GitCicdHandoff,
  GitCicdHandoffConfigurationPreview,
  GitCicdMonitoringConfig,
  GitCicdReadinessSnapshot,
  ProjectDeliveryBuildVerification,
  ProjectDeploymentTarget,
  SourceRepository
} from "@sketchcatch/types";
import { CicdAccordionSection, type CicdAccordionTone } from "./CicdAccordionSection";
import {
  isGitCicdHandoffSetupComplete,
  type GitCicdHandoffReadinessItem
} from "./cicd-handoff";
import {
  getCicdBuildVerificationPresentation,
  getCicdDeploymentOutputPresentation
} from "./cicd-readiness-presentation";
import handoffStyles from "./cicd-handoff.module.css";
import styles from "./workspace.module.css";

export function CicdHandoffPanel({
  buildVerification,
  canCreateHandoff,
  commandCopyState,
  configurationPreview,
  deploymentSucceeded,
  deploymentTarget,
  currentHandoff,
  existingHandoff,
  handoffErrorMessage,
  handoffs,
  infrastructureDeploymentCommand,
  isCurrent,
  isHandoffBusy,
  isHandoffReviewOpen,
  isReadinessRefreshing,
  monitoringConfig,
  onCloseCreateReview,
  onCopyInfrastructureCommand,
  onCreateHandoff,
  onOpenDirectDeployment,
  onRefreshReadiness,
  onSelectHandoff,
  readiness,
  readinessErrorMessage,
  readinessItems,
  repository,
  phaseStatusLabel,
  phaseStatusTone
}: {
  readonly buildVerification: ProjectDeliveryBuildVerification;
  readonly canCreateHandoff: boolean;
  readonly commandCopyState: "idle" | "copied" | "failed";
  readonly configurationPreview: GitCicdHandoffConfigurationPreview | null;
  readonly deploymentSucceeded: boolean;
  readonly deploymentTarget: ProjectDeploymentTarget | null;
  readonly currentHandoff: GitCicdHandoff | null;
  readonly existingHandoff: GitCicdHandoff | null;
  readonly handoffErrorMessage: string;
  readonly handoffs: readonly GitCicdHandoff[];
  readonly infrastructureDeploymentCommand: string;
  readonly isCurrent: boolean;
  readonly isHandoffBusy: boolean;
  readonly isHandoffReviewOpen: boolean;
  readonly isReadinessRefreshing: boolean;
  readonly monitoringConfig: GitCicdMonitoringConfig | null;
  readonly onCloseCreateReview: () => void;
  readonly onCopyInfrastructureCommand: () => void;
  readonly onCreateHandoff: () => void;
  readonly onOpenDirectDeployment?:
    | ((scope: "application" | "full_stack" | null) => void)
    | undefined;
  readonly onRefreshReadiness: () => void;
  readonly onSelectHandoff: (handoffId: string) => void;
  readonly readiness: GitCicdReadinessSnapshot;
  readonly readinessErrorMessage: string;
  readonly readinessItems: readonly GitCicdHandoffReadinessItem[];
  readonly repository: SourceRepository | null;
  readonly phaseStatusLabel: string;
  readonly phaseStatusTone: CicdAccordionTone;
}) {
  const applyPlanReady = isReadinessItemReady(readiness, readinessItems, "approved_apply_plan");
  const initialApplicationItem = readinessItems.find(
    (item) => item.key === "initial_application_release"
  );
  const initialApplicationApplicable = initialApplicationItem !== undefined;
  const initialApplicationReady =
    !initialApplicationApplicable ||
    isReadinessItemReady(readiness, readinessItems, "initial_application_release");
  const repositorySettingsVerified = existingHandoff?.repositorySettingsPreview?.verified === true;
  const awsRoleDiff = existingHandoff?.awsRoleDiff;
  const awsTrustVerified = Boolean(
    existingHandoff && (awsRoleDiff === null || awsRoleDiff?.verified === true)
  );
  const pullRequestReady = Boolean(
    existingHandoff?.pullRequestUrl && !["draft", "cancelled"].includes(existingHandoff.status)
  );
  const handoffSetupComplete = isGitCicdHandoffSetupComplete(existingHandoff);
  const buildVerificationPresentation =
    getCicdBuildVerificationPresentation(buildVerification);
  const deploymentOutputPresentation = getCicdDeploymentOutputPresentation({
    configurationPreview,
    deploymentSucceeded,
    target: deploymentTarget
  });

  return (
    <CicdAccordionSection
      defaultOpen={isCurrent}
      ensureOpen={isHandoffReviewOpen || handoffErrorMessage !== ""}
      id="cicd-handoff"
      isCurrent={isCurrent}
      metadata="배포 증거와 GitHub·AWS 설정, PR 준비 상태를 확인합니다."
      openWhen={isCurrent}
      phaseNumber="03"
      statusLabel={phaseStatusLabel}
      statusTone={phaseStatusTone}
      title="PR 준비"
    >
      <div className={handoffStyles.content}>
        <div
          className={handoffStyles.readiness}
          id="cicd-pr-readiness"
          aria-label="CI/CD PR 준비 상태"
        >
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
          <ul className={handoffStyles.readinessList}>
            <PrTaskRow
              actionLabel="배포에서 Plan 검토하기"
              description={applyPlanReady ? "완료" : "승인 필요"}
              isComplete={applyPlanReady}
              onAction={() => onOpenDirectDeployment?.(null)}
              title="Apply Plan"
            />
            <PrTaskRow
              description={buildVerificationPresentation.label}
              isComplete={buildVerificationPresentation.complete}
              title="Repository 빌드 검증"
            />
            {initialApplicationApplicable ? (
              <>
                <PrTaskRow
                  actionLabel="배포하기"
                  description={
                    initialApplicationReady
                      ? "완료"
                      : applyPlanReady
                        ? "배포 필요"
                        : "Apply Plan 승인 후 배포"
                  }
                  isComplete={initialApplicationReady}
                  onAction={
                    applyPlanReady
                      ? () =>
                          onOpenDirectDeployment?.(
                            initialApplicationItem.directDeploymentScope ?? "full_stack"
                          )
                      : undefined
                  }
                  title="최초 앱 배포"
                />
                <PrTaskRow
                  description={initialApplicationReady ? "확인 완료" : "첫 앱 배포 후 자동 확인"}
                  isComplete={initialApplicationReady}
                  title="배포 증거"
                />
              </>
            ) : null}
            <PrTaskRow
              description={renderDeploymentOutput(deploymentOutputPresentation.staticSite)}
              isComplete={deploymentOutputPresentation.staticSite.complete}
              title="Static Site URL"
            />
            <PrTaskRow
              description={renderDeploymentOutput(deploymentOutputPresentation.apiBase)}
              isComplete={deploymentOutputPresentation.apiBase.complete}
              title="API Base URL"
            />
            <PrTaskRow
              description={
                repositorySettingsVerified
                  ? "적용·검증 완료"
                  : existingHandoff?.repositorySettingsPreview?.applied
                    ? "적용 후 검증 필요"
                    : existingHandoff
                      ? "적용 대기"
                      : "승인 후 자동 적용"
              }
              isComplete={repositorySettingsVerified}
              title="Repository 설정"
            />
            <PrTaskRow
              description={
                awsTrustVerified
                  ? awsRoleDiff === null
                    ? "변경 필요 없음"
                    : "적용·검증 완료"
                  : awsRoleDiff?.applied
                    ? "적용 후 검증 필요"
                    : existingHandoff
                      ? "적용 대기"
                      : "승인 후 자동 적용"
              }
              isComplete={awsTrustVerified}
              title="AWS 신뢰 정책"
            />
            <PrTaskRow
              description={
                pullRequestReady
                  ? "PR 생성됨"
                  : applyPlanReady && initialApplicationReady
                    ? existingHandoff
                      ? "생성 또는 업데이트 대기"
                      : "생성 가능"
                    : "선행 조건 완료 후 생성"
              }
              isComplete={pullRequestReady}
              title="배포 PR"
            />
          </ul>
        </div>

        {handoffErrorMessage ? (
          <p className={styles.deploymentStageAlert} role="alert">
            {handoffErrorMessage}
          </p>
        ) : null}

        {existingHandoff ? (
          <p className={handoffStyles.notice}>
            {handoffSetupComplete
              ? "Repository 설정, AWS 신뢰 정책과 PR 준비가 완료되었습니다."
              : "이 승인 Plan의 CI/CD 설정이 일부 남아 있습니다."}
            {existingHandoff.pullRequestUrl ? (
              <a href={existingHandoff.pullRequestUrl} rel="noreferrer" target="_blank">
                GitHub에서 PR 열기
              </a>
            ) : null}
          </p>
        ) : null}

        {isHandoffReviewOpen ? (
          <div className={handoffStyles.review} role="group" aria-label="CI/CD PR 생성 확인">
            <strong>{existingHandoff ? "CI/CD 설정 계속하기" : "CI/CD 설정 및 PR 검토"}</strong>
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
              <div>
                <dt>RDS</dt>
                <dd>
                  {configurationPreview
                    ? configurationPreview.rdsEnabled
                      ? "사용"
                      : "사용 안 함"
                    : "확인 필요"}
                </dd>
              </div>
              <div>
                <dt>Static Site URL</dt>
                <dd>
                  {configurationPreview
                    ? configurationPreview.staticSiteUrl ?? "생성하지 않음"
                    : "확인 필요"}
                </dd>
              </div>
              <div>
                <dt>API Base URL</dt>
                <dd>
                  {configurationPreview
                    ? configurationPreview.apiBaseUrl ?? "생성하지 않음"
                    : "확인 필요"}
                </dd>
              </div>
            </dl>
            <ul>
              <li>
                GitHub Environment와 Actions variables를 현재 프로젝트 값으로 적용하고 검증합니다.
              </li>
              <li>AWS Role에 필요한 GitHub OIDC 신뢰 조건만 추가하고 검증합니다.</li>
              <li>검증된 설정으로 배포 workflow와 Terraform PR을 생성하거나 이어서 준비합니다.</li>
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
                {isHandoffBusy
                  ? "설정 적용 중"
                  : existingHandoff
                    ? "설정 계속하기"
                    : "설정 적용 및 PR 생성"}
              </button>
            </div>
          </div>
        ) : null}

        {handoffs.length > 1 ? (
          <label className={styles.cicdRunSelect}>
            이전 handoff
            <select
              onChange={(event) => onSelectHandoff(event.target.value)}
              value={currentHandoff?.id ?? ""}
            >
              {handoffs.map((handoff) => (
                <option key={handoff.id} value={handoff.id}>
                  {handoff.repositoryOwner}/{handoff.repositoryName} ·{" "}
                  {getGitCicdHandoffLabel(handoff.status)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {currentHandoff ? (
          <>
            <div className={handoffStyles.result}>
              <div>
                <strong>
                  {currentHandoff.repositoryOwner}/{currentHandoff.repositoryName}
                </strong>
                <span>{currentHandoff.targetBranch}</span>
              </div>
              {currentHandoff.statusMessage ? <p>{currentHandoff.statusMessage}</p> : null}
              <div className={handoffStyles.actions}>
                {currentHandoff.pullRequestUrl ? (
                  <a
                    className={styles.deploymentSecondaryButton}
                    href={currentHandoff.pullRequestUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    GitHub Pull Request 열기
                  </a>
                ) : null}
              </div>
            </div>
            {handoffSetupComplete ? (
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
            ) : null}
          </>
        ) : null}
      </div>
    </CicdAccordionSection>
  );
}

function PrTaskRow({
  actionLabel,
  description,
  isComplete,
  onAction,
  title
}: {
  readonly actionLabel?: string | undefined;
  readonly description: ReactNode;
  readonly isComplete: boolean;
  readonly onAction?: (() => void) | undefined;
  readonly title: string;
}) {
  return (
    <li data-ready={isComplete}>
      <div className={handoffStyles.readinessItemContent}>
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
      </div>
      {!isComplete && actionLabel && onAction ? (
        <button className={styles.deploymentSecondaryButton} onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </li>
  );
}

function renderDeploymentOutput(output: {
  readonly label: string;
  readonly url: string | null;
}): ReactNode {
  if (!output.url) return output.label;
  return (
    <a href={output.url} rel="noreferrer" target="_blank">
      {output.label}
    </a>
  );
}

function isReadinessItemReady(
  readiness: GitCicdReadinessSnapshot,
  items: readonly GitCicdHandoffReadinessItem[],
  key: "approved_apply_plan" | "initial_application_release"
): boolean {
  const itemReady = items.find((item) => item.key === key)?.ready === true;
  if (key === "approved_apply_plan") {
    return readiness.approvedApplyPlanArtifactId !== null || itemReady;
  }
  return readiness.initialApplicationReleaseId !== null || itemReady;
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
