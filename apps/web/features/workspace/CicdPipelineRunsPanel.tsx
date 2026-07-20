import type {
  GitCicdPipelineLog,
  GitCicdPipelineRun
} from "@sketchcatch/types";
import { CicdActivityView } from "./CicdActivityView";
import { CicdLogsView } from "./CicdLogsView";
import { DeploymentOutputLinks } from "./DeploymentOutputLinks";
import {
  formatPipelineRunOption,
  getPipelinePresentation
} from "./cicd-delivery-presentation";
import type { SafeDeploymentLink } from "./deployment-output-links";
import type { CicdConsoleView } from "./CicdConsoleScreen";
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

  return (
    <section className={styles.cicdPipelinePanel} id="cicd-pipeline" aria-labelledby="cicd-pipeline-title">
      <div className={styles.deploymentSectionHeader}>
        <div>
          <h3 id="cicd-pipeline-title">Pipeline</h3>
          <p>GitHub Actions 실행 단계와 결과를 확인합니다.</p>
        </div>
        {presentation.showRunControls ? (
          <button
            className={styles.deploymentSecondaryButton}
            disabled={isRefreshing || isReadinessRefreshing}
            onClick={onManualRefresh}
            type="button"
          >
            {isRefreshing || isReadinessRefreshing ? "갱신 중" : "새로고침"}
          </button>
        ) : null}
      </div>

      {!presentation.showRunControls ? (
        <div className={styles.cicdEmptyState}>
          <strong>{presentation.emptyTitle}</strong>
          <p>{presentation.emptyDescription}</p>
          {isHandoffReady ? (
            <button
              className={styles.deploymentPrimaryButton}
              disabled={isRefreshing || isReadinessRefreshing}
              onClick={onManualRefresh}
              type="button"
            >
              {isRefreshing || isReadinessRefreshing ? "확인 중" : "Pipeline 새로고침"}
            </button>
          ) : (
            <a className={styles.deploymentPrimaryButton} href="#cicd-handoff">
              배포 PR 준비 확인
            </a>
          )}
        </div>
      ) : (
        <>
          <label className={styles.cicdRunSelect}>
            Pipeline Run
            <select
              value={selectedRun?.id ?? ""}
              onChange={(event) => onSelectRun(event.target.value)}
            >
              {runs.map((run) => (
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
              <p>기존 HTTPS URL과 API는 유지됩니다. 검증된 동일 frontend Artifact로 웹 단계만 다시 실행합니다.</p>
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
            <p className={styles.deploymentStageAlert} role="alert">{frontendRetryError}</p>
          ) : null}

          <div className={styles.cicdViewNavigation} aria-label="Pipeline 상세 보기" role="tablist">
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
    </section>
  );
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
            {formatTime(run.startedAt ?? run.createdAt)} – {run.finishedAt ? formatTime(run.finishedAt) : "진행 중"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}
