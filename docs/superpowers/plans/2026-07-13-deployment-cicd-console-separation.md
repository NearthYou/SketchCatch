# Deployment and CI/CD Console Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Direct Deployment and CI/CD into independent screens inside the existing full-screen console, with repository monitoring settings, commit-scoped pipeline activity, notifications, and accessible deployment URLs.

**Architecture:** Keep `GitCicdHandoff` as the user-approved Git/PR handoff and add repository-scoped monitoring configuration plus commit-scoped Pipeline Run, stage, and log records. Extend the GitHub App provider and Fastify API to validate paths and poll GitHub Actions, then split the current oversized frontend panel into a shared console shell with focused Deployment and CI/CD screens.

**Tech Stack:** TypeScript, React 19, Next.js 16, Fastify 5, Zod 4, Drizzle ORM/PostgreSQL, GitHub App REST API, Web Notification API, Node test runner through `tsx --test`.

## Global Constraints

- Keep both screens inside the existing full-screen console; do not add a new Next.js route.
- New Source Repositories default CI/CD to enabled, but no handoff or automatic run may start until branch, app path, and infrastructure path are validated.
- Persist configuration and execution metadata in RDS; do not place GitHub, AWS, or Terraform mutation logic in React components.
- Keep `GitCicdHandoff`, Direct Deployment, and commit-scoped Pipeline Runs as separate domain concepts.
- Continue requiring user acceptance for Git workflow changes, AWS Role changes, and Terraform apply.
- Poll GitHub Actions every 5 seconds while a run is active and every 30 seconds while idle; do not add SSE, WebSocket, Service Worker, or Web Push.
- Never expose sensitive Terraform outputs, credentials, tokens, or raw secrets in logs, API responses, or notifications.
- Write project documentation and user-facing copy in Korean; keep code identifiers and API paths in English.
- Do not add runtime dependencies unless the existing platform APIs and packages are insufficient.

---

### Task 1: Lock Shared Monitoring and Pipeline Contracts

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `docs/data-models.md`
- Test: `packages/types/src/index.ts` through package typecheck

**Interfaces:**
- Produces: `GitCicdMonitoringConfig`, `GitCicdMonitoredPath`, `GitCicdPipelineRun`, `GitCicdPipelineStage`, `GitCicdPipelineLog`, request/response DTOs, and their narrow status unions.
- Consumes: existing `IsoDateTimeString`, `GitCicdHandoff`, and API response naming conventions.

- [ ] **Step 1: Add the contract section to the canonical data model document**

Add a `Git/CI/CD Monitoring and Pipeline Runs` section that states the exact ownership and compatibility rules from the approved design. Include these fields and API routes verbatim so implementation names cannot drift:

```md
GitCicdMonitoringConfig belongs to one active SourceRepository. GitCicdHandoff remains the approved Git/PR handoff. GitCicdPipelineRun belongs to one source commit and never replaces a handoff or Direct Deployment record.

- GET/PUT /projects/:projectId/source-repositories/:sourceRepositoryId/cicd-monitoring
- GET /projects/:projectId/git-cicd-pipeline-runs
- GET /git-cicd-pipeline-runs/:pipelineRunId
- GET /git-cicd-pipeline-runs/:pipelineRunId/logs?sinceSequence=
- POST /git-cicd-pipeline-runs/:pipelineRunId/refresh
```

- [ ] **Step 2: Add the shared types**

Add the following definitions near the existing Git/CI/CD types, using `IsoDateTimeString` for every serialized timestamp:

```ts
export type GitCicdMonitoringValidationStatus = "required" | "valid" | "invalid";
export type GitCicdMonitoredPath = {
  mode: "repository_root" | "subdirectory";
  path: string;
};
export type GitCicdMonitoringConfig = {
  sourceRepositoryId: string;
  enabled: boolean;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  validationStatus: GitCicdMonitoringValidationStatus;
  validationMessage: string | null;
  validatedAt: IsoDateTimeString | null;
  updatedAt: IsoDateTimeString;
};

export type GitCicdPipelineRunStatus =
  | "detected" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type GitCicdPipelineChangeScope = "app" | "infra" | "app_and_infra";
export type GitCicdPipelineStageKind =
  | "detect" | "app_build" | "infra_plan" | "infra_apply" | "app_deploy" | "verify";
export type GitCicdPipelineStageStatus =
  | "not_started" | "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";

export type GitCicdPipelineStage = {
  id: string;
  pipelineRunId: string;
  kind: GitCicdPipelineStageKind;
  status: GitCicdPipelineStageStatus;
  runUrl: string | null;
  startedAt: IsoDateTimeString | null;
  finishedAt: IsoDateTimeString | null;
};
export type GitCicdPipelineRun = {
  id: string;
  projectId: string;
  sourceRepositoryId: string;
  handoffId: string | null;
  commitSha: string;
  commitMessage: string;
  branch: string;
  changeScope: GitCicdPipelineChangeScope;
  status: GitCicdPipelineRunStatus;
  statusMessage: string | null;
  pipelineRunUrl: string | null;
  appUrl: string | null;
  apiUrl: string | null;
  startedAt: IsoDateTimeString | null;
  finishedAt: IsoDateTimeString | null;
  lastRefreshedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  stages: GitCicdPipelineStage[];
};
export type GitCicdPipelineLog = {
  id: string;
  pipelineRunId: string;
  stageId: string | null;
  sequence: number;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: IsoDateTimeString;
};
```

