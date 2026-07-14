import { execFile as execFileCallback } from "node:child_process";
import { readFile as readFileDefault } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const REQUIRED_DIRECT_SCOPES = ["infrastructure", "application", "full_stack"];
const REQUIRED_GITOPS_RUNTIMES = ["ecs_fargate", "lambda", "ec2_asg", "static_site"];
const REQUIRED_CLEANUP_CATEGORIES = ["ecr", "s3", "codebuild", "cloudwatch"];
const REQUIRED_CI_STAGES = ["build", "publish", "deploy", "health"];
const DEFAULT_PRODUCTION_ACCOUNT_IDS = ["555980271919"];
const SENSITIVE_KEY = /(access.?token|authorization|credential|password|private.?key|secret)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const ARTIFACT_DIGEST = /^sha256:[0-9a-f]{64}$/i;

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSensitiveKey(key) {
  return SENSITIVE_KEY.test(key) && !/^secretsMasked$/i.test(key);
}

function isTimestamp(value) {
  return hasText(value) && Number.isFinite(Date.parse(value));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isProductionHost(hostname, productionHosts) {
  const normalized = hostname.toLowerCase();
  return productionHosts.some((host) => {
    const candidate = String(host).trim().toLowerCase();
    return candidate !== "" && (normalized === candidate || normalized.endsWith(`.${candidate}`));
  });
}

function classifyApiUrl(apiBaseUrl, productionHosts) {
  try {
    const apiUrl = new URL(apiBaseUrl ?? "");
    if (apiUrl.protocol !== "https:" || isProductionHost(apiUrl.hostname, productionHosts)) {
      return "production_api";
    }
    if (
      apiUrl.username !== "" ||
      apiUrl.password !== "" ||
      apiUrl.search !== "" ||
      apiUrl.hash !== ""
    ) {
      return "invalid_api";
    }
    return null;
  } catch {
    return "invalid_api";
  }
}

function addPreflightError(errors, code, message) {
  errors.push({ code, message });
}

export function evaluateSandboxPreflight(input) {
  const errors = [];
  const accountId = input?.awsIdentity?.accountId;
  const productionAccountIds = new Set([
    ...DEFAULT_PRODUCTION_ACCOUNT_IDS,
    ...(input?.productionAccountIds ?? [])
  ]);

  if (!input?.mutationApproved) {
    addPreflightError(
      errors,
      "mutation_not_approved",
      "Live sandbox mutation approval is required"
    );
  }
  if (!/^\d{12}$/.test(accountId ?? "")) {
    addPreflightError(errors, "aws_identity_unavailable", "A verified AWS identity is required");
  } else if (productionAccountIds.has(accountId)) {
    addPreflightError(errors, "production_aws_account", "Production AWS accounts are denied");
  } else if (accountId !== input?.expectedAwsAccountId) {
    addPreflightError(
      errors,
      "aws_account_mismatch",
      "AWS identity does not match the approved account"
    );
  }

  const apiError = classifyApiUrl(input?.apiBaseUrl, input?.productionApiHosts ?? []);
  if (apiError === "production_api") {
    addPreflightError(errors, "production_api", "A non-production HTTPS API is required");
  } else if (apiError === "invalid_api") {
    addPreflightError(errors, "invalid_api", "A valid non-production API URL is required");
  }

  if (!input?.accessTokenPresent) {
    addPreflightError(errors, "access_token_missing", "A sandbox API access token is required");
  }
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(input?.region ?? "")) {
    addPreflightError(errors, "aws_region_missing", "An explicit AWS region is required");
  }
  if (!UUID.test(input?.awsConnectionId ?? "")) {
    addPreflightError(
      errors,
      "aws_connection_missing",
      "A verified sandbox AWS connection id is required"
    );
  } else if (!input?.awsConnection) {
    addPreflightError(
      errors,
      "aws_connection_unavailable",
      "The sandbox API could not verify the AWS connection"
    );
  } else {
    if (input.awsConnection.status !== "verified") {
      addPreflightError(
        errors,
        "aws_connection_unverified",
        "The sandbox AWS connection is not verified"
      );
    }
    if (
      input.awsConnection.accountId !== input.expectedAwsAccountId ||
      input.awsConnection.accountId !== accountId
    ) {
      addPreflightError(
        errors,
        "aws_connection_account_mismatch",
        "The service AWS connection targets a different account"
      );
    }
    if (input.awsConnection.region !== input.region) {
      addPreflightError(
        errors,
        "aws_connection_region_mismatch",
        "The service AWS connection targets a different region"
      );
    }
  }

  const repository = String(input?.githubRepository ?? "").toLowerCase();
  const productionRepositories = new Set(
    (input?.productionRepositories ?? []).map((candidate) => String(candidate).toLowerCase())
  );
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    addPreflightError(
      errors,
      "github_repository_missing",
      "A sandbox GitHub repository is required"
    );
  } else if (productionRepositories.has(repository)) {
    addPreflightError(
      errors,
      "production_github_repository",
      "Production GitHub repositories are denied"
    );
  }

  if (!hasText(input?.cleanupOwner)) {
    addPreflightError(errors, "cleanup_owner_missing", "A cleanup owner is required");
  }
  if (!(Number.isFinite(input?.budgetUsd) && input.budgetUsd > 0)) {
    addPreflightError(errors, "budget_missing", "A positive sandbox budget is required");
  }

  return { ready: errors.length === 0, errors };
}

