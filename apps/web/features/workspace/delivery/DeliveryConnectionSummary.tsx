import Link from "next/link";
import type { ProjectDeliveryProfile } from "@sketchcatch/types";
import { getDeliveryRepositoryPresentationState } from "./delivery-repository-state";
import styles from "../delivery-center.module.css";

export type DeliveryConnectionSummaryProps = {
  readonly accountLogins: readonly string[];
  readonly profile: Pick<ProjectDeliveryProfile, "repositoryAnalysisTarget" | "sourceRepository">;
  readonly repositoryHref: string;
  readonly showHeader?: boolean | undefined;
};

export function DeliveryConnectionSummary({
  accountLogins,
  profile,
  repositoryHref,
  showHeader = true
}: DeliveryConnectionSummaryProps) {
  const repositoryState = getDeliveryRepositoryPresentationState(profile);

  return (
    <section
      className={`${styles.card} ${styles.connectionSummary}`}
      id={showHeader ? "cicd-source-repository" : undefined}
      aria-label="CI/CD 연결 상태"
    >
      {showHeader ? (
        <div className={styles.cardHeading}>
          <h4>Delivery 연결</h4>
          <strong data-ready={repositoryState.kind === "connected"}>
            {repositoryState.kind === "connected" ? "연결됨" : "연결 필요"}
          </strong>
        </div>
      ) : null}
      <dl className={styles.connectionFacts}>
        <div>
          <dt>GitHub</dt>
          <dd>
            {(accountLogins ?? []).length > 0 ? (
              `${(accountLogins ?? []).join(", ")} · 연결됨`
            ) : (
              <Link href="/dashboard/settings#github-account-settings-title">GitHub 연결 필요</Link>
            )}
          </dd>
        </div>
        <div>
          <dt>Source Repository</dt>
          <dd>
            {repositoryState.kind === "connected" ? (
              <>
                {repositoryState.repository.owner}/{repositoryState.repository.name}
                {" · "}
                {repositoryState.repository.defaultBranch}
                {" · 자동 적용"}
              </>
            ) : repositoryState.kind === "connection_required" ? (
              <>
                {repositoryState.analysisTarget.owner}/{repositoryState.analysisTarget.name}
                {" · "}
                {repositoryState.analysisTarget.branch}
                {" · "}
                <Link href={repositoryHref}>PR 권한 연결 필요</Link>
              </>
            ) : (
              <Link href={repositoryHref}>Repository 선택</Link>
            )}
          </dd>
        </div>
      </dl>
      <p>자동 적용은 Repository를 선택한 상태이며 PR 생성 승인을 뜻하지 않습니다.</p>
    </section>
  );
}
