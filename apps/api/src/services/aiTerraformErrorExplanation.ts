import type {
  AiTerraformErrorCategory,
  AiTerraformDiagnosticExplanation,
  AiTerraformErrorExplanationResult,
  AiTerraformSafeFix,
  AiTerraformStage,
  RiskLevel,
  TerraformDiagnostic
} from "@sketchcatch/types";

export type TerraformErrorExplanationInput = {
  readonly stage: AiTerraformStage;
  readonly rawMessage: string;
  readonly diagnostic?: TerraformDiagnostic | undefined;
  readonly relatedResourceId?: string | undefined;
  readonly terraformCodeContext?: string | undefined;
};

// Terraform 원본 오류를 사용자가 이해하기 쉬운 원인과 다음 행동으로 바꿉니다.
export function explainTerraformError(
  input: TerraformErrorExplanationInput
): AiTerraformErrorExplanationResult {
  const explanation = classifyTerraformError(input.rawMessage);
  const safeFix = createTerraformSafeFix(input.rawMessage);
  const diagnosticExplanation = createDiagnosticExplanation({
    diagnostic: input.diagnostic,
    explanation,
    rawMessage: input.rawMessage,
    safeFix,
    terraformCodeContext: input.terraformCodeContext
  });

  return {
    stage: input.stage,
    category: explanation.category,
    severity: explanation.severity,
    rawMessage: input.rawMessage,
    relatedResourceId: input.relatedResourceId,
    summary: explanation.summary,
    likelyCause: explanation.likelyCause,
    nextActions: [...explanation.nextActions],
    wellArchitectedGuidance: [],
    consensusRecommendation: createConsensusRecommendation(explanation, safeFix),
    safeFix,
    diagnosticExplanation
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
    keywords: ["terraform.unexpected_token", "closed block", "닫힌 block", "unexpected token"],
    summary: "닫힌 block 뒤에 Terraform 코드가 이어져 문법 오류가 발생했습니다.",
    likelyCause: "리소스 block을 닫은 뒤 남은 attribute나 중첩 block이 바깥에 붙어 있을 가능성이 큽니다.",
    nextActions: [
      "오류가 표시된 파일과 줄 번호를 기준으로 닫는 중괄호 위치를 확인하세요.",
      "block 밖에 남은 attribute가 있다면 올바른 resource, module, provider block 안으로 옮기세요.",
      "수정 후 Terraform 재검증을 실행해 같은 진단이 사라졌는지 확인하세요."
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
  summary: "Terraform 진단을 바탕으로 수정 위치를 먼저 확인해야 합니다.",
  likelyCause: "오류 메시지가 알려준 파일과 줄에서 block 경계, 문법, 참조 형식을 확인해야 합니다.",
  nextActions: ["원본 오류 메시지를 확인하고 권한, region, quota, 문법 문제를 차례대로 점검하세요."]
};

type DiagnosticExplanationInput = {
  readonly diagnostic?: TerraformDiagnostic | undefined;
  readonly explanation: TerraformErrorExplanationTemplate;
  readonly rawMessage: string;
  readonly safeFix: AiTerraformSafeFix;
  readonly terraformCodeContext?: string | undefined;
};

function createDiagnosticExplanation({
  diagnostic,
  explanation,
  rawMessage,
  safeFix,
  terraformCodeContext
}: DiagnosticExplanationInput): AiTerraformDiagnosticExplanation {
  const errorType = diagnostic?.code ?? safeFix.code ?? extractDiagnosticCode(rawMessage);
  const line = diagnostic?.line;
  const sourceFileName = diagnostic?.sourceFileName ?? "main.tf";
  const codeFrame =
    terraformCodeContext && line !== undefined ? createCodeFrame(terraformCodeContext, line) : [];
  const ruleSuggestion =
    terraformCodeContext && line !== undefined
      ? createRuleCodeSuggestion(terraformCodeContext, line, errorType)
      : undefined;
  const plainExplanation = createPlainDiagnosticExplanation(errorType, explanation.summary);
  const fixExplanation = createFixExplanation(errorType, safeFix);

  return {
    errorType,
    plainExplanation,
    fixExplanation,
    codeFrame,
    canApply: ruleSuggestion !== undefined,
    ...(ruleSuggestion === undefined ? {} : { codeSuggestion: ruleSuggestion }),
    ...(line === undefined ? {} : { line }),
    ...(sourceFileName === undefined ? {} : { sourceFileName })
  };
}

function createPlainDiagnosticExplanation(errorType: string, fallback: string): string {
  switch (errorType) {
    case "terraform.trailing_comma":
      return "Terraform attribute assignment line ends with a comma, but HCL attributes do not use trailing commas.";
    case "terraform.quoted_reference":
      return "A Terraform reference is wrapped in quotes, so Terraform reads it as plain text instead of an expression.";
    case "terraform.unexpected_token":
      return "Terraform code appears after a block has already been closed, so the parser sees unexpected code outside the expected structure.";
    case "terraform.attribute_empty":
      return "An attribute assignment is missing the value after the equals sign.";
    case "terraform.attribute_syntax":
      return "A resource body line does not match the expected attribute = value or nested_block { syntax.";
    case "terraform.nested_block_assignment":
      return "This field should be written as a nested block, not as a top-level attribute assignment.";
    case "terraform.block_header":
      return "The Terraform block header does not match resource/data \"type\" \"name\" { syntax.";
    case "terraform.unbalanced":
      return "A quote, brace, bracket, or parenthesis is not balanced.";
    case "terraform.undefined_reference":
      return "The code references a local Terraform resource that is not declared in the current Terraform files.";
    case "terraform.duplicate_address":
      return "Two Terraform blocks use the same address, so Terraform cannot distinguish them.";
    default:
      return fallback;
  }
}

function createFixExplanation(errorType: string, safeFix: AiTerraformSafeFix): string {
  switch (errorType) {
    case "terraform.trailing_comma":
      return "Remove the comma at the end of the highlighted attribute line, then run Terraform validation again.";
    case "terraform.quoted_reference":
      return "Remove the surrounding quotes so the reference is evaluated as a Terraform expression.";
    case "terraform.unexpected_token":
      return "Move the extra attribute or block back inside the correct resource block, or remove it if it was pasted after the closing brace.";
    case "terraform.attribute_empty":
      return "Add a value after the equals sign, or remove the incomplete attribute line.";
    case "terraform.attribute_syntax":
      return "Rewrite the line as attribute = value, or use nested_block { ... } when the provider expects a block.";
    case "terraform.nested_block_assignment":
      return "Convert the assignment into the nested block shape expected by the resource.";
    case "terraform.block_header":
      return "Rewrite the header as resource/data \"terraform_type\" \"local_name\" {.";
    case "terraform.unbalanced":
      return "Close the missing quote or matching delimiter near the highlighted line.";
    case "terraform.undefined_reference":
      return "Declare the referenced resource, correct the reference name, or choose an existing Terraform address.";
    case "terraform.duplicate_address":
      return "Rename one of the duplicate Terraform local names so each block address is unique.";
    default:
      return safeFix.applicable
        ? safeFix.description
        : "Review the highlighted Terraform code and update it manually before validating again.";
  }
}

function createCodeFrame(terraformCode: string, lineNumber: number): AiTerraformDiagnosticExplanation["codeFrame"] {
  const lines = terraformCode.split(/\r?\n/);
  const startLine = Math.max(1, lineNumber - 2);
  const endLine = Math.min(lines.length, lineNumber + 2);

  return Array.from({ length: endLine - startLine + 1 }, (_, offset) => {
    const currentLineNumber = startLine + offset;

    return {
      lineNumber: currentLineNumber,
      text: lines[currentLineNumber - 1] ?? "",
      isErrorLine: currentLineNumber === lineNumber
    };
  });
}

function createRuleCodeSuggestion(
  terraformCode: string,
  lineNumber: number,
  errorType: string
): AiTerraformDiagnosticExplanation["codeSuggestion"] | undefined {
  const currentCode = terraformCode.split(/\r?\n/)[lineNumber - 1];

  if (currentCode === undefined) {
    return undefined;
  }

  if (errorType === "terraform.trailing_comma") {
    const suggestedCode = currentCode.replace(/,\s*$/, "");

    if (suggestedCode !== currentCode) {
      return {
        currentCode,
        suggestedCode,
        rationale: "The highlighted Terraform attribute can be fixed deterministically by removing the trailing comma.",
        source: "rule"
      };
    }
  }

  if (errorType === "terraform.quoted_reference") {
    const suggestedCode = currentCode.replace(
      /(=\s*)"((?:data\.)?[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)"/,
      "$1$2"
    );

    if (suggestedCode !== currentCode) {
      return {
        currentCode,
        suggestedCode,
        rationale: "The quoted Terraform reference can be fixed deterministically by removing the surrounding quotes.",
        source: "rule"
      };
    }
  }

  return undefined;
}

function extractDiagnosticCode(rawMessage: string): string {
  return rawMessage.match(/terraform\.[a-z0-9_.-]+/i)?.[0] ?? "terraform.unknown";
}

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

function createConsensusRecommendation(
  explanation: TerraformErrorExplanationTemplate,
  safeFix: AiTerraformSafeFix
): string {
  if (safeFix.applicable) {
    return `Terraform 진단 ${safeFix.code}는 안전 수정 대상입니다. ${safeFix.label} 적용 후 재검증하고, 통과하면 저장/다이어그램 동기화를 진행하세요.`;
  }

  return `Terraform 오류는 ${explanation.category} 범주로 보입니다. 자동 수정하지 말고 원본 위치를 확인해 수동으로 고친 뒤 재검증하세요.`;
}
