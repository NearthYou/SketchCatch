import type { GitCicdPipelineLog, GitCicdPipelineRun } from "@sketchcatch/types";
import { PlayCircle } from "lucide-react";
import { CicdAccordionSection, type CicdAccordionTone } from "./CicdAccordionSection";
import { CicdActivityView } from "./CicdActivityView";
import { CicdLogsView } from "./CicdLogsView";
import { DeploymentOutputLinks } from "./DeploymentOutputLinks";
import {
  formatPipelineRunOption,
  formatPipelineRunStatus,
  getPipelinePresentation
} from "./cicd-delivery-presentation";
import type { SafeDeploymentLink } from "./deployment-output-links";
import type { CicdConsoleView } from "./CicdConsoleScreen";
import deliveryStyles from "./delivery-center.module.css";
import styles from "./workspace.module.css";

export function CicdPipelineRunsPanel({
  activeView,
  canOpenLiveObservation,
  canRetryFrontend,
  frontendRetryError,
  isFrontendRetrying,
  isHandoffReady,
  isLogsLoading,
  isRefreshing,
  isReadinessRefreshing,
  logs,
  logsErrorMessage,
  onManualRefresh,
  onOpenLiveObservation,
  onRetryFrontend,
  onRetryLogs,
  onSelectRun,
  onSelectView,
  outputLinks,
  runs,
  selectedRun
}: {
  readonly activeView: CicdConsoleView;
  readonly canOpenLiveObservation: boolean;
  readonly canRetryFrontend: boolean;
  readonly frontendRetryError: string;
  readonly isFrontendRetrying: boolean;
  readonly isHandoffReady: boolean;
  readonly isLogsLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isReadinessRefreshing: boolean;
  readonly logs: readonly GitCicdPipelineLog[];
  readonly logsErrorMessage: string;
  readonly onManualRefresh: () => void;
  readonly onOpenLiveObservation?: (() => void) | undefined;
  readonly onRetryFrontend: () => void;
  readonly onRetryLogs: () => void;
  readonly onSelectRun: (runId: string) => void;
  readonly onSelectView: (view: CicdConsoleView) => void;
  readonly outputLinks: readonly SafeDeploymentLink[];
  readonly runs: readonly GitCicdPipelineRun[];
  readonly selectedRun: GitCicdPipelineRun | null;
}) {
  const presentation = getPipelinePresentation(runs);
  const latestRun =
    [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

  return (
    <CicdAccordionSection
      defaultOpen={presentation.showRunControls}
      openWhen={presentation.showRunControls}
      headerAction={
        <button
          aria-label="Pipeline 새로고침"
          className={deliveryStyles.accordionRowAction}
          disabled={isRefreshing || isReadinessRefreshing}
          onClick={onManualRefresh}
          type="button"
        >
          {isRefreshing || isReadinessRefreshing ? "갱신 중" : "새로고침"}
        </button>
      }
      icon={<PlayCircle size={17} />}
      id="cicd-pipeline"
      metadata={
        <span className={deliveryStyles.accordionSingleMeta}>
          GitHub Actions · {latestRun ? `${latestRun.branch} branch` : "최근 실행 없음"}
        </span>
      }
      statusLabel={latestRun ? formatPipelineRunStatus(latestRun.status) : "실행 없음"}
      statusTone={latestRun ? getPipelineTone(latestRun.status) : "pending"}
      title="Pipeline"
    >
      <div className={deliveryStyles.accordionContent}>
        {!presentation.showRunControls ? (
          <div className={styles.cicdEmptyState}>
            <strong>{presentation.emptyTitle}</strong>
            <p>{presentation.emptyDescription}</p>
            <span className={deliveryStyles.emptyStateHint}>
              {isHandoffReady
                ? "상단 새로고침으로 실행을 확인합니다."
                : "먼저 배포 PR 준비를 완료하세요."}
            </span>
          </div>
        ) : (
          <>
            <label className={styles.cicdRunSelect}>
              Pipeline Run
              <select
                value={selectedRun?.id ?? ""}
                onChange={(event) => onSelectRun(event.target.value)}
              >
                {(runs ?? []).map((run) => (
                  <option key={run.id} value={run.id}>
                    {formatPipelineRunOption(run)}
                  </option>
                ))}
              </select>
            </label>

            {selectedRun ? <SelectedRunSummary run={selectedRun} /> : null}

            <DeploymentOutputLinks
              links={outputLinks}
              onOpenLiveObservation={canOpenLiveObservation ? onOpenLiveObservation : undefined}
              scopeKey={selectedRun?.id ?? null}
            />

            {canRetryFrontend ? (
              <section className={styles.deploymentStageAlert} aria-live="polite">
                <strong>API는 정상 배포됐지만 웹 활성화가 완료되지 않았습니다.</strong>
                <p>
                  기존 HTTPS URL과 API는 유지됩니다. 검증된 동일 frontend Artifact로 웹 단계만 다시
                  실행합니다.
                </p>
                <button
                  className={styles.deploymentPrimaryButton}
                  disabled={isFrontendRetrying}
                  onClick={onRetryFrontend}
                  type="button"
                >
                  {isFrontendRetrying ? "웹 배포 재시도 중" : "웹 배포만 재시도"}
                </button>
              </section>
            ) : null}
            {frontendRetryError ? (
              <p className={styles.deploymentStageAlert} role="alert">
                {frontendRetryError}
              </p>
            ) : null}

            <div
              className={styles.cicdViewNavigation}
              aria-label="Pipeline 상세 보기"
              role="tablist"
            >
              {(["activity", "logs"] as const).map((view) => (
                <button
                  aria-controls={`cicd-${view}-panel`}
                  aria-selected={activeView === view}
                  id={`cicd-${view}-tab`}
                  key={view}
                  onClick={() => onSelectView(view)}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                    event.preventDefault();
                    const nextView = view === "activity" ? "logs" : "activity";
                    onSelectView(nextView);
                    event.currentTarget.parentElement
                      ?.querySelector<HTMLButtonElement>(`#cicd-${nextView}-tab`)
                      ?.focus();
                  }}
                  role="tab"
                  tabIndex={activeView === view ? 0 : -1}
                  type="button"
                >
                  {({ activity: "Activity", logs: "Logs" } as const)[view]}
                </button>
              ))}
            </div>
            <div
              aria-labelledby="cicd-activity-tab"
              hidden={activeView !== "activity"}
              id="cicd-activity-panel"
              role="tabpanel"
              tabIndex={0}
            >
              <CicdActivityView run={selectedRun} />
            </div>
            <div
              aria-labelledby="cicd-logs-tab"
              hidden={activeView !== "logs"}
              id="cicd-logs-panel"
              role="tabpanel"
              tabIndex={0}
            >
              <CicdLogsView
                errorMessage={logsErrorMessage}
                isLoading={isLogsLoading}
                logs={logs}
                onRetry={onRetryLogs}
                run={selectedRun}
              />
            </div>
          </>
        )}
      </div>
    </CicdAccordionSection>
  );
}

function getPipelineTone(status: GitCicdPipelineRun["status"]): CicdAccordionTone {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled") return "warning";
  return "info";
}

function SelectedRunSummary({ run }: { readonly run: GitCicdPipelineRun }) {
  return (
    <section className={styles.cicdRunSummary} aria-label="선택한 Pipeline Run">
      <div>
        <strong>{formatPipelineRunOption(run)}</strong>
        {run.pipelineRunUrl ? (
          <a href={run.pipelineRunUrl} rel="noreferrer" target="_blank">
            GitHub Actions에서 보기
          </a>
        ) : null}
      </div>
      <dl>
        <div>
          <dt>Commit message</dt>
          <dd>{run.commitMessage || "Commit message 없음"}</dd>
        </div>
        <div>
          <dt>Trigger</dt>
          <dd>{run.branch} branch 변경 감지</dd>
        </div>
        <div>
          <dt>실행 시간</dt>
          <dd>
            {formatTime(run.startedAt ?? run.createdAt)} –{" "}
            {run.finishedAt ? formatTime(run.finishedAt) : "진행 중"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
