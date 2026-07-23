import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HARNESS_KIND = "sketchcatch_terraform_import_safety";
const HARNESS_SCHEMA_VERSION = 1;
const FIXTURE_PREFIX = "sketchcatch-import-safety-";
const MUTATION_APPROVAL = "IMPORT_AND_UPDATE_ONE_DISPOSABLE_S3_TAG";
const FIXTURE_CREATION_APPROVAL = "CREATE_ONE_DISPOSABLE_EMPTY_S3_FIXTURE";
const MUTABLE_TAG_KEY = "SketchCatchMutable";
const BEFORE_TAG_VALUE = "before";
const AFTER_TAG_VALUE = "after";
const DEFAULT_DENIED_ACCOUNT_IDS = Object.freeze(["555980271919"]);
const REQUIRED_FIXTURE_TAG_KEYS = Object.freeze([
  "SketchCatchHarness",
  "SketchCatchRunId",
  MUTABLE_TAG_KEY
]);
const SAFE_UPDATE_PATHS = new Set([`tags.${MUTABLE_TAG_KEY}`, `tags_all.${MUTABLE_TAG_KEY}`]);
const RUN_ID = /^[a-z0-9](?:[a-z0-9-]{4,22}[a-z0-9])$/u;
const ACCOUNT_ID = /^\d{12}$/u;
const AWS_REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u;

export class TerraformImportSafetyError extends Error {
  // Give callers a stable, non-sensitive reason without exposing provider output.
  constructor(code, message) {
    super(message);
    this.name = "TerraformImportSafetyError";
    this.code = code;
  }
}

