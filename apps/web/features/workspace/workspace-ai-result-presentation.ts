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

export type WorkspaceAiReviewSummaryItem = {
  readonly id: string;
  readonly label: "잘된 점" | "주요 문제" | "검토 결과";
  readonly text: string;
  readonly tone: "positive" | "risk" | "neutral";
};

export type TerraformPreviewPresentation = {
  readonly checks: readonly WorkspaceAiResultCheck[];
  readonly nextStep: string;
  readonly summary: string;
  readonly summaryItems: readonly WorkspaceAiReviewSummaryItem[];
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
    label: "지속 가능성",
    summary: "불필요한 리소스 사용이 없는지 확인해야 합니다."
  }
} satisfies Record<CheckFindingCategory | WellArchitectedPillar, UserFacingCheckCopy>;

const WELL_ARCHITECTED_PILLARS = [
  "operational_excellence",
  "security",
  "reliability",
  "performance_efficiency",
  "cost_optimization",
  "sustainability"
] as const satisfies readonly WellArchitectedPillar[];

const PILLAR_FINDING_CATEGORIES = {
  operational_excellence: ["configuration"],
  security: ["security", "permission", "network"],
  reliability: ["availability"],
  performance_efficiency: ["performance"],
  cost_optimization: ["cost"],
  sustainability: []
} as const satisfies Record<WellArchitectedPillar, readonly CheckFindingCategory[]>;

const RISK_LEVEL_PRIORITY = {
  low: 0,
  medium: 1,
  high: 2
} as const satisfies Record<RiskLevel, number>;

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
  const checks = WELL_ARCHITECTED_PILLARS.map<WorkspaceAiResultCheck>((pillar, index) => {
    const copy = CHECK_COPY[pillar];
    const guidance = preview.wellArchitectedGuidance.find((item) => item.pillar === pillar);
    const aiReview = getAiPillarReview(preview, index);

    return {
      action: sanitizeReviewDetail(
        aiReview?.action || guidance?.recommendation || copy.action
      ),
      id: `pillar-${pillar}`,
      label: copy.label,
      severity: getPillarRiskLevel(preview, pillar, index),
      summary: sanitizeReviewDetail(
        aiReview?.summary || guidance?.observation || copy.summary
      )
    };
  });
  const reviewSummary =
    preview.llmExplanation?.wellArchitectedConclusion?.trim() ||
    createPreviewSummary(resourceCount, findingCount);

  return {
    checks,
    nextStep: createPreviewNextStep(preview),
    summary: createVisibleReviewSummary(reviewSummary),
    summaryItems: createReviewSummaryItems(reviewSummary, checks),
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
      return "보통";
    case "medium":
      return "확인 필요";
    case "high":
      return "심각";
  }
}

function getPillarRiskLevel(
  preview: AiTerraformPreviewExplanationResult,
  pillar: WellArchitectedPillar,
  pillarIndex: number
): RiskLevel {
  const categories: readonly CheckFindingCategory[] = PILLAR_FINDING_CATEGORIES[pillar];
  const deterministicRisk = preview.findings.reduce<RiskLevel>((highestRisk, finding) => {
    if (!categories.includes(finding.category)) {
      return highestRisk;
    }

    return RISK_LEVEL_PRIORITY[finding.severity] > RISK_LEVEL_PRIORITY[highestRisk]
      ? finding.severity
      : highestRisk;
  }, "low");
  const aiRisk = getAiPillarRiskLevel(preview, pillarIndex);

  return RISK_LEVEL_PRIORITY[aiRisk] > RISK_LEVEL_PRIORITY[deterministicRisk]
    ? aiRisk
    : deterministicRisk;
}

function getAiPillarRiskLevel(
  preview: AiTerraformPreviewExplanationResult,
  pillarIndex: number
): RiskLevel {
  const highlights = preview.llmExplanation?.highlights;

  if (highlights?.length !== WELL_ARCHITECTED_PILLARS.length) {
    return "low";
  }

  const review = highlights[pillarIndex] ?? "";

  if (/^\s*\[심각\]/u.test(review)) {
    return "high";
  }

  if (/^\s*\[확인 필요\]/u.test(review)) {
    return "medium";
  }

  return "low";
}

