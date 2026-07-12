import type { AiPreDeploymentAnalysisResult, Deployment, DiagramJson } from "@sketchcatch/types";
import { toDeploymentBaselineFingerprint } from "./terraform-panel-utils";

export type TerraformPreviewState = "empty" | "current" | "stale";

export type SafetyGateState = {
  readonly kind: "not-checked" | "ready" | "warning" | "blocked";
  readonly highFindingCount: number;
  readonly reason: string;
};

// 생성 기준 Board와 현재 Board를 비교해 Terraform Preview가 최신인지 판단합니다.
export function getTerraformPreviewState({
  currentDiagram,
  generatedDiagram,
  terraformCode
}: {
  readonly currentDiagram: DiagramJson;
  readonly generatedDiagram: DiagramJson | null;
  readonly terraformCode: string;
}): TerraformPreviewState {
  if (!terraformCode.trim() || !generatedDiagram) return "empty";

  return toDeploymentBaselineFingerprint(currentDiagram) ===
    toDeploymentBaselineFingerprint(generatedDiagram)
    ? "current"
    : "stale";
}

// 배포 전 검사 결과에서 Apply 가능 여부와 사용자에게 보여줄 이유를 계산합니다.
export function getSafetyGateState(
  analysis: AiPreDeploymentAnalysisResult | null
): SafetyGateState {
  if (!analysis) {
    return {
      kind: "not-checked",
      highFindingCount: 0,
      reason: "배포 전 검사를 먼저 실행해주세요."
    };
  }

  const highFindingCount = analysis.findings.filter(
    (finding) => finding.severity === "high"
  ).length;
  const hasFailedChecklist = analysis.checklist.some((item) => item.status === "fail");
  const hasWarning = analysis.findings.length > 0 ||
    analysis.checklist.some((item) => item.status === "warning");

  if (highFindingCount > 0 || hasFailedChecklist) {
    return {
      kind: "blocked",
      highFindingCount,
      reason: "높은 위험 또는 실패한 확인 항목을 먼저 해결해주세요."
    };
  }

  if (hasWarning) {
    return {
      kind: "warning",
      highFindingCount,
      reason: "경고를 확인한 뒤 Plan을 진행할 수 있습니다."
    };
  }

  return {
    kind: "ready",
    highFindingCount,
    reason: "배포 전 검사를 통과했습니다."
  };
}

// 배포 이력 중 가장 최근에 변경된 실행을 현재 작업 대상으로 고릅니다.
export function selectCurrentDeployment(
  deployments: readonly Deployment[]
): Deployment | null {
  return deployments.reduce<Deployment | null>((current, candidate) => {
    if (!current) return candidate;
    return candidate.updatedAt > current.updatedAt ? candidate : current;
  }, null);
}
