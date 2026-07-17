import type { GitCicdPipelineRun } from "@sketchcatch/types";
import { formatPipelineExecutionKind } from "./cicd-deployment-command";
import styles from "./workspace.module.css";

export function CicdActivityView({ run }: { readonly run: GitCicdPipelineRun | null }) {
  if (!run) {
    return <p className={styles.deploymentHint}>아직 감지된 Pipeline Run이 없습니다.</p>;
  }

  return (
    <section className={styles.cicdActivity} aria-label="Pipeline activity">
      <header>
        <div>
          <span>{formatPipelineExecutionKind(run.executionKind)}</span>
          <h3>{run.commitMessage || "Commit message 없음"}</h3>
          <p>{run.branch} · {run.commitSha.slice(0, 8)}</p>
          <p>
            시작 {formatTime(run.startedAt ?? run.createdAt)} · 종료 {run.finishedAt ? formatTime(run.finishedAt) : "진행 중"}
          </p>
        </div>
        <strong data-status={run.status}>{formatRunStatus(run.status)}</strong>
      </header>
      {run.statusMessage ? (
        <p role={run.status === "failed" || run.status === "cancelled" ? "alert" : "status"}>
          {run.statusMessage}
        </p>
      ) : null}
      {run.release ? (
        <dl className={styles.cicdReleaseSummary}>
          <div>
            <dt>Release</dt>
            <dd>{run.release.version}</dd>
          </div>
          <div>
            <dt>Artifact digest</dt>
            <dd>{run.release.artifactDigest.slice(0, 12)}</dd>
          </div>
          <div>
            <dt>Provider revision</dt>
            <dd>{run.release.providerRevision?.revisionId ?? "-"}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>
              {run.release.outputUrl ? (
                <a href={run.release.outputUrl} rel="noreferrer" target="_blank">
                  열기
                </a>
              ) : (
                "-"
              )}
            </dd>
          </div>
        </dl>
      ) : null}
      <ol className={styles.cicdStageList}>
        {run.stages.map((stage) => (
          <li data-status={stage.status} key={stage.id}>
            <span>{formatStage(stage.kind)}</span>
            <strong>{formatStageStatus(stage.status)}</strong>
            {stage.runUrl ? (
              <a href={stage.runUrl} rel="noreferrer" target="_blank">GitHub Actions에서 보기</a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

function formatRunStatus(status: GitCicdPipelineRun["status"]): string {
  return ({
    detected: "감지됨",
    queued: "대기 중",
    running: "실행 중",
    succeeded: "성공",
    failed: "실패",
    cancelled: "취소됨"
  } as const)[status];
}

function formatStage(kind: GitCicdPipelineRun["stages"][number]["kind"]): string {
  return ({
    detect: "변경 감지",
    app_build: "앱 빌드",
    artifact_publish: "아티팩트 게시",
    infra_plan: "Terraform Plan",
    infra_apply: "Terraform Apply",
    app_deploy: "릴리즈 적용",
    verify: "배포 검증"
  } as const)[kind];
}

function formatStageStatus(status: GitCicdPipelineRun["stages"][number]["status"]): string {
  return ({
    not_started: "시작 전",
    queued: "대기 중",
    running: "실행 중",
    succeeded: "성공",
    failed: "실패",
    skipped: "건너뜀",
    cancelled: "취소됨"
  } as const)[status];
}