function getAiPillarReview(
  preview: AiTerraformPreviewExplanationResult,
  pillarIndex: number
): { readonly action?: string | undefined; readonly summary: string } | null {
  const highlights = preview.llmExplanation?.highlights;

  if (highlights?.length !== WELL_ARCHITECTED_PILLARS.length) {
    return null;
  }

  const review = (highlights[pillarIndex] ?? "")
    .replace(/^\s*\[(?:보통|확인 필요|심각)\]\s*/u, "")
    .trim();
  const structuredSummary = review.match(
    /(?:^|\|\s*|\s)(?:문제|판단|현재 판단)\s*:\s*(.*?)(?=\s*(?:\|\s*)?(?:확인|확인할 부분|조치)\s*:|$)/u
  )?.[1]?.trim();
  const structuredAction = review.match(
    /(?:^|\|\s*|\s)(?:확인|확인할 부분|조치)\s*:\s*([^|]+)/u
  )?.[1]?.trim();
  const completeSummary =
    structuredSummary && isCompleteReviewDetail(structuredSummary) ? structuredSummary : undefined;
  const completeAction =
    structuredAction && isCompleteReviewDetail(structuredAction) ? structuredAction : undefined;

  if (completeSummary) {
    return {
      ...(completeAction ? { action: completeAction } : {}),
      summary: completeSummary
    };
  }

  const plainReview = review.replace(/^[^:：|]{1,32}[:：|]\s*/u, "").trim();

  return plainReview.length > 0 && isCompleteReviewDetail(plainReview)
    ? { summary: plainReview }
    : null;
}

function isCompleteReviewDetail(value: string): boolean {
  const readableEnding = sanitizeReviewDetail(value)
    .replace(/[.!?。]+$/gu, "")
    .trim();

  return /[다요]$/u.test(readableEnding);
}

function createReviewSummaryItems(
  value: string,
  checks: readonly WorkspaceAiResultCheck[]
): WorkspaceAiReviewSummaryItem[] {
  const riskChecks = checks
    .filter((check) => check.severity === "high" || check.severity === "medium")
    .sort(
      (left, right) =>
        RISK_LEVEL_PRIORITY[right.severity ?? "low"] -
        RISK_LEVEL_PRIORITY[left.severity ?? "low"]
    );
  const strengthChecks = checks.filter((check) => check.severity === "low");
  const strengthLimit = riskChecks.length >= 2 ? 1 : 2;
  const riskLimit = riskChecks.length >= 2 ? 2 : 1;
  const checkItems: WorkspaceAiReviewSummaryItem[] = [
    ...strengthChecks.slice(0, strengthLimit).map((check) => ({
      id: `summary-strength-${check.id}`,
      label: "잘된 점" as const,
      text: `${check.label}: ${check.summary}`,
      tone: "positive" as const
    })),
    ...riskChecks.slice(0, riskLimit).map((check) => ({
      id: `summary-risk-${check.id}`,
      label: "주요 문제" as const,
      text: `${check.label}: ${check.summary}`,
      tone: "risk" as const
    }))
  ];

  if (checkItems.length >= 2) {
    return checkItems;
  }

  const sentences = splitReviewSentences(value).slice(0, 3);
  const items = sentences.map<WorkspaceAiReviewSummaryItem>((sentence, index) => {
    if (/다만|하지만|반면|그러나|문제|위험|부족|누락|단일 장애점|필요|어렵|취약|중단|위반/u.test(sentence)) {
      return {
        id: `summary-${index}`,
        label: "주요 문제",
        text: sentence,
        tone: "risk"
      };
    }

    if (/좋|잘 |적절|준수|활성화|비활성화|명확|분리|구분되어|쉬운 구조|확장하기 쉬/u.test(sentence)) {
      return {
        id: `summary-${index}`,
        label: "잘된 점",
        text: sentence,
        tone: "positive"
      };
    }

    return {
      id: `summary-${index}`,
      label: "검토 결과",
      text: sentence,
      tone: "neutral"
    };
  });

  if (items.some((item) => item.tone === "positive")) {
    return items;
  }

  const confirmedStrength = checks.find((check) => check.severity === "low");

  if (!confirmedStrength) {
    return items;
  }

  const fallbackItems: WorkspaceAiReviewSummaryItem[] = [
    {
      id: "summary-confirmed-strength",
      label: "잘된 점",
      text: `${confirmedStrength.label}: ${confirmedStrength.summary}`,
      tone: "positive"
    },
    ...items.filter((item) => item.tone === "risk")
  ];

  return fallbackItems.slice(0, 3);
}

function createVisibleReviewSummary(value: string): string {
  const sentences = splitReviewSentences(value);
  const issueSentence = sentences
    .slice(1)
    .find((sentence) => /다만|하지만|반면|그러나|문제|위험|부족|필요/u.test(sentence));
  const selectedSentences = [sentences[0], issueSentence ?? sentences[1]].filter(
    (sentence): sentence is string => Boolean(sentence)
  );
  const visibleSummary = selectedSentences.join(" ");

  if (visibleSummary.length <= 320) {
    return visibleSummary;
  }

  return `${visibleSummary.slice(0, 319).trimEnd()}…`;
}

