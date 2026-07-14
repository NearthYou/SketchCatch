import type {
  AiTerraformErrorCategory,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  CheckFindingCategory,
  RiskLevel,
  TerraformDiagnostic,
  WellArchitectedPillar
} from "@sketchcatch/types";
import {
  createTerraformIssueFixPlan,
  type TerraformIssueCodePreview
} from "./workspace-terraform-ai";

export type WorkspaceAiResultCheck = {
  readonly action?: string | undefined;
  readonly id: string;
  readonly label: string;
  readonly severity?: RiskLevel | undefined;
  readonly summary: string;
};

export type TerraformPreviewPresentation = {
  readonly checks: readonly WorkspaceAiResultCheck[];
  readonly nextStep: string;
  readonly summary: string;
  readonly technical: {
    readonly findings: readonly string[];
    readonly provider?: string | undefined;
    readonly rawRecommendation: string;
    readonly rawSummary: string;
    readonly resources: readonly string[];
  };
};

export type TerraformIssuePresentation = {
  readonly canApply: boolean;
  readonly checks: readonly WorkspaceAiResultCheck[];
  readonly location: string;
  readonly nextStep: string;
  readonly summary: string;
  readonly technical: {
    readonly codeFrame: readonly { readonly isErrorLine: boolean; readonly lineNumber: number; readonly text: string }[];
    readonly codePreview?: TerraformIssueCodePreview | undefined;
    readonly errorType: string;
    readonly likelyCause: string;
    readonly nextActions: readonly string[];
    readonly providerLabel: string;
    readonly providerNotice?: string | undefined;
    readonly rawMessage: string;
  };
  readonly title: string;
};

type UserFacingCheckCopy = {
  readonly action: string;
  readonly label: string;
  readonly summary: string;
};

const CHECK_COPY = {
  availability: {
    action: "장애가 생겼을 때 복구할 방법이 준비되어 있는지 확인하세요.",
    label: "안정성",
    summary: "서비스가 중단되지 않도록 구성했는지 확인해야 합니다."
  },
  configuration: {
    action: "입력한 값과 사용 범위가 의도한 설정인지 확인하세요.",
    label: "설정",
    summary: "배포 전에 다시 확인할 설정이 있습니다."
  },
  cost: {
    action: "배포 전에 예상 비용과 불필요한 리소스가 없는지 확인하세요.",
    label: "비용",
    summary: "비용에 영향을 줄 수 있는 설정이 있습니다."
  },
  cost_optimization: {
    action: "배포 전에 예상 비용과 불필요한 리소스가 없는지 확인하세요.",
    label: "비용",
    summary: "비용에 영향을 줄 수 있는 설정이 있습니다."
  },
  network: {
    action: "필요한 대상만 연결되고 외부 공개 범위가 넓지 않은지 확인하세요.",
    label: "네트워크",
    summary: "접근 범위와 연결 설정을 확인해야 합니다."
  },
  operational_excellence: {
    action: "배포와 장애 대응 절차가 준비되어 있는지 확인하세요.",
    label: "운영",
    summary: "운영 전에 확인할 절차가 있습니다."
  },
  performance: {
    action: "예상 사용량을 처리할 수 있는 크기인지 확인하세요.",
    label: "성능",
    summary: "사용량에 맞는 성능 설정인지 확인해야 합니다."
  },
  performance_efficiency: {
    action: "예상 사용량을 처리할 수 있는 크기인지 확인하세요.",
    label: "성능",
    summary: "사용량에 맞는 성능 설정인지 확인해야 합니다."
  },
  permission: {
    action: "필요한 작업에만 권한을 허용했는지 확인하세요.",
    label: "권한",
    summary: "접근 권한이 너무 넓거나 부족하지 않은지 확인해야 합니다."
  },
  reliability: {
    action: "장애가 생겼을 때 복구할 방법이 준비되어 있는지 확인하세요.",
    label: "안정성",
    summary: "서비스가 중단되지 않도록 구성했는지 확인해야 합니다."
  },
  security: {
    action: "필요한 대상만 접근할 수 있도록 범위를 제한했는지 확인하세요.",
    label: "보안",
    summary: "외부 접근과 민감 정보 보호 설정을 확인해야 합니다."
  },
  sustainability: {
    action: "필요한 만큼만 리소스를 사용하도록 구성했는지 확인하세요.",
    label: "효율",
    summary: "불필요한 리소스 사용이 없는지 확인해야 합니다."
  }
} satisfies Record<CheckFindingCategory | WellArchitectedPillar, UserFacingCheckCopy>;