// Turn a comma-separated allowlist into exact, non-empty values.
function parseCsv(value) {
  return [
    ...new Set(
      String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

// Stop the harness with a stable code when a safety contract is not met.
function requireCondition(condition, code, message) {
  if (!condition) throw new TerraformImportSafetyError(code, message);
}

// Read only explicit allowlists and derive the one permitted disposable fixture name.
export function readTerraformImportSafetyConfig(env = process.env) {
  const mode = String(env.SKETCHCATCH_TF_IMPORT_MODE ?? "preflight").trim();
  const runId = String(env.SKETCHCATCH_TF_IMPORT_RUN_ID ?? "").trim();
  const expectedAccountId = String(env.SKETCHCATCH_TF_IMPORT_ACCOUNT_ID ?? "").trim();
  const region = String(env.SKETCHCATCH_TF_IMPORT_REGION ?? "").trim();
  const allowedAccountIds = parseCsv(env.SKETCHCATCH_TF_IMPORT_ALLOWED_ACCOUNT_IDS);
  const allowedRegions = parseCsv(env.SKETCHCATCH_TF_IMPORT_ALLOWED_REGIONS);
  const deniedAccountIds = [
    ...DEFAULT_DENIED_ACCOUNT_IDS,
    ...parseCsv(env.SKETCHCATCH_TF_IMPORT_DENIED_ACCOUNT_IDS)
  ];

  requireCondition(
    mode === "preflight" || mode === "create_fixture" || mode === "execute",
    "invalid_mode",
    "Mode must be preflight, create_fixture, or execute"
  );
  requireCondition(RUN_ID.test(runId), "invalid_run_id", "A safe disposable run id is required");
  requireCondition(
    ACCOUNT_ID.test(expectedAccountId),
    "invalid_account_id",
    "An explicit AWS account id is required"
  );
  requireCondition(AWS_REGION.test(region), "invalid_region", "An explicit AWS region is required");
  requireCondition(
    allowedAccountIds.includes(expectedAccountId),
    "account_not_allowlisted",
    "The expected AWS account must be explicitly allowlisted"
  );
  requireCondition(
    allowedRegions.includes(region),
    "region_not_allowlisted",
    "The AWS region must be explicitly allowlisted"
  );
  requireCondition(
    !deniedAccountIds.includes(expectedAccountId),
    "production_account_denied",
    "Production AWS accounts are denied"
  );
  if (mode === "create_fixture") {
    requireCondition(
      env.SKETCHCATCH_TF_IMPORT_FIXTURE_CREATION_APPROVED === FIXTURE_CREATION_APPROVAL,
      "fixture_creation_not_approved",
      "Exact disposable fixture creation approval is required"
    );
  } else if (mode === "execute") {
    requireCondition(
      env.SKETCHCATCH_TF_IMPORT_MUTATION_APPROVED === MUTATION_APPROVAL,
      "mutation_not_approved",
      "Exact disposable import mutation approval is required"
    );
  }

  return Object.freeze({
    mode,
    runId,
    expectedAccountId,
    region,
    fixtureBucketName: `${FIXTURE_PREFIX}${runId}`,
    allowedAccountIds: Object.freeze(allowedAccountIds),
    allowedRegions: Object.freeze(allowedRegions),
    deniedAccountIds: Object.freeze([...new Set(deniedAccountIds)]),
    expectedTags: Object.freeze({
      SketchCatchHarness: "terraform-import-safety-v1",
      SketchCatchRunId: runId,
      [MUTABLE_TAG_KEY]: BEFORE_TAG_VALUE
    })
  });
}

// Describe the fixed stage order so tests can prove no destroy stage exists.
export function createTerraformImportSafetyStagePlan(mode = "preflight") {
  const stages = ["tools", "identity", "fixture"];
  if (mode === "create_fixture") {
    stages.splice(2, 1, "fixture_absence", "fixture_create", "fixture_verify");
  } else if (mode === "execute") {
    stages.push(
      "terraform_init",
      "import_plan",
      "import_apply",
      "imported_noop_plan",
      "allowlisted_update_plan",
      "allowlisted_update_apply",
      "provider_update_verify",
      "final_noop_plan"
    );
  }
  return Object.freeze(stages);
}

// Explain the operator-owned fixture and approval gates without embedding credentials.
export function renderTerraformImportSafetyUsage() {
  return `Terraform import safety harness

Default mode: preflight (read-only)

Required environment:
  SKETCHCATCH_TF_IMPORT_RUN_ID=<6-24 lowercase letters, digits, or hyphens>
  SKETCHCATCH_TF_IMPORT_ACCOUNT_ID=<12 digit disposable AWS account>
  SKETCHCATCH_TF_IMPORT_ALLOWED_ACCOUNT_IDS=<exact comma-separated allowlist>
  SKETCHCATCH_TF_IMPORT_REGION=<fixture region>
  SKETCHCATCH_TF_IMPORT_ALLOWED_REGIONS=<exact comma-separated allowlist>

Optional redacted evidence file:
  --evidence-output <absolute path>
  or SKETCHCATCH_TF_IMPORT_EVIDENCE_PATH=<absolute path>

Fixture prepared by the operator before this harness:
  Bucket name: ${FIXTURE_PREFIX}<run id>
  Empty bucket with exactly these tags:
    SketchCatchHarness=terraform-import-safety-v1
    SketchCatchRunId=<run id>
    ${MUTABLE_TAG_KEY}=${BEFORE_TAG_VALUE}

Execute mode additionally requires:
  SKETCHCATCH_TF_IMPORT_MODE=execute
  SKETCHCATCH_TF_IMPORT_MUTATION_APPROVED=${MUTATION_APPROVAL}

One-time fixture creation uses a separate approval:
  SKETCHCATCH_TF_IMPORT_MODE=create_fixture
  SKETCHCATCH_TF_IMPORT_FIXTURE_CREATION_APPROVED=${FIXTURE_CREATION_APPROVAL}

Execute imports the existing fixture, proves a no-op, updates only ${MUTABLE_TAG_KEY}
to ${AFTER_TAG_VALUE}, and proves a final no-op. It never creates or destroys cloud resources.
The create_fixture mode creates only the one empty, tagged fixture and never deletes it.
Local Terraform plans and state are removed without printing their contents.
`;
}

/** gg: evidence 경로가 없으면 기존 stdout 전용 동작을 유지하고, 있으면 절대 경로만 받습니다. */
export function readTerraformImportSafetyEvidencePath(env = process.env, args = []) {
  const optionIndex = args.indexOf("--evidence-output");
  const optionValue = optionIndex >= 0 ? args[optionIndex + 1] : undefined;
  const configuredPath = String(
    optionValue ?? env.SKETCHCATCH_TF_IMPORT_EVIDENCE_PATH ?? ""
  ).trim();

  if (configuredPath.length === 0 && optionIndex < 0) {
    return null;
  }

  requireCondition(
    configuredPath.length > 0 && !configuredPath.startsWith("--") && isAbsolute(configuredPath),
    "invalid_evidence_path",
    "Evidence output must be an absolute path"
  );

  return configuredPath;
}

/** gg: 향후 result에 민감한 필드가 추가돼도 evidence에는 고정된 증명 필드만 남깁니다. */
export function createTerraformImportSafetyEvidence(result) {
  const evidence = {
    kind: HARNESS_KIND,
    schemaVersion: HARNESS_SCHEMA_VERSION,
    status: result?.status === "passed" ? "passed" : "blocked"
  };

  if (
    result?.mode === "preflight" ||
    result?.mode === "create_fixture" ||
    result?.mode === "execute"
  ) {
    evidence.mode = result.mode;
  }
  if (typeof result?.mutationPerformed === "boolean") {
    evidence.mutationPerformed = result.mutationPerformed;
  }
  if (typeof result?.fixtureFingerprint === "string") {
    evidence.fixtureFingerprint = result.fixtureFingerprint;
  }
  if (typeof result?.fixtureCreated === "boolean") {
    evidence.fixtureCreated = result.fixtureCreated;
  }
  if (typeof result?.cloudDestroyPerformed === "boolean") {
    evidence.cloudDestroyPerformed = result.cloudDestroyPerformed;
  }

  const preflight = copyAllowedFields(result?.preflight, [
    "ready",
    "accountVerified",
    "regionVerified",
    "empty"
  ]);
  if (Object.keys(preflight).length > 0) {
    evidence.preflight = preflight;
  }

  const proof = copyAllowedFields(result?.proof, [
    "importRemoteMutationCount",
    "importedPlanNoOp",
    "allowlistedUpdateCount",
    "providerUpdateVerified",
    "finalPlanNoOp",
    "cloudDestroyPerformed"
  ]);
  if (Object.keys(proof).length > 0) {
    evidence.proof = proof;
  }

  if (typeof result?.errorCode === "string" && /^[a-z0-9_]+$/u.test(result.errorCode)) {
    evidence.errorCode = result.errorCode;
  }

  return Object.freeze(evidence);
}

/** gg: 같은 폴더의 비공개 임시 파일을 완성한 뒤 rename해 반쪽 evidence를 남기지 않습니다. */
export async function writeTerraformImportSafetyEvidence(evidencePath, result, dependencies = {}) {
  if (evidencePath === null || evidencePath === undefined || evidencePath === "") {
    return null;
  }

  requireCondition(
    typeof evidencePath === "string" && isAbsolute(evidencePath),
    "invalid_evidence_path",
    "Evidence output must be an absolute path"
  );
  const fileSystem = {
    writeFile: dependencies.fileSystem?.writeFile ?? writeFile,
    rename: dependencies.fileSystem?.rename ?? rename,
    rm: dependencies.fileSystem?.rm ?? rm
  };
  const temporaryPath = join(
    dirname(evidencePath),
    `.${basename(evidencePath)}.${process.pid}-${randomUUID()}.tmp`
  );
  const contents = `${JSON.stringify(createTerraformImportSafetyEvidence(result), null, 2)}\n`;

  try {
    await fileSystem.writeFile(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
    await fileSystem.rename(temporaryPath, evidencePath);
  } catch {
    await fileSystem.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new TerraformImportSafetyError(
      "evidence_write_failed",
      "Redacted evidence file could not be written"
    );
  }

  return Object.freeze({ written: true });
}

/** gg: boolean과 안전한 정수 증명 값만 allowlist로 복사합니다. */
function copyAllowedFields(value, fieldNames) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    fieldNames.flatMap((fieldName) => {
      const fieldValue = value[fieldName];
      return typeof fieldValue === "boolean" || Number.isSafeInteger(fieldValue)
        ? [[fieldName, fieldValue]]
        : [];
    })
  );
}

// Build one atomic S3 create request whose tags identify only this disposable run.
export function createDisposableS3FixtureCommand(config) {
  const tags = Object.entries(config.expectedTags).map(([Key, Value]) => ({ Key, Value }));
  const createBucketConfiguration = {
    ...(config.region === "us-east-1" ? {} : { LocationConstraint: config.region }),
    Tags: tags
  };
  return Object.freeze({
    command: "aws",
    args: Object.freeze([
      "s3api",
      "create-bucket",
      "--bucket",
      config.fixtureBucketName,
      "--object-ownership",
      "BucketOwnerEnforced",
      "--region",
      config.region,
      "--create-bucket-configuration",
      JSON.stringify(createBucketConfiguration),
      "--output",
      "json"
    ])
  });
}

// Remove ambient Terraform controls and keep all runtime data inside the harness workspace.
export function createProtectedTerraformEnvironment(env, workdir = null) {
  const protectedEnv = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    if (key.startsWith("TF_")) continue;
    protectedEnv[key] = value;
  }
  protectedEnv.TF_IN_AUTOMATION = "1";
  protectedEnv.TF_INPUT = "0";
  if (workdir !== null) protectedEnv.TF_DATA_DIR = join(workdir, ".terraform-data");
  return protectedEnv;
}

// Normalize AWS's special legacy bucket location values.
function normalizeBucketRegion(locationConstraint) {
  if (
    locationConstraint === null ||
    locationConstraint === undefined ||
    locationConstraint === ""
  ) {
    return "us-east-1";
  }
  if (locationConstraint === "EU") return "eu-west-1";
  return String(locationConstraint);
}

// Convert the AWS tag list into a deterministic map for exact fixture checks.
function tagSetToRecord(tagSet) {
  requireCondition(Array.isArray(tagSet), "fixture_tags_unavailable", "Fixture tags are required");
  const entries = tagSet.map((tag) => [String(tag?.Key ?? ""), String(tag?.Value ?? "")]);
  requireCondition(
    entries.every(([key]) => key.length > 0),
    "fixture_tags_invalid",
    "Fixture tags are invalid"
  );
  return Object.fromEntries(entries);
}

// Prove the target is the empty, isolated fixture selected by the current run id.
export function evaluateTerraformImportFixturePreflight(config, evidence) {
  requireCondition(
    evidence?.accountId === config.expectedAccountId,
    "aws_account_mismatch",
    "AWS identity does not match the approved account"
  );
  requireCondition(
    evidence?.locationConstraintPresent === true,
    "fixture_location_unavailable",
    "Fixture location evidence is required"
  );
  requireCondition(
    normalizeBucketRegion(evidence?.locationConstraint) === config.region,
    "fixture_region_mismatch",
    "Fixture region does not match the approved region"
  );
  requireCondition(
    evidence?.objectCountPresent === true &&
      Number.isSafeInteger(evidence?.objectCount) &&
      evidence.objectCount >= 0 &&
      evidence?.objectListingComplete === true,
    "fixture_object_inventory_unavailable",
    "Complete fixture object inventory evidence is required"
  );
  requireCondition(
    Number(evidence?.objectCount) === 0,
    "fixture_not_empty",
    "The disposable fixture bucket must be empty"
  );
  requireCondition(
    evidence?.versionListingComplete === true &&
      Number.isSafeInteger(evidence?.versionCount) &&
      Number.isSafeInteger(evidence?.deleteMarkerCount),
    "fixture_version_inventory_unavailable",
    "Complete fixture version inventory evidence is required"
  );
  requireCondition(
    evidence.versionCount === 0 && evidence.deleteMarkerCount === 0,
    "fixture_has_versions",
    "The disposable fixture bucket must not contain versions or delete markers"
  );
  requireCondition(
    evidence?.multipartListingComplete === true &&
      Number.isSafeInteger(evidence?.multipartUploadCount),
    "fixture_multipart_inventory_unavailable",
    "Complete multipart upload inventory evidence is required"
  );
  requireCondition(
    evidence.multipartUploadCount === 0,
    "fixture_has_multipart_uploads",
    "The disposable fixture bucket must not contain incomplete multipart uploads"
  );

  const actualTags = tagSetToRecord(evidence?.tagSet);
  requireCondition(
    Object.keys(actualTags).length === REQUIRED_FIXTURE_TAG_KEYS.length,
    "fixture_tags_not_isolated",
    "The disposable fixture must contain only the harness tags"
  );
  for (const key of REQUIRED_FIXTURE_TAG_KEYS) {
    requireCondition(
      actualTags[key] === config.expectedTags[key],
      "fixture_tags_mismatch",
      "Fixture tags do not match the approved harness run"
    );
  }

  return Object.freeze({ ready: true, accountVerified: true, regionVerified: true, empty: true });
}

// Read an action list without trusting malformed provider plan JSON.
function getActions(resourceChange) {
  const actions = resourceChange?.change?.actions;
  requireCondition(
    Array.isArray(actions),
    "plan_actions_invalid",
    "Terraform plan actions are invalid"
  );
  return actions;
}

// Treat no-op and read as non-mutating while keeping import as an explicit operation.
function isEffectivePlanChange(resourceChange) {
  const actions = getActions(resourceChange);
  return (
    resourceChange?.change?.importing !== undefined ||
    actions.some((action) => action !== "no-op" && action !== "read")
  );
}

// Reject any create, delete, or replacement action in every harness plan.
function assertNoDestructiveActions(plan) {
  for (const resourceChange of plan?.resource_changes ?? []) {
    const actions = getActions(resourceChange);
    requireCondition(
      !actions.includes("create") && !actions.includes("delete"),
      "destructive_plan_denied",
      "Create, delete, and replacement actions are denied"
    );
  }
}

// Prove the first plan imports exactly one existing bucket without remote changes.
export function assertImportOnlyPlan(plan, fixtureBucketName) {
  assertNoDestructiveActions(plan);
  const changes = (plan?.resource_changes ?? []).filter(isEffectivePlanChange);
  requireCondition(
    changes.length === 1,
    "import_plan_scope_invalid",
    "Import plan must contain one operation"
  );
  const [change] = changes;
  requireCondition(
    change?.address === "aws_s3_bucket.fixture",
    "import_address_invalid",
    "Import plan targets an unexpected resource"
  );
  requireCondition(
    JSON.stringify(getActions(change)) === JSON.stringify(["no-op"]),
    "import_changes_remote_resource",
    "Initial import must not change the remote resource"
  );
  requireCondition(
    change?.change?.importing?.id === fixtureBucketName,
    "import_id_mismatch",
    "Import plan targets an unexpected fixture"
  );
  return Object.freeze({ importOnly: true, remoteMutationCount: 0 });
}

// Prove a follow-up plan contains no import and no provider mutation.
export function assertNoOpPlan(plan) {
  assertNoDestructiveActions(plan);
  const changes = (plan?.resource_changes ?? []).filter(isEffectivePlanChange);
  requireCondition(changes.length === 0, "expected_noop_plan", "Terraform plan must be a no-op");
  return Object.freeze({ noOp: true });
}

// Find exact before/after value paths so the one approved tag is the only drift.
function collectChangedPaths(before, after, prefix = "") {
  if (Object.is(before, after)) return [];
  if (
    before === null ||
    after === null ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) ||
    Array.isArray(after)
  ) {
    return [prefix];
  }

  const paths = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    paths.push(...collectChangedPaths(before[key], after[key], path));
  }
  return paths;
}

