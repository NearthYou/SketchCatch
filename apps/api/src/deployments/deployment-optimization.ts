import { createHash } from "node:crypto";
import type {
  DeploymentOptimizationDecision,
  DeploymentPlanSummary,
  DeploymentStatus,
  TerraformDesiredStateIdentity,
  TerraformResourceChangeAction,
  TerraformResourceChangeEvidence
} from "@sketchcatch/types";
import { DEPLOYMENT_OPTIMIZATION_CONTRACT_VERSION } from "@sketchcatch/types";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const terraformResourceAddressPattern = /^[a-zA-Z0-9_.-]+(?:\[\*\][a-zA-Z0-9_.-]*)*$/u;
const terraformResourceChangeEvidenceLimit = 1_000;
const supportedResourceChangeActions = new Set<TerraformResourceChangeAction>([
  "create",
  "update",
  "delete",
  "replace",
  "no_change",
  "read",
  "unknown"
]);

export const defaultDeploymentPlanDriftTtlMs = 5 * 60 * 1_000;
export const deploymentPlanOptimizationEvidenceSchemaVersion = 1 as const;

export type DeploymentPlanOptimizationEvidence = {
  readonly schemaVersion: typeof deploymentPlanOptimizationEvidenceSchemaVersion;
  readonly contractVersion: typeof DEPLOYMENT_OPTIMIZATION_CONTRACT_VERSION;
  readonly projectId: string;
  readonly deploymentId: string;
  readonly planArtifactId: string;
  readonly planArtifactSha256: string;
  readonly desiredStateIdentity: TerraformDesiredStateIdentity;
  readonly driftVerifiedAt: string;
  readonly planSummarySha256: string;
  readonly preDeploymentResultSha256: string;
  readonly resourceChanges: readonly TerraformResourceChangeEvidence[];
};

export type TerraformDesiredStateIdentityInput = {
  readonly projectId: string;
  readonly canonicalTerraformBundle: Buffer | Uint8Array | string;
  readonly terraformFiles: readonly {
    readonly fileName: string;
    readonly terraformCode: string;
  }[];
  readonly providerLockContent: Buffer | Uint8Array | string | null;
  readonly target: {
    readonly provider: "aws" | "kubernetes";
    readonly accountId: string;
    readonly region: string;
  };
  readonly state: {
    readonly lineage: string | null;
    readonly serial: number | null;
  };
};

export function createTerraformDesiredStateIdentity(
  input: TerraformDesiredStateIdentityInput
): TerraformDesiredStateIdentity {
  assertNonEmptyIdentity(input.projectId, "projectId");
  assertNonEmptyIdentity(input.target.accountId, "accountId");
  assertNonEmptyIdentity(input.target.region, "region");
  assertTerraformStateIdentity(input.state);

  const terraformBundleSha256 = createSha256(input.canonicalTerraformBundle);
  const normalizedLockContent = normalizeText(input.providerLockContent ?? "");
  const providerLockSha256 = createSha256(normalizedLockContent);
  const providerIdentitySha256 = hashOptimizationValue(
    readProviderIdentities(normalizedLockContent)
  );
  const variableIdentitySha256 = hashOptimizationValue(
    readTerraformBlockLabels(input.terraformFiles, "variable")
  );
  const backendIdentitySha256 = hashOptimizationValue(
    readTerraformBlockLabels(input.terraformFiles, "backend")
  );
  const targetIdentitySha256 = hashOptimizationValue({
    projectId: input.projectId,
    provider: input.target.provider,
    accountId: input.target.accountId,
    region: input.target.region
  });
  const stateLineageSha256 = input.state.lineage
    ? createSha256(input.state.lineage)
    : null;
  const stateIdentitySha256 = hashOptimizationValue({
    lineageSha256: stateLineageSha256,
    serial: input.state.serial
  });
  const identityWithoutFingerprint = {
    terraformBundleSha256,
    providerLockSha256,
    providerIdentitySha256,
    variableIdentitySha256,
    backendIdentitySha256,
    targetIdentitySha256,
    stateIdentitySha256,
    stateLineageSha256,
    stateSerial: input.state.serial
  };

  return {
    fingerprint: hashOptimizationValue({
      contractVersion: DEPLOYMENT_OPTIMIZATION_CONTRACT_VERSION,
      ...identityWithoutFingerprint
    }),
    ...identityWithoutFingerprint
  };
}