function pushError(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function indexRequired(items, key, required, path, errors) {
  const index = new Map();
  const list = Array.isArray(items) ? items : [];
  const requiredSet = new Set(required);
  let hasUnexpectedEntry = list.length !== required.length;
  for (const item of list) {
    if (hasText(item?.[key]) && !index.has(item[key])) {
      index.set(item[key], item);
    } else {
      hasUnexpectedEntry = true;
    }
    if (!requiredSet.has(item?.[key])) hasUnexpectedEntry = true;
  }
  if (hasUnexpectedEntry) {
    pushError(errors, path, "duplicate or unsupported entries");
  }
  for (const name of required) {
    if (!index.has(name)) {
      pushError(errors, `${path}.${name}`, "missing");
    }
  }
  return index;
}

function hasCredentialBearingValue(value, key = "") {
  if (isSensitiveKey(key) && value !== undefined && value !== null) return true;
  if (typeof value === "string") {
    if (
      /\b(?:Bearer\s+\S+|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]+|x-amz-credential=)/i.test(value)
    ) {
      return true;
    }
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        return url.username !== "" || url.password !== "" || url.search !== "";
      } catch {
        return true;
      }
    }
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasCredentialBearingValue(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(([childKey, childValue]) =>
      hasCredentialBearingValue(childValue, childKey)
    );
  }
  return false;
}

function validateRelease(release, path, errors) {
  if (!release || typeof release !== "object") {
    pushError(errors, path, "missing");
    return;
  }
  if (!hasText(release.version)) pushError(errors, `${path}.version`, "missing");
  if (!COMMIT_SHA.test(release.commitSha ?? "")) {
    pushError(errors, `${path}.commitSha`, "invalid");
  }
  if (!ARTIFACT_DIGEST.test(release.artifactDigest ?? "")) {
    pushError(errors, `${path}.artifactDigest`, "invalid");
  }
  if (!hasText(release.providerRevision)) {
    pushError(errors, `${path}.providerRevision`, "missing");
  }
  if (!isHttpUrl(release.outputUrl)) pushError(errors, `${path}.outputUrl`, "invalid");
}