// Collect only unknown values that Terraform marks true after the proposed change.
function collectUnknownPaths(value, prefix = "") {
  if (value === true) return [prefix];
  if (value === false || value === null || value === undefined || typeof value !== "object") {
    return [];
  }
  const paths = [];
  for (const key of Object.keys(value).sort()) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    paths.push(...collectUnknownPaths(value[key], path));
  }
  return paths;
}

// Allow exactly one in-place resource update and only the named mutable tag field.
export function assertSingleAllowlistedUpdatePlan(plan) {
  assertNoDestructiveActions(plan);
  const changes = (plan?.resource_changes ?? []).filter(isEffectivePlanChange);
  requireCondition(
    changes.length === 1,
    "update_plan_scope_invalid",
    "Update plan must change one resource"
  );
  const [change] = changes;
  requireCondition(
    change?.address === "aws_s3_bucket.fixture",
    "update_address_invalid",
    "Update plan targets an unexpected resource"
  );
  requireCondition(
    JSON.stringify(getActions(change)) === JSON.stringify(["update"]),
    "update_action_invalid",
    "Only one in-place update is allowed"
  );
  requireCondition(
    change?.change?.importing === undefined,
    "unexpected_second_import",
    "The allowlisted update plan must not import again"
  );

  const changedPaths = collectChangedPaths(change.change.before, change.change.after);
  requireCondition(changedPaths.length > 0, "update_diff_missing", "The update diff is missing");
  requireCondition(
    changedPaths.every((path) => SAFE_UPDATE_PATHS.has(path)),
    "update_field_not_allowlisted",
    "The update changes a field outside the allowlist"
  );
  requireCondition(
    change.change.before?.tags?.[MUTABLE_TAG_KEY] === BEFORE_TAG_VALUE &&
      change.change.after?.tags?.[MUTABLE_TAG_KEY] === AFTER_TAG_VALUE,
    "update_value_invalid",
    "The approved tag transition is missing"
  );
  requireCondition(
    collectUnknownPaths(change.change.after_unknown).length === 0,
    "update_contains_unknown_values",
    "The approved update contains unknown provider values"
  );

  return Object.freeze({ updateCount: 1, changedPaths: Object.freeze(changedPaths) });
}