Add request/response wrappers:

```ts
export type UpdateGitCicdMonitoringConfigRequest = {
  enabled: boolean;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  userAcceptedChangeId: string;
};
export type GitCicdMonitoringConfigResponse = { config: GitCicdMonitoringConfig };
export type GitCicdPipelineRunListResponse = {
  runs: GitCicdPipelineRun[];
  nextCursor: string | null;
};
export type GitCicdPipelineRunResponse = { run: GitCicdPipelineRun };
export type GitCicdPipelineLogListResponse = {
  logs: GitCicdPipelineLog[];
  nextSequence: number;
};
```

- [ ] **Step 3: Run the shared package check**

Run: `pnpm --filter @sketchcatch/types typecheck`

Expected: PASS with no exported-type or timestamp errors.

- [ ] **Step 4: Commit the contract**

```bash
git add packages/types/src/index.ts docs/data-models.md
git commit -m "Feat: CI/CD 모니터링 계약 정의"
```

---

### Task 2: Add the RDS Schema and Backward-Compatible Migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0031_git_cicd_monitoring_runs.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/src/db/schema-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 status and DTO unions.
- Produces: `git_cicd_monitoring_configs`, `git_cicd_pipeline_runs`, `git_cicd_pipeline_stages`, and `git_cicd_pipeline_logs` tables plus Drizzle relations.

- [ ] **Step 1: Write failing schema-contract assertions**

Extend the schema contract test to assert table exports and the critical uniqueness/safety fields:

```ts
import {
  gitCicdMonitoringConfigs,
  gitCicdPipelineLogs,
  gitCicdPipelineRuns,
  gitCicdPipelineStages
} from "./schema.js";

assert.ok(gitCicdMonitoringConfigs.sourceRepositoryId);
assert.ok(gitCicdMonitoringConfigs.validationStatus);
assert.ok(gitCicdPipelineRuns.commitSha);
assert.ok(gitCicdPipelineStages.pipelineRunId);
assert.ok(gitCicdPipelineLogs.sequence);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --dir apps/api exec tsx --test src/db/schema-contract.test.ts`

Expected: FAIL because the four exports do not exist.

- [ ] **Step 3: Add Drizzle tables and relations**

Implement one-to-one monitoring config by Source Repository and one-to-many run children. Use JSONB for the two small monitored-path values, not for runs/stages/logs:

```ts
export const gitCicdMonitoringConfigs = pgTable("git_cicd_monitoring_configs", {
  sourceRepositoryId: varchar("source_repository_id", { length: 36 })
    .primaryKey()
    .references(() => sourceRepositories.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  monitorBranch: varchar("monitor_branch", { length: 255 }).notNull(),
  appPath: jsonb("app_path").$type<GitCicdMonitoredPath>().notNull(),
  infraPath: jsonb("infra_path").$type<GitCicdMonitoredPath>().notNull(),
  validationStatus: varchar("validation_status", { length: 16 })
    .$type<GitCicdMonitoringValidationStatus>().notNull().default("required"),
  validationMessage: text("validation_message"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
```

For Pipeline Runs add a unique index on `(source_repository_id, commit_sha)`, indexes on project/status/created time, and nullable `handoff_id` with `onDelete: set null`. For stages add a unique index on `(pipeline_run_id, kind)`. For logs add a unique index on `(pipeline_run_id, sequence)`.

- [ ] **Step 4: Generate and normalize the migration**

Run: `pnpm --filter @sketchcatch/api db:generate`

Rename the generated SQL to `0031_git_cicd_monitoring_runs.sql` only if Drizzle generates a different descriptive suffix. Inspect the SQL and ensure it:

```sql
INSERT INTO "git_cicd_monitoring_configs" (
  "source_repository_id", "enabled", "monitor_branch", "app_path", "infra_path", "validation_status"
)
SELECT "id", true, "default_branch", '{"mode":"repository_root","path":"."}'::jsonb,
       '{"mode":"repository_root","path":"."}'::jsonb, 'required'
FROM "source_repositories"
WHERE "status" = 'active';
```

This backfill intentionally requires confirmation before automatic execution despite root defaults.