export function createDeploymentPlanOptimizationEvidence(input: {
  readonly projectId: string;
  readonly deploymentId: string;
  readonly planArtifactId: string;
  readonly planArtifactSha256: string;
  readonly desiredStateIdentity: TerraformDesiredStateIdentity;
  readonly driftVerifiedAt: string;
  readonly planSummary: DeploymentPlanSummary;
  readonly preDeploymentResult: unknown;
  readonly resourceChanges: readonly TerraformResourceChangeEvidence[];
}): DeploymentPlanOptimizationEvidence {
  const evidence: DeploymentPlanOptimizationEvidence = {
    schemaVersion: deploymentPlanOptimizationEvidenceSchemaVersion,
    contractVersion: DEPLOYMENT_OPTIMIZATION_CONTRACT_VERSION,
    projectId: input.projectId,
    deploymentId: input.deploymentId,
    planArtifactId: input.planArtifactId,
    planArtifactSha256: input.planArtifactSha256,
    desiredStateIdentity: input.desiredStateIdentity,
    driftVerifiedAt: input.driftVerifiedAt,
    planSummarySha256: hashOptimizationValue(input.planSummary),
    preDeploymentResultSha256: hashOptimizationValue(input.preDeploymentResult),
    resourceChanges: [...input.resourceChanges]
  };

  return parseDeploymentPlanOptimizationEvidence(Buffer.from(JSON.stringify(evidence)));
}

export function parseDeploymentPlanOptimizationEvidence(
  content: Buffer | Uint8Array | string
): DeploymentPlanOptimizationEvidence {
  try {
    const serialized = typeof content === "string" ? content : toBuffer(content).toString("utf8");
    const parsed: unknown = JSON.parse(serialized);
    assertOptimizationEvidence(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof DeploymentPlanOptimizationEvidenceError) {
      throw error;
    }

    throw new DeploymentPlanOptimizationEvidenceError("Deployment Plan optimization evidence is invalid");
  }
}

