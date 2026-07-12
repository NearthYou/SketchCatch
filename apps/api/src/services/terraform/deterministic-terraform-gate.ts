import type { CheckFinding, TerraformSyncFileInput } from "@sketchcatch/types";

type DeterministicRule = {
  readonly category: CheckFinding["category"];
  readonly code: string;
  readonly matches: (code: string) => boolean;
  readonly recommendation: string;
  readonly resourceTypePattern: RegExp;
  readonly riskFamily: string;
  readonly severity: CheckFinding["severity"];
  readonly title: string;
  readonly description: string;
};

const deterministicRules: readonly DeterministicRule[] = [
  {
    code: "PUBLIC_S3",
    riskFamily: "S3_PUBLIC_ACCESS",
    category: "security",
    severity: "high",
    resourceTypePattern: /aws_s3_(?:bucket|bucket_acl|bucket_policy|bucket_public_access_block)/,
    matches: (code) =>
      /\bacl\s*=\s*"public-(?:read|read-write)"/i.test(code) ||
      /\b(?:block_public_acls|block_public_policy|ignore_public_acls|restrict_public_buckets)\s*=\s*false\b/i.test(code) ||
      /"Principal"\s*:\s*(?:"\*"|\{[^}]*"AWS"\s*:\s*"\*")/is.test(code),
    title: "S3 버킷이 공개 접근을 허용할 수 있습니다.",
    description: "공개 ACL, bucket policy 또는 비활성화된 Block Public Access 설정이 감지되었습니다.",
    recommendation: "공개 설정을 제거하고 S3 Block Public Access 네 항목을 모두 true로 설정하세요."
  },
  {
    code: "PUBLIC_SSH",
    riskFamily: "PUBLIC_SSH",
    category: "network",
    severity: "high",
    resourceTypePattern: /aws_(?:security_group(?:_rule)?|vpc_security_group_ingress_rule)/,
    matches: (code) =>
      /(?:from_port|port)\s*=\s*22\b/i.test(code) &&
      /(?:0\.0\.0\.0\/0|::\/0)/.test(code),
    title: "SSH가 모든 인터넷 주소에 공개되어 있습니다.",
    description: "TCP 22 포트가 0.0.0.0/0 또는 ::/0에 허용되어 있습니다.",
    recommendation: "SSH ingress CIDR를 신뢰할 수 있는 관리망으로 제한하세요."
  },
  {
    code: "PUBLIC_RDS",
    riskFamily: "PUBLIC_RDS",
    category: "network",
    severity: "high",
    resourceTypePattern: /aws_db_instance/,
    matches: (code) =>
      /resource\s+"aws_db_instance"/i.test(code) &&
      /\bpublicly_accessible\s*=\s*true\b/i.test(code),
    title: "RDS 인스턴스가 공개 접근을 허용합니다.",
    description: "aws_db_instance의 publicly_accessible이 true로 설정되어 있습니다.",
    recommendation: "publicly_accessible을 false로 설정하고 private subnet에서만 접근하게 하세요."
  },
  {
    code: "IAM_WILDCARD",
    riskFamily: "IAM_WILDCARD",
    category: "permission",
    severity: "high",
    resourceTypePattern: /aws_iam_(?:policy|role_policy)/,
    matches: (code) =>
      /resource\s+"aws_iam_(?:policy|role_policy)"/i.test(code) &&
      /(?:"Action"\s*:|\bAction\s*=)\s*(?:"\*"|\[\s*"\*"\s*\])/is.test(code),
    title: "IAM 정책이 모든 작업을 허용합니다.",
    description: "IAM policy의 Action에 wildcard가 사용되었습니다.",
    recommendation: "필요한 AWS 작업만 명시해 최소 권한 정책으로 제한하세요."
  }
];

export function scanTerraformWithDeterministicGate(
  terraformFiles: readonly TerraformSyncFileInput[]
): CheckFinding[] {
  return terraformFiles.flatMap((file) => {
    const resourceBlocks = extractResourceBlocks(file.terraformCode);
    return deterministicRules.flatMap((rule) =>
      resourceBlocks.flatMap((resourceBlock) =>
        createFinding(file, resourceBlock, rule)
      )
    );
  });
}

function createFinding(
  file: TerraformSyncFileInput,
  resourceBlock: TerraformResourceBlock,
  rule: DeterministicRule
): CheckFinding[] {
  if (
    !rule.resourceTypePattern.test(resourceBlock.resourceType) ||
    !rule.matches(resourceBlock.code)
  ) {
    return [];
  }

  const resourceAddress = `${resourceBlock.resourceType}.${resourceBlock.resourceName}`;
  const line = file.terraformCode.slice(0, resourceBlock.startIndex).split("\n").length;

  return [
    {
      id: `deterministic:${rule.code.toLowerCase()}:${file.fileName}:${resourceAddress ?? "terraform"}`,
      category: rule.category,
      severity: rule.severity,
      resourceId: resourceAddress,
      sourceLocation: {
        fileName: file.fileName,
        line,
        resourceAddress
      },
      riskFamily: rule.riskFamily,
      title: rule.title,
      description: rule.description,
      recommendation: rule.recommendation
    }
  ];
}

type TerraformResourceBlock = {
  readonly code: string;
  readonly resourceName: string;
  readonly resourceType: string;
  readonly startIndex: number;
};

function extractResourceBlocks(code: string): TerraformResourceBlock[] {
  const blocks: TerraformResourceBlock[] = [];
  const resourceHeader = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = resourceHeader.exec(code)) !== null) {
    const resourceType = match[1];
    const resourceName = match[2];
    if (!resourceType || !resourceName) continue;

    const openingBraceIndex = resourceHeader.lastIndex - 1;
    const closingBraceIndex = findClosingBrace(code, openingBraceIndex);
    if (closingBraceIndex === undefined) continue;

    blocks.push({
      code: code.slice(match.index, closingBraceIndex + 1),
      resourceName,
      resourceType,
      startIndex: match.index
    });
    resourceHeader.lastIndex = closingBraceIndex + 1;
  }

  return blocks;
}

function findClosingBrace(code: string, openingBraceIndex: number): number | undefined {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = openingBraceIndex; index < code.length; index += 1) {
    const character = code[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return index;
  }

  return undefined;
}