const ISSUE_COPY = {
  credential: {
    nextStep: "AWS 연결 상태를 다시 확인한 뒤 검증을 실행하세요.",
    summary: "AWS 로그인 정보나 연결 상태를 확인하지 못했습니다.",
    title: "AWS 연결을 확인해 주세요"
  },
  dependency: {
    nextStep: "참조하는 리소스가 먼저 정의되어 있는지 확인한 뒤 다시 검증하세요.",
    summary: "리소스 간 연결이나 생성 순서 때문에 검증을 계속할 수 없습니다.",
    title: "리소스 연결을 확인해 주세요"
  },
  permission: {
    nextStep: "연결된 AWS 계정의 권한을 확인한 뒤 다시 검증하세요.",
    summary: "Terraform이 필요한 AWS 리소스에 접근하지 못했습니다.",
    title: "AWS 접근 권한을 확인해 주세요"
  },
  quota: {
    nextStep: "AWS 서비스 한도를 확인하고 필요하면 한도 증가를 요청하세요.",
    summary: "현재 AWS 계정의 사용 한도 때문에 작업을 계속할 수 없습니다.",
    title: "AWS 사용 한도를 확인해 주세요"
  },
  region_or_resource: {
    nextStep: "리전과 리소스 이름이 실제 AWS 환경과 일치하는지 확인하세요.",
    summary: "설정에 적힌 AWS 리소스나 리전 정보를 찾지 못했습니다.",
    title: "리소스 위치와 이름을 확인해 주세요"
  },
  syntax: {
    nextStep: "문제가 표시된 줄을 수정한 뒤 Terraform 검증을 다시 실행하세요.",
    summary: "코드 형식이 올바르지 않아 검증을 계속할 수 없습니다.",
    title: "Terraform 코드 형식을 확인해 주세요"
  },
  unknown: {
    nextStep: "기술 정보를 확인해 코드를 수정한 뒤 다시 검증하세요.",
    summary: "Terraform 검증 중 확인이 필요한 문제가 발견되었습니다.",
    title: "Terraform 설정을 확인해 주세요"
  }
} satisfies Record<AiTerraformErrorCategory, { readonly nextStep: string; readonly summary: string; readonly title: string }>;

export function createTerraformPreviewPresentation(
  preview: AiTerraformPreviewExplanationResult
): TerraformPreviewPresentation {
  const resourceCount = preview.detectedResources.length;
  const findingCount = preview.findings.length;
  const findingCategories = new Set(preview.findings.map((finding) => finding.category));
  const findingChecks = preview.findings.map<WorkspaceAiResultCheck>((finding) => {
    const copy = CHECK_COPY[finding.category];

    return {
      action: copy.action,
      id: `finding-${finding.id}`,
      label: copy.label,
      severity: finding.severity,
      summary: copy.summary
    };
  });
  const guidanceChecks = preview.wellArchitectedGuidance
    .filter((guidance) => {
      const findingCategory = toFindingCategory(guidance.pillar);
      return findingCategory === null || !findingCategories.has(findingCategory);
    })
    .map<WorkspaceAiResultCheck>((guidance) => {
      const copy = CHECK_COPY[guidance.pillar];

      return {
        action: copy.action,
        id: `guidance-${guidance.pillar}`,
        label: copy.label,
        summary: copy.summary
      };
    });

  return {
    checks: [...findingChecks, ...guidanceChecks].slice(0, 4),
    nextStep: createPreviewNextStep(preview),
    summary: createPreviewSummary(resourceCount, findingCount),
    technical: {
      findings: preview.findings.map((finding) =>
        [finding.title, finding.resourceId, finding.description, finding.recommendation]
          .filter(Boolean)
          .join(" · ")
      ),
      ...(preview.llmExplanation?.providerMetadata?.provider
        ? { provider: preview.llmExplanation.providerMetadata.provider }
        : {}),
      rawRecommendation: preview.consensusRecommendation,
      rawSummary: preview.summary,
      resources: preview.detectedResources.map(
        (resource) => `${resource.terraformType}.${resource.label} · ${resource.explanation}`
      )
    }
  };
}

