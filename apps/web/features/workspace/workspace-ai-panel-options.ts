import type { AiTerraformStage } from "@sketchcatch/types";
import type { ChoiceOption } from "./WorkspaceAiPanelPieces";

export const DEFAULT_REQUIREMENT_PROMPT =
  "웹사이트 하나 배포하고 싶어. 업로드한 파일도 저장할 수 있으면 좋겠어.";

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

export const terraformStageOptions: readonly ChoiceOption<AiTerraformStage>[] = [
  { label: "검증", value: "validate" },
  { label: "내보내기", value: "export" },
  { label: "계획", value: "plan" },
  { label: "적용", value: "apply" }
];