// Render a closed Terraform configuration with account, region, and destroy guards.
export function renderTerraformImportFixture(config, mutableTagValue = BEFORE_TAG_VALUE) {
  requireCondition(
    mutableTagValue === BEFORE_TAG_VALUE || mutableTagValue === AFTER_TAG_VALUE,
    "invalid_mutable_tag",
    "The mutable tag value is outside the harness contract"
  );
  const deniedAccounts = config.deniedAccountIds.map((id) => `    "${id}",`).join("\n");

  return `terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region              = "${config.region}"
  allowed_account_ids = ["${config.expectedAccountId}"]
  forbidden_account_ids = [
${deniedAccounts}
  ]
}

resource "aws_s3_bucket" "fixture" {
  bucket        = "${config.fixtureBucketName}"
  force_destroy = false

  tags = {
    SketchCatchHarness = "terraform-import-safety-v1"
    SketchCatchRunId   = "${config.runId}"
    ${MUTABLE_TAG_KEY.padEnd(18)} = "${mutableTagValue}"
  }

  lifecycle {
    prevent_destroy = true
  }
}

import {
  to = aws_s3_bucket.fixture
  id = "${config.fixtureBucketName}"
}
`;
}

// Run a subprocess without a shell and never expose captured stdout or stderr.
async function runCapturedCommand(command, args, options = {}) {
  const acceptedExitCodes = options.acceptedExitCodes ?? [0];
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
    return { exitCode: 0, stdout: result.stdout };
  } catch (error) {
    const exitCode = typeof error?.code === "number" ? error.code : null;
    if (exitCode !== null && acceptedExitCodes.includes(exitCode)) {
      return { exitCode, stdout: String(error.stdout ?? "") };
    }
    throw new TerraformImportSafetyError(
      error?.code === "ENOENT" ? "tool_missing" : "protected_command_failed",
      `${command} failed during a protected harness stage`
    );
  }
}

