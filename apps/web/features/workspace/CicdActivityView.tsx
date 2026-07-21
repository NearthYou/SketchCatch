import type { GitCicdPipelineRun } from "@sketchcatch/types";
import { formatPipelineRunStatus } from "./cicd-delivery-presentation";
import styles from "./workspace.module.css";

export function CicdActivityView({ run }: { readonly run: GitCicdPipelineRun | null }) {
  if (!run) {
    return <p className={styles.deploymentHint}>아직 감지된 Pipeline Run이 없습니다.</p>;
  }

  return (
    <section className={styles.cicdActivity} aria-label="Pipeline activity">
      <header>
        <div>
          <h4>실행 단계</h4>
          <p>각 GitHub Actions 단계의 상태와 시간을 확인합니다.</p>
        </div>
        <strong data-status={run.status}>{formatPipelineRunStatus(run.status)}</strong>
      </header>
      {run.statusMessage ? (
        <p role={run.status === "failed" || run.status === "cancelled" ? "alert" : "status"}>
          {run.statusMessage}
        </p>
      ) : null}
      <ol className={styles.cicdStageList}>
        {run.stages.map((stage) => (
          <li data-status={stage.status} key={stage.id}>
            <span>{formatStage(stage.kind)}</span>
            <span>{formatStageTime(stage.startedAt, stage.finishedAt)}</span>
            <strong>{formatStageStatus(stage.status)}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatStageTime(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "시작 전";
  const started = new Date(startedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" });
  return finishedAt
    ? `${started} – ${new Date(finishedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}`
    : `${started} – 진행 중`;
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
