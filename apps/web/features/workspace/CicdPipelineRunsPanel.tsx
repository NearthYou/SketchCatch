import type { GitCicdPipelineLog, GitCicdPipelineRun } from "@sketchcatch/types";
import { CicdAccordionSection, type CicdAccordionTone } from "./CicdAccordionSection";
import { CicdActivityView } from "./CicdActivityView";
import { CicdLogsView } from "./CicdLogsView";
import { DeploymentOutputLinks } from "./DeploymentOutputLinks";
import { formatPipelineRunOption, getPipelinePresentation } from "./cicd-delivery-presentation";
import type { SafeDeploymentLink } from "./deployment-output-links";
import type { CicdConsoleView } from "./CicdConsoleScreen";
import deliveryStyles from "./delivery-center.module.css";
import styles from "./workspace.module.css";

export function CicdPipelineRunsPanel({
  activeView,
  canOpenLiveObservation,
  canRetryFrontend,
  frontendRetryError,
  isCurrent,
  isFrontendRetrying,
  isHandoffReady,
  isLogsLoading,
  logs,
  logsErrorMessage,
  onOpenLiveObservation,
  onRetryFrontend,
  onRetryLogs,
  onSelectRun,
  onSelectView,
  outputLinks,
  phaseStatusLabel,
  phaseStatusTone,
  runs,
  selectedRun
}: {
  readonly activeView: CicdConsoleView;
  readonly canOpenLiveObservation: boolean;
  readonly canRetryFrontend: boolean;
  readonly frontendRetryError: string;
  readonly isCurrent: boolean;
  readonly isFrontendRetrying: boolean;
  readonly isHandoffReady: boolean;
  readonly isLogsLoading: boolean;
  readonly logs: readonly GitCicdPipelineLog[];
  readonly logsErrorMessage: string;
  readonly onOpenLiveObservation?: (() => void) | undefined;
  readonly onRetryFrontend: () => void;
  readonly onRetryLogs: () => void;
  readonly onSelectRun: (runId: string) => void;
  readonly onSelectView: (view: CicdConsoleView) => void;
  readonly outputLinks: readonly SafeDeploymentLink[];
  readonly phaseStatusLabel: string;
  readonly phaseStatusTone: CicdAccordionTone;
  readonly runs: readonly GitCicdPipelineRun[];
  readonly selectedRun: GitCicdPipelineRun | null;
}) {
  const presentation = getPipelinePresentation(runs);

  return (
    <CicdAccordionSection
      defaultOpen={isCurrent}
      openWhen={isCurrent}
      id="cicd-pipeline"
      isCurrent={isCurrent}
      metadata="PR 생성 이후 Pipeline 실행 상태를 확인합니다."
      phaseNumber="04"
      statusLabel={phaseStatusLabel}
      statusTone={phaseStatusTone}
      title="Pipeline"
    >
      <div className={deliveryStyles.accordionContent}>
        {!presentation.showRunControls ? (
          <p className={deliveryStyles.emptyStateHint}>
            아직 실행된 Pipeline이 없습니다.
            {!isHandoffReady ? <span>PR 생성 후 실행</span> : null}
          </p>
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
                  className={styles.deploymentSecondaryButton}
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
