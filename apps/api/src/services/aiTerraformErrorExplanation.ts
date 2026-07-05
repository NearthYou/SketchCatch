import type {
  AiTerraformErrorCategory,
  AiTerraformErrorExplanationResult,
  AiTerraformSafeFix,
  AiWellArchitectedGuidance,
  AiTerraformStage,
  RiskLevel
} from "@sketchcatch/types";

export type TerraformErrorExplanationInput = {
  readonly stage: AiTerraformStage;
  readonly rawMessage: string;
  readonly relatedResourceId?: string | undefined;
};

// Terraform 원본 오류를 사용자가 이해하기 쉬운 원인과 다음 행동으로 바꿉니다.
export function explainTerraformError(
  input: TerraformErrorExplanationInput
): AiTerraformErrorExplanationResult {
  const explanation = classifyTerraformError(input.rawMessage);
  const safeFix = createTerraformSafeFix(input.rawMessage);

  return {
    stage: input.stage,
    category: explanation.category,
    severity: explanation.severity,
    rawMessage: input.rawMessage,
    relatedResourceId: input.relatedResourceId,
    summary: explanation.summary,
    likelyCause: explanation.likelyCause,
    nextActions: [...explanation.nextActions],
    wellArchitectedGuidance: createWellArchitectedGuidance(explanation, safeFix),
    consensusRecommendation: createConsensusRecommendation(explanation, safeFix),
    safeFix
  };
}

type TerraformErrorExplanationTemplate = {
  readonly category: AiTerraformErrorCategory;
  readonly severity: RiskLevel;
  readonly keywords: readonly string[];
  readonly summary: string;
  readonly likelyCause: string;
  readonly nextActions: readonly string[];
};

// LLM 없이도 자주 나오는 Terraform 오류를 설명할 수 있게 만든 고정 분류표입니다.
const TERRAFORM_ERROR_TEMPLATES: readonly TerraformErrorExplanationTemplate[] = [
  {
    category: "permission",
    severity: "high",
    keywords: ["accessdenied", "not authorized", "unauthorizedoperation"],
    summary: "AWS 권한이 부족해서 Terraform 작업이 막혔습니다.",
    likelyCause: "연결된 AWS 사용자나 Role에 필요한 작업 권한이 없습니다.",
    nextActions: [
      "AWS 연결에 사용한 사용자나 Role의 IAM 정책을 확인하세요.",
      "오류 메시지에 나온 AWS action 권한이 허용되어 있는지 확인하세요.",
      "권한을 수정한 뒤 같은 Plan 단계를 다시 실행하세요."
    ]
  },
  {
    category: "credential",
    severity: "high",
    keywords: ["nocredentialproviders", "no valid credential", "expiredtoken", "invalidclienttokenid"],
    summary: "AWS 인증 정보가 없거나 사용할 수 없습니다.",
    likelyCause: "Access Key, Secret Key, 세션 토큰, 또는 Assume Role 설정이 비어 있거나 만료됐습니다.",
    nextActions: [
      "AWS 연결 화면에서 credential이 저장되어 있는지 확인하세요.",
      "임시 세션 토큰을 쓰는 경우 만료 여부를 확인하세요.",
      "연결 상태 확인을 다시 실행한 뒤 Plan을 재시도하세요."
    ]
  },
  {
    category: "region_or_resource",
    severity: "medium",
    keywords: ["invalidamiid.notfound", "notfound", "not found", "does not exist in this region"],
    summary: "선택한 region에서 Resource를 찾지 못했습니다.",
    likelyCause: "AMI, subnet, VPC 같은 값이 현재 region에 없거나 잘못된 ID일 수 있습니다.",
    nextActions: [
      "AWS region 설정이 의도한 값인지 확인하세요.",
      "오류에 나온 Resource ID가 그 region에 실제로 존재하는지 확인하세요.",
      "Architecture Board의 Resource 설정 값을 최신 값으로 바꾼 뒤 다시 실행하세요."
    ]
  },
  {
    category: "quota",
    severity: "high",
    keywords: ["limitexceeded", "vcpu", "quota", "maximum number"],
    summary: "AWS 계정 한도 때문에 요청한 Resource를 만들 수 없습니다.",
    likelyCause: "현재 계정/region의 quota보다 더 많은 용량이나 Resource를 요청했습니다.",
    nextActions: [
      "더 작은 instance type이나 더 적은 Resource 수로 낮춰보세요.",
      "AWS Service Quotas에서 현재 한도를 확인하세요.",
      "팀 실습 계정이면 팀장에게 quota 상태를 확인해달라고 요청하세요."
    ]
  },
  {
    category: "syntax",
    severity: "medium",
    keywords: ["invalid expression", "unsupported argument", "missing required argument", "syntax"],
    summary: "Terraform 코드 문법이나 argument 이름이 맞지 않습니다.",
    likelyCause: "IaC Preview에 잘못된 Terraform 표현식, 빠진 값, 또는 지원하지 않는 argument가 들어갔습니다.",
    nextActions: [
      "오류에 표시된 파일과 줄 번호를 확인하세요.",
      "Terraform 코드 에디터에서 해당 argument 이름과 값 형식을 확인하세요.",
      "Architecture Board 설정을 저장한 뒤 IaC Preview를 다시 생성하세요."
    ]
  },
  {
    category: "dependency",
    severity: "medium",
    keywords: ["dependencyviolation", "dependent object", "cycle", "depends on"],
    summary: "Resource 사이의 의존 관계 때문에 Terraform 작업이 막혔습니다.",
    likelyCause: "삭제하거나 수정하려는 Resource를 다른 Resource가 아직 참조하고 있을 수 있습니다.",
    nextActions: [
      "Plan 결과에서 어떤 Resource가 먼저 바뀌어야 하는지 확인하세요.",
      "Architecture Board의 연결선을 확인해 불필요한 의존 관계를 제거하세요.",
      "삭제가 포함된 변경이라면 관련 Resource 순서를 다시 검토하세요."
    ]
  }
] as const;

