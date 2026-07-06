"use client";

import { useMemo, useState } from "react";
import type {
  AiArchitectureDraftResult,
  ArchitectureDraftClarification,
  ArchitectureGuardrailWarning,
  CreateArchitectureDraftResponse,
  DesignSimulationResult
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createAiArchitectureDraft,
  runAiDesignSimulation
} from "./api";
import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";
import {
  createWorkspaceAiBoardSnapshot,
  isWorkspaceAiResultStale
} from "./workspace-ai-panel-state";
import {
  WorkspaceAiActionHeader,
  WorkspaceAiDesignSimulationResult,
  WorkspaceAiExplanation,
  WorkspaceAiGuardrailWarnings,
  WorkspaceAiRequestMessage
} from "./WorkspaceAiPanelPieces";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import {
  DEFAULT_REQUIREMENT_PROMPT,
  promptGuideExamples
} from "./workspace-ai-panel-options";
import styles from "./workspace.module.css";

export type WorkspaceAiPanelProps = {
  readonly context: DiagramEditorPanelContext;
};

const DESIGN_SIMULATION_DEFAULTS = {
  budgetLevel: "normal",
  trafficLevel: "normal"
} as const;

// 실제 Architecture Board 오른쪽 패널에서 gg AI MVP 흐름을 실행합니다.
export function WorkspaceAiPanel({ context }: WorkspaceAiPanelProps) {
  const [prompt, setPrompt] = useState(DEFAULT_REQUIREMENT_PROMPT);
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [designSimulation, setDesignSimulation] = useState<DesignSimulationResult | null>(null);
  const [draftState, setDraftState] = useState<AiRequestState>("idle");
  const [simulationState, setSimulationState] = useState<AiRequestState>("idle");
  const [draftErrorMessage, setDraftErrorMessage] = useState("");
  const [simulationErrorMessage, setSimulationErrorMessage] = useState("");
  const [simulationFingerprint, setSimulationFingerprint] = useState<string | null>(null);
  const boardSnapshot = useMemo(
    () => createWorkspaceAiBoardSnapshot(context.diagram),
    [context.diagram]
  );
  const hasStaleDesignSimulation =
    designSimulation !== null &&
    isWorkspaceAiResultStale(simulationFingerprint, boardSnapshot.fingerprint);
  const draftWarnings = useMemo(
    () => createDraftWarnings(draft, boardSnapshot.hasResources),
    [boardSnapshot.hasResources, draft]
  );

  async function createDraftFromPrompt(): Promise<void> {
    if (prompt.trim().length === 0) {
      setDraftState("error");
      setDraftErrorMessage("Requirement Prompt를 먼저 입력해주세요.");
      return;
    }

    setDraftState("loading");
    setDraftErrorMessage("");
    setDraft(null);
    context.setPreviewDiagram(null);

    try {
      const result = await createAiArchitectureDraft({
        prompt
      });

      if (isArchitectureDraftClarification(result)) {
        setDraftState("error");
        setDraftErrorMessage(result.question);
        return;
      }

      const previewDiagram = convertArchitectureJsonToDiagramJson(result.architectureJson);

      setDraft(result);
      context.setPreviewDiagram(previewDiagram);
      setDraftState("idle");
    } catch (error) {
      setDraftState("error");
      setDraftErrorMessage(getApiErrorMessage(error, "아키텍처 초안 생성 중 오류가 발생했습니다."));
    }
  }

  function applyDraftToBoard(): void {
    if (draft === null) {
      return;
    }

    context.applyDiagramJson(convertArchitectureJsonToDiagramJson(draft.architectureJson));
    requestImmediateDiagramSave();
    setDraft(null);
    setDesignSimulation(null);
    setSimulationFingerprint(null);
  }

  function requestImmediateDiagramSave(): void {
    const savePromise = context.saveDiagramNow?.();

    if (savePromise) {
      void savePromise.catch(() => undefined);
    }
  }

  function cancelDraftPreview(): void {
    context.setPreviewDiagram(null);
    setDraft(null);
    setDraftErrorMessage("");
    setDraftState("idle");
  }

  async function runDesignSimulation(): Promise<void> {
    if (context.isPreviewActive) {
      setSimulationState("error");
      setSimulationErrorMessage("AI 초안 미리보기 중에는 현재 보드 시뮬레이션을 실행할 수 없습니다.");
      return;
    }

    if (!boardSnapshot.hasResources) {
      setSimulationState("error");
      setSimulationErrorMessage("아키텍처 보드에 리소스가 있어야 실행할 수 있습니다.");
      return;
    }

    setSimulationState("loading");
    setSimulationErrorMessage("");

    try {
      const result = await runAiDesignSimulation({
        architectureJson: boardSnapshot.architectureJson,
        ...DESIGN_SIMULATION_DEFAULTS
      });
      setDesignSimulation(result);
      setSimulationFingerprint(boardSnapshot.fingerprint);
      setSimulationState("idle");
    } catch (error) {
      setSimulationState("error");
      setSimulationErrorMessage(getApiErrorMessage(error, "설계 시뮬레이션 중 오류가 발생했습니다."));
    }
  }

  return (
    <div className={styles.aiPanel}>
      <header className={styles.aiPanelHeader}>
        <span>자연어 다이어그램</span>
        <h2>자연어 다이어그램</h2>
      </header>

      <section className={styles.aiSection}>
        <label className={styles.aiField}>
          <span>요구사항 프롬프트</span>
          <textarea
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            value={prompt}
          />
        </label>
        <div className={styles.aiPromptGuide} aria-label="프롬프트 작성 가이드">
          <div className={styles.aiPromptGuideHeader}>
            <strong>그냥 이렇게 시작해도 돼요</strong>
          </div>
          <div className={styles.aiPromptChips}>
            {promptGuideExamples.map((example) => (
              <button
                className={styles.aiPromptChip}
                key={example}
                onClick={() => setPrompt(example)}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
        {draft === null ? (
          <button
            className={styles.aiPrimaryButton}
            disabled={draftState === "loading"}
            onClick={() => void createDraftFromPrompt()}
            type="button"
          >
            {draftState === "loading" ? "초안 생성 중" : "초안 미리보기 생성"}
          </button>
        ) : null}
        <WorkspaceAiRequestMessage state={draftState} message={draftErrorMessage} />
        {draft !== null ? (
          <article className={styles.aiResultCard}>
            <div className={styles.aiResultHeader}>
              <h3>{draft.title}</h3>
              <span>{draft.architectureJson.nodes.length}개 리소스</span>
            </div>
            <WorkspaceAiExplanation explanation={draft.llmExplanation} />
            <div className={styles.aiActionRow}>
              <button className={styles.aiPrimaryButton} onClick={applyDraftToBoard} type="button">
                생성
              </button>
              <button className={styles.aiSecondaryButton} onClick={cancelDraftPreview} type="button">
                취소
              </button>
              <button
                className={styles.aiSecondaryButton}
                disabled={draftState === "loading"}
                onClick={() => void createDraftFromPrompt()}
                type="button"
              >
                다시 생성
              </button>
            </div>
            <WorkspaceAiGuardrailWarnings warnings={draftWarnings} />
          </article>
        ) : null}
      </section>

      <section className={styles.aiSection}>
        <WorkspaceAiActionHeader
          buttonLabel={simulationState === "loading" ? "계산 중" : "시뮬레이션"}
          disabled={simulationState === "loading" || context.isPreviewActive}
          onClick={() => void runDesignSimulation()}
          title="설계 시뮬레이션"
        />
        <WorkspaceAiRequestMessage state={simulationState} message={simulationErrorMessage} />
        {hasStaleDesignSimulation ? <p className={styles.aiStaleNotice}>보드 변경됨 · 다시 실행 필요</p> : null}
        {designSimulation !== null ? (
          <WorkspaceAiDesignSimulationResult simulation={designSimulation} />
        ) : (
          <p className={styles.aiHint}>현재 보드 기준으로 요청 흐름, 병목, 장애, 비용 압박을 추정합니다.</p>
        )}
      </section>
    </div>
  );
}

function createDraftWarnings(
  draft: AiArchitectureDraftResult | null,
  boardHasResources: boolean
): ArchitectureGuardrailWarning[] | undefined {
  if (draft === null) {
    return undefined;
  }

  const warnings = [...(draft.metadata.guardrailWarnings ?? [])];

  if (boardHasResources) {
    warnings.push({
      code: "board_replacement_required",
      message: "생성을 누르면 현재 보드가 AI 초안으로 전체 교체됩니다. 이번 버전은 패치 적용이 아니라 전체 교체입니다."
    });
  }

  return warnings;
}

function isArchitectureDraftClarification(
  response: CreateArchitectureDraftResponse
): response is ArchitectureDraftClarification {
  return "status" in response && response.status === "needs_clarification";
}
