import type {
  AiTerraformDetectedResource,
  AiTerraformPreviewExplanationResult,
  CheckFinding
} from "@sketchcatch/types";

// Terraform 코드 조각을 읽고 어떤 Resource와 위험 신호가 있는지 설명합니다.
export function explainTerraformPreview(terraformCode: string): AiTerraformPreviewExplanationResult {
  const normalizedCode = terraformCode.toLowerCase();
  const detectedResources = detectTerraformResources(normalizedCode);
  const findings = createTerraformPreviewFindings(normalizedCode);

  return {
    summary: `IaC Preview에서 ${detectedResources.length}개의 Terraform Resource를 감지했습니다.`,
    detectedResources,
    findings,
    checklist: [
      {
        id: "terraform-review-check",
        label: "IaC Preview가 만드는 Resource와 위험 항목 확인",
        status: findings.length > 0 ? "warning" : "pass",
        relatedFindingIds: findings.map((finding) => finding.id)
      }
    ]
  };
}

// Terraform resource 블록 이름을 기준으로 현재 코드가 만들 대상을 감지합니다.
function detectTerraformResources(normalizedCode: string): AiTerraformDetectedResource[] {
  const resources: AiTerraformDetectedResource[] = [];

  if (normalizedCode.includes('resource "aws_instance"')) {
    resources.push({
      terraformType: "aws_instance",
      label: "EC2 Instance",
      explanation: "EC2 서버 Resource를 생성합니다."
    });
  }

  if (normalizedCode.includes('resource "aws_db_instance"')) {
    resources.push({
      terraformType: "aws_db_instance",
      label: "RDS Database",
      explanation: "RDS 데이터베이스 Resource를 생성합니다."
    });
  }

  if (normalizedCode.includes('resource "aws_s3_bucket"')) {
    resources.push({
      terraformType: "aws_s3_bucket",
      label: "S3 Bucket",
      explanation: "파일이나 정적 웹 자산을 담는 S3 버킷을 생성합니다."
    });
  }

  if (normalizedCode.includes('resource "aws_security_group_rule"')) {
    resources.push({
      terraformType: "aws_security_group_rule",
      label: "Security Group Rule",
      explanation: "Security Group의 inbound 또는 outbound 규칙을 생성합니다."
    });
  }

  return resources;
}

// Terraform 코드에서 보안/비용 경고를 모아 finding 목록으로 만듭니다.
function createTerraformPreviewFindings(normalizedCode: string): CheckFinding[] {
  return [
    ...createOpenSshFindings(normalizedCode),
    ...createDatabaseCostFindings(normalizedCode)
  ];
}

// Terraform 코드에 "SSH 22번 포트 전체 공개" 조합이 있으면 보안 finding을 만듭니다.
function createOpenSshFindings(normalizedCode: string): CheckFinding[] {
  if (
    !normalizedCode.includes("0.0.0.0/0") ||
    !normalizedCode.includes("from_port = 22") ||
    !normalizedCode.includes("to_port = 22")
  ) {
    return [];
  }

  return [
    {
      id: "terraform-security-open-ssh",
      category: "security",
      severity: "high",
      title: "Terraform 코드에서 SSH가 전체 공개되어 있습니다",
      description: "22번 포트가 0.0.0.0/0으로 열려 있어 누구나 SSH 접속을 시도할 수 있습니다.",
      recommendation: "cidr_blocks 값을 본인 IP나 관리용 CIDR로 제한하세요."
    }
  ];
}

// Terraform 코드에 RDS Resource가 있으면 비용 확인 finding을 만듭니다.
function createDatabaseCostFindings(normalizedCode: string): CheckFinding[] {
  if (!normalizedCode.includes('resource "aws_db_instance"')) {
    return [];
  }

  return [
    {
      id: "terraform-cost-rds",
      category: "cost",
      severity: "medium",
      title: "Terraform 코드가 RDS 비용을 만들 수 있습니다",
      description: "RDS는 실행 시간과 스토리지에 따라 비용이 발생합니다.",
      recommendation: "작은 instance_class와 짧은 Practice Session 기준으로 비용을 확인하세요."
    }
  ];
}
