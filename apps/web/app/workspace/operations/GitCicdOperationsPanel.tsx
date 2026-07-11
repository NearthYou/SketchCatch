"use client";

import { ExternalLink, GitBranch, LoaderCircle, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import type { WorkspaceDeploymentState } from "./use-workspace-deployment";
import type { WorkspaceGitCicdState } from "./use-workspace-git-cicd";
import styles from "./workspace-operations.module.css";

// 현재 배포 artifact를 GitHub PR과 Pipeline으로 넘기는 모든 행동을 보여줍니다.
export function GitCicdOperationsPanel({
  deployment,
  gitCicd,
  projectId
}: {
  readonly deployment: WorkspaceDeploymentState;
  readonly gitCicd: WorkspaceGitCicdState;
  readonly projectId: string;
}) {
  const current = gitCicd.current;
  const isBusy = gitCicd.requestState === "loading";

  return (
    <div className={styles.panelBody}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Git / CI / CD</p>
          <h2>Repository 배포</h2>
        </div>
        <span className={styles.statusText} data-tone={current?.status ?? "draft"}>
          {getGitCicdStatusLabel(current?.status)}
        </span>
      </header>

      {gitCicd.errorMessage ? (
        <p className={styles.inlineNotice} data-tone="error">{gitCicd.errorMessage}</p>
      ) : null}

      {gitCicd.repositories.length === 0 ? (
        <section className={styles.resultSection}>
          <h3>연결된 GitHub Repository가 없습니다.</h3>
          <p className={styles.emptyText}>프로젝트 설정에서 배포할 Repository를 먼저 연결해주세요.</p>
          <a className={styles.inlineLink} href={`/dashboard/projects/${encodeURIComponent(projectId)}/settings?tab=github`}>
            GitHub 연결 <ExternalLink aria-hidden="true" size={13} />
          </a>
        </section>
      ) : (
        <section className={styles.gitSetup}>
          <label>
            <span>배포 Repository</span>
            <select
              disabled={isBusy}
              onChange={(event) => gitCicd.setSelectedRepositoryId(event.target.value)}
              value={gitCicd.selectedRepositoryId}
            >
              {gitCicd.repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.owner}/{repository.name} · {repository.defaultBranch}
                </option>
              ))}
            </select>
          </label>
          <button
            className={styles.primaryButton}
            disabled={isBusy || !deployment.current}
            onClick={() => void gitCicd.create()}
            type="button"
          >
            {isBusy ? <LoaderCircle aria-hidden="true" size={15} /> : <GitBranch aria-hidden="true" size={15} />}
            Git/CI/CD 준비
          </button>
          {!deployment.current ? (
            <p className={styles.inlineNotice}>Direct Deployment에서 배포 기준을 먼저 저장해야 합니다.</p>
          ) : null}
        </section>
      )}

      {gitCicd.handoffs.length > 0 ? (
        <label className={styles.handoffSelect}>
          <span>이전 handoff</span>
          <select onChange={(event) => gitCicd.select(event.target.value)} value={current?.id ?? ""}>
            {gitCicd.handoffs.map((handoff) => (
              <option key={handoff.id} value={handoff.id}>
                {handoff.repositoryOwner}/{handoff.repositoryName} · {getGitCicdStatusLabel(handoff.status)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {current ? (
        <section className={styles.gitHandoffDetails}>
          <div className={styles.sectionTitleRow}>
            <h3>{current.repositoryOwner}/{current.repositoryName}</h3>
            <button aria-label="Pipeline 상태 새로고침" onClick={() => void gitCicd.refresh()} title="새로고침" type="button">
              <RefreshCw aria-hidden="true" size={14} />
            </button>
          </div>
          <dl className={styles.handoffFacts}>
            <div><dt>Environment</dt><dd>{current.environmentName}</dd></div>
            <div><dt>Branch</dt><dd>{current.targetBranch}</dd></div>
            <div><dt>Infrastructure</dt><dd>{getPipelineStatusLabel(current.infraPipelineStatus)}</dd></div>
            <div><dt>Application</dt><dd>{getPipelineStatusLabel(current.appPipelineStatus)}</dd></div>
          </dl>

          {current.statusMessage ? <p className={styles.inlineNotice}>{current.statusMessage}</p> : null}

          {current.repositorySettingsPreview ? (
            <details className={styles.gitDetails} open>
              <summary>Repository 변경 확인</summary>
              <p>{current.repositorySettingsPreview.workflowFiles.length}개 workflow와 {current.repositorySettingsPreview.variables.length}개 variable을 준비합니다.</p>
              <button className={styles.secondaryButton} disabled={isBusy} onClick={() => void gitCicd.applyRepositorySettings()} type="button">
                <Settings2 aria-hidden="true" size={14} /> Repository 설정 적용
              </button>
            </details>
          ) : null}

          {current.githubOAuthRequired ? (
            <div className={styles.actionRow}>
              <button className={styles.secondaryButton} disabled={isBusy} onClick={() => void gitCicd.startGitHubOAuth()} type="button">
                GitHub OAuth 승인
              </button>
              <button className={styles.secondaryButton} disabled={isBusy} onClick={() => void gitCicd.applyRepositorySettingsWithOAuth()} type="button">
                승인 후 다시 적용
              </button>
            </div>
          ) : null}

          {current.awsRoleDiff && !current.awsRoleDiff.applied ? (
            <details className={styles.gitDetails} open>
              <summary>AWS Role 변경 확인</summary>
              <p>{current.awsRoleDiff.repository}의 GitHub Actions만 Role을 맡도록 trust 조건을 적용합니다.</p>
              <button className={styles.secondaryButton} disabled={isBusy} onClick={() => void gitCicd.applyAwsRoleDiff()} type="button">
                <ShieldCheck aria-hidden="true" size={14} /> AWS Role 변경 적용
              </button>
            </details>
          ) : null}

          <div className={styles.gitLinks}>
            {current.pullRequestUrl ? <a href={current.pullRequestUrl} rel="noreferrer" target="_blank">Pull Request <ExternalLink aria-hidden="true" size={12} /></a> : null}
            {current.infraPipelineRunUrl ? <a href={current.infraPipelineRunUrl} rel="noreferrer" target="_blank">Infrastructure Pipeline <ExternalLink aria-hidden="true" size={12} /></a> : null}
            {current.appPipelineRunUrl ? <a href={current.appPipelineRunUrl} rel="noreferrer" target="_blank">Application Pipeline <ExternalLink aria-hidden="true" size={12} /></a> : null}
            {current.staticSiteUrl ? <a href={current.staticSiteUrl} rel="noreferrer" target="_blank">배포된 Web <ExternalLink aria-hidden="true" size={12} /></a> : null}
            {current.apiBaseUrl ? <a href={current.apiBaseUrl} rel="noreferrer" target="_blank">배포된 API <ExternalLink aria-hidden="true" size={12} /></a> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// Handoff 상태를 사용자가 바로 이해할 수 있는 짧은 문구로 바꿉니다.
function getGitCicdStatusLabel(status: string | undefined): string {
  if (status === "pr_created") return "PR 생성됨";
  if (status === "pipeline_running") return "Pipeline 실행 중";
  if (status === "pipeline_success") return "배포 성공";
  if (status === "pipeline_failed") return "Pipeline 실패";
  if (status === "cancelled") return "취소됨";
  return "준비 전";
}

// 세부 Pipeline 상태를 같은 한국어 상태 어휘로 표시합니다.
function getPipelineStatusLabel(status: string): string {
  if (status === "waiting_for_merge") return "Merge 대기";
  if (status === "waiting_for_approval") return "승인 대기";
  if (status === "running") return "실행 중";
  if (status === "success") return "성공";
  if (status === "failed") return "실패";
  if (status === "cancelled") return "취소";
  return "시작 전";
}
