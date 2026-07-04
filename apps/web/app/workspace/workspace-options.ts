import type {
  ArchitectureDraftBudgetLevel,
  ArchitectureDraftScenarioHint,
  ArchitectureDraftSecurityPriority,
  ArchitectureDraftTrafficLevel
} from "@sketchcatch/types";

type ChoiceOption<Value extends string> = {
  readonly label: string;
  readonly value: Value;
};

export const samplePrompt = "DB가 포함된 백엔드 API 서버를 AWS에 배포하고 싶어.";

export const sampleTerraform = `resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t3.micro"
}

resource "aws_security_group_rule" "ssh" {
  type        = "ingress"
  from_port   = 22
  to_port     = 22
  cidr_blocks = ["0.0.0.0/0"]
}

resource "aws_db_instance" "main" {
  instance_class = "db.t3.micro"
}`;

export const sampleDiagramTerraform = `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = {
    Name = "main-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = {
    Name = "public-subnet"
  }
}`;

export const scenarioOptions: readonly ChoiceOption<ArchitectureDraftScenarioHint>[] = [
  { label: "정적 웹사이트", value: "static_site" },
  { label: "API 서버", value: "api_server" },
  { label: "서버+스토리지", value: "server_storage" },
  { label: "DB 포함 백엔드", value: "backend_with_db" },
  { label: "잘 모르겠음", value: "auto" }
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