function validateDirect(item, scope, errors) {
  const path = `direct.${scope}`;
  if (!UUID.test(item?.deploymentId ?? "")) pushError(errors, `${path}.deploymentId`, "invalid");
  if (item?.status !== "SUCCESS") pushError(errors, `${path}.status`, "must be SUCCESS");

  const revision = item?.revision;
  const prepared = revision?.preparedSnapshotHash;
  if (
    !SHA256.test(prepared ?? "") ||
    prepared !== revision?.approvedSnapshotHash ||
    prepared !== revision?.executedSnapshotHash
  ) {
    pushError(errors, `${path}.revision`, "prepared, approved, and executed snapshots differ");
  }
  if (!SHA256.test(item?.logsSha256 ?? "")) pushError(errors, `${path}.logsSha256`, "invalid");
  if (!SHA256.test(item?.outputsSha256 ?? "")) {
    pushError(errors, `${path}.outputsSha256`, "invalid");
  }
  if (item?.destroy?.status !== "DESTROYED") {
    pushError(errors, `${path}.destroy`, "must be DESTROYED");
  }
  if (!SHA256.test(item?.destroy?.logsSha256 ?? "") || !isTimestamp(item?.destroy?.verifiedAt)) {
    pushError(errors, `${path}.destroy`, "provider evidence missing");
  }

  if (scope !== "infrastructure") {
    validateRelease(item?.release, `${path}.release`, errors);
    if (
      item?.outputProbe?.url !== item?.release?.outputUrl ||
      !(item?.outputProbe?.statusCode >= 200 && item.outputProbe.statusCode < 400) ||
      !isTimestamp(item?.outputProbe?.observedAt)
    ) {
      pushError(errors, `${path}.outputProbe`, "does not match the healthy release URL");
    }
  }
}

function validateGitOps(item, runtime, errors) {
  const path = `gitops.${runtime}`;
  if (!UUID.test(item?.handoffId ?? "") || !UUID.test(item?.pipelineRunId ?? "")) {
    pushError(errors, `${path}.identity`, "invalid");
  }
  if (item?.status !== "pipeline_success") {
    pushError(errors, `${path}.status`, "must be pipeline_success");
  }

  const pushedSha = item?.commit?.pushedSha;
  if (
    !COMMIT_SHA.test(pushedSha ?? "") ||
    pushedSha !== item?.commit?.detectedSha ||
    pushedSha !== item?.release?.commitSha
  ) {
    pushError(errors, `${path}.commit`, "release identity mismatch");
  }

  const stages = new Set(item?.ci?.stages ?? []);
  if (
    !hasText(item?.ci?.runId) ||
    !isHttpUrl(item?.ci?.runUrl) ||
    !REQUIRED_CI_STAGES.every((stage) => stages.has(stage)) ||
    !SHA256.test(item?.ci?.logsSha256 ?? "") ||
    item?.ci?.secretsMasked !== true
  ) {
    pushError(errors, `${path}.ci`, "run, stages, or masked log evidence missing");
  }

  validateRelease(item?.release, `${path}.release`, errors);
  if (
    item?.outputProbe?.url !== item?.release?.outputUrl ||
    !(item?.outputProbe?.statusCode >= 200 && item.outputProbe.statusCode < 400) ||
    !isTimestamp(item?.outputProbe?.observedAt)
  ) {
    pushError(errors, `${path}.outputProbe`, "does not match the healthy release URL");
  }

  const rollback = item?.rollback;
  if (
    rollback?.failureInjected !== true ||
    rollback?.status !== "verified" ||
    !hasText(rollback?.failedRevision) ||
    !hasText(rollback?.previousRevision) ||
    rollback?.previousRevision !== rollback?.restoredRevision ||
    rollback?.healthStatusCode < 200 ||
    rollback?.healthStatusCode >= 400 ||
    !isTimestamp(rollback?.verifiedAt)
  ) {
    pushError(errors, `${path}.rollback`, "previous revision was not restored");
  }

  const destroy = item?.destroy;
  if (
    destroy?.status !== "success" ||
    !isHttpUrl(destroy?.runUrl) ||
    !SHA256.test(destroy?.logsSha256 ?? "") ||
    !isTimestamp(destroy?.verifiedAt)
  ) {
    pushError(errors, `${path}.destroy`, "provider evidence missing");
  }
}

