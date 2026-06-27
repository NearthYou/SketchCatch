"use client";

import { useMemo, useRef, useState } from "react";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  AiTerraformStage,
  AiTerraformPreviewExplanationResult,
  ArchitectureDraftBudgetLevel,
  ArchitectureDraftScenarioHint,
  ArchitectureDraftSecurityPriority,
  ArchitectureDraftTrafficLevel,
  ArchitectureJson,
  DesignSimulationResult,
  TerraformDiagnostic,
  TerraformValidateResponse
} from "@sketchcatch/types";
import { apiFetch, getApiErrorMessage } from "../../lib/api-client";
import { ArchitectureDraftPanel } from "./ArchitectureDraftPanel";
import { DesignSimulationPanel } from "./DesignSimulationPanel";
import { DraftMetadataPanel } from "./DraftMetadataPanel";
import { PreDeploymentAnalysisPanel } from "./PreDeploymentAnalysisPanel";
import { TerraformErrorExplanationPanel } from "./TerraformErrorExplanationPanel";
import { TerraformPreviewPanel } from "./TerraformPreviewPanel";
import { getResourceTypeLabel } from "./resource-type-labels";
import {
  postJson,
  requestDesignSimulation,
  requestTerraformErrorExplanation
} from "./workspace-api-client";
import { sampleDiagramTerraform, samplePrompt, sampleTerraform } from "./workspace-options";