export function createTerraformIssuePresentation({
  diagnostic,
  explanation,
  terraformCode
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly terraformCode: string;
}): TerraformIssuePresentation {
  const fixPlan = createTerraformIssueFixPlan({ diagnostic, explanation, terraformCode });
  const copy = ISSUE_COPY[explanation.category];

  return {
    canApply: fixPlan.canApply,
    checks: [
      {
        id: "location",
        label: "문제 위치",
        summary: fixPlan.location
      },
      {
        id: "fix-availability",
        label: "수정 방법",
        summary: fixPlan.canApply
          ? "검토 후 적용할 수 있는 수정안을 준비했습니다."
          : "코드를 직접 확인해야 하는 문제입니다."
      }
    ],
    location: fixPlan.location,
    nextStep: fixPlan.canApply
      ? "기술 정보에서 변경 내용을 확인한 뒤 수정안을 적용하세요."
      : copy.nextStep,
    summary: copy.summary,
    technical: {
      codeFrame: fixPlan.codeFrame,
      ...(fixPlan.codePreview ? { codePreview: fixPlan.codePreview } : {}),
      errorType: fixPlan.errorType,
      likelyCause: explanation.likelyCause,
      nextActions: explanation.nextActions,
      providerLabel: fixPlan.providerLabel,
      ...(fixPlan.providerNotice ? { providerNotice: fixPlan.providerNotice } : {}),
      rawMessage: diagnostic.message || explanation.rawMessage
    },
    title: copy.title
  };
}

export function formatTerraformReviewContext(label: string): string {
  if (/^리소스 코드\s*[·:]/u.test(label)) {
    return "선택한 리소스 기준";
  }

  if (/^강조 코드\s*[·:]/u.test(label)) {
    return "선택한 코드 기준";
  }

  const normalized = label.replace(/^현재 파일\s*[·:]\s*/u, "").trim();

  if (normalized.length === 0) {
    return "현재 코드 기준";
  }

  if (containsInternalReference(normalized)) {
    return "선택한 코드 기준";
  }

  return normalized.endsWith("기준") ? normalized : `${normalized} 기준`;
}

export function getWorkspaceAiResultSeverityLabel(severity: RiskLevel): string {
  switch (severity) {
    case "low":
      return "낮음";
    case "medium":
      return "주의";
    case "high":
      return "위험";
  }
}

function createPreviewSummary(resourceCount: number, findingCount: number): string {
  const resourceSummary =
    resourceCount > 0
      ? `${resourceCount}개의 인프라 리소스를 검토했습니다.`
      : "Terraform 구성을 검토했습니다.";

  if (findingCount === 0) {
    return `${resourceSummary} 현재 확인된 주의 사항은 없습니다.`;
  }

  return `${resourceSummary} 배포 전에 확인할 항목이 ${findingCount}개 있습니다.`;
}

function createPreviewNextStep(preview: AiTerraformPreviewExplanationResult): string {
  return preview.findings.length > 0
    ? "확인할 점을 검토한 뒤 배포 계획을 다시 확인하세요."
    : "배포 계획과 비용·보안 검사를 확인한 뒤 다음 단계로 진행하세요.";
}

function containsInternalReference(value: string): boolean {
  return (
    /\b(?:data|module|resource)\.[A-Za-z0-9_.-]+/u.test(value) ||
    /\b(?:aws|azurerm|google)_[A-Za-z0-9_]+/u.test(value) ||
    /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/u.test(value)
  );
}

function toFindingCategory(pillar: WellArchitectedPillar): CheckFindingCategory | null {
  switch (pillar) {
    case "security":
      return "security";
    case "performance_efficiency":
      return "performance";
    case "cost_optimization":
      return "cost";
    case "reliability":
      return "availability";
    case "operational_excellence":
    case "sustainability":
      return null;
  }
}