export function validateSandboxEvidence(report) {
  const errors = [];

  if (report?.kind !== "sketchcatch_deployment_sandbox_e2e" || report?.schemaVersion !== 1) {
    pushError(errors, "report", "unsupported schema");
  }
  if (
    !UUID.test(report?.runId ?? "") ||
    !isTimestamp(report?.startedAt) ||
    !isTimestamp(report?.finishedAt)
  ) {
    pushError(errors, "report.identity", "invalid");
  }
  if (report?.environment?.productionMutation !== false) {
    pushError(errors, "environment.productionMutation", "must be false");
  }
  if (
    !/^\d{12}$/.test(report?.environment?.awsAccountId ?? "") ||
    DEFAULT_PRODUCTION_ACCOUNT_IDS.includes(report?.environment?.awsAccountId)
  ) {
    pushError(errors, "environment.awsAccountId", "production account is denied");
  }
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(report?.environment?.awsRegion ?? "")) {
    pushError(errors, "environment.awsRegion", "invalid");
  }
  if (classifyApiUrl(report?.environment?.apiBaseUrl, ["sketchcatch.net"]) !== null) {
    pushError(errors, "environment.apiBaseUrl", "non-production HTTPS URL required");
  }
  if (
    !/^[^/\s]+\/[^/\s]+$/.test(report?.environment?.githubRepository ?? "") ||
    String(report?.environment?.githubRepository).toLowerCase() === "nearthyou/sketchcatch"
  ) {
    pushError(errors, "environment.githubRepository", "non-production repository required");
  }
  if (!isTimestamp(report?.environment?.mutationApprovedAt)) {
    pushError(errors, "environment.mutationApprovedAt", "missing");
  }
  if (!hasText(report?.environment?.cleanupOwner)) {
    pushError(errors, "environment.cleanupOwner", "missing");
  }
  if (!(Number.isFinite(report?.environment?.budgetUsd) && report.environment.budgetUsd > 0)) {
    pushError(errors, "environment.budgetUsd", "invalid");
  }
  if (!Array.isArray(report?.knownRisks)) {
    pushError(errors, "knownRisks", "must be an array");
  }
  if (hasCredentialBearingValue(report)) {
    pushError(errors, "report", "credential-bearing value detected");
  }

  const direct = indexRequired(report?.direct, "scope", REQUIRED_DIRECT_SCOPES, "direct", errors);
  for (const scope of REQUIRED_DIRECT_SCOPES) {
    const item = direct.get(scope);
    if (item) validateDirect(item, scope, errors);
  }

  const gitops = indexRequired(
    report?.gitops,
    "runtime",
    REQUIRED_GITOPS_RUNTIMES,
    "gitops",
    errors
  );
  for (const runtime of REQUIRED_GITOPS_RUNTIMES) {
    const item = gitops.get(runtime);
    if (item) validateGitOps(item, runtime, errors);
  }

  const fullStack = direct.get("full_stack");
  const observation = report?.observation;
  if (
    !UUID.test(observation?.observationId ?? "") ||
    observation?.deploymentId !== fullStack?.deploymentId ||
    observation?.targetUrl !== fullStack?.release?.outputUrl ||
    !SHA256.test(observation?.qrPayloadSha256 ?? "") ||
    !isTimestamp(observation?.expiresAt) ||
    observation?.acceptedRequestCount < 1 ||
    observation?.receiptCount < observation?.acceptedRequestCount
  ) {
    pushError(errors, "observation", "QR request evidence is incomplete or not release-bound");
  }
  if (
    observation?.cloudWatch?.source !== "cloudwatch" ||
    observation?.cloudWatch?.requestCount < 1 ||
    !Number.isFinite(observation?.cloudWatch?.errorCount) ||
    !Number.isFinite(observation?.cloudWatch?.latencyP95Ms) ||
    !Number.isFinite(observation?.cloudWatch?.capacity) ||
    !SHA256.test(observation?.cloudWatch?.querySha256 ?? "") ||
    !isTimestamp(observation?.cloudWatch?.observedAt)
  ) {
    pushError(errors, "observation.cloudWatch", "actual metrics are incomplete");
  }

  const inbox = report?.notifications?.inbox;
  const webPush = report?.notifications?.webPush;
  if (
    !UUID.test(inbox?.notificationId ?? "") ||
    inbox?.directDeploymentId !== fullStack?.deploymentId ||
    !Array.from(gitops.values()).some(
      (item) => item?.pipelineRunId === inbox?.gitopsPipelineRunId
    ) ||
    inbox?.persisted !== true ||
    !isTimestamp(inbox?.observedAt)
  ) {
    pushError(errors, "notifications.inbox", "persistent source evidence is incomplete");
  }
  if (
    webPush?.notificationId !== inbox?.notificationId ||
    webPush?.delivered !== true ||
    ![200, 201, 202].includes(webPush?.providerStatusCode) ||
    !isTimestamp(webPush?.observedAt)
  ) {
    pushError(errors, "notifications.webPush", "provider delivery evidence is incomplete");
  }

  const destroyedIds = new Set(report?.cleanup?.directDeploymentIds ?? []);
  if (
    Array.from(direct.values()).some((item) => !destroyedIds.has(item.deploymentId)) ||
    !isTimestamp(report?.cleanup?.completedAt)
  ) {
    pushError(errors, "cleanup.direct", "destroyed deployment evidence is incomplete");
  }
  for (const category of REQUIRED_CLEANUP_CATEGORIES) {
    const evidence = report?.cleanup?.categories?.[category];
    if (!evidence) {
      pushError(errors, `cleanup.${category}`, "missing");
    } else if (evidence.remainingCount !== 0) {
      pushError(errors, `cleanup.${category}`, "temporary resources remain");
    } else if (
      evidence.providerVerified !== true ||
      !SHA256.test(evidence.querySha256 ?? "") ||
      !isTimestamp(evidence.checkedAt)
    ) {
      pushError(errors, `cleanup.${category}`, "provider evidence missing");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function redactSensitiveEvidence(value, key = "") {
  if (isSensitiveKey(key)) return "<redacted>";
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveEvidence(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactSensitiveEvidence(childValue, childKey)
      ])
    );
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
    } catch {
      return "<redacted>";
    }
  }
  return value;
}

