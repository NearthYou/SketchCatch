import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureDiagnostic,
  CheckFinding,
  TerraformDiagnostic
} from "@sketchcatch/types";

// Architecture 규칙 결과를 기존 비용·보안 검사 결과 앞에 합칩니다.
export function addArchitectureDiagnosticsToPreDeploymentAnalysis(
  analysis: AiPreDeploymentAnalysisResult,
  diagnostics: readonly ArchitectureDiagnostic[]
): AiPreDeploymentAnalysisResult {
  const actionableDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity !== "info");

  if (actionableDiagnostics.length === 0) {
    return analysis;
  }

  const diagnosticFindings = actionableDiagnostics.map(createArchitectureDiagnosticFinding);
  const diagnosticFindingIds = diagnosticFindings.map((finding) => finding.id);
  const errorCount = actionableDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length;

  return {
    ...analysis,
    summary: createPreDeploymentSummaryWithArchitectureDiagnostics(
      analysis,
      actionableDiagnostics
    ),
    findings: [...diagnosticFindings, ...analysis.findings],
    checklist: [
      {
        id: "architecture-diagnostics-check",
        label: "Architecture 설계 진단 확인",
        status: errorCount > 0 ? "fail" : "warning",
        relatedFindingIds: diagnosticFindingIds
      },
      ...analysis.checklist
    ],
    suggestions: [
      ...diagnosticFindings.map((finding) => ({
        id: `suggestion-${finding.id}`,
        findingId: finding.id,
        title: "Board 설계 수정",
        targetResourceId: finding.resourceId,
        action: "manual_review" as const,
        expectedImpact: {
          cost: "unknown" as const,
          security: "neutral" as const,
          reliability: "improve" as const
        },
        explanation:
          "Board에서 해당 Resource의 배치와 파라미터를 확인한 뒤 배포 전 검사를 다시 실행하세요."
      })),
      ...analysis.suggestions
    ]
  };
}

// 배포를 막는 Architecture 오류만으로 Safety Gate 결과를 만듭니다.
export function createPreDeploymentAnalysisFromArchitectureDiagnostics(
  diagnostics: readonly ArchitectureDiagnostic[]
): AiPreDeploymentAnalysisResult {
  return addArchitectureDiagnosticsToPreDeploymentAnalysis(
    {
      summary: "Architecture 설계 오류를 먼저 해결해야 합니다.",
      totalMonthlyEstimate: {
        amount: 0,
        currency: "USD",
        pricingAssumption: "Architecture diagnostics fail-fast 결과라 비용 산정을 실행하지 않았습니다."
      },
      resourceCostEstimates: [],
      findings: [],
      checklist: [],
      suggestions: []
    },
    diagnostics
  );
}

export function addTerraformDiagnosticsToPreDeploymentAnalysis(
  analysis: AiPreDeploymentAnalysisResult,
  diagnostics: readonly TerraformDiagnostic[]
): AiPreDeploymentAnalysisResult {
  const actionableDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity !== "info");

  if (actionableDiagnostics.length === 0) {
    return analysis;
  }

  const diagnosticFindings = actionableDiagnostics.map(createTerraformDiagnosticFinding);
  const diagnosticFindingIds = diagnosticFindings.map((finding) => finding.id);
  const hasErrorDiagnostic = actionableDiagnostics.some(
    (diagnostic) => diagnostic.severity === "error"
  );

  return {
    ...analysis,
    summary: createPreDeploymentSummaryWithTerraformDiagnostics(analysis, actionableDiagnostics),
    findings: [...diagnosticFindings, ...analysis.findings],
    checklist: [
      {
        id: "terraform-diagnostics-check",
        label: "Terraform 코드 진단 확인",
        status: hasErrorDiagnostic ? "fail" : "warning",
        relatedFindingIds: diagnosticFindingIds
      },
      ...analysis.checklist
    ],
    suggestions: [
      ...diagnosticFindings.map((finding) => ({
        id: `suggestion-${finding.id}`,
        findingId: finding.id,
        title: "Terraform 코드 수정",
        action: "manual_review" as const,
        expectedImpact: {
          cost: "unknown" as const,
          security: "neutral" as const,
          reliability: "improve" as const
        },
        explanation:
          "Terraform 탭의 진단 메시지를 먼저 해결한 뒤 배포 기준 저장과 배포 전 검사를 다시 실행하세요."
      })),
      ...analysis.suggestions
    ]
  };
}

