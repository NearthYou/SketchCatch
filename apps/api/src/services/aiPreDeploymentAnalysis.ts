import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  ChecklistItem,
  CheckFinding,
  ResourceNode
} from "@sketchcatch/types";
import { createConfigurationFindings } from "./aiPreDeploymentConfiguration.js";
import { createCostFindings, createResourceCostEstimate } from "./aiPreDeploymentCost.js";
import { createSecurityFindings } from "./aiPreDeploymentSecurity.js";

// 보드 설계도 전체를 돌면서 비용, 보안, 설정 문제를 한 번에 모으는 사전 점검 입구입니다.
export function analyzePreDeployment(architectureJson: ArchitectureJson): AiPreDeploymentAnalysisResult {
  const findings = architectureJson.nodes.flatMap(createFindingsForNode);
  const resourceCostEstimates = architectureJson.nodes.map(createResourceCostEstimate);

  return {
    summary: createSummary(findings),
    totalMonthlyEstimate: {
      amount: 0,
      currency: "USD",
      pricingAssumption: "1차 제공 fallback은 실제 AWS 가격 API 없이 위험 분석 중심으로 0 USD를 반환합니다."
    },
    resourceCostEstimates,
    findings,
    checklist: createChecklist(findings)
  };
}

// finding 목록을 사용자가 먼저 볼 한 문장 요약으로 줄입니다.
function createSummary(findings: readonly CheckFinding[]): string {
  if (findings.length === 0) {
    return "현재 기본 Pre-Deployment Check에서 막는 항목은 없습니다.";
  }

  if (findings.some((finding) => finding.category === "security")) {
    return "배포 전에 해결해야 할 Security Risk가 있습니다.";
  }

  if (findings.some((finding) => finding.category === "configuration")) {
    return "배포 전에 빠진 Resource 설정을 확인해야 합니다.";
  }

  return "배포 전에 Cost Risk를 확인해야 합니다.";
}

// Resource 하나에 대해 보안, 비용, 필수 설정 규칙을 차례대로 적용합니다.
function createFindingsForNode(node: ResourceNode): CheckFinding[] {
  return [
    ...createSecurityFindings(node),
    ...createCostFindings(node),
    ...createConfigurationFindings(node)
  ];
}

// finding을 체크리스트로 바꿔서 배포 전에 무엇을 확인해야 하는지 보여줍니다.
function createChecklist(findings: readonly CheckFinding[]): ChecklistItem[] {
  const securityFindingIds = getFindingIdsByCategory(findings, "security");
  const costFindingIds = getFindingIdsByCategory(findings, "cost");
  const configurationFindingIds = getFindingIdsByCategory(findings, "configuration");

  return [
    {
      id: "security-open-ssh-check",
      label: "SSH 전체 공개 여부 확인",
      status: securityFindingIds.length > 0 ? "fail" : "pass",
      relatedFindingIds: securityFindingIds
    },
    {
      id: "cost-risk-check",
      label: "고비용 Resource 여부 확인",
      status: costFindingIds.length > 0 ? "warning" : "pass",
      relatedFindingIds: costFindingIds
    },
    {
      id: "required-config-check",
      label: "필수 Resource 설정 입력 여부 확인",
      status: configurationFindingIds.length > 0 ? "fail" : "pass",
      relatedFindingIds: configurationFindingIds
    }
  ];
}

// 체크리스트 항목이 어떤 finding을 가리키는지 연결하기 위해 category별 id만 모읍니다.
function getFindingIdsByCategory(
  findings: readonly CheckFinding[],
  category: CheckFinding["category"]
): string[] {
  return findings.filter((finding) => finding.category === category).map((finding) => finding.id);
}