- [ ] **Step 5: Run schema and migration metadata tests**

Run: `pnpm --dir apps/api exec tsx --test src/db/schema-contract.test.ts src/db/migration-metadata.test.ts`

Expected: PASS, including journal parse and schema exports.

- [ ] **Step 6: Commit the persistence layer**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/schema-contract.test.ts apps/api/drizzle
git commit -m "Feat: CI/CD 실행 이력 스키마 추가"
```

---

### Task 3: Validate and Persist Repository Monitoring Settings

**Files:**
- Create: `apps/api/src/git-cicd/git-cicd-monitoring-service.ts`
- Create: `apps/api/src/git-cicd/git-cicd-monitoring-service.test.ts`
- Modify: `apps/api/src/source-repositories/github-app-client.ts`
- Modify: `apps/api/src/source-repositories/github-app-client.test.ts`
- Modify: `apps/api/src/routes/git-cicd-handoffs.ts`
- Modify: `apps/api/src/routes/git-cicd-handoffs.test.ts`
- Modify: `apps/api/src/git-cicd/git-cicd-handoff-service.ts`

**Interfaces:**
- Consumes: `UpdateGitCicdMonitoringConfigRequest` and monitoring tables.
- Produces: `GitCicdMonitoringRepository`, `GitCicdMonitoringProvider`, `getGitCicdMonitoringConfig()`, `updateGitCicdMonitoringConfig()`, and HTTP GET/PUT routes.

- [ ] **Step 1: Write failing normalization and validation tests**

Cover root normalization, traversal rejection, missing branch, file-vs-directory rejection, permission errors, and disabled incomplete configuration:

```ts
assert.deepEqual(normalizeMonitoredPath({ mode: "repository_root", path: "anything" }), {
  mode: "repository_root", path: "."
});
assert.throws(
  () => normalizeMonitoredPath({ mode: "subdirectory", path: "../secrets" }),
  GitCicdMonitoringValidationError
);
```

For a disabled request, assert it can persist normalized values with `validationStatus: "required"`; for an enabled request, assert both directories and branch must validate before returning `valid`.

- [ ] **Step 2: Run the service test and verify it fails**

Run: `pnpm --dir apps/api exec tsx --test src/git-cicd/git-cicd-monitoring-service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Extend the GitHub App client with read-only validation**

Add these methods to `GitHubAppClient` and its implementation:

```ts
validateRepositoryBranch(input: GitHubRepositoryRefInput): Promise<boolean>;
validateRepositoryDirectory(
  input: GitHubRepositoryRefInput & { path: string }
): Promise<"directory" | "file" | "missing">;
```

Use `GET /repos/{owner}/{repo}/git/ref/heads/{branch}` for the branch and the existing contents helper for the path. Convert GitHub `404` to `false`/`missing`; propagate `401`/`403` as permission errors.

- [ ] **Step 4: Implement the monitoring service and repository**

Define focused interfaces so route tests can inject fakes:

```ts
export type GitCicdMonitoringProvider = {
  validateBranch(input: MonitoringTargetInput): Promise<boolean>;
  validateDirectory(input: MonitoringTargetInput & { path: string }): Promise<"directory" | "file" | "missing">;
};
export async function updateGitCicdMonitoringConfig(
  input: UpdateMonitoringInput,
  repository: GitCicdMonitoringRepository,
  provider: GitCicdMonitoringProvider
): Promise<GitCicdMonitoringConfigRecord> {
  const sourceRepository = await repository.findAccessibleSourceRepository(
    input.projectId,
    input.sourceRepositoryId,
    input.accessContext
  );
  if (!sourceRepository) throw new GitCicdMonitoringNotFoundError();

  const appPath = normalizeMonitoredPath(input.appPath);
  const infraPath = normalizeMonitoredPath(input.infraPath);
  if (!input.enabled) {
    return repository.upsertConfig({
      ...input,
      appPath,
      infraPath,
      validationStatus: "required",
      validationMessage: null,
      validatedAt: null
    });
  }

  await validateMonitoringTarget({
    sourceRepository,
    monitorBranch: input.monitorBranch,
    appPath,
    infraPath,
    provider
  });
  return repository.upsertConfig({
    ...input,
    appPath,
    infraPath,
    validationStatus: "valid",
    validationMessage: null,
    validatedAt: new Date()
  });
}
```

Return stable error codes `MONITOR_BRANCH_NOT_FOUND`, `MONITOR_PATH_NOT_FOUND`, `MONITOR_PATH_NOT_DIRECTORY`, and `GITHUB_PERMISSION_REQUIRED` through the existing API error envelope.

- [ ] **Step 5: Add GET/PUT routes with strict Zod validation**

Add the params/body schemas and routes under the existing Git/CI/CD registration:

```ts
const monitoredPathSchema = z.object({
  mode: z.enum(["repository_root", "subdirectory"]),
  path: z.string().trim().max(1024)
}).strict();

app.put(
  "/projects/:projectId/source-repositories/:sourceRepositoryId/cicd-monitoring",
  async (request, reply) => {
    const accessContext = { kind: "user", userId: requireActiveUserId(request) } as const;
    const params = monitoringParamsSchema.parse(request.params);
    const body = updateMonitoringBodySchema.parse(request.body);
    const config = await updateGitCicdMonitoringConfig(
      { ...params, ...body, accessContext },
      monitoringRepository,
      monitoringProvider
    );
    const response: GitCicdMonitoringConfigResponse = {
      config: toGitCicdMonitoringConfig(config)
    };
    return reply.status(200).send(response);
  }
);
```

Require `userAcceptedChangeId` on PUT. Saving to RDS is not itself a Git mutation; applying the resulting workflow files still occurs through the existing explicit repository-settings/handoff action.

- [ ] **Step 6: Gate handoff creation on a valid enabled config**

Before the existing provider creates files or a PR, load the monitoring config for `sourceRepositoryId` and throw `GitCicdHandoffProviderConflictError` unless `enabled === true && validationStatus === "valid"`.

- [ ] **Step 7: Render the approved paths into GitHub Actions workflows**

Extend `GitCicdWorkflowRenderInput` with `appPath` and `infraPath`. Replace the hard-coded infra path trigger and add an app push trigger:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'apps/web/**'
      - '.github/workflows/sketchcatch-app.yml'
```

Keep the current user-approved repository-settings apply action as the only operation that writes these workflow files.

- [ ] **Step 8: Run focused service, route, provider, and workflow tests**

Run: `pnpm --dir apps/api exec tsx --test src/git-cicd/git-cicd-monitoring-service.test.ts src/source-repositories/github-app-client.test.ts src/routes/git-cicd-handoffs.test.ts src/git-cicd/git-cicd-workflows.test.ts`

Expected: PASS with no network calls outside injected fetch fakes.

- [ ] **Step 9: Commit monitoring settings**

```bash
git add apps/api/src/git-cicd apps/api/src/source-repositories apps/api/src/routes/git-cicd-handoffs.ts apps/api/src/routes/git-cicd-handoffs.test.ts
git commit -m "Feat: 저장소 CI/CD 감시 설정 추가"
```

---

### Task 4: Discover and Persist Commit-Scoped Pipeline Runs

**Files:**
- Create: `apps/api/src/git-cicd/git-cicd-pipeline-run-service.ts`
- Create: `apps/api/src/git-cicd/git-cicd-pipeline-run-service.test.ts`
- Create: `apps/api/src/git-cicd/github-actions-run-provider.ts`
- Create: `apps/api/src/git-cicd/github-actions-run-provider.test.ts`
- Modify: `apps/api/src/source-repositories/github-app-client.ts`
- Modify: `apps/api/src/source-repositories/github-app-client.test.ts`

**Interfaces:**
- Consumes: valid monitoring config and GitHub App installation/repository identity.
- Produces: `refreshProjectPipelineRuns()`, `refreshPipelineRun()`, `listProjectPipelineRuns()`, `listPipelineLogs()`, and provider snapshots keyed by commit SHA.

- [ ] **Step 1: Write failing change-scope tests**

Define and test a pure helper before persistence:

```ts
assert.equal(classifyPipelineChangeScope(["apps/web/page.tsx"], config), "app");
assert.equal(classifyPipelineChangeScope(["infra/terraform/main.tf"], config), "infra");
assert.equal(classifyPipelineChangeScope(
  ["apps/web/page.tsx", "infra/terraform/main.tf"], config
), "app_and_infra");
assert.equal(classifyPipelineChangeScope(["README.md"], config), null);
```

Include segment-safe matching so `apps/web-old` does not match `apps/web`.

- [ ] **Step 2: Run the service test and verify it fails**

Run: `pnpm --dir apps/api exec tsx --test src/git-cicd/git-cicd-pipeline-run-service.test.ts`

Expected: FAIL because the module and classifier do not exist.

- [ ] **Step 3: Add GitHub read models and client calls**

Add provider-facing methods without leaking raw GitHub payloads beyond the client:

```ts
listBranchWorkflowRuns(input: GitHubRepositoryRefInput): Promise<GitHubWorkflowRunSummary[]>;
listCommitFiles(input: GitHubRepositoryRefInput & { commitSha: string }): Promise<string[]>;
listWorkflowJobs(input: GitHubRepositoryInput & { runId: number }): Promise<GitHubWorkflowJobSummary[]>;
readWorkflowJobLog(input: GitHubRepositoryInput & { jobId: number }): Promise<string>;
```

Use GitHub endpoints `/actions/runs?branch=...`, `/commits/{sha}`, `/actions/runs/{runId}/jobs`, and `/actions/jobs/{jobId}/logs`. Mask lines matching the existing secret-token masking rules before returning log text.

- [ ] **Step 4: Map GitHub data into provider snapshots**

Implement `GitCicdRunProviderSnapshot` with `commitSha`, message, branch, workflow name, run URL, start/end times, aggregate status, jobs, and masked log lines. Map workflow names exactly: `SketchCatch Infra` to infra stages and `SketchCatch App` to app stages.

- [ ] **Step 5: Implement idempotent persistence**

In `refreshProjectPipelineRuns()`:

1. Load the active repository and valid enabled config.
2. Fetch recent branch workflow runs.
3. Group workflows by commit SHA.
4. Fetch changed files once per unseen SHA and classify scope.
5. Skip commits outside both monitored paths.
6. Upsert one Pipeline Run per `(sourceRepositoryId, commitSha)`.
7. Upsert the six known stages, marking non-applicable stages `skipped`.
8. Replace or append logs by deterministic sequence without duplicating existing entries.
9. Preserve the previous status and `lastRefreshedAt` when GitHub refresh fails.

Use a repository transaction for run, stages, and logs.

- [ ] **Step 6: Test idempotency, stage mapping, and stale-state behavior**

Add tests that call refresh twice with the same snapshot and assert one run, one of each stage, and no duplicate sequence. Simulate a provider error after a successful refresh and assert the run remains `running` while the service returns a stale-state indicator.

- [ ] **Step 7: Run the focused pipeline tests**

Run: `pnpm --dir apps/api exec tsx --test src/git-cicd/git-cicd-pipeline-run-service.test.ts src/git-cicd/github-actions-run-provider.test.ts src/source-repositories/github-app-client.test.ts`

Expected: PASS, including secret masking and duplicate prevention.

- [ ] **Step 8: Commit Pipeline Run synchronization**

```bash
git add apps/api/src/git-cicd apps/api/src/source-repositories/github-app-client.ts apps/api/src/source-repositories/github-app-client.test.ts
git commit -m "Feat: 커밋별 CI/CD 실행 상태 수집"
```

---

### Task 5: Expose Pipeline Run, Stage, and Log APIs

**Files:**
- Modify: `apps/api/src/routes/git-cicd-handoffs.ts`
- Modify: `apps/api/src/routes/git-cicd-handoffs.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: Task 4 service functions and repository.
- Produces: authenticated list/detail/log/refresh endpoints using Task 1 response DTOs.

