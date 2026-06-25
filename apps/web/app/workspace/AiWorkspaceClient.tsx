"use client";

import { useMemo, useState } from "react";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformPreviewExplanationResult,
  ArchitectureDraftBudgetLevel,
  ArchitectureDraftScenarioHint,
  ArchitectureDraftSecurityPriority,
  ArchitectureDraftTrafficLevel,
  ArchitectureJson
} from "@sketchcatch/types";
import { DraftMetadataPanel } from "./DraftMetadataPanel";
import { ResultList } from "./ResultList";
import { getResourceTypeLabel } from "./resource-type-labels";
import { postJson } from "./workspace-api-client";
import { budgetOptions, samplePrompt, sampleTerraform, scenarioOptions, securityOptions, trafficOptions } from "./workspace-options";

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
  const [terraformPreview, setTerraformPreview] =
    useState<AiTerraformPreviewExplanationResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

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

  // 모든 버튼 요청이 같은 loading/error 처리를 쓰도록 감싸는 작은 공통 함수입니다.
  async function runRequest(request: () => Promise<void>): Promise<void> {
    setStatus("loading");
    setErrorMessage("");

    try {
      await request();
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="workspaceGrid workspaceGridWide">
      <section className="workspacePanel toolPanel">
        <h2>Architecture Draft</h2>
        <label className="fieldLabel" htmlFor="prompt-input">
          자연어 요청
        </label>
        <textarea
          className="textArea"
          id="prompt-input"
          onChange={(event) => setPrompt(event.target.value)}
          rows={5}
          value={prompt}
        />

        <span className="fieldLabel">용도 선택</span>
        <div className="choiceGrid">
          {scenarioOptions.map((option) => (
            <button
              className={option.value === scenarioHint ? "choiceButton choiceButtonActive" : "choiceButton"}
              key={option.value}
              onClick={() => setScenarioHint(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="fieldLabel">예산</span>
        <div className="choiceGrid choiceGridCompact">
          {budgetOptions.map((option) => (
            <button
              className={option.value === budgetLevel ? "choiceButton choiceButtonActive" : "choiceButton"}
              key={option.value}
              onClick={() => setBudgetLevel(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="fieldLabel">트래픽</span>
        <div className="choiceGrid choiceGridCompact">
          {trafficOptions.map((option) => (
            <button
              className={option.value === trafficLevel ? "choiceButton choiceButtonActive" : "choiceButton"}
              key={option.value}
              onClick={() => setTrafficLevel(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="fieldLabel">보안 우선순위</span>
        <div className="choiceGrid choiceGridCompact">
          {securityOptions.map((option) => (
            <button
              className={option.value === securityPriority ? "choiceButton choiceButtonActive" : "choiceButton"}
              key={option.value}
              onClick={() => setSecurityPriority(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <button className="primaryButton" disabled={status === "loading"} onClick={runPromptDraft}>
          자연어 초안 생성
        </button>

        <label className="fieldLabel" htmlFor="github-url-input">
          GitHub public repository URL
        </label>
        <input
          className="textInput"
          id="github-url-input"
          onChange={(event) => setRepositoryUrl(event.target.value)}
          placeholder="https://github.com/owner/repo"
          type="url"
          value={repositoryUrl}
        />
        <button
          className="secondaryButton"
          disabled={status === "loading" || repositoryUrl.trim().length === 0}
          onClick={runGitHubDraft}
        >
          GitHub 초안 생성
        </button>
      </section>

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

      <section className="workspacePanel resultPanel">
        <h2>비용/보안 점검</h2>
        {analysis === null ? (
          <p className="emptyState">Architecture Draft 생성 후 사전 점검을 실행하면 finding과 checklist가 나옵니다.</p>
        ) : (
          <ResultList
            items={analysis.findings.map((finding) => ({
              id: finding.id,
              label: `${finding.severity.toUpperCase()} · ${finding.title}`,
              text: finding.description
            }))}
            summary={analysis.summary}
          />
        )}
      </section>

      <section className="workspacePanel toolPanel">
        <h2>Terraform Preview 설명</h2>
        <label className="fieldLabel" htmlFor="terraform-input">
          Terraform 코드
        </label>
        <textarea
          className="codeArea"
          id="terraform-input"
          onChange={(event) => setTerraformCode(event.target.value)}
          rows={11}
          value={terraformCode}
        />
        <button className="primaryButton" disabled={status === "loading"} onClick={runTerraformPreview}>
          코드 설명 생성
        </button>
        {terraformPreview === null ? null : (
          <ResultList
            items={terraformPreview.detectedResources.map((resource) => ({
              id: `${resource.terraformType}-${resource.label}`,
              label: resource.label,
              text: resource.explanation
            }))}
            summary={terraformPreview.summary}
          />
        )}
      </section>

      {status === "error" ? <p className="errorBanner">{errorMessage}</p> : null}
      {status === "loading" ? <p className="loadingBanner">AI fallback 응답을 생성하는 중입니다.</p> : null}
    </div>
  );
}
