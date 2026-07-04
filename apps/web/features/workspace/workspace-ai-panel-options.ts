import type {
  ArchitectureDraftBudgetLevel,
  ArchitectureDraftScenarioHint,
  ArchitectureDraftSecurityPriority,
  ArchitectureDraftTrafficLevel,
  AiTerraformStage
} from "@sketchcatch/types";
import type { ChoiceOption } from "./WorkspaceAiPanelPieces";

export const DEFAULT_REQUIREMENT_PROMPT =
  "웹사이트 하나 배포하고 싶어. 업로드한 파일도 저장할 수 있으면 좋겠어.";

export const promptGuideExamples = [
  "웹사이트 하나 배포하고 싶어",
  "파일 업로드 페이지가 필요해",
  "로그인 있는 작은 웹서비스가 필요해"
] as const;

export const DEFAULT_TERRAFORM_PREVIEW_CODE = `resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t3.micro"
}

resource "aws_security_group_rule" "ssh" {
  type        = "ingress"
  from_port   = 22
  to_port     = 22
  cidr_blocks = ["0.0.0.0/0"]
}`;

export const DEFAULT_TERRAFORM_ERROR_MESSAGE = "Error: Missing required argument on generated variables.tf";

export const scenarioOptions: readonly ChoiceOption<ArchitectureDraftScenarioHint>[] = [
  { label: "자연어 기준으로 자동 판단", value: "auto" },
  { label: "API 서버", value: "api_server" },
  { label: "백엔드와 DB", value: "backend_with_db" },
  { label: "서버와 스토리지", value: "server_storage" },
  { label: "Lambda 함수", value: "serverless_function" },
  { label: "정적 웹사이트", value: "static_site" }
];

export const budgetOptions: readonly ChoiceOption<ArchitectureDraftBudgetLevel>[] = [
  { label: "저렴하게 시작", value: "low" },
  { label: "기능 여유 우선", value: "normal" }
];

export const trafficOptions: readonly ChoiceOption<ArchitectureDraftTrafficLevel>[] = [
  { label: "처음엔 적은 방문자", value: "small" },
  { label: "방문자 증가 대비", value: "normal" }
];

export const securityOptions: readonly ChoiceOption<ArchitectureDraftSecurityPriority>[] = [
  { label: "공개 자료 중심", value: "basic" },
  { label: "로그인/개인정보 보호 우선", value: "high" }
];

export const terraformStageOptions: readonly ChoiceOption<AiTerraformStage>[] = [
  { label: "validate", value: "validate" },
  { label: "export", value: "export" },
  { label: "plan", value: "plan" },
  { label: "apply", value: "apply" }
];