// Parse captured JSON while keeping raw provider evidence out of logs.
function parseProtectedJson(value, code) {
  try {
    return JSON.parse(value);
  } catch {
    throw new TerraformImportSafetyError(code, "Protected command returned invalid JSON");
  }
}

// Read and verify only the current AWS account before any fixture operation.
async function collectAwsIdentity(config, commandRunner = runCapturedCommand) {
  const identity = parseProtectedJson(
    (
      await commandRunner("aws", [
        "sts",
        "get-caller-identity",
        "--region",
        config.region,
        "--output",
        "json"
      ])
    ).stdout,
    "aws_identity_invalid"
  );
  requireCondition(
    identity.Account === config.expectedAccountId,
    "aws_account_mismatch",
    "AWS identity does not match the approved account"
  );
  return String(identity.Account);
}

// Read fixture facts without issuing any mutating AWS call.
async function collectAwsFixtureEvidence(config, accountId, commandRunner = runCapturedCommand) {
  const location = parseProtectedJson(
    (
      await commandRunner("aws", [
        "s3api",
        "get-bucket-location",
        "--bucket",
        config.fixtureBucketName,
        "--expected-bucket-owner",
        config.expectedAccountId,
        "--region",
        config.region,
        "--output",
        "json"
      ])
    ).stdout,
    "fixture_location_invalid"
  );
  const tagging = parseProtectedJson(
    (
      await commandRunner("aws", [
        "s3api",
        "get-bucket-tagging",
        "--bucket",
        config.fixtureBucketName,
        "--expected-bucket-owner",
        config.expectedAccountId,
        "--region",
        config.region,
        "--output",
        "json"
      ])
    ).stdout,
    "fixture_tags_invalid"
  );
  const objects = parseProtectedJson(
    (
      await commandRunner("aws", [
        "s3api",
        "list-objects-v2",
        "--bucket",
        config.fixtureBucketName,
        "--max-keys",
        "1",
        "--expected-bucket-owner",
        config.expectedAccountId,
        "--region",
        config.region,
        "--output",
        "json"
      ])
    ).stdout,
    "fixture_objects_invalid"
  );
  const versions = parseProtectedJson(
    (
      await commandRunner("aws", [
        "s3api",
        "list-object-versions",
        "--bucket",
        config.fixtureBucketName,
        "--max-keys",
        "1",
        "--expected-bucket-owner",
        config.expectedAccountId,
        "--region",
        config.region,
        "--output",
        "json"
      ])
    ).stdout,
    "fixture_versions_invalid"
  );
  const multipartUploads = parseProtectedJson(
    (
      await commandRunner("aws", [
        "s3api",
        "list-multipart-uploads",
        "--bucket",
        config.fixtureBucketName,
        "--max-uploads",
        "1",
        "--expected-bucket-owner",
        config.expectedAccountId,
        "--region",
        config.region,
        "--output",
        "json"
      ])
    ).stdout,
    "fixture_multipart_uploads_invalid"
  );

  const objectCountPresent =
    Object.hasOwn(objects, "KeyCount") &&
    typeof objects.KeyCount === "number" &&
    Number.isSafeInteger(objects.KeyCount);
  const objectCount = objectCountPresent ? Number(objects.KeyCount) : Number.NaN;
  const objectContentsValid =
    objectCount === 0
      ? objects.Contents === undefined ||
        (Array.isArray(objects.Contents) && objects.Contents.length === 0)
      : Array.isArray(objects.Contents);

  return {
    accountId,
    locationConstraintPresent: Object.hasOwn(location, "LocationConstraint"),
    locationConstraint: location.LocationConstraint,
    tagSet: tagging.TagSet,
    objectCountPresent,
    objectCount,
    objectListingComplete:
      Object.hasOwn(objects, "IsTruncated") && objects.IsTruncated === false && objectContentsValid,
    versionListingComplete:
      Object.hasOwn(versions, "IsTruncated") &&
      versions.IsTruncated === false &&
      (versions.Versions === undefined || Array.isArray(versions.Versions)) &&
      (versions.DeleteMarkers === undefined || Array.isArray(versions.DeleteMarkers)),
    versionCount: Array.isArray(versions.Versions) ? versions.Versions.length : 0,
    deleteMarkerCount: Array.isArray(versions.DeleteMarkers) ? versions.DeleteMarkers.length : 0,
    multipartListingComplete:
      Object.hasOwn(multipartUploads, "IsTruncated") &&
      multipartUploads.IsTruncated === false &&
      (multipartUploads.Uploads === undefined || Array.isArray(multipartUploads.Uploads)),
    multipartUploadCount: Array.isArray(multipartUploads.Uploads)
      ? multipartUploads.Uploads.length
      : 0
  };
}

