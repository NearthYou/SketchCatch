import type {
  GitCicdMonitoringConfig,
  GitCicdPipelineRun,
  SourceRepository
} from "@sketchcatch/types";
import { CicdActivityView } from "./CicdActivityView";
import { isCicdPipelineRunStale } from "./cicd-console-state";
import styles from "./workspace.module.css";

export function CicdOverviewView({
  config,
  currentRun,
  repository
}: {
  readonly config: GitCicdMonitoringConfig | null;
  readonly currentRun: GitCicdPipelineRun | null;
  readonly repository: SourceRepository;
}) {
  return (
    <div className={styles.cicdOverview}>
      <section className={styles.cicdRepositorySummary}>
        <div>
          <span>Source Repository</span>
          <h3>{repository.owner}/{repository.name}</h3>
          <p>{config?.monitorBranch || repository.defaultBranch}</p>
        </div>
        <strong data-status={config?.validationStatus ?? "required"}>
          {config?.enabled ? "Monitoring on" : "Monitoring off"}
        </strong>
      </section>
      {config ? (
        <dl className={styles.cicdOverviewPaths}>
          <div><dt>App path</dt><dd>{formatPath(config.appPath)}</dd></div>
          <div><dt>Infrastructure path</dt><dd>{formatPath(config.infraPath)}</dd></div>
        </dl>
      ) : null}
      {currentRun && isCicdPipelineRunStale(currentRun) ? (
        <p className={styles.deploymentStageAlert} role="status">상태 갱신이 지연되고 있습니다.</p>
      ) : null}
      <CicdActivityView run={currentRun} />
    </div>
  );
}

function formatPath(path: GitCicdMonitoringConfig["appPath"]): string {
  return path.mode === "repository_root" ? "저장소 루트 (.)" : path.path;
}
