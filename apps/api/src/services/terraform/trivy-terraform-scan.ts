import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { CheckFinding, TerraformSyncFileInput } from "@sketchcatch/types";
import type { RuntimeCache, RuntimeCacheJsonValue } from "../../runtime-cache/index.js";

const execFileAsync = promisify(execFile);
const TRIVY_SCAN_TIMEOUT_MS = 30_000;
const TRIVY_SCAN_MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const TRIVY_IGNORE_FILE_NAME = ".sketchcatch-trivyignore";
const DEFAULT_TRIVY_RESULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TRIVY_RESULT_CACHE_MAX_ENTRIES = 100;
const TRIVY_PROCESS_CACHE_IDENTITY = randomUUID();
const detectedTrivyVersions = new Map<string, string>();

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
  readonly artifactSha256?: string | undefined;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
};

export type TerraformSecurityScanner = (
  input: TerraformSecurityScannerInput
) => Promise<CheckFinding[]>;

export type CreateCachedTerraformSecurityScannerOptions = {
  readonly scan: TerraformSecurityScanner;
  readonly cacheKeySalt?: string | (() => string) | undefined;
  readonly cacheTtlMs?: number | undefined;
  readonly maxCachedResults?: number | undefined;
  readonly now?: (() => number) | undefined;
  readonly runtimeCache?: RuntimeCache | undefined;
};

type CachedTerraformSecurityFindings = {
  readonly expiresAt: number;
  readonly findings: CheckFinding[];
};

const TRIVY_WARMUP_TERRAFORM = 'terraform { required_version = ">= 1.0" }\n';

export type TrivyTerraformScanOptions = {
  readonly cacheDir?: string | undefined;
  readonly onScanError?: ((error: unknown) => void) | undefined;
  readonly runtimeCache?: RuntimeCache | undefined;
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
  const cachedScan = createCachedTerraformSecurityScanner({
    scan: (input) => scanTerraformWithTrivy(input, options),
    cacheKeySalt: () => createConfiguredScannerCacheKeySalt(options),
    runtimeCache: options.runtimeCache
  });

  return async (input) => {
    try {
      return await cachedScan(input);
    } catch (error) {
      options.onScanError?.(error);
      return [];
    }
  };
}

export function createCachedTerraformSecurityScanner(
  options: CreateCachedTerraformSecurityScannerOptions
): TerraformSecurityScanner {
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_TRIVY_RESULT_CACHE_TTL_MS;
  const maxCachedResults =
    options.maxCachedResults ?? DEFAULT_TRIVY_RESULT_CACHE_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const cachedResults = new Map<string, CachedTerraformSecurityFindings>();
  const scansInFlight = new Map<string, Promise<CheckFinding[]>>();

  return async (input) => {
    const cacheKeySalt =
      typeof options.cacheKeySalt === "function"
        ? options.cacheKeySalt()
        : options.cacheKeySalt;
    const cacheKey = createTerraformSecurityScanCacheKey(input, cacheKeySalt);
    const cachedResult = cachedResults.get(cacheKey);

    if (cachedResult && cachedResult.expiresAt > now()) {
      cachedResults.delete(cacheKey);
      cachedResults.set(cacheKey, cachedResult);
      return structuredClone(cachedResult.findings);
    }

    cachedResults.delete(cacheKey);
    const existingScan = scansInFlight.get(cacheKey);
    if (existingScan) {
      return structuredClone(await existingScan);
    }

    const scan = loadAndCacheFindings(input, cacheKey);
    scansInFlight.set(cacheKey, scan);
    try {
      return structuredClone(await scan);
    } finally {
      if (scansInFlight.get(cacheKey) === scan) {
        scansInFlight.delete(cacheKey);
      }
    }
  };

  async function loadAndCacheFindings(
    input: TerraformSecurityScannerInput,
    cacheKey: string
  ): Promise<CheckFinding[]> {
    const runtimeCachedFindings = await readRuntimeCachedFindings(
      options.runtimeCache,
      cacheKey
    );

    if (runtimeCachedFindings) {
      cacheFindings(cacheKey, runtimeCachedFindings);
      return runtimeCachedFindings;
    }

    const findings = await options.scan(input);
    cacheFindings(cacheKey, findings);
    await writeRuntimeCachedFindings(options.runtimeCache, cacheKey, findings, cacheTtlMs);
    return findings;
  }

  function cacheFindings(cacheKey: string, findings: readonly CheckFinding[]): void {
    cachedResults.set(cacheKey, {
      expiresAt: now() + cacheTtlMs,
      findings: structuredClone([...findings])
    });

    while (cachedResults.size > maxCachedResults) {
      const oldestCacheKey = cachedResults.keys().next().value as string | undefined;
      if (oldestCacheKey === undefined) break;
      cachedResults.delete(oldestCacheKey);
    }
  }
}