// Fail closed when an account lookup finds this run's bucket name already in use.
export function assertDisposableFixtureAbsent(matches) {
  requireCondition(
    Array.isArray(matches) && matches.length === 0,
    "fixture_already_exists",
    "The disposable fixture already exists"
  );
  return Object.freeze({ absent: true });
}

// Read the caller's bucket list and verify absence before the one allowed create request.
async function verifyDisposableFixtureAbsent(config, commandRunner = runCapturedCommand) {
  const matches = parseProtectedJson(
    (
      await commandRunner("aws", [
        "s3api",
        "list-buckets",
        "--region",
        config.region,
        "--query",
        `Buckets[?Name=='${config.fixtureBucketName}'].Name`,
        "--output",
        "json"
      ])
    ).stdout,
    "fixture_absence_check_invalid"
  );
  return assertDisposableFixtureAbsent(matches);
}

// Read a saved Terraform plan without printing its provider or state payload.
async function readTerraformPlan(workdir, planPath, commandRunner = runCapturedCommand) {
  const result = await commandRunner("terraform", ["show", "-json", planPath], { cwd: workdir });
  return parseProtectedJson(result.stdout, "terraform_plan_json_invalid");
}

// Create a saved plan and preserve detailed-exitcode as evidence for no-op checks.
async function createTerraformPlan(workdir, planPath, commandRunner = runCapturedCommand) {
  return commandRunner(
    "terraform",
    [
      "plan",
      "-input=false",
      "-no-color",
      "-lock-timeout=30s",
      "-detailed-exitcode",
      `-out=${planPath}`
    ],
    { cwd: workdir, acceptedExitCodes: [0, 2] }
  );
}

