import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  CheckFinding,
  TerraformDiagnostic
} from "@sketchcatch/types";
import {
  findTerraformSourceLocationForAddress,
  parseTerraformFiles,
  type TerraformVirtualFile
} from "./terraform-panel-utils";

const RESOURCE_TYPE_TERRAFORM_TYPES: Record<string, readonly string[]> = {
  AMI: ["aws_ami"],
  CLOUDFRONT: ["aws_cloudfront_distribution"],
  EC2: ["aws_instance"],
  INTERNET_GATEWAY: ["aws_internet_gateway"],
  LAMBDA: ["aws_lambda_function"],
  RDS: ["aws_db_instance"],
  ROUTE_TABLE: ["aws_route_table"],
  ROUTE_TABLE_ASSOCIATION: ["aws_route_table_association"],
  S3: ["aws_s3_bucket"],
  SECURITY_GROUP: ["aws_security_group", "aws_security_group_rule"],
  SUBNET: ["aws_subnet"],
  VPC: ["aws_vpc"]
};

export function addTerraformDiagnosticsToPreDeploymentAnalysis(
  analysis: AiPreDeploymentAnalysisResult,
  diagnostics: readonly TerraformDiagnostic[],
  sourceFiles: readonly TerraformVirtualFile[] = [],
  architectureJson?: ArchitectureJson
): AiPreDeploymentAnalysisResult {
  const actionableDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity !== "info");
  const analysisWithSourceLocations = addTerraformSourceLocationsToFindings(
    analysis,
    sourceFiles,
    architectureJson
  );

  if (actionableDiagnostics.length === 0) {
    return analysisWithSourceLocations;
  }

  const diagnosticFindings = actionableDiagnostics.map((diagnostic, index) =>
    createTerraformDiagnosticFinding(diagnostic, index, sourceFiles)
  );
  const diagnosticFindingIds = diagnosticFindings.map((finding) => finding.id);
  const hasErrorDiagnostic = actionableDiagnostics.some(
    (diagnostic) => diagnostic.severity === "error"
  );

  return {
    ...analysis,
    summary: createPreDeploymentSummaryWithTerraformDiagnostics(analysis, actionableDiagnostics),
    findings: [...diagnosticFindings, ...analysisWithSourceLocations.findings],
    checklist: [
      {
        id: "terraform-diagnostics-check",
        label: "Terraform 코드 진단 확인",
        status: hasErrorDiagnostic ? "fail" : "warning",
        relatedFindingIds: diagnosticFindingIds
      },
      ...analysisWithSourceLocations.checklist
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
      ...analysisWithSourceLocations.suggestions
    ]
  };
}

function addTerraformSourceLocationsToFindings(
  analysis: AiPreDeploymentAnalysisResult,
  sourceFiles: readonly TerraformVirtualFile[],
  architectureJson: ArchitectureJson | undefined
): AiPreDeploymentAnalysisResult {
  if (sourceFiles.length === 0 || architectureJson === undefined || analysis.findings.length === 0) {
    return analysis;
  }

  const findings = analysis.findings.map((finding) => {
    if (finding.sourceLocation) {
      return finding;
    }

    const sourceLocation = findSourceLocationForPreDeploymentFinding(
      finding,
      sourceFiles,
      architectureJson
    );

    return sourceLocation ? { ...finding, sourceLocation } : finding;
  });

  return {
    ...analysis,
    findings
  };
}

function findSourceLocationForPreDeploymentFinding(
  finding: CheckFinding,
  sourceFiles: readonly TerraformVirtualFile[],
  architectureJson: ArchitectureJson
): CheckFinding["sourceLocation"] {
  const node = architectureJson.nodes.find((candidate) => candidate.id === finding.resourceId);
  const addressCandidates = createTerraformAddressCandidates(finding, node);

  for (const address of addressCandidates) {
    const sourceLocation = findTerraformSourceLocationForAddress(sourceFiles, address);

    if (sourceLocation) {
      return sourceLocation;
    }
  }

  const block = findFallbackTerraformBlock(finding, sourceFiles, node);

  return block
    ? {
        fileName: block.fileName,
        line: block.startLine,
        column: 1,
        resourceAddress: block.address,
        terraformBlockType: block.blockType,
        terraformBlockName: block.name
      }
    : undefined;
}

function createTerraformAddressCandidates(
  finding: CheckFinding,
  node: ArchitectureJson["nodes"][number] | undefined
): string[] {
  const candidates = new Set<string>();

  addStringCandidate(candidates, finding.resourceId);
  addStringCandidate(candidates, getConfigString(node, ["terraformAddress", "terraform_address"]));

  const terraformTypes = getTerraformTypeCandidates(finding, node);
  const terraformNames = getTerraformNameCandidates(finding, node);

  for (const terraformType of terraformTypes) {
    for (const terraformName of terraformNames) {
      candidates.add(`${terraformType}.${terraformName}`);
    }
  }

  return [...candidates];
}

