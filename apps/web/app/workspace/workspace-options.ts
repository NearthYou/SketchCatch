export const samplePrompt =
  "로그인이 있는 웹사이트를 배포하고 싶어. 사용자가 이미지를 업로드하고, 처음에는 저렴하게 시작하되 개인정보는 보호해줘.";

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