// gg AI API를 팀에 보여주기 위한 임시 작업 화면입니다. 최종 보드 UI가 붙으면 대체될 수 있습니다.
export function AiWorkspaceClient() {
  const [prompt, setPrompt] = useState(samplePrompt);
  const [scenarioHint, setScenarioHint] = useState<ArchitectureDraftScenarioHint>("backend_with_db");
  const [budgetLevel, setBudgetLevel] = useState<ArchitectureDraftBudgetLevel>("low");
  const [trafficLevel, setTrafficLevel] = useState<ArchitectureDraftTrafficLevel>("small");
  const [securityPriority, setSecurityPriority] = useState<ArchitectureDraftSecurityPriority>("basic");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [terraformCode, setTerraformCode] = useState(sampleTerraform);
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [analysis, setAnalysis] = useState<AiPreDeploymentAnalysisResult | null>(null);
  const [designSimulation, setDesignSimulation] = useState<DesignSimulationResult | null>(null);
  const [terraformPreview, setTerraformPreview] =
    useState<AiTerraformPreviewExplanationResult | null>(null);
  const [terraformErrorStage, setTerraformErrorStage] = useState<AiTerraformStage>("export");
  const [terraformErrorMessage, setTerraformErrorMessage] = useState(
    "Error: Missing required argument on generated variables.tf"
  );
  const [terraformErrorResourceId, setTerraformErrorResourceId] = useState("");
  const [terraformErrorExplanation, setTerraformErrorExplanation] =
    useState<AiTerraformErrorExplanationResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [terraformDiagnostics, setTerraformDiagnostics] = useState<TerraformDiagnostic[]>([]);
  const [isValidatingTerraform, setIsValidatingTerraform] = useState(false);
  const [terraformDiagnosticsError, setTerraformDiagnosticsError] = useState<string | null>(null);
  const [hasStaleTerraformDiagnostics, setHasStaleTerraformDiagnostics] = useState(false);
  const [hasValidatedTerraform, setHasValidatedTerraform] = useState(false);
  const latestTerraformCode = useRef(sampleTerraform);
  const latestTerraformValidationRequestId = useRef(0);

  const architectureJson = useMemo<ArchitectureJson | null>(() => draft?.architectureJson ?? null, [draft]);

  // 자연어 입력을 AI Architecture Draft API로 보내고 결과 설계도를 화면에 저장합니다.
  async function runPromptDraft(): Promise<void> {
    await runRequest(async () => {
      const result = await postJson<AiArchitectureDraftResult>("/ai/architecture-draft", {
        budgetLevel,
        prompt,
        scenarioHint,
        securityPriority,
        trafficLevel
      });
      setDraft(result);
      setAnalysis(null);
      setDesignSimulation(null);
    });
  }

  // GitHub URL을 보내 public repo 근거 기반 초안을 요청합니다.
  async function runGitHubDraft(): Promise<void> {
    await runRequest(async () => {
      const result = await postJson<AiArchitectureDraftResult>("/ai/github-architecture-draft", {
        repositoryUrl
      });
      setDraft(result);
      setAnalysis(null);
      setDesignSimulation(null);
    });
  }

  // 이미 만든 ArchitectureJson을 비용/보안/설정 점검 API로 보냅니다.
  async function runPreDeploymentCheck(): Promise<void> {
    if (architectureJson === null) {
      setErrorMessage("먼저 Architecture Draft를 생성해야 사전 점검을 실행할 수 있습니다.");
      setStatus("error");
      return;
    }

    await runRequest(async () => {
      const result = await postJson<AiPreDeploymentAnalysisResult>("/ai/pre-deployment-check", {
        architectureJson
      });
      setAnalysis(result);
    });
  }

  // ArchitectureJson을 실제 부하 테스트 없이 Design Simulation API로 보내 추정 결과를 받습니다.
  async function runDesignSimulation(): Promise<void> {
    if (architectureJson === null) {
      setErrorMessage("먼저 Architecture Draft를 생성해야 Design Simulation을 실행할 수 있습니다.");
      setStatus("error");
      return;
    }

    await runRequest(async () => {
      const result = await requestDesignSimulation({
        architectureJson,
        budgetLevel,
        trafficLevel
      });
      setDesignSimulation(result);
    });
  }

  // Terraform 코드 조각을 보내 Resource 감지와 위험 설명을 요청합니다.
  async function runTerraformPreview(): Promise<void> {
    await runRequest(async () => {
      const result = await postJson<AiTerraformPreviewExplanationResult>(
        "/ai/terraform-preview-explanation",
        { terraformCode }
      );
      setTerraformPreview(result);
    });
  }

  // 샘플 변환은 실제 프로젝트 Terraform API 인증/저장 흐름을 건드리지 않습니다.
  function runDiagramToTerraform(): void {
    setStatus("idle");
    setErrorMessage("");
    setTerraformCode(sampleDiagramTerraform);
    latestTerraformCode.current = sampleDiagramTerraform;
    setTerraformPreview(null);
    setTerraformDiagnostics([]);
    setTerraformDiagnosticsError(null);
    setHasStaleTerraformDiagnostics(false);
    setHasValidatedTerraform(false);
  }

  // 사용자가 붙여 넣은 Terraform 오류 메시지를 Preview 설명과 분리해 해석합니다.
  async function runTerraformErrorExplanation(): Promise<void> {
    const rawMessage = terraformErrorMessage.trim();

    if (rawMessage.length === 0) {
      setErrorMessage("Terraform 오류 메시지를 먼저 입력해야 합니다.");
      setStatus("error");
      return;
    }

    const relatedResourceId = terraformErrorResourceId.trim();

    await runRequest(async () => {
      const result = await requestTerraformErrorExplanation({
        rawMessage,
        ...(relatedResourceId.length > 0 ? { relatedResourceId } : {}),
        stage: terraformErrorStage
      });
      setTerraformErrorExplanation(result);
    });
  }

  function handleTerraformCodeChange(nextCode: string): void {
    setTerraformCode(nextCode);
    latestTerraformCode.current = nextCode;
    setTerraformPreview(null);
    setTerraformDiagnosticsError(null);
    setHasStaleTerraformDiagnostics(hasValidatedTerraform);
  }

  async function runTerraformValidation(): Promise<void> {
    const codeToValidate = terraformCode;
    const requestId = latestTerraformValidationRequestId.current + 1;

    latestTerraformValidationRequestId.current = requestId;
    setIsValidatingTerraform(true);
    setTerraformDiagnosticsError(null);

    try {
      const result = await apiFetch<TerraformValidateResponse>("/terraform/validate", {
        auth: true,
        body: {
          terraformCode: codeToValidate
        },
        method: "POST"
      });

      if (latestTerraformCode.current !== codeToValidate) {
        setHasStaleTerraformDiagnostics(hasValidatedTerraform);
        return;
      }

      setTerraformDiagnostics(result.diagnostics);
      setHasStaleTerraformDiagnostics(false);
      setHasValidatedTerraform(true);
    } catch (error) {
      if (latestTerraformCode.current !== codeToValidate) {
        setHasStaleTerraformDiagnostics(hasValidatedTerraform);
        return;
      }

      setTerraformDiagnosticsError(
        getApiErrorMessage(
          error,
          error instanceof Error ? error.message : "Terraform 문법 점검 중 오류가 발생했습니다."
        )
      );
    } finally {
      if (latestTerraformValidationRequestId.current === requestId) {
        setIsValidatingTerraform(false);
      }
    }
  }

  // 모든 버튼 요청이 같은 loading/error 처리를 쓰도록 감싸는 작은 공통 함수입니다.
  async function runRequest(request: () => Promise<void>): Promise<void> {
    setStatus("loading");
    setErrorMessage("");

    try {
      await request();
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        getApiErrorMessage(
          error,
          error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다."
        )
      );
    }
  }

  return (
    <div className="workspaceGrid workspaceGridWide">
      <ArchitectureDraftPanel
        budgetLevel={budgetLevel}
        isLoading={status === "loading"}
        onBudgetLevelChange={setBudgetLevel}
        onGitHubDraft={runGitHubDraft}
        onPromptChange={setPrompt}
        onPromptDraft={runPromptDraft}
        onRepositoryUrlChange={setRepositoryUrl}
        onScenarioHintChange={setScenarioHint}
        onSecurityPriorityChange={setSecurityPriority}
        onTrafficLevelChange={setTrafficLevel}
        prompt={prompt}
        repositoryUrl={repositoryUrl}
        scenarioHint={scenarioHint}
        securityPriority={securityPriority}
        trafficLevel={trafficLevel}
      />

      <section className="workspacePanel resultPanel">
        <h2>Draft 결과</h2>
        {draft === null ? (
          <p className="emptyState">초안을 만들면 보드가 열 수 있는 ArchitectureJson 요약이 표시됩니다.</p>
        ) : (
          <div className="resultStack">
            <p className="resultTitle">{draft.title}</p>
            <p className="mutedText">
              source: {draft.metadata.source} · confidence: {draft.metadata.confidence}
            </p>
            <div className="chipRow">
              {draft.architectureJson.nodes.map((node) => (
                <span className="workspaceResourceChip" key={node.id}>
                  {getResourceTypeLabel(node.type)} · {node.label ?? node.id}
                </span>
              ))}
            </div>
            <p className="mutedText">연결선 {draft.architectureJson.edges.length}개</p>
            <DraftMetadataPanel metadata={draft.metadata} />
          </div>
        )}
        <button
          className="primaryButton"
          disabled={status === "loading" || architectureJson === null}
          onClick={runPreDeploymentCheck}
        >
          배포 전 점검
        </button>
      </section>

      <PreDeploymentAnalysisPanel analysis={analysis} />

      <DesignSimulationPanel
        designSimulation={designSimulation}
        isDisabled={status === "loading" || architectureJson === null}
        onDesignSimulation={runDesignSimulation}
      />

      <TerraformPreviewPanel
        isLoading={status === "loading"}
        isValidatingTerraform={isValidatingTerraform}
        hasStaleTerraformDiagnostics={hasStaleTerraformDiagnostics}
        hasValidatedTerraform={hasValidatedTerraform}
        onDiagramToTerraform={runDiagramToTerraform}
        onTerraformCodeChange={handleTerraformCodeChange}
        onTerraformPreview={runTerraformPreview}
        onTerraformValidate={runTerraformValidation}
        terraformCode={terraformCode}
        terraformDiagnostics={terraformDiagnostics}
        terraformDiagnosticsError={terraformDiagnosticsError}
        terraformPreview={terraformPreview}
      />

      <TerraformErrorExplanationPanel
        explanation={terraformErrorExplanation}
        isLoading={status === "loading"}
        onRawMessageChange={setTerraformErrorMessage}
        onRelatedResourceIdChange={setTerraformErrorResourceId}
        onStageChange={setTerraformErrorStage}
        onTerraformErrorExplanation={runTerraformErrorExplanation}
        rawMessage={terraformErrorMessage}
        relatedResourceId={terraformErrorResourceId}
        stage={terraformErrorStage}
      />

      {status === "error" ? <p className="errorBanner">{errorMessage}</p> : null}
      {status === "loading" ? <p className="loadingBanner">AI fallback 응답을 생성하는 중입니다.</p> : null}
    </div>
  );
}
