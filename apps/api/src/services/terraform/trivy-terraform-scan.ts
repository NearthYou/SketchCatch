import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { CheckFinding, TerraformSyncFileInput } from "@sketchcatch/types";

const execFileAsync = promisify(execFile);
const TRIVY_SCAN_TIMEOUT_MS = 30_000;
const TRIVY_SCAN_MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const TRIVY_IGNORE_FILE_NAME = ".sketchcatch-trivyignore";

// Product policy keeps these AWS ALB and Auto Scaling checks out of the Trivy result.
export const disabledTrivyTerraformRuleIds = [
  "AWS-0047",
  "AWS-0009",
  "AWS-0052",
  "AWS-0053",
  "AWS-0054",
  "AWS-0008",
  "AWS-0122",
  "AWS-0129",
  "AWS-0130"
] as const;

export type TerraformSecurityScannerInput = {
  readonly terraformFiles: readonly TerraformSyncFileInput[];
};

export type TerraformSecurityScanner = (
  input: TerraformSecurityScannerInput
) => Promise<CheckFinding[]>;

export type TrivyTerraformScanOptions = {
  readonly cacheDir?: string | undefined;
  readonly onScanError?: ((error: unknown) => void) | undefined;
  readonly trivyBinaryPath?: string | undefined;
};

type WrittenTerraformFile = {
  readonly originalFileName: string;
  readonly relativePath: string;
};

type TrivyOutput = {
  readonly Results?: readonly TrivyResult[] | undefined;
};

type TrivyResult = {
  readonly Target?: string | undefined;
  readonly Misconfigurations?: readonly TrivyMisconfiguration[] | undefined;
};

type TrivyMisconfiguration = {
  readonly ID?: string | undefined;
  readonly AVDID?: string | undefined;
  readonly Title?: string | undefined;
  readonly Message?: string | undefined;
  readonly Description?: string | undefined;
  readonly Resolution?: string | undefined;
  readonly Severity?: string | undefined;
  readonly Status?: string | undefined;
  readonly CauseMetadata?:
    | {
        readonly FilePath?: string | undefined;
        readonly Resource?: string | undefined;
        readonly StartLine?: number | undefined;
        readonly Code?:
          | {
              readonly Lines?: readonly {
                readonly Number?: number | undefined;
              }[];
            }
          | undefined;
      }
    | undefined;
};

type TrivyFindingText = {
  readonly category?: CheckFinding["category"] | undefined;
  readonly riskFamily?: string | undefined;
  readonly title: string;
  readonly description: string;
  readonly recommendation: string;
};

export function createConfiguredTerraformSecurityScanner(
  options: TrivyTerraformScanOptions = {}
): TerraformSecurityScanner {
  return async (input) => {
    try {
      return await scanTerraformWithTrivy(input, options);
    } catch (error) {
      options.onScanError?.(error);
      return [];
    }
  };
}