function splitList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveAwsCliIdentity(profile) {
  if (!hasText(profile)) return null;
  try {
    const { stdout } = await execFile(
      "aws",
      ["sts", "get-caller-identity", "--profile", profile, "--output", "json"],
      { windowsHide: true, maxBuffer: 1024 * 1024 }
    );
    const identity = JSON.parse(stdout);
    return { accountId: String(identity.Account ?? "") };
  } catch {
    return null;
  }
}

function resolveApiRoot(apiBaseUrl) {
  const url = new URL(apiBaseUrl);
  url.pathname = url.pathname.replace(/\/$/, "");
  if (!url.pathname.endsWith("/api")) url.pathname = `${url.pathname}/api`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function resolveAwsConnectionViaApi({ apiBaseUrl, accessToken, connectionId }) {
  if (!hasText(apiBaseUrl) || !hasText(accessToken) || !UUID.test(connectionId ?? "")) {
    return null;
  }
  try {
    const apiRoot = resolveApiRoot(apiBaseUrl);
    const headers = { Accept: "application/json", Authorization: `Bearer ${accessToken}` };
    const listResponse = await fetch(`${apiRoot}/aws/connections`, {
      headers,
      cache: "no-store"
    });
    if (!listResponse.ok) return null;
    const { awsConnections } = await listResponse.json();
    const connection = awsConnections?.find(({ id }) => id === connectionId);
    if (!connection) return null;

    const testResponse = await fetch(`${apiRoot}/aws/connections/${connectionId}/test`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ roleArn: connection.roleArn }),
      cache: "no-store"
    });
    if (!testResponse.ok) return null;
    const identity = await testResponse.json();

    return {
      id: connection.id,
      accountId: identity.accountId,
      region: identity.region,
      status: identity.ok === true ? connection.status : "failed"
    };
  } catch {
    return null;
  }
}

