import type { GitCicdPipelineRun } from "@sketchcatch/types";
import styles from "./workspace.module.css";

export function CicdActivityView({ run }: { readonly run: GitCicdPipelineRun | null }) {
  if (!run) {
    return <p className={styles.deploymentHint}>아직 감지된 Pipeline Run이 없습니다.</p>;
  }

  return (
    <section className={styles.cicdActivity} aria-label="Pipeline activity">
      <header>
        <div>
          <span>{formatScope(run.changeScope)}</span>
          <h3>{run.commitMessage || "Commit message 없음"}</h3>
          <p>{run.branch} · {run.commitSha.slice(0, 8)}</p>
          <p>
            시작 {formatTime(run.startedAt ?? run.createdAt)} · 종료 {run.finishedAt ? formatTime(run.finishedAt) : "진행 중"}
          </p>
        </div>
        <strong data-status={run.status}>{formatRunStatus(run.status)}</strong>
      </header>
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

function formatScope(scope: GitCicdPipelineRun["changeScope"]): string {
  return scope === "app" ? "App" : scope === "infra" ? "Infrastructure" : "App + Infrastructure";
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
    infra_plan: "Terraform Plan",
    infra_apply: "Terraform Apply",
    app_deploy: "앱 배포",
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