function splitReviewSentences(value: string): string[] {
  const normalized = value.replace(/\s+/gu, " ").trim();

  return (normalized.match(/(?:\d+\.\d+|[^.!?])+(?:[.!?]+|$)/gu) ?? [normalized])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sanitizeReviewDetail(value: string): string {
  const normalized = value
    .replace(/\b(?:data|module|resource)\.[A-Za-z0-9_.-]+/gu, "해당 리소스")
    .replace(/\b(?:aws|azurerm|google)_[A-Za-z0-9_]+(?:\.[A-Za-z0-9_.-]+)?/gu, "해당 리소스")
    .replace(/resource 블록/gu, "Terraform 설정")
    .replace(/\s+/gu, " ")
    .trim();

  const readable = normalized
    .replace(
      /desired_count\s*=\s*1로 task 장애 시 서비스가 중단됩니다/gu,
      "실행 중인 ECS 작업이 1개뿐이라, 해당 작업에 장애가 생기면 서비스가 중단됩니다"
    )
    .replace(
      /desired_count\s*=\s*1(?:은|로 인한)?\s*단일 장애점 위험/gu,
      "실행 중인 ECS 작업이 1개뿐이라, 이 작업이 멈추면 서비스도 중단될 수 있습니다"
    )
    .replace(
      /desired_count를 2 이상으로 설정하고 서로 다른 AZ에 배치하세요/gu,
      "ECS 작업을 2개 이상 실행하고 서로 다른 가용 영역(AZ)에 배치하세요"
    )
    .replace(
      /최소 2개 이상의 desired_count와 multi-AZ 배치 필요/gu,
      "ECS 작업을 2개 이상 실행하고 서로 다른 가용 영역(AZ)에 배치하세요"
    )
    .replace(
      /S3 public access 차단 확인되나 security group 규칙 불완전/gu,
      "S3 공개 접근은 차단되어 있지만 보안 그룹의 접근 허용 범위는 충분히 검증되지 않았습니다"
    )
    .replace(
      /ingress cidr_blocks 범위와 최소 권한 원칙 검증 필요/gu,
      "보안 그룹의 인바운드 허용 IP 범위를 확인하고 필요한 대상만 접근하도록 제한하세요"
    )
    .replace(
      /health_check_grace_period\s*30초 설정되나 AZ 분산 미확인/gu,
      "상태 확인 유예 시간은 30초지만, 서비스가 여러 가용 영역에 분산됐는지는 확인되지 않았습니다"
    )
    .replace(
      /최소 2개 AZ의 subnets 배치와 target group 연결 검증/gu,
      "서로 다른 가용 영역의 서브넷을 사용하고 대상 그룹 연결과 상태 확인이 정상인지 검증하세요"
    )
    .replace(
      /cpu\s*=\s*256,?\s*memory\s*=\s*512 설정되나 적정성 불명/gu,
      "CPU 0.25 vCPU와 메모리 512 MiB가 할당됐지만 실제 부하에 적정한지는 확인되지 않았습니다"
    )
    .replace(
      /워크로드 요구사항 대비 리소스 크기와 scaling 정책 필요/gu,
      "실제 CPU·메모리 사용량을 확인하고 부하에 따라 자동으로 작업 수를 조절하도록 설정하세요"
    )
    .replace(
      /Fargate 리소스 크기 확인되나 right-sizing 근거 없음/gu,
      "Fargate 용량은 설정되어 있지만 실제 사용량에 맞춘 크기인지 판단할 근거가 없습니다"
    )
    .replace(
      /실제 사용률 기반 cpu\/memory 조정과 Savings Plan 검토/gu,
      "실제 CPU·메모리 사용률에 맞춰 용량을 조정하고 장기 사용 시 Savings Plans 적용을 검토하세요"
    )
    .replace(
      /awsvpc 네트워크 모드와 최소 리소스 할당 확인/gu,
      "ECS 작업에 전용 네트워크를 사용하고 필요한 최소 수준의 리소스를 할당했습니다"
    )
    .replace(
      /network_mode\s*=\s*awsvpc,?\s*assign_public_ip\s*=\s*false로 효율적 구성/gu,
      "각 ECS 작업에 전용 네트워크 인터페이스를 사용하고 공개 IP를 할당하지 않도록 설정했습니다"
    )
    .replace(/desired_count/gu, "ECS 작업 수")
    .replace(/multi-AZ/gu, "여러 가용 영역(AZ)")
    .replace(/security group/giu, "보안 그룹")
    .replace(/cidr_blocks/gu, "허용 IP 범위")
    .replace(/right-sizing/giu, "적정 용량 산정")
    .replace(/scaling/giu, "자동 확장")
    .replace(/subnets?/giu, "서브넷")
    .replace(/target group/giu, "대상 그룹")
    .trim();

  return /[.!?。]$/u.test(readable) ? readable : `${readable}.`;
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