export async function runSandboxPreflight(env, options = {}) {
  const now = options.now ?? (() => new Date());
  const resolveAwsIdentity = options.resolveAwsIdentity ?? resolveAwsCliIdentity;
  const resolveAwsConnection = options.resolveAwsConnection ?? resolveAwsConnectionViaApi;
  const profile = env.SKETCHCATCH_SANDBOX_AWS_PROFILE;
  const productionApiHosts = [
    "sketchcatch.net",
    ...splitList(env.SKETCHCATCH_PRODUCTION_API_HOSTS)
  ];
  const identity = await resolveAwsIdentity(profile);
  const canResolveAwsConnection =
    classifyApiUrl(env.SKETCHCATCH_SANDBOX_API_BASE_URL, productionApiHosts) === null &&
    hasText(env.SKETCHCATCH_SANDBOX_ACCESS_TOKEN) &&
    UUID.test(env.SKETCHCATCH_SANDBOX_AWS_CONNECTION_ID ?? "");
  const awsConnection = canResolveAwsConnection
    ? await resolveAwsConnection({
        apiBaseUrl: env.SKETCHCATCH_SANDBOX_API_BASE_URL,
        accessToken: env.SKETCHCATCH_SANDBOX_ACCESS_TOKEN,
        connectionId: env.SKETCHCATCH_SANDBOX_AWS_CONNECTION_ID
      })
    : null;
  const input = {
    mutationApproved: env.SKETCHCATCH_SANDBOX_MUTATION_APPROVED === "true",
    awsIdentity: identity,
    expectedAwsAccountId: env.SKETCHCATCH_SANDBOX_AWS_ACCOUNT_ID,
    productionAccountIds: splitList(env.SKETCHCATCH_PRODUCTION_AWS_ACCOUNT_IDS),
    apiBaseUrl: env.SKETCHCATCH_SANDBOX_API_BASE_URL,
    productionApiHosts,
    accessTokenPresent: hasText(env.SKETCHCATCH_SANDBOX_ACCESS_TOKEN),
    awsConnectionId: env.SKETCHCATCH_SANDBOX_AWS_CONNECTION_ID,
    awsConnection,
    region: env.SKETCHCATCH_SANDBOX_REGION,
    githubRepository: env.SKETCHCATCH_SANDBOX_GITHUB_REPOSITORY,
    productionRepositories: [
      "NearthYou/SketchCatch",
      ...splitList(env.SKETCHCATCH_PRODUCTION_GITHUB_REPOSITORIES)
    ],
    cleanupOwner: env.SKETCHCATCH_SANDBOX_CLEANUP_OWNER,
    budgetUsd: Number(env.SKETCHCATCH_SANDBOX_BUDGET_USD)
  };
  const result = evaluateSandboxPreflight(input);

  return {
    kind: "sketchcatch_deployment_sandbox_preflight",
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    ready: result.ready,
    target: {
      awsProfile: profile ?? null,
      awsAccountId: identity?.accountId ?? null,
      expectedAwsAccountId: input.expectedAwsAccountId ?? null,
      region: env.SKETCHCATCH_SANDBOX_REGION ?? null,
      apiBaseUrl: input.apiBaseUrl ? redactSensitiveEvidence(input.apiBaseUrl) : null,
      awsConnectionId: input.awsConnectionId ?? null,
      githubRepository: input.githubRepository ?? null,
      cleanupOwner: input.cleanupOwner ?? null,
      budgetUsd: Number.isFinite(input.budgetUsd) ? input.budgetUsd : null
    },
    errors: result.errors
  };
}

export async function runSandboxCli(args = process.argv.slice(2), env = process.env, options = {}) {
  const write = options.write ?? ((value) => process.stdout.write(value));
  const command = args[0];

  if (command === "preflight") {
    const report = await runSandboxPreflight(env, options);
    write(`${JSON.stringify(report, null, 2)}\n`);
    return report.ready ? 0 : 2;
  }

  if (command === "verify") {
    const reportPath = args[1];
    if (!hasText(reportPath)) {
      write(`${JSON.stringify({ valid: false, errors: ["report path is required"] })}\n`);
      return 64;
    }
    try {
      const readFile = options.readFile ?? readFileDefault;
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      const result = validateSandboxEvidence(report);
      write(`${JSON.stringify(result)}\n`);
      return result.valid ? 0 : 1;
    } catch {
      write(`${JSON.stringify({ valid: false, errors: ["report could not be read"] })}\n`);
      return 1;
    }
  }

  write("Usage: node scripts/smoke/deployment-sandbox-e2e.mjs <preflight|verify REPORT_PATH>\n");
  return 64;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSandboxCli();
}
