import type {
  AiTerraformErrorExplanationResult,
  AiTerraformStage
} from "@sketchcatch/types";

export type TerraformErrorExplanationInput = {
  readonly stage: AiTerraformStage;
  readonly rawMessage: string;
  readonly relatedResourceId?: string | undefined;
};

export function explainTerraformError(
  input: TerraformErrorExplanationInput
): AiTerraformErrorExplanationResult {
  if (isPermissionError(input.rawMessage)) {
    return {
      stage: input.stage,
      category: "permission",
      severity: "high",
      rawMessage: input.rawMessage,
      relatedResourceId: input.relatedResourceId,
      summary: "AWS 권한이 부족해서 Terraform 작업이 막혔습니다.",
      likelyCause: "연결된 AWS 사용자나 Role에 필요한 작업 권한이 없습니다.",
      nextActions: [
        "AWS 연결에 사용한 사용자나 Role의 IAM 정책을 확인하세요.",
        "오류 메시지에 나온 AWS action 권한이 허용되어 있는지 확인하세요.",
        "권한을 수정한 뒤 같은 Plan 단계를 다시 실행하세요."
      ]
    };
  }

  return {
    stage: input.stage,
    category: "unknown",
    severity: "medium",
    rawMessage: input.rawMessage,
    relatedResourceId: input.relatedResourceId,
    summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
    likelyCause: "아직 MVP fallback 규칙에 등록되지 않은 오류입니다.",
    nextActions: ["원본 오류 메시지를 확인하고 권한, region, quota, 문법 문제를 차례대로 점검하세요."]
  };
}

function isPermissionError(rawMessage: string): boolean {
  const normalizedMessage = rawMessage.toLowerCase();

  return (
    normalizedMessage.includes("accessdenied") ||
    normalizedMessage.includes("not authorized") ||
    normalizedMessage.includes("unauthorizedoperation")
  );
}
