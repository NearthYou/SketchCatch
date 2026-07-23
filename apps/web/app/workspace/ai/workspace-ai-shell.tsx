"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
  createWorkspaceAiOrbitReactionKey,
  getWorkspaceAiOrbitPresentation,
  getWorkspaceAiStageTransition,
  resolveWorkspaceAiMobileView,
  resolveFinalArchitectureDiagram,
  shouldShowMobilePreviewTrigger,
  type WorkspaceAiStagePhase
} from "./workspace-ai-presentation";
import { WorkspaceAiComposer } from "./workspace-ai-composer";
import styles from "./workspace-ai.module.css";

/** AI 대화, 장식 Orbit, 승인 전 최종 Preview의 화면 전환을 조율합니다. */
export function WorkspaceAiShell({
  existingProject
}: {
  readonly existingProject?: AiStartExistingProject | undefined;
}) {
  const workflow = useAiStartWorkflow({ existingProject });
  const [selections, setSelections] = useState<readonly SelectedAssistantOption[]>([]);
  const [stagePhase, setStagePhase] = useState<WorkspaceAiStagePhase>("orbit");
  const [mobilePreviewRequested, setMobilePreviewRequested] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
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
  const answerCount = workflow.messages.filter(({ role }) => role === "user").length;
  const orbitPresentation = getWorkspaceAiOrbitPresentation({ answerCount, stagePhase });
  const orbitReactionKey = createWorkspaceAiOrbitReactionKey({ stagePhase });
  const mobileView = resolveWorkspaceAiMobileView({
    hasFinalPreview: showFinalPreview,
    previewRequested: mobilePreviewRequested
  });
  const showMobilePreviewTrigger = shouldShowMobilePreviewTrigger({
    hasFinalPreview: showFinalPreview,
    mobileView
  });
  const projectName =
    workflow.projectDraft?.projectName ??
    existingProject?.projectName ??
    "새 Practice Architecture";

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const transition = getWorkspaceAiStageTransition({
      currentPhase: stagePhase,
      hasFinalPreview,
      prefersReducedMotion
    });

    setStagePhase(transition.phase);
    if (transition.phase !== "orbit-exiting") return;

    const timeoutId = window.setTimeout(() => {
      setStagePhase("preview");
    }, transition.delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [hasFinalPreview, prefersReducedMotion, stagePhase]);

  useEffect(() => {
    if (!showFinalPreview) setMobilePreviewRequested(false);
  }, [showFinalPreview]);

  useEffect(() => {
    const acceptedSelection = workflow.acceptedClarificationSelection;
    if (acceptedSelection === null) return;
    const result = appendSelectedAssistantOption(selectionsRef.current, acceptedSelection);
    if (!result.didAppend) return;
    selectionsRef.current = result.selections;
    setSelections(result.selections);
  }, [workflow.acceptedClarificationSelection]);

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
      : "초안 준비됨"
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
          <span className={styles.stageBadge}>{stageState}</span>
          {mobileView === "preview" ? (
            <button
              className={styles.mobileBackToConversation}
              onClick={() => setMobilePreviewRequested(false)}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={14} /> 대화
            </button>
          ) : null}
          {showMobilePreviewTrigger ? (
            <button
              className={styles.mobilePreviewTrigger}
              onClick={() => setMobilePreviewRequested(true)}
              type="button"
            >
              미리보기
            </button>
          ) : null}
          {showFinalPreview ? (
            <button
              aria-label={
                workflow.approvalState === "loading" ? "보드에 적용 중" : "보드에 적용"
              }
              className={styles.topBarApply}
              disabled={!workflow.canApprove}
              onClick={() => void workflow.approveDraft()}
              type="button"
            >
              <span className={styles.topBarApplyFullLabel}>
                {workflow.approvalState === "loading" ? "적용 중" : "보드에 적용"}
              </span>
              <span className={styles.topBarApplyShortLabel}>
                {workflow.approvalState === "loading" ? "적용 중" : "적용"}
              </span>
              {workflow.approvalState !== "loading" ? (
                <ArrowRight aria-hidden="true" size={14} />
              ) : null}
            </button>
          ) : null}
          {showFinalPreview && workflow.approvalError ? (
            <span className={styles.topBarApplyError} role="alert">
              {workflow.approvalError}
            </span>
          ) : null}
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

      <div
        className={`${styles.splitLayout} ${showFinalPreview ? styles.splitLayoutFinal : styles.splitLayoutConversation} ${mobileView === "preview" ? styles.mobilePreviewOpen : ""}`}
      >
        <section
          aria-label="AI 대화"
          className={`${styles.conversationPanel} ${showFinalPreview ? styles.conversationPanelFinal : styles.conversationPanelActive}`}
          id="conversation"
        >
          <ConversationTranscript
            hasFinalPreview={showFinalPreview}
            isInteractionLocked={workflow.approvalState === "loading"}
            isSuggestionInputBlocked={
              workflow.approvalState === "loading" ||
              workflow.voiceInput.isListening ||
              workflow.voiceTranscriptNeedsConfirmation
            }
            messages={workflow.messages}
            onCancelRequest={workflow.cancelRequest}
            onOpenPreview={() => setMobilePreviewRequested(true)}
            onRetry={workflow.retryDraft}
            onSuggestionSelect={handleSuggestionSelect}
            requestState={workflow.requestState}
            selections={selections}
          />

          {selections.length > 0 ? (
            <div className={styles.mobileSelectionTrail}>
              <SelectedOptionTrail compact selections={selections} />
            </div>
          ) : null}

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
          aria-label={showFinalPreview ? "완성된 AI 초안" : "장식용 AWS 리소스 장면"}
          aria-live="polite"
          className={`${styles.visualStage} ${showFinalPreview ? styles.visualStageFinal : styles.visualStageOrbit}`}
        >
          {showFinalPreview && finalDiagram && workflow.draft && workflow.compilationProposal ? (
            <FinalArchitecturePreview
              diagram={finalDiagram}
              selections={selections}
            />
          ) : (
            <>
              <div className={styles.stageCanvas}>
                <DecorativeAwsOrbit
                  composition={orbitComposition}
                  convergenceLevel={orbitPresentation.convergenceLevel}
                  isConverging={orbitPresentation.phase === "converging"}
                  reactionKey={orbitReactionKey}
                  visibleRingCount={orbitPresentation.visibleRingCount}
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