- [ ] **Step 1: Write failing route tests**

Add authenticated route cases for:

```ts
GET /api/projects/:projectId/git-cicd-pipeline-runs?cursor=&limit=20
GET /api/git-cicd-pipeline-runs/:pipelineRunId
GET /api/git-cicd-pipeline-runs/:pipelineRunId/logs?sinceSequence=0
POST /api/git-cicd-pipeline-runs/:pipelineRunId/refresh
```

Assert project ownership, default `limit: 20`, maximum `limit: 50`, newest-first order, `nextCursor`, sequence filtering, and 404 for inaccessible runs.

- [ ] **Step 2: Run route tests and verify they fail**

Run: `pnpm --dir apps/api exec tsx --test src/routes/git-cicd-handoffs.test.ts`

Expected: FAIL with route not found.

- [ ] **Step 3: Add strict params/query schemas and route handlers**

Use:

```ts
const pipelineRunListQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict();
const pipelineLogQuerySchema = z.object({
  sinceSequence: z.coerce.number().int().min(0).default(0)
}).strict();
```

Keep handlers thin: authenticate, parse, invoke service, map ISO timestamps, return typed response.

- [ ] **Step 4: Register injected provider/repository dependencies in app composition**

Construct the GitHub Actions run provider beside the existing handoff pipeline-status provider. Do not create a second GitHub App credential path.

- [ ] **Step 5: Run route and API type checks**

Run: `pnpm --dir apps/api exec tsx --test src/routes/git-cicd-handoffs.test.ts`

Run: `pnpm --filter @sketchcatch/api typecheck`

Expected: both PASS.

- [ ] **Step 6: Commit the HTTP boundary**

```bash
git add apps/api/src/routes/git-cicd-handoffs.ts apps/api/src/routes/git-cicd-handoffs.test.ts apps/api/src/app.ts
git commit -m "Feat: CI/CD 실행 조회 API 추가"
```

---

### Task 6: Add Web API Clients and Pure Console State Helpers