function findFallbackTerraformBlock(
  finding: CheckFinding,
  sourceFiles: readonly TerraformVirtualFile[],
  node: ArchitectureJson["nodes"][number] | undefined
) {
  const blocks = parseTerraformFiles(sourceFiles);

  if (blocks.length === 0) {
    return undefined;
  }

  const terraformTypes = new Set(getTerraformTypeCandidates(finding, node));
  const terraformNames = new Set(getTerraformNameCandidates(finding, node));
  const exactNameMatches = blocks.filter((block) => terraformNames.has(block.name));

  if (exactNameMatches.length === 1) {
    return exactNameMatches[0];
  }

  const typeMatches = blocks.filter((block) => terraformTypes.has(block.terraformType));
  const exactTypeAndNameMatches = typeMatches.filter((block) => terraformNames.has(block.name));

  if (exactTypeAndNameMatches.length > 0) {
    return exactTypeAndNameMatches[0];
  }

  if (typeMatches.length === 1) {
    return typeMatches[0];
  }

  if (blocks.length === 1) {
    return blocks[0];
  }

  return undefined;
}

function getTerraformTypeCandidates(
  finding: CheckFinding,
  node: ArchitectureJson["nodes"][number] | undefined
): string[] {
  const candidates = new Set<string>();

  addStringCandidate(candidates, getConfigString(node, ["terraformResourceType", "terraform_resource_type"]));
  addStringCandidate(candidates, getConfigString(node, ["resourceType", "resource_type"]));

  for (const terraformType of RESOURCE_TYPE_TERRAFORM_TYPES[node?.type ?? ""] ?? []) {
    candidates.add(terraformType);
  }

  for (const terraformType of inferTerraformTypesFromFinding(finding)) {
    candidates.add(terraformType);
  }

  return [...candidates];
}

function inferTerraformTypesFromFinding(finding: CheckFinding): string[] {
  const text = `${finding.category} ${finding.title} ${finding.description} ${finding.recommendation}`.toLowerCase();

  if (text.includes("ssh") || text.includes("security group")) {
    return ["aws_security_group", "aws_security_group_rule"];
  }

  if (text.includes("rds") || text.includes("database")) {
    return ["aws_db_instance"];
  }

  if (text.includes("s3") || text.includes("bucket")) {
    return ["aws_s3_bucket"];
  }

  if (text.includes("iam")) {
    return ["aws_iam_policy", "aws_iam_role_policy", "aws_iam_policy_document"];
  }

  return [];
}

function getTerraformNameCandidates(
  finding: CheckFinding,
  node: ArchitectureJson["nodes"][number] | undefined
): string[] {
  const candidates = new Set<string>();

  addTerraformLocalNameCandidate(
    candidates,
    getConfigString(node, ["terraformResourceName", "terraform_resource_name"])
  );
  addTerraformLocalNameCandidate(candidates, getConfigString(node, ["resourceName", "resource_name"]));
  addTerraformLocalNameCandidate(candidates, node?.id);
  addTerraformLocalNameCandidate(candidates, node?.label);
  addTerraformLocalNameCandidate(candidates, finding.resourceId);

  return [...candidates];
}

function getConfigString(
  node: ArchitectureJson["nodes"][number] | undefined,
  keys: readonly string[]
): string | undefined {
  if (!node) {
    return undefined;
  }

  for (const key of keys) {
    const value = node.config[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function addStringCandidate(candidates: Set<string>, value: string | undefined): void {
  const trimmedValue = value?.trim();

  if (trimmedValue) {
    candidates.add(trimmedValue);
  }
}

function addTerraformLocalNameCandidate(candidates: Set<string>, value: string | undefined): void {
  const localName = toTerraformLocalName(value);

  if (localName) {
    candidates.add(localName);
  }
}

function toTerraformLocalName(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const addressTail = trimmedValue.match(/(?:resource|data\.)?([a-z0-9_]+\.[A-Za-z0-9_-]+)$/)?.[1] ?? trimmedValue;
  const localName = addressTail.includes(".") ? addressTail.split(".").at(-1) : addressTail;

  return localName
    ?.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function createTerraformDiagnosticFinding(
  diagnostic: TerraformDiagnostic,
  index: number,
  sourceFiles: readonly TerraformVirtualFile[]
): CheckFinding {
  const sourceLocation = createTerraformDiagnosticSourceLocation(diagnostic, sourceFiles);

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

function createTerraformDiagnosticSourceLocation(
  diagnostic: TerraformDiagnostic,
  sourceFiles: readonly TerraformVirtualFile[]
): CheckFinding["sourceLocation"] {
  const blockLocation = findTerraformSourceLocationForAddress(sourceFiles, diagnostic.resourceAddress);

  if (blockLocation) {
    return sourceFiles.length === 1 && diagnostic.line
      ? { ...blockLocation, line: diagnostic.line }
      : blockLocation;
  }

  if (sourceFiles.length === 1 && diagnostic.line) {
    const [sourceFile] = sourceFiles;

    if (!sourceFile) {
      return undefined;
    }

    return {
      fileName: sourceFile.fileName,
      line: diagnostic.line,
      column: 1,
      resourceAddress: diagnostic.resourceAddress
    };
  }

  return undefined;
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