export async function scanTerraformWithTrivy(
  input: TerraformSecurityScannerInput,
  options: TrivyTerraformScanOptions = {}
): Promise<CheckFinding[]> {
  const terraformFiles = input.terraformFiles.filter((file) => file.terraformCode.trim().length > 0);

  if (terraformFiles.length === 0) {
    return [];
  }

  const tempDirectory = await mkdtemp(path.join(tmpdir(), "sketchcatch-trivy-"));

  try {
    const writtenFiles = await writeTerraformFiles(tempDirectory, terraformFiles);
    const ignoreFilePath = await writeTrivyIgnoreFile(tempDirectory);
    const trivyOutput = await runTrivyConfigScan(tempDirectory, ignoreFilePath, options);

    return parseTrivyTerraformFindings(trivyOutput, {
      tempDirectory,
      writtenFiles
    });
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

export function parseTrivyTerraformFindings(
  trivyJson: string,
  context: {
    readonly tempDirectory?: string | undefined;
    readonly writtenFiles?: readonly WrittenTerraformFile[] | undefined;
  } = {}
): CheckFinding[] {
  const output = JSON.parse(trivyJson) as TrivyOutput;
  const findings: CheckFinding[] = [];

  for (const result of output.Results ?? []) {
    for (const misconfiguration of result.Misconfigurations ?? []) {
      if (misconfiguration.Status?.toUpperCase() === "PASS") {
        continue;
      }

      findings.push(createFindingFromTrivyMisconfiguration(result, misconfiguration, context));
    }
  }

  return groupTrivyFindings(findings);
}

async function writeTerraformFiles(
  tempDirectory: string,
  terraformFiles: readonly TerraformSyncFileInput[]
): Promise<WrittenTerraformFile[]> {
  const usedRelativePaths = new Set<string>();
  const writtenFiles: WrittenTerraformFile[] = [];

  for (const [index, file] of terraformFiles.entries()) {
    const relativePath = toUniqueRelativePath(
      toSafeRelativePath(file.fileName, index),
      usedRelativePaths,
      index
    );
    const absolutePath = path.join(tempDirectory, relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.terraformCode, "utf8");
    writtenFiles.push({
      originalFileName: file.fileName,
      relativePath: normalizeRelativePath(relativePath)
    });
  }

  return writtenFiles;
}

async function writeTrivyIgnoreFile(tempDirectory: string): Promise<string> {
  const ignoreFilePath = path.join(tempDirectory, TRIVY_IGNORE_FILE_NAME);
  await writeFile(ignoreFilePath, createTrivyIgnoreFileContents(), "utf8");
  return ignoreFilePath;
}

export function createTrivyIgnoreFileContents(): string {
  return [
    ...disabledTrivyTerraformRuleIds,
    ...disabledTrivyTerraformRuleIds.map((ruleId) => `AVD-${ruleId}`)
  ].join("\n");
}

async function runTrivyConfigScan(
  tempDirectory: string,
  ignoreFilePath: string,
  options: TrivyTerraformScanOptions
): Promise<string> {
  const cacheDir = options.cacheDir ?? process.env.TRIVY_CACHE_DIR;
  const trivyArgs = [
    ...(cacheDir && cacheDir.trim().length > 0 ? ["--cache-dir", cacheDir] : []),
    "config",
    "--quiet",
    "--format",
    "json",
    "--exit-code",
    "0",
    "--misconfig-scanners",
    "terraform",
    "--ignorefile",
    ignoreFilePath,
    "--severity",
    "MEDIUM,HIGH,CRITICAL",
    "."
  ];
  const { stdout } = await execFileAsync(
    options.trivyBinaryPath ?? process.env.TRIVY_BIN ?? "trivy",
    trivyArgs,
    {
      cwd: tempDirectory,
      encoding: "utf8",
      maxBuffer: TRIVY_SCAN_MAX_BUFFER_BYTES,
      timeout: TRIVY_SCAN_TIMEOUT_MS,
      windowsHide: true
    }
  );

  return stdout;
}

function createFindingFromTrivyMisconfiguration(
  result: TrivyResult,
  misconfiguration: TrivyMisconfiguration,
  context: {
    readonly tempDirectory?: string | undefined;
    readonly writtenFiles?: readonly WrittenTerraformFile[] | undefined;
  }
): CheckFinding {
  const ruleId = misconfiguration.ID ?? misconfiguration.AVDID ?? "TRIVY";
  const targetPath = getTargetPath(result, misconfiguration, context.tempDirectory);
  const originalFileName = getOriginalFileName(targetPath, context.writtenFiles);
  const line = getMisconfigurationLine(misconfiguration);
  const resourceAddress = misconfiguration.CauseMetadata?.Resource;
  const text = createKoreanTrivyFindingText(ruleId, misconfiguration);

  return {
    id: sanitizeFindingId(
      `trivy:${ruleId}:${originalFileName ?? targetPath ?? "terraform"}:${resourceAddress ?? "resource"}:${line ?? "line"}`
    ),
    category: text.category ?? inferTrivyFindingCategory(misconfiguration),
    severity: toRiskSeverity(misconfiguration.Severity),
    ...(resourceAddress ? { resourceId: resourceAddress } : {}),
    ...(originalFileName && line
      ? {
          sourceLocation: {
            fileName: originalFileName,
            line,
            ...(resourceAddress ? { resourceAddress } : {})
          }
        }
      : {}),
    ...(text.riskFamily
      ? {
          riskFamily: text.riskFamily,
          trivyRuleIds: [ruleId]
        }
      : {}),
    title: text.title,
    description: text.description,
    recommendation: text.recommendation
  };
}

function createKoreanTrivyFindingText(
  ruleId: string,
  misconfiguration: TrivyMisconfiguration
): TrivyFindingText {
  const haystack = createTrivyMisconfigurationHaystack(ruleId, misconfiguration);
  const normalizedRuleId = ruleId.toUpperCase().replace(/^AVD-/, "");

  if (["AWS-0086", "AWS-0087", "AWS-0091", "AWS-0093"].includes(normalizedRuleId)) {
    return {
      category: "security",
      riskFamily: "S3_PUBLIC_ACCESS",
      title: "S3 Block Public Access의 모든 보호 설정을 활성화해야 합니다.",
      description:
        "S3 Block Public Access의 일부 보호 설정이 빠지면 공개 ACL이나 공개 bucket policy가 적용될 수 있습니다.",
      recommendation:
        "`aws_s3_bucket_public_access_block`에서 `block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets`를 모두 `true`로 설정하세요."
    };
  }

  if (normalizedRuleId === "AWS-0090") {
    return {
      category: "availability",
      riskFamily: "S3_VERSIONING",
      title: "S3 버킷 버전 관리를 활성화해야 합니다.",
      description:
        "버전 관리가 없으면 객체를 실수로 덮어쓰거나 삭제했을 때 이전 데이터를 복구하기 어렵습니다.",
      recommendation:
        "`aws_s3_bucket_versioning` 리소스에서 `versioning_configuration.status = \"Enabled\"`를 설정하세요."
    };
  }

  if (normalizedRuleId === "AWS-0132") {
    return {
      category: "security",
      riskFamily: "S3_KMS_ENCRYPTION",
      title: "S3 버킷 암호화에 고객 관리형 KMS 키를 사용해야 합니다.",
      description:
        "고객 관리형 KMS 키를 사용하면 키 정책, 접근 제어, 감사와 키 수명주기를 직접 관리할 수 있습니다.",
      recommendation:
        "`aws_s3_bucket_server_side_encryption_configuration`에서 SSE-KMS와 고객 관리형 `kms_master_key_id`를 설정하세요."
    };
  }

  if (hasAny(haystack, ["metadata service", "imds", "http_tokens", "session token"])) {
    return {
      title: "EC2 인스턴스는 인스턴스 메타데이터 서비스(IMDS) v2 세션 토큰을 요구해야 합니다.",
      description:
        "IMDS v1은 세션 토큰 없이 인스턴스 메타데이터에 접근할 수 있어 SSRF나 내부 네트워크 접근 경로가 생겼을 때 자격 증명 노출 위험이 커집니다.",
      recommendation:
        '`aws_instance` 리소스의 `metadata_options`에서 `http_tokens = "required"`를 설정하세요.'
    };
  }

  if (hasAny(haystack, ["backup retention", "backup_retention", "backup_retention_period"])) {
    return {
      title: "RDS 백업 보존 기간은 기본 1일보다 길게 설정해야 합니다.",
      description:
        "백업 보존 기간이 너무 짧으면 장애, 실수, 침해 이후 복구할 수 있는 시점이 부족해집니다.",
      recommendation:
        "`backup_retention_period`를 2일 이상 또는 운영 복구 정책에 맞는 기간으로 설정하세요."
    };
  }

  if (hasAny(haystack, ["rds", "db instance"]) && hasAny(haystack, ["encrypt", "encryption", "storage_encrypted"])) {
    return {
      title: "RDS DB 인스턴스 암호화를 활성화해야 합니다.",
      description:
        "저장 데이터가 암호화되지 않으면 스냅샷, 백업, 스토리지 계층에서 데이터 보호 수준이 낮아집니다.",
      recommendation:
        "`storage_encrypted = true`를 설정하고 필요하면 `kms_key_id`로 관리형 KMS 키를 지정하세요."
    };
  }

  if (hasAny(haystack, ["publicly_accessible", "publiclyaccessible", "public network", "public database"])) {
    return {
      title: "RDS는 퍼블릭 네트워크에서 접근 가능하면 안 됩니다.",
      description:
        "퍼블릭 DB 엔드포인트는 인증 정보 대입 공격, 무차별 대입 공격, 의도치 않은 데이터 노출의 공격면을 넓힙니다.",
      recommendation:
        "`publicly_accessible = false`를 설정하고 DB subnet group이 private subnet을 사용하도록 구성하세요."
    };
  }

  if (hasAny(haystack, ["ssh", "rdp", "0.0.0.0/0", "::/0", "unrestricted ingress"])) {
    return {
      title: "보안 그룹은 SSH/RDP를 전체 인터넷에 열면 안 됩니다.",
      description:
        "SSH 또는 RDP가 0.0.0.0/0이나 ::/0에 열려 있으면 외부 누구나 접속 시도를 할 수 있어 침해 가능성이 커집니다.",
      recommendation:
        "관리자 VPN, bastion, Session Manager 또는 신뢰할 수 있는 CIDR에서만 접근하도록 ingress 규칙을 제한하세요."
    };
  }

  if (hasAny(haystack, ["bucket policy", "public acl", "public access"])) {
    return {
      title: "S3 버킷은 공개 접근을 허용하면 안 됩니다.",
      description:
        "공개 ACL이나 과도한 bucket policy는 업로드 파일, Terraform 산출물, 사용자 데이터를 익명 사용자에게 노출할 수 있습니다.",
      recommendation:
        "공개 ACL과 Principal \"*\" 허용 정책을 제거하고 S3 Block Public Access를 활성화하세요."
    };
  }

  if (hasAny(haystack, ["iam", "wildcard", "privilege", "permission"])) {
    return {
      title: "IAM 권한 범위가 과도하게 넓을 수 있습니다.",
      description:
        "와일드카드 권한이나 넓은 resource 범위는 역할이 오용되거나 탈취됐을 때 관련 없는 클라우드 리소스까지 변경하게 만들 수 있습니다.",
      recommendation:
        "필요한 action과 resource ARN만 명시하도록 IAM 정책을 최소 권한 원칙에 맞게 줄이세요."
    };
  }

  return {
    title: `Terraform 보안 설정을 배포 전에 검토해야 합니다. (${ruleId})`,
    description:
      "Trivy가 Terraform 구성에서 보안, 안정성, 또는 운영 위험으로 이어질 수 있는 설정을 감지했습니다.",
    recommendation:
      "해당 Terraform 리소스의 설정을 검토하고 Trivy 권장 사항에 맞게 수정한 뒤 배포 전 검사를 다시 실행하세요."
  };
}

function groupTrivyFindings(findings: readonly CheckFinding[]): CheckFinding[] {
  const grouped = new Map<string, CheckFinding>();

  for (const finding of findings) {
    if (!finding.riskFamily) {
      grouped.set(finding.id, finding);
      continue;
    }

    const resourceAddress =
      finding.sourceLocation?.resourceAddress ?? finding.resourceId ?? "global";
    const key = `${resourceAddress}|${finding.riskFamily}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...finding,
        id: sanitizeFindingId(
          `trivy:${finding.riskFamily}:${finding.sourceLocation?.fileName ?? "terraform"}:${resourceAddress}:${finding.sourceLocation?.line ?? "line"}`
        ),
        trivyRuleIds: [...(finding.trivyRuleIds ?? [])]
      });
      continue;
    }

    grouped.set(key, {
      ...existing,
      severity: maxRiskSeverity(existing.severity, finding.severity),
      trivyRuleIds: Array.from(
        new Set([...(existing.trivyRuleIds ?? []), ...(finding.trivyRuleIds ?? [])])
      )
    });
  }

  return [...grouped.values()];
}

function maxRiskSeverity(
  left: CheckFinding["severity"],
  right: CheckFinding["severity"]
): CheckFinding["severity"] {
  const rank: Record<CheckFinding["severity"], number> = {
    low: 0,
    medium: 1,
    high: 2
  };

  return rank[right] > rank[left] ? right : left;
}

function createTrivyMisconfigurationHaystack(
  ruleId: string,
  misconfiguration: TrivyMisconfiguration
): string {
  return [
    ruleId,
    misconfiguration.ID,
    misconfiguration.AVDID,
    misconfiguration.Title,
    misconfiguration.Message,
    misconfiguration.Description,
    misconfiguration.Resolution,
    misconfiguration.CauseMetadata?.Resource
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLowerCase();
}

function hasAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase()));
}

function getTargetPath(
  result: TrivyResult,
  misconfiguration: TrivyMisconfiguration,
  tempDirectory?: string | undefined
): string | undefined {
  const candidate = misconfiguration.CauseMetadata?.FilePath ?? result.Target;

  if (!candidate || candidate === ".") {
    return undefined;
  }

  const relativePath = path.isAbsolute(candidate) && tempDirectory
    ? path.relative(tempDirectory, candidate)
    : candidate;

  return normalizeRelativePath(relativePath);
}

function getOriginalFileName(
  targetPath: string | undefined,
  writtenFiles: readonly WrittenTerraformFile[] | undefined
): string | undefined {
  if (!targetPath) {
    return writtenFiles?.[0]?.originalFileName;
  }

  const normalizedTarget = normalizeRelativePath(targetPath);

  return (
    writtenFiles?.find((file) => file.relativePath === normalizedTarget)?.originalFileName ??
    normalizedTarget
  );
}

function getMisconfigurationLine(misconfiguration: TrivyMisconfiguration): number | undefined {
  const startLine = misconfiguration.CauseMetadata?.StartLine;

  if (startLine && startLine > 0) {
    return startLine;
  }

  const codeLine = misconfiguration.CauseMetadata?.Code?.Lines?.find(
    (line) => line.Number !== undefined && line.Number > 0
  );

  return codeLine?.Number;
}

function inferTrivyFindingCategory(misconfiguration: TrivyMisconfiguration): CheckFinding["category"] {
  const haystack = [
    misconfiguration.ID,
    misconfiguration.AVDID,
    misconfiguration.Title,
    misconfiguration.Message,
    misconfiguration.Description,
    misconfiguration.CauseMetadata?.Resource
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("iam") || haystack.includes("permission") || haystack.includes("privilege")) {
    return "permission";
  }

  if (
    haystack.includes("security_group") ||
    haystack.includes("security group") ||
    haystack.includes("cidr") ||
    haystack.includes("network") ||
    haystack.includes("ssh") ||
    haystack.includes("rdp")
  ) {
    return "network";
  }

  return "security";
}

function toRiskSeverity(severity: string | undefined): CheckFinding["severity"] {
  switch (severity?.toUpperCase()) {
    case "CRITICAL":
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    default:
      return "low";
  }
}

function toSafeRelativePath(fileName: string, index: number): string {
  const normalizedFileName = fileName
    .replace(/\\/g, "/")
    .replace(/^[a-zA-Z]:/, "")
    .replace(/^\/+/, "");
  const safeParts = normalizedFileName
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..");

  if (safeParts.length === 0) {
    return `main-${index}.tf`;
  }

  return safeParts.join(path.sep);
}

function toUniqueRelativePath(
  relativePath: string,
  usedRelativePaths: Set<string>,
  index: number
): string {
  const normalizedPath = normalizeRelativePath(relativePath);

  if (!usedRelativePaths.has(normalizedPath)) {
    usedRelativePaths.add(normalizedPath);
    return relativePath;
  }

  const extension = path.extname(relativePath);
  const nameWithoutExtension = relativePath.slice(0, relativePath.length - extension.length);
  const uniqueRelativePath = `${nameWithoutExtension}-${index}${extension || ".tf"}`;

  usedRelativePaths.add(normalizeRelativePath(uniqueRelativePath));
  return uniqueRelativePath;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function sanitizeFindingId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 180) || "trivy-terraform-finding"
  );
}
