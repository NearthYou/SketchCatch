"use client";

import { ArrowRight, ArrowUp, RotateCcw } from "lucide-react";
import type {
  AiArchitectureDraftResult,
  ArchitectureBoardCompilationProposal,
  DiagramJson
} from "@sketchcatch/types";
import { DiagramEditor } from "../../../features/diagram-editor";
import { createArchitectureBoardCompilationPreview } from "../../../features/architecture-board-compiler";
import type { SelectedAssistantOption } from "./selected-option-model";
import { SelectedOptionTrail } from "./selected-option-trail";
import styles from "./workspace-ai.module.css";

export function FinalArchitecturePreview({
  approvalError,
  canApprove,
  diagram,
  draft,
  isApplying,
  onApply,
  onRegenerate,
  proposal,
  selections
}: {
  readonly approvalError: string | null;
  readonly canApprove: boolean;
  readonly diagram: DiagramJson;
  readonly draft: AiArchitectureDraftResult;
  readonly isApplying: boolean;
  readonly onApply: () => Promise<void>;
  readonly onRegenerate: () => Promise<void>;
  readonly proposal: ArchitectureBoardCompilationProposal;
  readonly selections: readonly SelectedAssistantOption[];
}) {
  const summary = createArchitectureBoardCompilationPreview(proposal);
  const previewIdentity = [
    proposal.provenance.candidateId,
    proposal.provenance.compilerVersion,
    JSON.stringify(diagram)
  ].join("::");
  const warnings = draft.metadata.guardrailWarnings?.map(({ message }) => message) ?? [];
  const fallbackEvidence = draft.llmExplanation
    ? [
        draft.llmExplanation.summary,
        ...draft.llmExplanation.highlights,
        ...(draft.llmExplanation.fallbackUsed
          ? [`Fallback 사용: ${draft.llmExplanation.fallbackReason ?? "안전 규칙"}`]
          : ["Rule fallback 미사용"])
      ]
    : ["LLM 설명 없음"];

  return (
    <section
      aria-labelledby="final-preview-heading"
      className={styles.previewShell}
      id="final-architecture-preview"
    >
      <header className={styles.previewHeader}>
        <p>Final Preview</p>
        <h2 id="final-preview-heading">{draft.title}</h2>
      </header>

      <div className={styles.previewFrame}>
        <DiagramEditor
          initialDiagram={diagram}
          initialPreviewDiagram={diagram}
          key={previewIdentity}
          mode="viewer"
          rightPanel={null}
          showSaveAction={false}
        />
      </div>

      <div>
        <div className={styles.previewEvidence}>
          <details>
            <summary>
              Compiler 근거 · 변경 {proposal.changes.length} · 진단 {proposal.diagnostics.length}
            </summary>
            <ul>
              <li>
                품질 점수 {summary.quality.beforeScore.toFixed(1)} →{" "}
                {summary.quality.afterScore.toFixed(1)}
              </li>
              <li>Compilation distance {summary.quality.compilationDistance.toFixed(1)}</li>
              {summary.diagnosticSummaries.length > 0 ? (
                summary.diagnosticSummaries.map((diagnostic, index) => (
                  <li key={`${index}:${diagnostic}`}>{diagnostic}</li>
                ))
              ) : (
                <li>Compiler 진단 없음</li>
              )}
            </ul>
          </details>

          <details>
            <summary>가정·설명·경고</summary>
            <ul>
              <li>신뢰도: {draft.metadata.confidence}</li>
              {draft.metadata.assumptions.map((assumption, index) => (
                <li key={`assumption:${index}:${assumption}`}>가정: {assumption}</li>
              ))}
              {draft.metadata.explanations.map((explanation, index) => (
                <li key={`explanation:${index}:${explanation}`}>{explanation}</li>
              ))}
              {warnings.length > 0 ? (
                warnings.map((warning, index) => (
                  <li key={`warning:${index}:${warning}`}>경고: {warning}</li>
                ))
              ) : (
                <li>Draft guardrail 경고 없음</li>
              )}
            </ul>
          </details>

          <details>
            <summary>생성·fallback·Template 근거</summary>
            <ul>
              <li>Draft source: {draft.metadata.source}</li>
              <li>Compiler: {summary.compilerVersion}</li>
              {fallbackEvidence.map((evidence, index) => (
                <li key={`evidence:${index}:${evidence}`}>{evidence}</li>
              ))}
              {summary.referenceTemplateIds.length > 0 ? (
                summary.referenceTemplateIds.map((templateId, index) => (
                  <li key={`template:${index}:${templateId}`}>Reference Template: {templateId}</li>
                ))
              ) : (
                <li>일반 Compiler 규칙 사용</li>
              )}
            </ul>
          </details>
        </div>

        <SelectedOptionTrail compact selections={selections} />

        <div className={styles.previewActions}>
          <a className={styles.backToConversation} href="#conversation">
            <ArrowUp aria-hidden="true" size={15} /> 대화로 돌아가기
          </a>
          <span className={styles.previewApprovalBoundary}>
            적용 전에는 Board를 변경하지 않습니다.
          </span>
          {approvalError ? (
            <span className={styles.previewApplyError} role="alert">
              {approvalError}
            </span>
          ) : null}
          <div className={styles.previewActionsGroup}>
            <button
              className={styles.previewSecondary}
              disabled={isApplying}
              onClick={() => void onRegenerate()}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={15} /> 다시 생성
            </button>
            <button
              className={styles.previewPrimary}
              disabled={!canApprove}
              onClick={() => void onApply()}
              type="button"
            >
              {isApplying ? "적용 중" : "Board에 적용"}
              {!isApplying ? <ArrowRight aria-hidden="true" size={15} /> : null}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
