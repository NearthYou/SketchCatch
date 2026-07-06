import type {
  AiPreDeploymentAnalysisResult,
  CheckFinding,
  TerraformDiagnostic
} from "@sketchcatch/types";

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