export function createPreDeploymentAnalysisFromTerraformDiagnostics(
  diagnostics: readonly TerraformDiagnostic[]
): AiPreDeploymentAnalysisResult {
  return addTerraformDiagnosticsToPreDeploymentAnalysis(
    {
      summary: "Terraform 코드 진단을 먼저 해결해야 합니다.",
      totalMonthlyEstimate: {
        amount: 0,
        currency: "USD",
        pricingAssumption: "Terraform diagnostics fail-fast 결과라 비용 산정을 실행하지 않았습니다."
      },
      resourceCostEstimates: [],
      findings: [],
      checklist: [],
      suggestions: []
    },
    diagnostics
  );
}

// Architecture 진단 한 건을 Safety Gate에서 사용하는 finding으로 바꿉니다.
function createArchitectureDiagnosticFinding(
  diagnostic: ArchitectureDiagnostic,
  index: number
): CheckFinding {
  const recommendation = diagnostic.remediation[0]?.label ?? "Board에서 Resource 구성을 확인하세요.";

  return {
    id: `architecture-diagnostic-${index}-${diagnostic.code}`,
    category: "configuration",
    severity: diagnostic.severity === "error" ? "high" : "medium",
    resourceId: diagnostic.resourceNodeId,
    title: diagnostic.summary,
    description: diagnostic.message,
    recommendation
  };
}

function createTerraformDiagnosticFinding(
  diagnostic: TerraformDiagnostic,
  index: number
): CheckFinding {
  const sourceLocation = diagnostic.line
    ? {
        fileName: diagnostic.sourceFileName ?? "main.tf",
        line: diagnostic.line,
        ...(diagnostic.resourceAddress ? { resourceAddress: diagnostic.resourceAddress } : {})
      }
    : null;

  return {
    id: `terraform-diagnostic-${index}-${diagnostic.code ?? diagnostic.severity}`,
    category: "configuration",
    severity: diagnostic.severity === "error" ? "high" : "medium",
    resourceId: diagnostic.resourceAddress ?? diagnostic.nodeId,
    ...(sourceLocation ? { sourceLocation } : {}),
    title: diagnostic.line
      ? `Terraform 코드 ${formatTerraformDiagnosticLocation(diagnostic)} 확인 필요`
      : "Terraform 코드 확인 필요",
    description: diagnostic.message,
    recommendation: "Terraform 탭에서 해당 진단을 수정한 뒤 Validate 또는 저장을 다시 실행하세요."
  };
}

function formatTerraformDiagnosticLocation(diagnostic: TerraformDiagnostic): string {
  return diagnostic.sourceFileName
    ? `${diagnostic.sourceFileName}:${diagnostic.line}`
    : `${diagnostic.line}번째 줄`;
}

function createPreDeploymentSummaryWithTerraformDiagnostics(
  analysis: AiPreDeploymentAnalysisResult,
  diagnostics: readonly TerraformDiagnostic[]
): string {
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  if (errorCount > 0) {
    return `Terraform 코드에 배포 전 해결해야 할 오류 ${errorCount}개가 있습니다.`;
  }

  if (analysis.findings.length === 0) {
    return `Terraform 코드에 배포 전 확인할 경고 ${warningCount}개가 있습니다.`;
  }

  return `Terraform 코드 경고 ${warningCount}개와 배포 전 점검 항목을 함께 확인해야 합니다.`;
}

// Architecture 진단 개수를 사용자가 바로 이해할 수 있는 검사 요약으로 만듭니다.
function createPreDeploymentSummaryWithArchitectureDiagnostics(
  analysis: AiPreDeploymentAnalysisResult,
  diagnostics: readonly ArchitectureDiagnostic[]
): string {
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  if (errorCount > 0) {
    return `Architecture 설계 오류 ${errorCount}개를 먼저 해결해야 합니다.`;
  }

  if (analysis.findings.length === 0) {
    return `Architecture 설계 경고 ${warningCount}개를 확인해야 합니다.`;
  }

  return `Architecture 설계 경고 ${warningCount}개와 배포 전 점검 항목을 함께 확인해야 합니다.`;
}
