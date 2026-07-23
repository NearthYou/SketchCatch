"use client";

import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, GitBranch } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type {
  RepositoryAnalysisTemplateId,
  RepositoryTemplateRecommendationCandidate,
  SourceRepository,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

import { BoardThumbnailImage } from "../../../components/architecture-board/BoardThumbnailImage";
import { listBoardTemplates } from "../../../features/resource-settings/template-library";
import {
  createRepositoryEvidenceSummary,
  getRepositoryDisplayIdentity
} from "./repository-analysis-presentation";
import { getRepositoryTemplatePreviewIndex } from "./repository-template-preview";
import styles from "./repository-analysis-screen.module.css";

const TEMPLATE_METADATA_BY_ID = new Map(
  listBoardTemplates().map((template) => [
    template.id,
    {
      thumbnailSrc: template.thumbnailSrc ?? null,
      title: template.title
    }
  ])
);

type RepositoryTemplatePreviewCandidate = Pick<
  RepositoryTemplateRecommendationCandidate,
  "confidence" | "displayTitle" | "reasons" | "templateId"
>;

export function RepositoryAnalysisForm({
  branch,
  errorMessage,
  isBusy,
  onBranchChange,
  onRepositoryUrlChange,
  onSubmit,
  repositoryUrl
}: {
  readonly branch: string;
  readonly errorMessage: string;
  readonly isBusy: boolean;
  readonly onBranchChange: (branch: string) => void;
  readonly onRepositoryUrlChange: (repositoryUrl: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly repositoryUrl: string;
}) {
  return (
    <section aria-label="GitHub 저장소 분석" className={styles.formSection}>
      <form onSubmit={onSubmit}>
        <div className={styles.formFields}>
          <label className={styles.field} htmlFor="repository-url">
            <span>Repository URL</span>
            <input
              autoComplete="url"
              id="repository-url"
              name="repositoryUrl"
              onChange={(event) => onRepositoryUrlChange(event.target.value)}
              placeholder="https://github.com/owner/repository"
              required
              type="url"
              value={repositoryUrl}
            />
          </label>
          <label className={styles.field} htmlFor="repository-branch">
            <span className={styles.fieldLabel}>
              <GitBranch aria-hidden="true" size={24} />
              <span>Branch</span>
            </span>
            <input
              autoComplete="off"
              id="repository-branch"
              name="branch"
              onChange={(event) => onBranchChange(event.target.value)}
              placeholder="기본 branch 자동 감지"
              type="text"
              value={branch}
            />
          </label>
        </div>
        <div className={styles.formActions}>
          <p className={styles.formHint}>
            공개 저장소는 GitHub 연결 없이 분석할 수 있습니다.
          </p>
          <button
            className={styles.primaryButton}
            disabled={isBusy || !repositoryUrl.trim()}
            type="submit"
          >
            {isBusy ? "분석 중" : "URL 분석"}
          </button>
        </div>
      </form>
      {isBusy ? (
        <p aria-live="polite" className={styles.statusMessage} role="status">
          저장소를 분석하고 있습니다.
        </p>
      ) : null}
      {errorMessage ? (
        <p className={styles.errorMessage} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

export function RepositoryAnalysisResult({
  aiDesignHref,
  analysis,
  analyzeAnotherLabel = "다른 저장소 분석",
  candidates,
  isBusy,
  onAnalyzeAnother,
  onUseTemplate,
  resetKey,
  statusLabel = "분석 완료",
  toolbar
}: {
  readonly aiDesignHref: string;
  readonly analysis: SourceRepositoryAnalysisResult | SourceRepository;
  readonly analyzeAnotherLabel?: string;
  readonly candidates: readonly RepositoryTemplatePreviewCandidate[];
  readonly isBusy: boolean;
  readonly onAnalyzeAnother: () => void;
  readonly onUseTemplate: (templateId: RepositoryAnalysisTemplateId) => void;
  readonly resetKey: string;
  readonly statusLabel?: string;
  readonly toolbar?: ReactNode;
}) {
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    setPreviewIndex(0);
  }, [resetKey]);

  const evidence = createRepositoryEvidenceSummary(analysis);
  const resolvedPreviewIndex =
    candidates.length > 0 ? Math.min(previewIndex, candidates.length - 1) : 0;
  const currentCandidate = candidates[resolvedPreviewIndex] ?? candidates[0];
  const currentTemplate = currentCandidate
    ? TEMPLATE_METADATA_BY_ID.get(currentCandidate.templateId)
    : undefined;

  return (
    <section aria-labelledby="repository-result-title" className={styles.resultSection}>
      <RepositoryAnalysisSummary
        actionLabel={analyzeAnotherLabel}
        analysis={analysis}
        headingId="repository-result-title"
        isBusy={isBusy}
        onAction={onAnalyzeAnother}
        statusLabel={statusLabel}
      />
      {toolbar ? <div className={styles.resultToolbar}>{toolbar}</div> : null}

      <div className={styles.resultLayout}>
        <aside aria-labelledby="repository-evidence-title" className={styles.evidenceColumn}>
          <p className={styles.sectionLabel} id="repository-evidence-title">
            저장소에서 찾은 근거
          </p>
          {evidence.length > 0 ? (
            <dl className={styles.evidenceList}>
              {evidence.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.emptyEvidence}>표시할 수 있는 분석 근거가 없습니다.</p>
          )}
        </aside>

        <div className={styles.previewColumn}>
          <p className={styles.sectionLabel}>Template Preview</p>
          {currentCandidate ? (
            <>
              <div className={styles.previewHeading}>
                <div>
                  <h3>{currentCandidate.displayTitle}</h3>
                  <p className={styles.confidence}>
                    적합도 {Math.round(currentCandidate.confidence * 100)}%
                  </p>
                </div>
              </div>
              <p aria-atomic="true" aria-live="polite" className={styles.srOnly}>
                {`${currentCandidate.displayTitle}, 적합도 ${Math.round(
                  currentCandidate.confidence * 100
                )}%${
                  candidates.length > 1
                    ? `, ${resolvedPreviewIndex + 1} / ${candidates.length}`
                    : ""
                }, ${
                  currentCandidate.reasons[0] ?? "추천 이유가 제공되지 않았습니다."
                }`}
              </p>

              <BoardThumbnailImage
                alt={`${currentCandidate.displayTitle} Template 미리보기`}
                className={styles.previewImage}
                src={currentTemplate?.thumbnailSrc ?? null}
              />

              <div className={styles.previewFooter}>
                {candidates.length > 1 ? (
                  <nav aria-label="Template 후보 탐색" className={styles.previewNavigation}>
                    <button
                      aria-label="이전 Template"
                      className={styles.iconButton}
                      disabled={resolvedPreviewIndex === 0}
                      onClick={() =>
                        setPreviewIndex((current) =>
                          getRepositoryTemplatePreviewIndex(
                            current,
                            candidates.length,
                            "previous"
                          )
                        )
                      }
                      type="button"
                    >
                      <ChevronLeft aria-hidden="true" size={18} />
                    </button>
                    <span className={styles.previewOrder}>
                      {resolvedPreviewIndex + 1} / {candidates.length}
                    </span>
                    <button
                      aria-label="다음 Template"
                      className={styles.iconButton}
                      disabled={resolvedPreviewIndex === candidates.length - 1}
                      onClick={() =>
                        setPreviewIndex((current) =>
                          getRepositoryTemplatePreviewIndex(current, candidates.length, "next")
                        )
                      }
                      type="button"
                    >
                      <ChevronRight aria-hidden="true" size={18} />
                    </button>
                  </nav>
                ) : null}
                <p className={styles.recommendationReason}>
                  {currentCandidate.reasons[0] ?? "추천 이유가 제공되지 않았습니다."}
                </p>
              </div>

              <div className={styles.previewActions}>
                <Link className={styles.aiAction} href={aiDesignHref}>
                  AI 새 설계
                </Link>
                <button
                  className={styles.primaryButton}
                  disabled={isBusy}
                  onClick={() => onUseTemplate(currentCandidate.templateId)}
                  type="button"
                >
                  {isBusy ? "처리 중" : "이 Template 사용"}
                </button>
              </div>
            </>
          ) : (
            <div className={styles.emptyPreview}>
              <p>추천할 수 있는 Template 후보가 없습니다.</p>
              <Link className={styles.aiAction} href={aiDesignHref}>
                AI 새 설계
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function RepositoryAnalysisSummary({
  actionLabel,
  analysis,
  headingId,
  isBusy,
  onAction,
  statusLabel = "분석 완료"
}: {
  readonly actionLabel: string;
  readonly analysis: SourceRepositoryAnalysisResult | SourceRepository;
  readonly headingId: string;
  readonly isBusy: boolean;
  readonly onAction: () => void;
  readonly statusLabel?: string;
}) {
  const identity = getRepositoryDisplayIdentity(analysis);

  return (
    <header className={styles.repositoryHeader}>
      <div className={styles.repositoryIdentity}>
        <p className={styles.eyebrow}>Repository</p>
        <h2 id={headingId}>
          <span>{identity.owner}</span>
          <span aria-hidden="true"> / </span>
          <span>{identity.name}</span>
        </h2>
        <div className={styles.repositoryMeta}>
          <span>
            <GitBranch aria-hidden="true" size={14} />
            {identity.branch}
          </span>
          <span
            className={
              statusLabel === "분석 완료" ? styles.completedStatus : styles.pendingStatus
            }
            role="status"
          >
            {statusLabel === "분석 완료" ? (
              <CheckCircle2 aria-hidden="true" size={14} />
            ) : null}
            {statusLabel}
          </span>
        </div>
      </div>
      <button
        className={styles.tertiaryButton}
        disabled={isBusy}
        onClick={onAction}
        type="button"
      >
        {actionLabel}
      </button>
    </header>
  );
}