**Files:**
- Modify: `apps/web/features/workspace/api.ts`
- Modify: `apps/web/features/workspace/api.test.ts`
- Create: `apps/web/features/workspace/cicd-console-state.ts`
- Create: `apps/web/features/workspace/cicd-console-state.test.ts`
- Create: `apps/web/features/workspace/deployment-output-links.ts`
- Create: `apps/web/features/workspace/deployment-output-links.test.ts`

**Interfaces:**
- Consumes: Task 1 DTOs and Task 5 HTTP routes.
- Produces: monitoring/run client functions, polling selectors, notification transition helpers, and safe Output link classification.

- [ ] **Step 1: Write failing API-client tests**

Assert exact authenticated paths and bodies for:

```ts
getGitCicdMonitoringConfig(projectId, sourceRepositoryId)
updateGitCicdMonitoringConfig(projectId, sourceRepositoryId, request)
listGitCicdPipelineRuns(projectId, { cursor, limit })
getGitCicdPipelineRun(pipelineRunId)
listGitCicdPipelineLogs(pipelineRunId, sinceSequence)
refreshGitCicdPipelineRun(pipelineRunId)
```

- [ ] **Step 2: Run the API-client tests and verify they fail**

Run: `pnpm --dir apps/web exec tsx --test features/workspace/api.test.ts`

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Implement typed API clients**

Follow existing `apiFetch` patterns and return unwrapped `config`, `runs`, `run`, and `logs` values. Do not add component-local fetch calls.

- [ ] **Step 4: Write failing pure-state tests**

Cover interval choice, terminal transition detection, duplicate notification keys, active-vs-history selection, stale status, and URL filtering:

```ts
assert.equal(getCicdPollIntervalMs([{ status: "running" }]), 5_000);
assert.equal(getCicdPollIntervalMs([{ status: "succeeded" }]), 30_000);
assert.equal(createPipelineNotificationKey("run-1", "succeeded"), "run-1:succeeded");
assert.deepEqual(getSafeDeploymentLinks(outputs), [
  { kind: "web", label: "Web entry point", url: "https://app.example.com" }
]);
```

Include sensitive outputs, non-HTTP strings, malformed URLs, `staticSiteUrl`, and `apiBaseUrl` precedence.

- [ ] **Step 5: Run pure-state tests and verify they fail**

Run: `pnpm --dir apps/web exec tsx --test features/workspace/cicd-console-state.test.ts features/workspace/deployment-output-links.test.ts`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 6: Implement the helpers**

Export constants `ACTIVE_CICD_POLL_INTERVAL_MS = 5_000` and `IDLE_CICD_POLL_INTERVAL_MS = 30_000`. Keep `getSafeDeploymentLinks()` pure and reject any `TerraformOutput` with `sensitive === true` before URL parsing.

- [ ] **Step 7: Run the focused web tests**

Run: `pnpm --dir apps/web exec tsx --test features/workspace/api.test.ts features/workspace/cicd-console-state.test.ts features/workspace/deployment-output-links.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit clients and helpers**

```bash
git add apps/web/features/workspace/api.ts apps/web/features/workspace/api.test.ts apps/web/features/workspace/cicd-console-state.ts apps/web/features/workspace/cicd-console-state.test.ts apps/web/features/workspace/deployment-output-links.ts apps/web/features/workspace/deployment-output-links.test.ts
git commit -m "Feat: CI/CD 콘솔 상태 클라이언트 추가"
```

---

### Task 7: Split the Full-Screen Console into Focused Screens

**Files:**
- Create: `apps/web/features/workspace/DeploymentConsoleShell.tsx`
- Create: `apps/web/features/workspace/DirectDeploymentScreen.tsx`
- Create: `apps/web/features/workspace/CicdConsoleScreen.tsx`
- Create: `apps/web/features/workspace/CicdMonitoringSettings.tsx`
- Create: `apps/web/features/workspace/CicdActivityView.tsx`
- Create: `apps/web/features/workspace/CicdLogsView.tsx`
- Modify: `apps/web/features/workspace/DeploymentPanel.tsx`
- Modify: `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Create: `apps/web/features/workspace/deployment-cicd-console-layout.test.ts`

**Interfaces:**
- Consumes: existing Deployment callbacks/props and Task 6 clients/helpers.
- Produces: `DeploymentConsoleShell` with `activeScreen: "deployment" | "cicd"`; independent Direct and CI/CD view state.

- [ ] **Step 1: Write a failing source-structure regression test**

Assert the shell imports both focused screens, the Direct screen does not import CI/CD client functions, and the CI/CD screen does not import Terraform apply actions:

```ts
assert.match(shellSource, /DirectDeploymentScreen/);
assert.match(shellSource, /CicdConsoleScreen/);
assert.doesNotMatch(directSource, /listGitCicdPipelineRuns/);
assert.doesNotMatch(cicdSource, /runDeploymentApply/);
```

