"use client";

import { useMemo, useState } from "react";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  ArchitectureDraftBudgetLevel,
  ArchitectureDraftScenarioHint,
  ArchitectureDraftSecurityPriority,
  ArchitectureDraftTrafficLevel,
  DesignSimulationResult
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createAiArchitectureDraft,
  runAiDesignSimulation,
  runAiPreDeploymentCheck
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
  WorkspaceAiPreDeploymentResult,
  WorkspaceAiRequestMessage,
  WorkspaceAiSelect
} from "./WorkspaceAiPanelPieces";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import {
  budgetOptions,
  DEFAULT_REQUIREMENT_PROMPT,
  scenarioOptions,
  securityOptions,
  trafficOptions
} from "./workspace-ai-panel-options";
import styles from "./workspace.module.css";

export type WorkspaceAiPanelProps = {
  readonly context: DiagramEditorPanelContext;
};

// 실제 Architecture Board 오른쪽 패널에서 gg AI MVP 흐름을 실행합니다.
export function WorkspaceAiPanel({ context }: WorkspaceAiPanelProps) {
  const [prompt, setPrompt] = useState(DEFAULT_REQUIREMENT_PROMPT);
  const [scenarioHint, setScenarioHint] = useState<ArchitectureDraftScenarioHint>("backend_with_db");
  const [budgetLevel, setBudgetLevel] = useState<ArchitectureDraftBudgetLevel>("low");
  const [trafficLevel, setTrafficLevel] = useState<ArchitectureDraftTrafficLevel>("small");
  const [securityPriority, setSecurityPriority] = useState<ArchitectureDraftSecurityPriority>("basic");
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [preDeploymentAnalysis, setPreDeploymentAnalysis] =
    useState<AiPreDeploymentAnalysisResult | null>(null);
  const [designSimulation, setDesignSimulation] = useState<DesignSimulationResult | null>(null);
  const [draftState, setDraftState] = useState<AiRequestState>("idle");
  const [preDeploymentState, setPreDeploymentState] = useState<AiRequestState>("idle");
  const [simulationState, setSimulationState] = useState<AiRequestState>("idle");
  const [draftErrorMessage, setDraftErrorMessage] = useState("");
  const [preDeploymentErrorMessage, setPreDeploymentErrorMessage] = useState("");
  const [simulationErrorMessage, setSimulationErrorMessage] = useState("");
  const [preDeploymentFingerprint, setPreDeploymentFingerprint] = useState<string | null>(null);
  const [simulationFingerprint, setSimulationFingerprint] = useState<string | null>(null);
  const boardSnapshot = useMemo(
    () => createWorkspaceAiBoardSnapshot(context.diagram),
    [context.diagram]
  );
  const hasStalePreDeploymentAnalysis =
    preDeploymentAnalysis !== null &&
    isWorkspaceAiResultStale(preDeploymentFingerprint, boardSnapshot.fingerprint);
  const hasStaleDesignSimulation =
    designSimulation !== null &&
    isWorkspaceAiResultStale(simulationFingerprint, boardSnapshot.fingerprint);

  async function createDraftFromPrompt(): Promise<void> {
    if (prompt.trim().length === 0) {
      setDraftState("error");
      setDraftErrorMessage("Requirement Prompt를 먼저 입력해주세요.");
      return;
    }

    setDraftState("loading");
    setDraftErrorMessage("");

    try {
      const result = await createAiArchitectureDraft({
        budgetLevel,
        prompt,
        scenarioHint,
        securityPriority,
        trafficLevel
      });
      setDraft(result);
      setDraftState("idle");
    } catch (error) {
      setDraftState("error");
      setDraftErrorMessage(getApiErrorMessage(error, "Architecture Draft 생성 중 오류가 발생했습니다."));
    }
  }

  function applyDraftToBoard(): void {
    if (draft === null) {
      return;
    }

    context.applyDiagramJson(convertArchitectureJsonToDiagramJson(draft.architectureJson));
    setPreDeploymentAnalysis(null);
    setDesignSimulation(null);
    setPreDeploymentFingerprint(null);
    setSimulationFingerprint(null);
  }

  async function runPreDeploymentCheck(): Promise<void> {
    if (!boardSnapshot.hasResources) {
      setPreDeploymentState("error");
      setPreDeploymentErrorMessage("Architecture Board에 Resource가 있어야 실행할 수 있습니다.");
      return;
    }

    setPreDeploymentState("loading");
    setPreDeploymentErrorMessage("");

    try {
      const result = await runAiPreDeploymentCheck(boardSnapshot.architectureJson);
      setPreDeploymentAnalysis(result);
      setPreDeploymentFingerprint(boardSnapshot.fingerprint);
      setPreDeploymentState("idle");
    } catch (error) {
      setPreDeploymentState("error");
      setPreDeploymentErrorMessage(getApiErrorMessage(error, "Pre-Deployment Check 중 오류가 발생했습니다."));
    }
  }

  async function runDesignSimulation(): Promise<void> {
    if (!boardSnapshot.hasResources) {
      setSimulationState("error");
      setSimulationErrorMessage("Architecture Board에 Resource가 있어야 실행할 수 있습니다.");
      return;
    }

    setSimulationState("loading");
    setSimulationErrorMessage("");

    try {
      const result = await runAiDesignSimulation({
        architectureJson: boardSnapshot.architectureJson,
        budgetLevel,
        trafficLevel
      });
      setDesignSimulation(result);
      setSimulationFingerprint(boardSnapshot.fingerprint);
      setSimulationState("idle");
    } catch (error) {
      setSimulationState("error");
      setSimulationErrorMessage(getApiErrorMessage(error, "Design Simulation 중 오류가 발생했습니다."));
    }
  }

  return (
    <div className={styles.aiPanel}>
      <header className={styles.aiPanelHeader}>
        <span>AI</span>
        <h2>Workspace AI</h2>
      </header>

      <section className={styles.aiSection}>
        <label className={styles.aiField}>
          <span>Requirement Prompt</span>
          <textarea
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            value={prompt}
          />
        </label>
        <WorkspaceAiSelect
          label="용도"
          onChange={setScenarioHint}
          options={scenarioOptions}
          value={scenarioHint}
        />
        <div className={styles.aiInlineFields}>
          <WorkspaceAiSelect
            label="예산"
            onChange={setBudgetLevel}
            options={budgetOptions}
            value={budgetLevel}
          />
          <WorkspaceAiSelect
            label="트래픽"
            onChange={setTrafficLevel}
            options={trafficOptions}
            value={trafficLevel}
          />
        </div>
        <WorkspaceAiSelect
          label="보안"
          onChange={setSecurityPriority}
          options={securityOptions}
          value={securityPriority}
        />
        <button
          className={styles.aiPrimaryButton}
          disabled={draftState === "loading"}
          onClick={() => void createDraftFromPrompt()}
          type="button"
        >
          {draftState === "loading" ? "초안 생성 중" : "Architecture Draft 생성"}
        </button>
        <WorkspaceAiRequestMessage state={draftState} message={draftErrorMessage} />
        {draft !== null ? (
          <article className={styles.aiResultCard}>
            <div className={styles.aiResultHeader}>
              <h3>{draft.title}</h3>
              <span>{draft.architectureJson.nodes.length} Resources</span>
            </div>
            <WorkspaceAiExplanation explanation={draft.llmExplanation} />
            <button className={styles.aiSecondaryButton} onClick={applyDraftToBoard} type="button">
              보드에 반영
            </button>
          </article>
        ) : null}
      </section>

      <section className={styles.aiSection}>
        <WorkspaceAiActionHeader
          buttonLabel={preDeploymentState === "loading" ? "검사 중" : "Pre-Deployment Check"}
          disabled={preDeploymentState === "loading"}
          onClick={() => void runPreDeploymentCheck()}
          title="배포 전 검사"
        />
        <WorkspaceAiRequestMessage state={preDeploymentState} message={preDeploymentErrorMessage} />
        {hasStalePreDeploymentAnalysis ? <p className={styles.aiStaleNotice}>보드 변경됨 · 다시 실행 필요</p> : null}
        {preDeploymentAnalysis !== null ? (
          <WorkspaceAiPreDeploymentResult analysis={preDeploymentAnalysis} />
        ) : (
          <p className={styles.aiHint}>현재 보드 기준으로 비용, 보안, 설정 위험을 확인합니다.</p>
        )}
      </section>

      <section className={styles.aiSection}>
        <WorkspaceAiActionHeader
          buttonLabel={simulationState === "loading" ? "계산 중" : "Design Simulation"}
          disabled={simulationState === "loading"}
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