async function readRuntimeCachedFindings(
  runtimeCache: RuntimeCache | undefined,
  cacheKey: string
): Promise<CheckFinding[] | null> {
  if (!runtimeCache) {
    return null;
  }

  try {
    const value = await runtimeCache.get<{ findings?: unknown }>({
      namespace: "trivy-terraform-scan",
      key: cacheKey
    });

    return value && Array.isArray(value.findings)
      ? structuredClone(value.findings as CheckFinding[])
      : null;
  } catch {
    return null;
  }
}

async function writeRuntimeCachedFindings(
  runtimeCache: RuntimeCache | undefined,
  cacheKey: string,
  findings: readonly CheckFinding[],
  ttlMs: number
): Promise<void> {
  if (!runtimeCache) {
    return;
  }

  try {
    const value = JSON.parse(JSON.stringify({ findings })) as RuntimeCacheJsonValue;
    await runtimeCache.set(
      {
        namespace: "trivy-terraform-scan",
        key: cacheKey
      },
      value,
      { ttlMs }
    );
  } catch {
    // Runtime Cache is an optimization; Trivy findings remain the source result.
  }
}

function createTerraformSecurityScanCacheKey(
  input: TerraformSecurityScannerInput,
  cacheKeySalt = ""
): string {
  const hash = createHash("sha256");
  hash.update("sketchcatch-trivy-terraform-scan:v1\0");
  hash.update(cacheKeySalt);

  if (input.artifactSha256) {
    hash.update("\0artifact-sha256\0");
    hash.update(input.artifactSha256);
    return hash.digest("hex");
  }

  const normalizedFiles = [...input.terraformFiles].sort((left, right) =>
    left.fileName.localeCompare(right.fileName)
  );
  for (const file of normalizedFiles) {
    if (file.terraformCode.trim().length === 0) {
      continue;
    }

    hash.update("\0file\0");
    hash.update(file.fileName);
    hash.update("\0content\0");
    hash.update(file.terraformCode);
  }

  return hash.digest("hex");
}

function createConfiguredScannerCacheKeySalt(options: TrivyTerraformScanOptions): string {
  const cacheDir = options.cacheDir ?? process.env.TRIVY_CACHE_DIR ?? "";
  const trivyBinaryPath = options.trivyBinaryPath ?? process.env.TRIVY_BIN ?? "trivy";

  return JSON.stringify({
    cacheDir,
    disabledRuleIds: disabledTrivyTerraformRuleIds,
    policyDigest: readTrivyPolicyDigest(cacheDir),
    trivyBinaryPath,
    trivyVersion: resolveTrivyVersion(trivyBinaryPath)
  });
}

function resolveTrivyVersion(trivyBinaryPath: string): string {
  if (process.env.TRIVY_VERSION) return process.env.TRIVY_VERSION;
  const cached = detectedTrivyVersions.get(trivyBinaryPath);
  if (cached) return cached;

  try {
    const output = execFileSync(trivyBinaryPath, ["--version"], {
      encoding: "utf8",
      timeout: 2_000,
      windowsHide: true
    });
    const version = output.match(/(?:Version:\s*)?v?(\d+\.\d+\.\d+)/i)?.[1];
    if (version) {
      detectedTrivyVersions.set(trivyBinaryPath, version);
      return version;
    }
  } catch {
    // An unavailable binary cannot safely share a cross-process result cache.
  }

  return `process:${TRIVY_PROCESS_CACHE_IDENTITY}`;
}