Also assert the top-level buttons are labeled `배포` and `CI/CD`, and old `deploymentConsoleTab` markup is absent from `DeploymentPanel.tsx`.

- [ ] **Step 2: Run the layout test and verify it fails**

Run: `pnpm --dir apps/web exec tsx --test features/workspace/deployment-cicd-console-layout.test.ts`

Expected: FAIL because the focused files do not exist.

- [ ] **Step 3: Extract Direct Deployment without behavior changes**

Move current setup, pre-deployment, approval, apply/destroy, Direct records, logs, and results into `DirectDeploymentScreen`. Preserve the existing prop signatures and tests. Leave `DeploymentPanel` as a temporary compatibility adapter that renders `DeploymentConsoleShell` so `WorkspaceRightPanel` changes remain small.

- [ ] **Step 4: Implement the common shell and last-screen persistence**

Use a project-scoped local-storage key:

```ts
const key = `sketchcatch:deployment-console-screen:${projectId}`;
type DeploymentConsoleScreen = "deployment" | "cicd";
```

Default to `deployment`, validate stored values, and render accessible `aria-pressed` top-level controls. Keep the existing portal and Terraform unsaved-change gate in `WorkspaceRightPanel`.

- [ ] **Step 5: Implement CI/CD Overview, Activity, Logs, and Settings**

`CicdConsoleScreen` owns:

```ts
type CicdConsoleView = "overview" | "activity" | "logs" | "settings";
```

It loads repository/config/runs together, selects the active run first or newest run otherwise, refreshes through Task 6 clients, and keeps prior data visible during refresh. Settings must show explicit root/subdirectory choice for both app and infra paths and disable Save until every enabled field is complete.

- [ ] **Step 6: Add loading, empty, stale, permission, and failure states**

Use the exact Korean states:

- `CI/CD 설정이 필요합니다.` for `validationStatus: required`
- `GitHub 권한을 확인해 주세요.` for permission failures, with the existing project settings link
- `상태 갱신이 지연되고 있습니다.` when `lastRefreshedAt` exceeds 60 seconds during a non-terminal run
- `아직 감지된 Pipeline Run이 없습니다.` for an empty valid configuration

- [ ] **Step 7: Run existing Deployment and new console tests**

Run: `pnpm --dir apps/web exec tsx --test features/workspace/deployment-panel-apply-confirmation.test.ts features/workspace/deployment-actions.test.ts features/workspace/deployment-cicd-console-layout.test.ts features/workspace/cicd-console-state.test.ts`

Expected: PASS with Direct behavior unchanged and new boundaries enforced.

- [ ] **Step 8: Run web typecheck**

Run: `pnpm --filter @sketchcatch/web typecheck`

Expected: PASS.

- [ ] **Step 9: Commit the screen split**

```bash
git add apps/web/features/workspace
git commit -m "Refactor: 배포와 CI/CD 콘솔 화면 분리"
```

---

### Task 8: Add Workspace Notifications and Accessible Output Cards

**Files:**
- Create: `apps/web/features/workspace/WorkspaceNotificationHost.tsx`
- Create: `apps/web/features/workspace/workspace-notifications.ts`
- Create: `apps/web/features/workspace/workspace-notifications.test.ts`
- Create: `apps/web/features/workspace/DeploymentOutputLinks.tsx`
- Modify: `apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx`
- Modify: `apps/web/features/workspace/DirectDeploymentScreen.tsx`
- Modify: `apps/web/features/workspace/CicdConsoleScreen.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`

**Interfaces:**
- Consumes: Task 6 terminal-transition and Output helpers.
- Produces: session notification list, deduplicated toast/browser notifications, and shared Output cards.

- [ ] **Step 1: Write failing notification tests**

Test that only transitions into `succeeded` or `failed` notify, the same `runId:status` key notifies once, denied/unsupported Notification APIs still enqueue an in-app item, and permission is requested only from an explicit user action:

```ts
const next = reduceWorkspaceNotifications(state, {
  type: "pipeline_terminal",
  runId: "run-1",
  status: "succeeded",
  title: "배포 완료",
  body: "main · a13f9c2"
});
assert.equal(next.items.length, 1);
assert.equal(reduceWorkspaceNotifications(next, sameEvent).items.length, 1);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --dir apps/web exec tsx --test features/workspace/workspace-notifications.test.ts`

Expected: FAIL because the reducer does not exist.

- [ ] **Step 3: Implement the notification host**

Mount one host in `ProjectWorkspaceDraftManager` so it survives switching between console screens. Persist deduplication keys for the current browser session in `sessionStorage`; keep the visible notification list in React state. Add an explicit `브라우저 알림 켜기` control that calls `Notification.requestPermission()` and never requests permission on mount.

- [ ] **Step 4: Connect Pipeline Run transitions**

