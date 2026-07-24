import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureSuggestion,
  ArchitectureJson,
  ChecklistItem,
  CheckFinding,
  ResourceNode
} from "@sketchcatch/types";
import { createConfigurationFindings } from "./aiPreDeploymentConfiguration.js";
import { createCostFindings, createResourceCostEstimate } from "./aiPreDeploymentCost.js";
import { createSecurityFindings } from "./aiPreDeploymentSecurity.js";

export type AnalyzePreDeploymentOptions = {
  readonly includeArchitectureSecurityFindings?: boolean | undefined;
};

// 보드 설계도 전체를 돌면서 비용, 보안, 설정 문제를 한 번에 모으는 사전 점검 입구입니다.
export function analyzePreDeployment(
  architectureJson: ArchitectureJson,
  options: AnalyzePreDeploymentOptions = {}
): AiPreDeploymentAnalysisResult {
  const findings = deduplicatePreDeploymentFindings(
    architectureJson.nodes.flatMap((node) => createFindingsForNode(node, options))
  );
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
    checklist: createChecklist(findings),
    suggestions: createSuggestions(findings)
  };
}

export function mergePreDeploymentAnalysisFindings(
  analysis: AiPreDeploymentAnalysisResult,
  prependedFindings: readonly CheckFinding[]
): AiPreDeploymentAnalysisResult {
  if (prependedFindings.length === 0) {
    return analysis;
  }

  const findings = deduplicatePreDeploymentFindings([
    ...prependedFindings,
    ...analysis.findings
  ]);

  return {
    ...analysis,
    summary: createSummary(findings),
    findings,
    checklist: createChecklist(findings),
    suggestions: createSuggestions(findings)
  };
}

// finding 목록을 사용자가 먼저 볼 한 문장 요약으로 줄입니다.
function deduplicatePreDeploymentFindings(
  findings: readonly CheckFinding[]
): CheckFinding[] {
  const deduplicated = new Map<string, CheckFinding>();

  for (const finding of findings) {
    const key = createPreDeploymentFindingDedupeKey(finding);

    if (!deduplicated.has(key)) {
      deduplicated.set(key, finding);
    }
  }

  return [...deduplicated.values()];
}

function createPreDeploymentFindingDedupeKey(finding: CheckFinding): string {
  return [
    finding.category,
    finding.severity,
    normalizeFindingText(
      finding.resourceId ?? finding.sourceLocation?.resourceAddress ?? "global"
    ),
    normalizeFindingText(finding.title),
    normalizeFindingText(finding.recommendation)
  ].join("|");
}

function normalizeFindingText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function createSummary(findings: readonly CheckFinding[]): string {
  if (findings.length === 0) {
    return "현재 기본 deployment check에서 막는 항목은 없습니다.";
  }

  if (findings.some(isSecurityRelatedFinding)) {
    return "배포 전에 해결해야 할 Security Risk가 있습니다.";
  }

  if (findings.some((finding) => finding.category === "configuration")) {
    return "배포 전에 빠진 Resource 설정을 확인해야 합니다.";
  }

  return "배포 전에 Cost Risk를 확인해야 합니다.";
}

// Resource 하나에 대해 보안, 비용, 필수 설정 규칙을 차례대로 적용합니다.
function createFindingsForNode(
  node: ResourceNode,
  options: AnalyzePreDeploymentOptions
): CheckFinding[] {
  return [
    ...(options.includeArchitectureSecurityFindings === false ? [] : createSecurityFindings(node)),
    ...createCostFindings(node),
    ...createConfigurationFindings(node)
  ];
}

// finding을 체크리스트로 바꿔서 배포 전에 무엇을 확인해야 하는지 보여줍니다.
function createChecklist(findings: readonly CheckFinding[]): ChecklistItem[] {
  const securityFindingIds = findings.filter(isSecurityRelatedFinding).map((finding) => finding.id);
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

function isSecurityRelatedFinding(finding: CheckFinding): boolean {
  return (
    finding.category === "security" ||
    finding.category === "permission" ||
    finding.category === "network"
  );
}

// finding을 자동 적용 명령이 아닌 사람이 검토할 수 있는 수정 제안으로 바꿉니다.
function createSuggestions(findings: readonly CheckFinding[]): ArchitectureSuggestion[] {
  return findings.map(createSuggestionForFinding);
}

// CheckFinding category별로 MVP에서 안전하게 말할 수 있는 제안만 만듭니다.
function createSuggestionForFinding(finding: CheckFinding): ArchitectureSuggestion {
  switch (finding.category) {
    case "security":
      return {
        id: `suggestion-${finding.id}`,
        findingId: finding.id,
        title: "SSH 접근 범위 제한",
        targetResourceId: finding.resourceId,
        action: "modify_resource",
        expectedImpact: {
          cost: "neutral",
          security: "improve",
          reliability: "neutral"
        },
        explanation: "Security Group ingress에서 0.0.0.0/0 SSH 허용을 제거하고 관리용 CIDR만 남기세요."
      };
    case "cost":
      return {
        id: `suggestion-${finding.id}`,
        findingId: finding.id,
        title: "연습 비용 낮추기 검토",
        targetResourceId: finding.resourceId,
        action: "manual_review",
        expectedImpact: {
          cost: "decrease",
          security: "neutral",
          reliability: "neutral"
        },
        explanation: "작은 인스턴스 설정, 짧은 Practice Session, Auto Cleanup 계획을 먼저 확인하세요."
      };
    case "configuration":
      return {
        id: `suggestion-${finding.id}`,
        findingId: finding.id,
        title: "필수 Resource 설정 입력",
        targetResourceId: finding.resourceId,
        action: "modify_resource",
        expectedImpact: {
          cost: "unknown",
          security: "neutral",
          reliability: "improve"
        },
        explanation: "Architecture Board에서 빠진 config를 채운 뒤 deployment check를 다시 실행하세요."
      };
    case "permission":
    case "network":
    case "performance":
    case "availability":
      return {
        id: `suggestion-${finding.id}`,
        findingId: finding.id,
        title: "수동 검토 필요",
        targetResourceId: finding.resourceId,
        action: "manual_review",
        expectedImpact: {
          cost: "unknown",
          security: "unknown",
          reliability: "unknown"
        },
        explanation: "현재 MVP 규칙만으로 자동 수정 방향을 정하지 않고 팀원이 직접 확인할 수 있게 남깁니다."
      };
  }
}