export function evaluatePendingPlanReuse(input: {
  readonly startedFromStatus: DeploymentStatus;
  readonly projectId: string;
  readonly deploymentId: string;
  readonly currentPlanArtifactId: string | null;
  readonly approvedAt: Date | string | null;
  readonly planSummary: DeploymentPlanSummary | null;
  readonly planArtifact:
    | {
        readonly id: string;
        readonly deploymentId: string;
        readonly terraformArtifactId: string;
        readonly terraformArtifactSha256: string | null;
        readonly operation: "apply" | "destroy";
        readonly sha256: string;
        readonly accountId: string;
        readonly region: string;
      }
    | undefined;
  readonly expectedTerraformArtifactId: string;
  readonly expectedAccountId: string;
  readonly expectedRegion: string;
  readonly actualPlanArtifactSha256: string | undefined;
  readonly evidence: DeploymentPlanOptimizationEvidence | undefined;
  readonly currentDesiredStateIdentity: TerraformDesiredStateIdentity;
  readonly now: Date;
  readonly driftTtlMs: number;
}): DeploymentOptimizationDecision {
  if (
    input.startedFromStatus !== "PENDING" ||
    !input.currentPlanArtifactId ||
    input.approvedAt ||
    !input.planSummary ||
    !input.planArtifact ||
    !input.evidence
  ) {
    return { outcome: "execute", reason: "cache_miss" };
  }

  const planArtifact = input.planArtifact;
  const evidence = input.evidence;

  if (
    planArtifact.id !== input.currentPlanArtifactId ||
    planArtifact.deploymentId !== input.deploymentId ||
    planArtifact.terraformArtifactId !== input.expectedTerraformArtifactId ||
    planArtifact.operation !== "apply"
  ) {
    return { outcome: "execute", reason: "cache_miss" };
  }

  if (
    evidence.projectId !== input.projectId ||
    evidence.deploymentId !== input.deploymentId ||
    evidence.planArtifactId !== planArtifact.id ||
    evidence.planArtifactSha256 !== planArtifact.sha256 ||
    input.actualPlanArtifactSha256 !== planArtifact.sha256 ||
    evidence.planSummarySha256 !== hashOptimizationValue(input.planSummary)
  ) {
    return { outcome: "fallback_execute", reason: "cache_validation_failed" };
  }

  if (
    planArtifact.accountId !== input.expectedAccountId ||
    planArtifact.region !== input.expectedRegion
  ) {
    return { outcome: "execute", reason: "target_changed" };
  }

  if (
    planArtifact.terraformArtifactSha256 !==
    input.currentDesiredStateIdentity.terraformBundleSha256
  ) {
    return { outcome: "execute", reason: "desired_state_changed" };
  }

  const verifiedAt = Date.parse(evidence.driftVerifiedAt);
  const evidenceAgeMs = input.now.getTime() - verifiedAt;

  if (!Number.isFinite(verifiedAt) || evidenceAgeMs < 0) {
    return { outcome: "fallback_execute", reason: "cache_validation_failed" };
  }

  if (evidenceAgeMs > input.driftTtlMs) {
    return { outcome: "execute", reason: "drift_ttl_expired" };
  }

  const previousIdentity = evidence.desiredStateIdentity;
  const currentIdentity = input.currentDesiredStateIdentity;

  if (previousIdentity.targetIdentitySha256 !== currentIdentity.targetIdentitySha256) {
    return { outcome: "execute", reason: "target_changed" };
  }

  if (
    previousIdentity.providerLockSha256 !== currentIdentity.providerLockSha256 ||
    previousIdentity.providerIdentitySha256 !== currentIdentity.providerIdentitySha256
  ) {
    return { outcome: "execute", reason: "provider_lock_changed" };
  }

  if (
    previousIdentity.stateIdentitySha256 !== currentIdentity.stateIdentitySha256 ||
    previousIdentity.stateLineageSha256 !== currentIdentity.stateLineageSha256 ||
    previousIdentity.stateSerial !== currentIdentity.stateSerial
  ) {
    return { outcome: "execute", reason: "state_changed" };
  }

  if (
    previousIdentity.terraformBundleSha256 !== currentIdentity.terraformBundleSha256 ||
    previousIdentity.variableIdentitySha256 !== currentIdentity.variableIdentitySha256 ||
    previousIdentity.backendIdentitySha256 !== currentIdentity.backendIdentitySha256
  ) {
    return { outcome: "execute", reason: "desired_state_changed" };
  }

  if (previousIdentity.fingerprint !== currentIdentity.fingerprint) {
    return { outcome: "fallback_execute", reason: "cache_validation_failed" };
  }

  return { outcome: "reuse", reason: "verified_pending_plan" };
}

export function createTerraformResourceChangeEvidence(
  terraformShowJson: string
): TerraformResourceChangeEvidence[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(terraformShowJson);
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.resource_changes)) {
    return [];
  }

  const evidence: TerraformResourceChangeEvidence[] = [];

  for (const candidate of parsed.resource_changes) {
    if (evidence.length >= terraformResourceChangeEvidenceLimit) {
      break;
    }

    if (!isRecord(candidate) || candidate.mode === "data" || typeof candidate.address !== "string") {
      continue;
    }

    const change = isRecord(candidate.change) ? candidate.change : undefined;
    const actions = Array.isArray(change?.actions)
      ? change.actions.filter((action): action is string => typeof action === "string")
      : [];
    const resourceAddress = sanitizeTerraformResourceAddress(candidate.address);

    evidence.push({
      resourceAddress,
      action: classifyTerraformActions(actions)
    });
  }

  return evidence;
}

export function isTerraformPlanNoChange(planSummary: DeploymentPlanSummary): boolean {
  return (
    planSummary.createCount === 0 &&
    planSummary.updateCount === 0 &&
    planSummary.deleteCount === 0 &&
    planSummary.replaceCount === 0
  );
}