When refresh changes a selected or listed run from non-terminal to terminal, dispatch one event to the host. Use `new Notification(title, { body, tag: notificationKey })` only when permission is `granted`. Notifications must contain project/branch/short SHA/status but no logs or output values.

- [ ] **Step 5: Implement the shared Output component**

Render Task 6 safe links with:

```tsx
<a href={link.url} target="_blank" rel="noreferrer">사이트 열기</a>
<button type="button" onClick={() => navigator.clipboard.writeText(link.url)}>URL 복사</button>
<span aria-live="polite">{copiedUrl === link.url ? "URL을 복사했습니다." : ""}</span>
```

Show `Web entry point` before `API endpoint`, and render non-URL non-sensitive Terraform outputs in the existing details list without open/copy controls.

- [ ] **Step 6: Add component/source regression assertions**

Extend the notification and Output tests to assert `aria-live`, `rel="noreferrer"`, sensitive filtering, and that both Direct and CI/CD screens import `DeploymentOutputLinks`.

- [ ] **Step 7: Run focused notification and Output tests**

Run: `pnpm --dir apps/web exec tsx --test features/workspace/workspace-notifications.test.ts features/workspace/deployment-output-links.test.ts features/workspace/deployment-cicd-console-layout.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit notifications and Output access**

```bash
git add apps/web/features/workspace
git commit -m "Feat: 배포 완료 알림과 Output 링크 제공"
```

---

### Task 9: Integrate, Dogfood the Representative Journey, and Update Durable Docs

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/architecture.md`
- Modify: `agent-progress.md`
- Modify: `session-handoff.md` only if implementation remains for another session

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified end-to-end behavior, updated operational boundaries, and durable handoff evidence.

- [ ] **Step 1: Run all focused API tests**

Run:

```bash
pnpm --dir apps/api exec tsx --test \
  src/db/schema-contract.test.ts \
  src/git-cicd/git-cicd-monitoring-service.test.ts \
  src/git-cicd/git-cicd-pipeline-run-service.test.ts \
  src/git-cicd/github-actions-run-provider.test.ts \
  src/git-cicd/git-cicd-workflows.test.ts \
  src/routes/git-cicd-handoffs.test.ts \
  src/source-repositories/github-app-client.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all focused web tests**

Run:

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/api.test.ts \
  features/workspace/cicd-console-state.test.ts \
  features/workspace/deployment-output-links.test.ts \
  features/workspace/workspace-notifications.test.ts \
  features/workspace/deployment-cicd-console-layout.test.ts \
  features/workspace/deployment-panel-apply-confirmation.test.ts
```

Expected: PASS.

- [ ] **Step 3: Apply the migration only to an approved local test database**

Run with a non-production `DATABASE_URL`:

```bash
pnpm --filter @sketchcatch/api db:migrate
```

Expected: migration `0031_git_cicd_monitoring_runs.sql` applies; existing active Source Repositories receive `validationStatus = 'required'`; existing handoff rows remain unchanged.

- [ ] **Step 4: Run the representative browser journey**

Start the existing local web/API stack with test credentials and verify:

1. Open a project and the full-screen console.
2. Switch between `배포` and `CI/CD`; close/reopen and confirm the last screen restores.
3. Confirm CI/CD defaults enabled, choose `main`, and explicitly select root/subdirectory for app and infra.
4. Apply repository workflow settings through the existing user-accepted action.
5. Push the prepared greeting-text commit under the app path.
6. Observe Detect, Build, Deploy, Verify; confirm Activity, Logs, start/end time, and final status.
7. Confirm one in-app notification and, after explicit permission, one browser Notification.
8. Open the non-sensitive Web entry point and verify the changed greeting.
9. Follow the Runtime Log link to Live Observation and confirm CI/CD status does not change.

Do not run Terraform Apply or mutate real cloud infrastructure unless the user separately authorizes that deployment execution.

- [ ] **Step 5: Update durable documentation**

Document polling, RDS records, approval boundaries, notification limits, and CI/CD-vs-Runtime log separation in `docs/architecture.md` and `docs/deployment.md`. Record exact focused and full verification commands in `agent-progress.md`.

- [ ] **Step 6: Run the repository completion gates**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: all commands PASS. If lint emits only a documented pre-existing warning, record it exactly rather than claiming a clean lint.

- [ ] **Step 7: Perform the clean-state and adversarial safety review**

Apply `clean-state-checklist.md` and `evaluator-rubric.md`. Confirm no secrets, direct frontend cloud calls, unapproved Git writes, Terraform apply, or duplicate active `feature_list.json` item was introduced.

- [ ] **Step 8: Commit documentation and final evidence**

```bash
git add docs/architecture.md docs/deployment.md agent-progress.md session-handoff.md
git commit -m "Docs: 배포와 CI/CD 분리 검증 기록"
```