const UNKNOWN_TERRAFORM_ERROR_TEMPLATE: TerraformErrorExplanationTemplate = {
  category: "unknown",
  severity: "medium",
  keywords: [],
  summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
  likelyCause: "아직 1차 제공 fallback 규칙에 등록되지 않은 오류입니다.",
  nextActions: ["원본 오류 메시지를 확인하고 권한, region, quota, 문법 문제를 차례대로 점검하세요."]
};

// 원본 오류 문장에 포함된 단어를 보고 가장 가까운 설명 템플릿을 고릅니다.
function classifyTerraformError(rawMessage: string): TerraformErrorExplanationTemplate {
  const normalizedMessage = rawMessage.toLowerCase();

  return (
    TERRAFORM_ERROR_TEMPLATES.find((template) =>
      template.keywords.some((keyword) => normalizedMessage.includes(keyword))
    ) ?? UNKNOWN_TERRAFORM_ERROR_TEMPLATE
  );
}

function createTerraformSafeFix(rawMessage: string): AiTerraformSafeFix {
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes("terraform.trailing_comma")) {
    return {
      applicable: true,
      code: "terraform.trailing_comma",
      label: "Trailing comma 제거",
      description: "Terraform attribute 줄 끝의 불필요한 comma를 제거합니다."
    };
  }

  if (normalizedMessage.includes("terraform.quoted_reference")) {
    return {
      applicable: true,
      code: "terraform.quoted_reference",
      label: "Reference quote 제거",
      description: "Terraform reference를 문자열이 아니라 expression으로 해석되게 quote를 제거합니다."
    };
  }

  const diagnosticCode = rawMessage.match(/terraform\.[a-z0-9_.-]+/i)?.[0] ?? "terraform.unknown";

  return {
    applicable: false,
    code: diagnosticCode,
    label: "수동 수정 필요",
    description: "이 Terraform 진단은 의미 판단이 필요해 자동 적용하지 않습니다."
  };
}

function createWellArchitectedGuidance(
  explanation: TerraformErrorExplanationTemplate,
  safeFix: AiTerraformSafeFix
): AiWellArchitectedGuidance[] {
  const fixRecommendation = safeFix.applicable
    ? `${safeFix.label}를 사용자 승인 후 적용하고 재검증합니다.`
    : "AI 가이드를 참고해 사용자가 Terraform 코드를 직접 수정한 뒤 재검증합니다.";

  return [
    {
      pillar: "operational_excellence",
      title: "운영 우수성",
      observation: "검증 오류를 Issues 탭에서 추적하면 수정 전까지 작업 상태를 잃지 않습니다.",
      recommendation: fixRecommendation
    },
    {
      pillar: "security",
      title: "보안",
      observation: explanation.category === "credential" || explanation.category === "permission"
        ? "권한 또는 인증 오류는 민감 정보 노출 없이 원인만 확인해야 합니다."
        : "Terraform 원문과 오류 메시지에는 credential 값을 포함하지 않아야 합니다.",
      recommendation: "오류 메시지를 공유하거나 AI에 보낼 때 secret 원문을 마스킹한 상태를 유지합니다."
    },
    {
      pillar: "reliability",
      title: "신뢰성",
      observation: "오류가 해결되기 전까지 진단을 유지해야 배포 전 검증 흐름이 흔들리지 않습니다.",
      recommendation: "수정 후 Terraform validate 또는 SketchCatch 검증을 다시 실행해 같은 진단이 사라졌는지 확인합니다."
    },
    {
      pillar: "performance_efficiency",
      title: "성능 효율성",
      observation: "문법/참조 오류는 실제 plan/apply 전에 빠르게 차단할 수 있는 저비용 문제입니다.",
      recommendation: "로컬 정적 검증 단계에서 먼저 해결하고 무거운 Terraform 실행은 통과 후 진행합니다."
    },
    {
      pillar: "cost_optimization",
      title: "비용 최적화",
      observation: "검증 오류를 plan/apply 전에 해결하면 실패한 배포 재시도와 불필요한 실행 시간을 줄입니다.",
      recommendation: "자동 적용 가능한 오류만 즉시 수정하고, 의미 판단이 필요한 변경은 수동 검토로 비용 리스크를 낮춥니다."
    },
    {
      pillar: "sustainability",
      title: "지속 가능성",
      observation: "불필요한 재실행과 실패한 배포 시도를 줄이면 컴퓨팅 낭비를 줄일 수 있습니다.",
      recommendation: "작은 deterministic fix부터 적용하고 재검증 결과로 다음 행동을 결정합니다."
    }
  ];
}

function createConsensusRecommendation(
  explanation: TerraformErrorExplanationTemplate,
  safeFix: AiTerraformSafeFix
): string {
  if (safeFix.applicable) {
    return `Terraform 진단 ${safeFix.code}는 안전 수정 대상입니다. ${safeFix.label} 적용 후 재검증하고, 통과하면 저장/다이어그램 동기화를 진행하세요.`;
  }

  return `Terraform 오류는 ${explanation.category} 범주로 보입니다. 자동 수정하지 말고 원본 위치를 확인해 수동으로 고친 뒤 재검증하세요.`;
}
