import type {
  AiTerraformErrorCategory,
  AiTerraformErrorExplanationResult,
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

  return {
    stage: input.stage,
    category: explanation.category,
    severity: explanation.severity,
    rawMessage: input.rawMessage,
    relatedResourceId: input.relatedResourceId,
    summary: explanation.summary,
    likelyCause: explanation.likelyCause,
    nextActions: [...explanation.nextActions]
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
