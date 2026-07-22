import type { GitCicdPipelineLog, GitCicdPipelineRun } from "@sketchcatch/types";
import styles from "./workspace.module.css";

export function CicdLogsView({
  errorMessage,
  isLoading,
  logs,
  onRetry,
  run
}: {
  readonly errorMessage: string;
  readonly isLoading: boolean;
  readonly logs: readonly GitCicdPipelineLog[];
  readonly onRetry: () => void;
  readonly run: GitCicdPipelineRun | null;
}) {
  return (
    <section className={styles.cicdLogs} aria-label="CI/CD logs">
      <div className={styles.deploymentSectionHeader}>
        <div>
          <h4>CI/CD logs</h4>
          <p>선택한 commit의 GitHub Actions 단계 로그입니다.</p>
        </div>
        <div className={styles.deploymentHeaderActions}>
          <button className={styles.deploymentSecondaryButton} onClick={onRetry} type="button">로그 다시 시도</button>
        </div>
      </div>
      {errorMessage ? (
        <p className={styles.deploymentStageAlert} role="alert">{errorMessage}</p>
      ) : null}
      {!run ? (
        <p className={styles.deploymentHint}>로그를 볼 Pipeline Run을 선택하세요.</p>
      ) : logs.length === 0 ? (
        <p className={styles.deploymentHint}>{isLoading ? "로그를 불러오는 중입니다." : "아직 수집된 CI/CD 로그가 없습니다."}</p>
      ) : (
        <ol className={styles.cicdLogList}>
          {logs.map((log) => (
            <li data-level={log.level} key={log.id}>
              <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleTimeString("ko-KR")}</time>
              <span>{log.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
