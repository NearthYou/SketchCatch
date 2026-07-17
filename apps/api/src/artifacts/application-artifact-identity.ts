import { createHash } from "node:crypto";
import { posix } from "node:path";
import type {
  ApplicationArtifactFingerprintInput,
  ApplicationArtifactIdentity,
  ConfirmedBuildConfig
} from "@sketchcatch/types";

const commitShaPattern = /^([a-f0-9]{40}|[a-f0-9]{64})$/u;
const secretKeyPattern = /(secret|token|password|credential|private.?key|access.?key|api.?key)/iu;

export function createApplicationArtifactIdentity(
  input: ApplicationArtifactFingerprintInput
): ApplicationArtifactIdentity {
  const commitSha = normalizeCommitSha(input.commitSha);
  const confirmedCommitSha = normalizeCommitSha(input.confirmedBuildConfig.confirmedCommitSha);

  if (confirmedCommitSha !== commitSha) {
    throw new Error("Confirmed build commit must match the artifact commit");
  }

  const repositoryIdentity = createRepositoryIdentity(input.repository);
  const buildContractVersion = requireNonEmpty(input.buildContractVersion, "build contract version");
  const targetOs = normalizeTargetOs(input.targetOs);
  const targetArchitecture = normalizeTargetArchitecture(input.targetArchitecture);
  const buildConfigSha256 = hashCanonicalValue(
    normalizeConfirmedBuildConfig(input.confirmedBuildConfig)
  );
  const buildInputIdentitySha256 = hashCanonicalValue(
    normalizeSecretFreeBuildInputs(input.buildInputs)
  );
  const identityWithoutFingerprint = {
    repositoryIdentity,
    commitSha,
    kind: input.kind,
    buildConfigSha256,
    buildContractVersion,
    targetOs,
    targetArchitecture,
    buildInputIdentitySha256
  };

  return {
    artifactFingerprint: hashCanonicalValue(identityWithoutFingerprint),
    ...identityWithoutFingerprint
  };
}

function createRepositoryIdentity(input: {
  readonly provider: "internal" | "github";
  readonly owner: string;
  readonly name: string;
}): string {
  const provider = input.provider.toLowerCase();
  const owner = requireNonEmpty(input.owner, "repository owner");
  const name = requireNonEmpty(input.name, "repository name");

  if (provider === "github") {
    return `${provider}:${owner.toLowerCase()}/${name.toLowerCase()}`;
  }

  return `${provider}:${owner}/${name}`;
}

function normalizeConfirmedBuildConfig(config: ConfirmedBuildConfig): Record<string, unknown> {
  return {
    sourceRoot: normalizePath(config.sourceRoot),
    evidence: config.evidence
      .map((evidence) => ({
        kind: evidence.kind,
        path: normalizePath(evidence.path)
      }))
      .sort((left, right) =>
        compareCanonicalText(`${left.kind}:${left.path}`, `${right.kind}:${right.path}`)
      ),
    installPreset: config.installPreset,
    buildPreset: config.buildPreset,
    artifactOutputPath: normalizeOptionalPath(config.artifactOutputPath),
    runtimeEntrypoint: normalizeOptionalText(config.runtimeEntrypoint),
    healthCheckPath: normalizeOptionalPath(config.healthCheckPath),
    dockerfilePath: normalizeOptionalPath(config.dockerfilePath),
    packageManifestPath: normalizeOptionalPath(config.packageManifestPath),
    samTemplatePath: normalizeOptionalPath(config.samTemplatePath),
    appSpecPath: normalizeOptionalPath(config.appSpecPath),
    staticOutputPath: normalizeOptionalPath(config.staticOutputPath),
    exactSemVerTag: normalizeOptionalText(config.exactSemVerTag),
    manifestVersion: normalizeOptionalText(config.manifestVersion)
  };
}

function normalizeSecretFreeBuildInputs(
  inputs: Record<string, string | number | boolean | null>
): Record<string, string | number | boolean | null> {
  const normalized: Record<string, string | number | boolean | null> = {};

  if (!isRecord(inputs)) {
    throw new Error("Application artifact build inputs must be a record");
  }

  for (const key of Object.keys(inputs).sort()) {
    const normalizedKey = requireNonEmpty(key, "build input key");
    if (normalizedKey !== key) {
      throw new Error(`Build input key must not contain surrounding whitespace: ${key}`);
    }
    const secretDetectionKey = normalizedKey.replace(/[-_]+/gu, "");
    if (secretKeyPattern.test(secretDetectionKey)) {
      throw new Error(`Secret-free build input key is required: ${normalizedKey}`);
    }

    const value = inputs[key];
    if (value === undefined) {
      throw new Error(`Build input ${normalizedKey} must be defined`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`Build input ${normalizedKey} must be finite`);
    }
    normalized[normalizedKey] = value;
  }

  return normalized;
}

function normalizeCommitSha(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!commitShaPattern.test(normalized)) {
    throw new Error("Artifact commit SHA must be a 40 or 64 character hexadecimal value");
  }
  return normalized;
}

function normalizeTargetOs(value: string): string {
  return requireNonEmpty(value, "target OS").toLowerCase();
}

function normalizeTargetArchitecture(value: string): string {
  const architecture = requireNonEmpty(value, "target architecture").toLowerCase();
  if (architecture === "x86_64" || architecture === "x64") return "amd64";
  if (architecture === "aarch64") return "arm64";
  return architecture;
}

function normalizeOptionalPath(value: string | null): string | null {
  return value === null ? null : normalizePath(value);
}

function normalizePath(value: string): string {
  const normalized = posix.normalize(
    requireNonEmpty(value, "build path").replace(/\\/gu, "/")
  );
  return normalized.length > 1 && normalized.endsWith("/")
    ? normalized.replace(/\/+$/u, "")
    : normalized;
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  return requireNonEmpty(value, "build value");
}

function requireNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Application artifact ${fieldName} must be non-empty`);
  }
  return normalized;
}

function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hashCanonicalValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(toCanonicalJsonValue(value)) ?? "")
    .digest("hex");
}

function toCanonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCanonicalJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, toCanonicalJsonValue(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
