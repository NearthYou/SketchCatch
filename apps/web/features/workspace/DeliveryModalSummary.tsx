import { useEffect, useState } from "react";
import type { GitCicdPipelineRun, ProjectDeliveryProfile } from "@sketchcatch/types";
import { getApiErrorMessage } from "../../lib/api-client";
import { getProjectDeliveryProfile, listGitCicdPipelineRuns } from "./api";
import styles from "./delivery-center.module.css";

export function DeliveryModalSummary({
  onOpenDelivery,
  projectId
}: {
  readonly onOpenDelivery: () => void;
  readonly projectId: string;
}) {
  const [profile, setProfile] = useState<ProjectDeliveryProfile | null>(null);
  const [recentRun, setRecentRun] = useState<GitCicdPipelineRun | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getProjectDeliveryProfile(projectId), listGitCicdPipelineRuns(projectId, { limit: 1 })])
      .then(([nextProfile, runs]) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setRecentRun(runs.runs[0] ?? null);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(getApiErrorMessage(error, "CI/CD 요약을 불러오지 못했습니다."));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <section className={styles.modalSummary} aria-labelledby="delivery-modal-summary-title">
      <div>
        <p>CI/CD 요약</p>
        <h2 id="delivery-modal-summary-title">상세 설정은 Delivery에서 관리합니다</h2>
      </div>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {!profile && !errorMessage ? <p role="status">CI/CD 상태를 불러오는 중입니다.</p> : null}
      {profile ? (
        <dl className={styles.modalDefinitionList}>
          <div><dt>Source Repository</dt><dd>{profile.sourceRepository ? `${profile.sourceRepository.owner}/${profile.sourceRepository.name}` : "선택 필요"}</dd></div>
          <div><dt>Readiness</dt><dd>{profile.readiness.ready ? "준비됨" : `${profile.readiness.requiredActionCount}개 확인 필요`}</dd></div>
          <div><dt>최근 실행</dt><dd>{recentRun ? `${recentRun.status} · ${recentRun.branch} · ${recentRun.commitSha.slice(0, 8)}` : "실행 기록 없음"}</dd></div>
        </dl>
      ) : null}
      <button className={styles.primaryButton} onClick={onOpenDelivery} type="button">
        Delivery 열기
      </button>
      <p>이 화면에서는 설정을 수정하거나 Pipeline을 실행하지 않습니다.</p>
    </section>
  );
}