function readTrivyPolicyDigest(cacheDir: string): string {
  if (cacheDir.trim().length === 0) {
    return process.env.TRIVY_CHECKS_BUNDLE_DIGEST ?? "unknown";
  }

  try {
    const metadata = JSON.parse(
      readFileSync(path.join(cacheDir, "policy", "metadata.json"), "utf8")
    ) as { Digest?: unknown };

    return typeof metadata.Digest === "string" && metadata.Digest.length > 0
      ? metadata.Digest
      : "unknown";
  } catch {
    return process.env.TRIVY_CHECKS_BUNDLE_DIGEST ?? "unknown";
  }
}

export async function warmTrivyCheckBundle(
  scan: TerraformSecurityScanner = (input) => scanTerraformWithTrivy(input)
): Promise<void> {
  await scan({
    terraformFiles: [
      {
        fileName: "trivy-warmup.tf",
        terraformCode: TRIVY_WARMUP_TERRAFORM
      }
    ]
  });
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

  const s3PublicAccessText = getS3PublicAccessRuleText(normalizedRuleId);
  if (s3PublicAccessText) return s3PublicAccessText;

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
      title: joinUniqueFindingText(existing.title, finding.title),
      description: joinUniqueFindingText(existing.description, finding.description),
      recommendation: joinUniqueFindingText(existing.recommendation, finding.recommendation),
      severity: maxRiskSeverity(existing.severity, finding.severity),
      trivyRuleIds: Array.from(
        new Set([...(existing.trivyRuleIds ?? []), ...(finding.trivyRuleIds ?? [])])
      )
    });
  }

  return [...grouped.values()];
}

function getS3PublicAccessRuleText(ruleId: string): TrivyFindingText | undefined {
  const rules: Record<string, Omit<TrivyFindingText, "category" | "riskFamily">> = {
    "AWS-0086": {
      title: "S3 공개 ACL 업로드를 차단해야 합니다. (AWS-0086)",
      description: "block_public_acls가 꺼져 있으면 공개 ACL이 지정된 PUT 요청을 허용할 수 있습니다.",
      recommendation: "aws_s3_bucket_public_access_block의 block_public_acls를 true로 설정하세요."
    },
    "AWS-0087": {
      title: "S3 공개 bucket policy 생성을 차단해야 합니다. (AWS-0087)",
      description: "block_public_policy가 꺼져 있으면 공개 bucket policy가 새로 적용될 수 있습니다.",
      recommendation: "aws_s3_bucket_public_access_block의 block_public_policy를 true로 설정하세요."
    },
    "AWS-0091": {
      title: "S3 공개 ACL을 무시하도록 설정해야 합니다. (AWS-0091)",
      description: "ignore_public_acls가 꺼져 있으면 기존 공개 ACL이 접근 권한에 반영될 수 있습니다.",
      recommendation: "aws_s3_bucket_public_access_block의 ignore_public_acls를 true로 설정하세요."
    },
    "AWS-0093": {
      title: "S3 공개 bucket policy의 접근 범위를 제한해야 합니다. (AWS-0093)",
      description: "restrict_public_buckets가 꺼져 있으면 공개 policy가 있는 bucket에 광범위한 접근이 가능할 수 있습니다.",
      recommendation: "aws_s3_bucket_public_access_block의 restrict_public_buckets를 true로 설정하세요."
    }
  };
  const text = rules[ruleId];
  return text ? { ...text, category: "security", riskFamily: "S3_PUBLIC_ACCESS" } : undefined;
}

function joinUniqueFindingText(left: string, right: string): string {
  return left === right ? left : `${left}\n${right}`;
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
