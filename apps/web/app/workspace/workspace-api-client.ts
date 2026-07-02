import type {
  AiTerraformErrorExplanationResult,
  AiTerraformStage,
  CreateDesignSimulationRequest,
  DesignSimulationResult
} from "@sketchcatch/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type TerraformErrorExplanationRequest = {
  readonly stage: AiTerraformStage;
  readonly rawMessage: string;
  readonly relatedResourceId?: string | undefined;
};

// Design Simulation UI가 같은 endpoint와 body 계약을 재사용하도록 감싼 함수입니다.
export async function requestDesignSimulation(
  input: CreateDesignSimulationRequest
): Promise<DesignSimulationResult> {
  return postJson<DesignSimulationResult>("/ai/design-simulation", {
    architectureJson: input.architectureJson,
    budgetLevel: input.budgetLevel,
    trafficLevel: input.trafficLevel
  });
}

// Terraform 오류 설명 UI가 Preview 설명과 다른 API를 호출하도록 분리합니다.
export async function requestTerraformErrorExplanation(
  input: TerraformErrorExplanationRequest
): Promise<AiTerraformErrorExplanationResult> {
  return postJson<AiTerraformErrorExplanationResult>("/ai/terraform-error-explanation", {
    rawMessage: input.rawMessage,
    relatedResourceId: input.relatedResourceId,
    stage: input.stage
  });
}

// workspace 데모 화면에서 gg AI API로 JSON 요청을 보내는 최소 client입니다.
export async function postJson<ResponseBody>(
  path: string,
  body: Record<string, unknown>
): Promise<ResponseBody> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }

  return response.json();
}