// Verify the provider now reports the one approved tag value and no unrelated tag drift.
async function verifyUpdatedFixtureTags(config, commandRunner = runCapturedCommand) {
  const tagging = parseProtectedJson(
    (
      await commandRunner("aws", [
        "s3api",
        "get-bucket-tagging",
        "--bucket",
        config.fixtureBucketName,
        "--expected-bucket-owner",
        config.expectedAccountId,
        "--region",
        config.region,
        "--output",
        "json"
      ])
    ).stdout,
    "fixture_tags_invalid"
  );
  const tags = tagSetToRecord(tagging.TagSet);
  requireCondition(
    Object.keys(tags).length === REQUIRED_FIXTURE_TAG_KEYS.length &&
      tags.SketchCatchHarness === config.expectedTags.SketchCatchHarness &&
      tags.SketchCatchRunId === config.runId &&
      tags[MUTABLE_TAG_KEY] === AFTER_TAG_VALUE,
    "provider_update_not_verified",
    "AWS did not confirm the one approved fixture tag update"
  );
  return Object.freeze({ providerVerified: true });
}

// Resolve injectable command and local-file boundaries without widening cloud authority.
function resolveHarnessDependencies(dependencies = {}) {
  return Object.freeze({
    commandRunner: dependencies.commandRunner ?? runCapturedCommand,
    fileSystem: Object.freeze({
      mkdtemp: dependencies.fileSystem?.mkdtemp ?? mkdtemp,
      writeFile: dependencies.fileSystem?.writeFile ?? writeFile,
      rm: dependencies.fileSystem?.rm ?? rm
    }),
    temporaryRoot: dependencies.temporaryRoot ?? tmpdir()
  });
}