export type DeploymentPlanSingleFlight<T> = {
  readonly size: number;
  run(key: string, operation: () => Promise<T>): {
    readonly joined: boolean;
    readonly promise: Promise<T>;
  };
};

export function createDeploymentPlanSingleFlight<T>(): DeploymentPlanSingleFlight<T> {
  const inFlight = new Map<string, Promise<T>>();

  return {
    get size() {
      return inFlight.size;
    },

    run(key, operation) {
      const existing = inFlight.get(key);

      if (existing) {
        return { joined: true, promise: existing };
      }

      const promise = Promise.resolve().then(operation);
      inFlight.set(key, promise);
      void promise
        .finally(() => {
          if (inFlight.get(key) === promise) {
            inFlight.delete(key);
          }
        })
        .catch(() => undefined);

      return { joined: false, promise };
    }
  };
}

export function hashOptimizationValue(value: unknown): string {
  return createSha256(JSON.stringify(toCanonicalJsonValue(value)) ?? "");
}

class DeploymentPlanOptimizationEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentPlanOptimizationEvidenceError";
  }
}

function assertOptimizationEvidence(
  value: unknown
): asserts value is DeploymentPlanOptimizationEvidence {
  if (!isRecord(value)) {
    throw new DeploymentPlanOptimizationEvidenceError("Deployment Plan optimization evidence must be an object");
  }

  assertExactKeys(value, [
    "schemaVersion",
    "contractVersion",
    "projectId",
    "deploymentId",
    "planArtifactId",
    "planArtifactSha256",
    "desiredStateIdentity",
    "driftVerifiedAt",
    "planSummarySha256",
    "preDeploymentResultSha256",
    "resourceChanges"
  ]);

  if (
    value.schemaVersion !== deploymentPlanOptimizationEvidenceSchemaVersion ||
    value.contractVersion !== DEPLOYMENT_OPTIMIZATION_CONTRACT_VERSION ||
    !isNonEmptyString(value.projectId) ||
    !isNonEmptyString(value.deploymentId) ||
    !isNonEmptyString(value.planArtifactId) ||
    !isSha256(value.planArtifactSha256) ||
    !isIsoDateTime(value.driftVerifiedAt) ||
    !isSha256(value.planSummarySha256) ||
    !isSha256(value.preDeploymentResultSha256) ||
    !Array.isArray(value.resourceChanges) ||
    value.resourceChanges.length > terraformResourceChangeEvidenceLimit
  ) {
    throw new DeploymentPlanOptimizationEvidenceError("Deployment Plan optimization evidence fields are invalid");
  }

  assertDesiredStateIdentity(value.desiredStateIdentity);

  for (const resourceChange of value.resourceChanges) {
    if (!isRecord(resourceChange)) {
      throw new DeploymentPlanOptimizationEvidenceError("Deployment Plan optimization evidence resource change is invalid");
    }
    assertExactKeys(resourceChange, ["resourceAddress", "action"]);

    if (
      typeof resourceChange.resourceAddress !== "string" ||
      resourceChange.resourceAddress.length === 0 ||
      resourceChange.resourceAddress.length > 256 ||
      !terraformResourceAddressPattern.test(resourceChange.resourceAddress) ||
      typeof resourceChange.action !== "string" ||
      !supportedResourceChangeActions.has(resourceChange.action as TerraformResourceChangeAction)
    ) {
      throw new DeploymentPlanOptimizationEvidenceError("Deployment Plan optimization evidence resource change fields are invalid");
    }
  }
}

function assertDesiredStateIdentity(value: unknown): asserts value is TerraformDesiredStateIdentity {
  if (!isRecord(value)) {
    throw new DeploymentPlanOptimizationEvidenceError("Deployment Plan optimization identity is invalid");
  }

  assertExactKeys(value, [
    "fingerprint",
    "terraformBundleSha256",
    "providerLockSha256",
    "providerIdentitySha256",
    "variableIdentitySha256",
    "backendIdentitySha256",
    "targetIdentitySha256",
    "stateIdentitySha256",
    "stateLineageSha256",
    "stateSerial"
  ]);

  const hashFields = [
    value.fingerprint,
    value.terraformBundleSha256,
    value.providerLockSha256,
    value.providerIdentitySha256,
    value.variableIdentitySha256,
    value.backendIdentitySha256,
    value.targetIdentitySha256,
    value.stateIdentitySha256
  ];

  if (
    !hashFields.every(isSha256) ||
    (value.stateLineageSha256 !== null && !isSha256(value.stateLineageSha256)) ||
    (value.stateSerial !== null &&
      (typeof value.stateSerial !== "number" ||
        !Number.isSafeInteger(value.stateSerial) ||
        value.stateSerial < 0))
  ) {
    throw new DeploymentPlanOptimizationEvidenceError("Deployment Plan optimization identity fields are invalid");
  }
}

function assertExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new DeploymentPlanOptimizationEvidenceError("Deployment Plan optimization evidence contains unsupported metadata");
  }
}

function readProviderIdentities(lockContent: string): string[] {
  const identities: string[] = [];
  const providerPattern = /provider\s+"([^"]+)"\s*\{([\s\S]*?)\}/gu;

  for (const match of lockContent.matchAll(providerPattern)) {
    const address = match[1]?.trim();
    const body = match[2] ?? "";
    const version = /\bversion\s*=\s*"([^"]+)"/u.exec(body)?.[1]?.trim() ?? "";

    if (address) {
      identities.push(`${address}@${version}`);
    }
  }

  return identities.sort();
}

function readTerraformBlockLabels(
  files: readonly { readonly fileName: string; readonly terraformCode: string }[],
  blockType: "backend" | "variable"
): string[] {
  const labels = new Set<string>();
  const pattern = new RegExp(`\\b${blockType}\\s+"([^"]+)"`, "gu");

  for (const file of files) {
    for (const match of normalizeText(file.terraformCode).matchAll(pattern)) {
      const label = match[1]?.trim();
      if (label) {
        labels.add(label);
      }
    }
  }

  return [...labels].sort();
}

function classifyTerraformActions(actions: readonly string[]): TerraformResourceChangeAction {
  if (isSameActions(actions, ["create"])) return "create";
  if (isSameActions(actions, ["update"])) return "update";
  if (isSameActions(actions, ["delete"])) return "delete";
  if (isSameActions(actions, ["delete", "create"]) || isSameActions(actions, ["create", "delete"])) {
    return "replace";
  }
  if (isSameActions(actions, ["no-op"])) return "no_change";
  if (isSameActions(actions, ["read"])) return "read";
  return "unknown";
}

function sanitizeTerraformResourceAddress(address: string): string {
  const withoutInstanceKeys = address.replace(/\[[^\]]*\]/gu, "[*]");

  if (
    withoutInstanceKeys.length > 0 &&
    withoutInstanceKeys.length <= 256 &&
    terraformResourceAddressPattern.test(withoutInstanceKeys)
  ) {
    return withoutInstanceKeys;
  }

  return "unknown_resource";
}

function isSameActions(actions: readonly string[], expected: readonly string[]): boolean {
  return actions.length === expected.length && actions.every((action, index) => action === expected[index]);
}

function assertTerraformStateIdentity(input: {
  readonly lineage: string | null;
  readonly serial: number | null;
}): void {
  if (input.lineage !== null && input.lineage.trim().length === 0) {
    throw new Error("Terraform state lineage must be null or non-empty");
  }

  if (input.serial !== null && (!Number.isSafeInteger(input.serial) || input.serial < 0)) {
    throw new Error("Terraform state serial must be null or a non-negative safe integer");
  }
}

function assertNonEmptyIdentity(value: string, fieldName: string): void {
  if (!value.trim()) {
    throw new Error(`Terraform desired-state ${fieldName} must be non-empty`);
  }
}

function toCanonicalJsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toCanonicalJsonValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, toCanonicalJsonValue(value[key])])
    );
  }

  return value;
}

function normalizeText(value: Buffer | Uint8Array | string): string {
  const text = typeof value === "string" ? value : toBuffer(value).toString("utf8");
  return text.replace(/\r\n?/gu, "\n").trimEnd();
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toBuffer(value: Buffer | Uint8Array | string): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && sha256Pattern.test(value);
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
