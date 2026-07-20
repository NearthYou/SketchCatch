import type {
  GitCicdPipelineLog,
  GitCicdPipelineRun
} from "@sketchcatch/types";
import { CicdActivityView } from "./CicdActivityView";
import { CicdLogsView } from "./CicdLogsView";
import { DeploymentOutputLinks } from "./DeploymentOutputLinks";
import { formatPipelineExecutionKind } from "./cicd-deployment-command";
import type { SafeDeploymentLink } from "./deployment-output-links";
import type { CicdConsoleView } from "./CicdConsoleScreen";
import styles from "./workspace.module.css";

export function CicdPipelineRunsPanel({
  activeView,
  canOpenLiveObservation,
  canRetryFrontend,
  frontendRetryError,
  isFrontendRetrying,
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
  return (
    <section className={styles.cicdPipelinePanel} id="cicd-pipeline" aria-labelledby="cicd-pipeline-title">
      <div className={styles.deploymentSectionHeader}>
        <div>
          <h3 id="cicd-pipeline-title">Pipeline</h3>
          <p>GitHub Actions 실행 단계와 결과를 확인합니다.</p>
        </div>
        <button
          className={styles.deploymentSecondaryButton}
          disabled={isRefreshing || isReadinessRefreshing}
          onClick={onManualRefresh}
          type="button"
        >
          {isRefreshing || isReadinessRefreshing ? "갱신 중" : "새로고침"}
        </button>
      </div>

      <div className={styles.cicdViewNavigation} aria-label="CI/CD console view">
        {(["activity", "logs"] as const).map((view) => (
          <button
            aria-pressed={activeView === view}
            key={view}
            onClick={() => onSelectView(view)}
            type="button"
          >
            {({ activity: "Activity", logs: "Logs" } as const)[view]}
          </button>
        ))}
      </div>

      {runs.length > 0 ? (
        <label className={styles.cicdRunSelect}>
          Pipeline Run
          <select value={selectedRun?.id ?? ""} onChange={(event) => onSelectRun(event.target.value)}>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {formatPipelineExecutionKind(run.executionKind)} · {run.commitSha.slice(0, 8)}
                {run.githubWorkflowRunId ? ` · Run ${run.githubWorkflowRunId}` : ""}
                {run.githubWorkflowRunAttempt ? ` · 시도 ${run.githubWorkflowRunAttempt}` : ""} · {run.commitMessage}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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
      {runs.length === 0 ? (
        <p className={styles.cicdState} role="status">
          아직 감지된 Pipeline Run이 없습니다.
        </p>
      ) : activeView === "activity" ? (
        <CicdActivityView run={selectedRun} />
      ) : (
        <CicdLogsView
          errorMessage={logsErrorMessage}
          isLoading={isLogsLoading}
          logs={logs}
          onOpenLiveObservation={onOpenLiveObservation}
          onRetry={onRetryLogs}
          run={selectedRun}
        />
      )}
    </section>
  );
}
