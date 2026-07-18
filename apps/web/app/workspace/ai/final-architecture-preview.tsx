"use client";

import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import type { DiagramJson } from "@sketchcatch/types";
import { DiagramEditor } from "../../../features/diagram-editor";
import type { SelectedAssistantOption } from "./selected-option-model";
import { SelectedOptionTrail } from "./selected-option-trail";
import styles from "./workspace-ai.module.css";

export function FinalArchitecturePreview({
  approvalError,
  canApprove,
  diagram,
  isApplying,
  onApply,
  onBackToConversation,
  onRegenerate,
  selections
}: {
  readonly approvalError: string | null;
  readonly canApprove: boolean;
  readonly diagram: DiagramJson;
  readonly isApplying: boolean;
  readonly onApply: () => Promise<void>;
  readonly onBackToConversation: () => void;
  readonly onRegenerate: () => Promise<void>;
  readonly selections: readonly SelectedAssistantOption[];
}) {
  const previewIdentity = JSON.stringify(diagram);

  return (
    <section
      aria-label="아키텍처 미리보기"
      className={styles.previewShell}
      id="final-architecture-preview"
    >
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
        <SelectedOptionTrail compact selections={selections} />

        <div className={styles.previewActions}>
          <button
            className={styles.backToConversation}
            onClick={onBackToConversation}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={15} /> 대화로 돌아가기
          </button>
          <span className={styles.previewApprovalBoundary}>
            적용하기 전에는 보드가 바뀌지 않아요.
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
              {isApplying ? "적용 중" : "보드에 적용"}
              {!isApplying ? <ArrowRight aria-hidden="true" size={15} /> : null}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