// Execute the import proof only after preflight and the exact mutation approval gate.
export async function runTerraformImportSafetyHarness(env = process.env, dependencies = {}) {
  const config = readTerraformImportSafetyConfig(env);
  const {
    commandRunner: baseCommandRunner,
    fileSystem,
    temporaryRoot
  } = resolveHarnessDependencies(dependencies);
  const preflightTerraformEnv = createProtectedTerraformEnvironment(env);
  await baseCommandRunner("terraform", ["version", "-json"], {
    env: preflightTerraformEnv
  });
  await baseCommandRunner("aws", ["--version"]);

  const accountId = await collectAwsIdentity(config, baseCommandRunner);
  const fixtureFingerprint = createHash("sha256")
    .update(config.fixtureBucketName)
    .digest("hex")
    .slice(0, 16);

  if (config.mode === "create_fixture") {
    await verifyDisposableFixtureAbsent(config, baseCommandRunner);
    const request = createDisposableS3FixtureCommand(config);
    await baseCommandRunner(request.command, request.args);
    const createdEvidence = await collectAwsFixtureEvidence(config, accountId, baseCommandRunner);
    const createdPreflight = evaluateTerraformImportFixturePreflight(config, createdEvidence);
    return Object.freeze({
      kind: HARNESS_KIND,
      schemaVersion: HARNESS_SCHEMA_VERSION,
      mode: config.mode,
      status: "passed",
      mutationPerformed: true,
      fixtureFingerprint,
      fixtureCreated: true,
      cloudDestroyPerformed: false,
      preflight: createdPreflight
    });
  }

  const awsEvidence = await collectAwsFixtureEvidence(config, accountId, baseCommandRunner);
  const preflight = evaluateTerraformImportFixturePreflight(config, awsEvidence);

  if (config.mode === "preflight") {
    return Object.freeze({
      kind: HARNESS_KIND,
      schemaVersion: HARNESS_SCHEMA_VERSION,
      mode: config.mode,
      status: "passed",
      mutationPerformed: false,
      fixtureFingerprint,
      preflight
    });
  }

  const workdir = await fileSystem.mkdtemp(join(temporaryRoot, "sketchcatch-tf-import-safety-"));
  const terraformEnv = createProtectedTerraformEnvironment(env, workdir);
  // Keep every Terraform subprocess inside the protected temporary workspace.
  const terraformCommandRunner = (command, args, options = {}) =>
    baseCommandRunner(command, args, { ...options, env: terraformEnv });
  const mainFile = join(workdir, "main.tf");

  try {
    await fileSystem.writeFile(mainFile, renderTerraformImportFixture(config), {
      encoding: "utf8",
      mode: 0o600
    });
    await terraformCommandRunner("terraform", ["init", "-input=false", "-no-color"], {
      cwd: workdir
    });

    const importPlanPath = join(workdir, "import.tfplan");
    await createTerraformPlan(workdir, importPlanPath, terraformCommandRunner);
    assertImportOnlyPlan(
      await readTerraformPlan(workdir, importPlanPath, terraformCommandRunner),
      config.fixtureBucketName
    );
    await terraformCommandRunner(
      "terraform",
      ["apply", "-input=false", "-no-color", importPlanPath],
      { cwd: workdir }
    );

    const importedNoOpPath = join(workdir, "imported-noop.tfplan");
    const importedNoOp = await createTerraformPlan(
      workdir,
      importedNoOpPath,
      terraformCommandRunner
    );
    requireCondition(
      importedNoOp.exitCode === 0,
      "imported_plan_not_noop",
      "Imported plan is not a no-op"
    );
    assertNoOpPlan(await readTerraformPlan(workdir, importedNoOpPath, terraformCommandRunner));

    await fileSystem.writeFile(mainFile, renderTerraformImportFixture(config, AFTER_TAG_VALUE), {
      encoding: "utf8",
      mode: 0o600
    });
    const updatePlanPath = join(workdir, "allowlisted-update.tfplan");
    const updatePlanResult = await createTerraformPlan(
      workdir,
      updatePlanPath,
      terraformCommandRunner
    );
    requireCondition(
      updatePlanResult.exitCode === 2,
      "update_plan_missing",
      "Approved update plan is missing"
    );
    assertSingleAllowlistedUpdatePlan(
      await readTerraformPlan(workdir, updatePlanPath, terraformCommandRunner)
    );
    await terraformCommandRunner(
      "terraform",
      ["apply", "-input=false", "-no-color", updatePlanPath],
      { cwd: workdir }
    );
    await verifyUpdatedFixtureTags(config, terraformCommandRunner);

    const finalNoOpPath = join(workdir, "final-noop.tfplan");
    const finalNoOp = await createTerraformPlan(workdir, finalNoOpPath, terraformCommandRunner);
    requireCondition(finalNoOp.exitCode === 0, "final_plan_not_noop", "Final plan is not a no-op");
    assertNoOpPlan(await readTerraformPlan(workdir, finalNoOpPath, terraformCommandRunner));

    return Object.freeze({
      kind: HARNESS_KIND,
      schemaVersion: HARNESS_SCHEMA_VERSION,
      mode: config.mode,
      status: "passed",
      mutationPerformed: true,
      fixtureFingerprint,
      proof: Object.freeze({
        importRemoteMutationCount: 0,
        importedPlanNoOp: true,
        allowlistedUpdateCount: 1,
        providerUpdateVerified: true,
        finalPlanNoOp: true,
        cloudDestroyPerformed: false
      })
    });
  } finally {
    // Remove local plans and state; cloud cleanup is deliberately never automated here.
    await fileSystem.rm(workdir, { recursive: true, force: true });
  }
}

// Keep CLI output to a redacted proof summary and stable failure code.
async function runCli() {
  let evidencePath = null;
  try {
    evidencePath = readTerraformImportSafetyEvidencePath(process.env, process.argv.slice(2));
    const result = await runTerraformImportSafetyHarness(process.env);
    await writeTerraformImportSafetyEvidence(evidencePath, result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code =
      error instanceof TerraformImportSafetyError ? error.code : "terraform_import_safety_failed";
    const blockedResult = { kind: HARNESS_KIND, status: "blocked", errorCode: code };
    if (evidencePath) {
      try {
        await writeTerraformImportSafetyEvidence(evidencePath, blockedResult);
      } catch {
        // gg: evidence 실패가 원래 검증 오류의 안전한 stdout/stderr 계약을 바꾸지 않게 합니다.
      }
    }
    process.stderr.write(`${JSON.stringify(blockedResult)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help")) {
    process.stdout.write(renderTerraformImportSafetyUsage());
  } else {
    await runCli();
  }
}
