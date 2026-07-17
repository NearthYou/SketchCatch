"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceDeploymentNotificationCenterSlot } from "../../../components/notifications/DeploymentNotificationCenter";
import { ProductBrand } from "../../../components/ui/ProductBrand";
import { ConversationTranscript } from "./conversation-transcript";
import { DecorativeAwsOrbit } from "./decorative-aws-orbit";
import { FinalArchitecturePreview } from "./final-architecture-preview";
import { createDecorativeOrbitComposition } from "./option-resource-presentation";
import {
  appendSelectedAssistantOption,
  type SelectedAssistantOption
} from "./selected-option-model";
import { SelectedOptionTrail } from "./selected-option-trail";
import type { AiStartExistingProject, AiStartMessage } from "./ai-start-model";
import { useAiStartWorkflow } from "./use-ai-start-workflow";
import {
  getWorkspaceAiStageTransition,
  resolveFinalArchitectureDiagram,
  type WorkspaceAiStagePhase
} from "./workspace-ai-presentation";
import { WorkspaceAiComposer } from "./workspace-ai-composer";
import styles from "./workspace-ai.module.css";

export function WorkspaceAiShell({
  existingProject
}: {
  readonly existingProject?: AiStartExistingProject | undefined;
}) {
  const workflow = useAiStartWorkflow({ existingProject });
  const [selections, setSelections] = useState<readonly SelectedAssistantOption[]>([]);
  const [stagePhase, setStagePhase] = useState<WorkspaceAiStagePhase>("orbit");
  const selectionsRef = useRef<readonly SelectedAssistantOption[]>([]);
  const orbitComposition = useMemo(
    () => createDecorativeOrbitComposition(selections),
    [selections]
  );
  const finalDiagram = resolveFinalArchitectureDiagram(
    workflow.draft,
    workflow.compilationProposal
  );
  const hasFinalPreview =
    finalDiagram !== null && workflow.draft !== null && workflow.compilationProposal !== null;
  const showFinalPreview = hasFinalPreview && stagePhase === "preview";
  const projectName =
    workflow.projectDraft?.projectName ??
    existingProject?.projectName ??
    "새 Practice Architecture";

  useEffect(() => {
    const transition = getWorkspaceAiStageTransition({
      hasFinalPreview,
      prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
    });

    setStagePhase(transition.phase);
    if (transition.phase !== "orbit-exiting") return;

    const timeoutId = window.setTimeout(() => {
      setStagePhase("preview");
    }, transition.delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [hasFinalPreview]);

  function handleSuggestionSelect(message: AiStartMessage, suggestion: string): void {
    if (
      workflow.approvalState === "loading" ||
      workflow.voiceInput.isListening ||
      workflow.voiceTranscriptNeedsConfirmation
    ) {
      return;
    }

    const result = appendSelectedAssistantOption(selectionsRef.current, {
      label: suggestion,
      questionMessageId: message.id,
      selectedAt: new Date().toISOString()
    });

    if (!result.didAppend) return;

    selectionsRef.current = result.selections;
    setSelections(result.selections);
    void workflow.submitPrompt(suggestion);
  }

  const stageState = hasFinalPreview
    ? workflow.approvalState === "loading"
      ? "적용 중"
      : "최종 Preview"
    : workflow.requestState === "loading"
      ? "응답 중"
      : "탐색 중";

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarBrand}>
          <ProductBrand />
          <span className={styles.topBarProjectName}>{projectName}</span>
        </div>
        <p className={styles.topBarTitle}>AI 초안</p>
        <div className={styles.topBarState}>
          <span>{stageState}</span>
          <WorkspaceDeploymentNotificationCenterSlot />
          <button
            disabled={workflow.approvalState === "loading"}
            onClick={workflow.cancelStart}
            type="button"
          >
            나가기
          </button>
        </div>
      </header>

      <div className={styles.splitLayout}>
        <section aria-label="AI 대화" className={styles.conversationPanel} id="conversation">
          <ConversationTranscript
            hasFinalPreview={showFinalPreview}
            isInteractionLocked={workflow.approvalState === "loading"}
            isSuggestionInputBlocked={
              workflow.approvalState === "loading" ||
              workflow.voiceInput.isListening ||
              workflow.voiceTranscriptNeedsConfirmation
            }
            lastExclusion={workflow.lastExclusion}
            messages={workflow.messages}
            onCancelRequest={workflow.cancelRequest}
            onExcludeCandidate={workflow.excludeProgressCandidate}
            onRetry={workflow.retryDraft}
            onSuggestionSelect={handleSuggestionSelect}
            onUndoExclusion={workflow.undoLastExclusion}
            progressSnapshot={workflow.progressSnapshot}
            requestState={workflow.requestState}
            selections={selections}
          />

          <WorkspaceAiComposer
            canSubmit={workflow.canSubmit}
            onChange={workflow.setComposerValue}
            onConfirmVoiceTranscript={workflow.confirmVoiceTranscript}
            onSubmit={workflow.submitPrompt}
            value={workflow.composerValue}
            voiceInput={workflow.voiceInput}
            voiceTranscriptNeedsConfirmation={workflow.voiceTranscriptNeedsConfirmation}
          />
        </section>

        <aside
          aria-label={showFinalPreview ? "최종 Architecture Preview" : "장식용 AWS Resource Orbit"}
          aria-live="polite"
          className={`${styles.visualStage} ${showFinalPreview ? styles.visualStageFinal : ""}`}
        >
          {showFinalPreview && finalDiagram && workflow.draft && workflow.compilationProposal ? (
            <FinalArchitecturePreview
              approvalError={workflow.approvalError}
              canApprove={workflow.canApprove}
              diagram={finalDiagram}
              draft={workflow.draft}
              isApplying={workflow.approvalState === "loading"}
              onApply={workflow.approveDraft}
              onRegenerate={workflow.regenerateDraft}
              proposal={workflow.compilationProposal}
              selections={selections}
            />
          ) : (
            <>
              <div className={styles.stageCanvas}>
                <DecorativeAwsOrbit
                  composition={orbitComposition}
                  isExiting={stagePhase === "orbit-exiting"}
                />
              </div>
              <SelectedOptionTrail selections={selections} />
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
