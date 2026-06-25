import type { AiArchitectureDraftResult, CreateArchitectureDraftRequest } from "@sketchcatch/types";
import { applyGuardrailMetadata } from "./aiArchitectureDraftMetadata.js";
import { createDraftByScenario } from "./aiArchitectureDraftTemplates.js";
import { applyOperatingConditionConfig } from "./aiArchitectureOperatingConditions.js";
import { resolveScenario } from "./aiArchitectureScenarioResolution.js";

// 자연어 요청을 보드가 열 수 있는 ArchitectureJson 초안으로 바꾸는 1차 진입점입니다.
export function createArchitectureDraft(input: string | CreateArchitectureDraftRequest): AiArchitectureDraftResult {
  const request = normalizeArchitectureDraftRequest(input);
  const resolution = resolveScenario(request);
  const draft = createDraftByScenario(resolution.selectedScenario);
  const configuredDraft = applyOperatingConditionConfig(draft, request);

  return applyGuardrailMetadata(configuredDraft, request, resolution);
}

// GitHub 링크 요청도 결국 가벼운 텍스트 근거를 모아 자연어 초안 생성 흐름을 재사용합니다.
export function createArchitectureDraftFromRepositoryEvidence(
  repositoryUrl: string,
  evidence: readonly string[]
): AiArchitectureDraftResult {
  const evidenceText = evidence.join("\n").toLowerCase();
  const draft = createArchitectureDraft(evidenceText || repositoryUrl);

  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      source: "github",
      assumptions: [
        ...draft.metadata.assumptions,
        "Source Repository의 README와 package metadata만 근거로 Architecture Draft를 추론했습니다."
      ]
    }
  };
}

function normalizeArchitectureDraftRequest(input: string | CreateArchitectureDraftRequest): CreateArchitectureDraftRequest {
  if (typeof input !== "string") {
    return input;
  }

  // GitHub 초안 생성처럼 문자열만 넘기는 기존 흐름도 같은 기본 선택값을 쓰게 맞춥니다.
  return {
    prompt: input,
    scenarioHint: "auto",
    budgetLevel: "normal",
    trafficLevel: "normal",
    securityPriority: "basic"
  };
}
