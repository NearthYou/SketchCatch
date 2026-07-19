# AWS Connection Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse Engineering 기록이 있는 AWS 연결을 기록 손실 없이 삭제하고, 설정 화면에서 삭제 효과와 실패 복구를 명확하게 제공한다.

**Architecture:** `reverse_engineering_scans.aws_connection_id`를 nullable `ON DELETE SET NULL` 참조로 바꾸고 공유 DTO까지 nullable을 전파한다. AWS 연결 repository가 보존할 스캔 수를 미리보기로 반환하며, Web 삭제 모달은 성공 전까지 열린 상태를 유지하고 오류를 모달 내부에 표시한다.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Fastify, React/Next.js, TanStack Query, Node test runner

## Global Constraints

- Reverse Engineering 스캔 결과와 프로젝트 기록은 AWS 연결 삭제 후에도 보존한다.
- CloudFormation Stack과 Terraform Execution Role은 삭제하지 않는다.
- Deployment와 Terraform state 차단, confirmation token, 관리 AWS 리소스 cleanup 안전 경계는 유지한다.
- 실제 AWS apply, destroy 또는 사용자 Deployment는 실행하지 않는다.
- 기존 사용자 변경인 `apps/web/app/workspace/repository/repository-start.module.css`, `.playwright-cli/`, `output/`은 수정하지 않는다.

---

### Task 1: Nullable Reverse Engineering Connection Contract

**Files:**
- Create: `apps/api/src/db/aws-connection-reverse-scan-detachment-migration.test.ts`
- Create: `apps/api/drizzle/0051_aws_connection_reverse_scan_detachment.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `docs/data-models.md`

**Interfaces:**
- Consumes: existing `reverse_engineering_scans.aws_connection_id` foreign key.
- Produces: `ReverseEngineeringScan.awsConnectionId: string | null` and `ON DELETE SET NULL` database behavior.

- [ ] **Step 1: Write the failing migration contract test**

```ts
test("0051 preserves Reverse Engineering scans when an AWS connection is deleted", () => {
  const table = getTableConfig(reverseEngineeringScans);
  assert.equal(table.columns.find((column) => column.name === "aws_connection_id")?.notNull, false);
  assert.match(sql, /DROP CONSTRAINT[\s\S]*reverse_engineering_scans_aws_connection_id/iu);
  assert.match(sql, /FOREIGN KEY \("aws_connection_id"\)[\s\S]*ON DELETE set null/iu);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/db/aws-connection-reverse-scan-detachment-migration.test.ts`

Expected: FAIL because migration `0051` does not exist and the schema column is still required.

- [ ] **Step 3: Implement the schema, migration, journal, shared type, and documentation change**

```ts
awsConnectionId: varchar("aws_connection_id", { length: 36 }).references(
  () => awsConnections.id,
  { onDelete: "set null" }
)
```

```sql
ALTER TABLE "reverse_engineering_scans" ALTER COLUMN "aws_connection_id" DROP NOT NULL;
ALTER TABLE "reverse_engineering_scans" DROP CONSTRAINT IF EXISTS "reverse_engineering_scans_aws_connection_id_aws_connections_id_fk";
ALTER TABLE "reverse_engineering_scans" DROP CONSTRAINT IF EXISTS "reverse_engineering_scans_aws_connection_id_aws_connections_id_";
ALTER TABLE "reverse_engineering_scans" ADD CONSTRAINT "reverse_engineering_scans_aws_connection_id_aws_connections_id_fk" FOREIGN KEY ("aws_connection_id") REFERENCES "public"."aws_connections"("id") ON DELETE set null ON UPDATE no action;
```

- [ ] **Step 4: Run focused migration and type checks and verify GREEN**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/db/aws-connection-reverse-scan-detachment-migration.test.ts && pnpm migration:compatibility:check && pnpm --filter @sketchcatch/types typecheck`

Expected: all commands exit 0.

### Task 2: Deletion Preview and Repository Regression

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/aws-connections/aws-connection-service.ts`
- Modify: `apps/api/src/aws-connections/aws-connection-service.test.ts`
- Modify: `apps/api/src/routes/aws-connections.test.ts`

**Interfaces:**
- Consumes: nullable Reverse Engineering connection contract from Task 1.
- Produces: `preservedRecords: { reverseEngineeringScans: number }` in `AwsConnectionDeletionPreviewResponse`.

- [ ] **Step 1: Write failing preview tests**

```ts
assert.deepEqual(preview.preservedRecords, { reverseEngineeringScans: 2 });
```

Add `countReverseEngineeringScans(connectionId): Promise<number>` to the in-memory repository test double and assert the route response exposes the count.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/aws-connections/aws-connection-service.test.ts src/routes/aws-connections.test.ts`

Expected: FAIL because the repository method and response field do not exist.

- [ ] **Step 3: Implement the count and response**

```ts
countReverseEngineeringScans(connectionId: string): Promise<number>;
```

The PostgreSQL repository uses `select({ count: count() })` filtered by `reverseEngineeringScans.awsConnectionId`. `getAwsConnectionDeletionPreview` loads managed resources, deployment blocking state, and the scan count together and returns:

```ts
preservedRecords: { reverseEngineeringScans: reverseEngineeringScanCount }
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/aws-connections/aws-connection-service.test.ts src/routes/aws-connections.test.ts`

Expected: all focused tests pass.

### Task 3: Recoverable Deletion Modal

**Files:**
- Modify: `apps/web/app/dashboard/settings/settings-dashboard-client.tsx`
- Modify: `apps/web/app/dashboard/dashboard-tools.module.css`
- Modify: `apps/web/features/dashboard/aws-connection-settings.test.ts`
- Modify: `apps/web/features/workspace/ReverseEngineeringScanHistoryPanel.tsx`
- Modify: `apps/web/features/workspace/ReverseEngineeringScanHistoryPanel.test.tsx`

**Interfaces:**
- Consumes: `AwsConnectionDeletionPreviewResponse.preservedRecords` and nullable `ReverseEngineeringScan.awsConnectionId`.
- Produces: an inline deletion failure state and the `연결 삭제됨` history label.

- [ ] **Step 1: Write failing Web tests**

Assert the modal contains `보존하는 기록`, `Reverse Engineering 결과`, `삭제가 완료되지 않았습니다. 연결은 유지되었습니다.`, `삭제 중…`, and that the catch path does not call `setDeletionPreview(null)`. Render a scan with `awsConnectionId: null` and assert `연결 삭제됨` is visible.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/dashboard/aws-connection-settings.test.ts features/workspace/ReverseEngineeringScanHistoryPanel.test.tsx`

Expected: FAIL because the new copy and nullable history label do not exist.

- [ ] **Step 3: Implement the modal state and presentation**

Add `deletionErrorMessage` state. Clear it when opening or closing a deletion preview. On DELETE failure keep `deletionPreview`, set the user summary in the modal, and retain retry. Render the preserved scan count and use `actionPending ? "삭제 중…" : ...` for the destructive action. Render `연결 삭제됨` in history when `scan.awsConnectionId === null`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/dashboard/aws-connection-settings.test.ts features/workspace/ReverseEngineeringScanHistoryPanel.test.tsx`

Expected: all focused tests pass.

### Task 4: Full Verification and Harness Records

**Files:**
- Modify: `agent-progress.md`
- Modify: `session-handoff.md` only if unfinished continuation risk remains.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: fresh verification evidence and concise continuation state.

- [ ] **Step 1: Run the original HTTP reproduction against the migrated local database**

Create a disposable user/project/connection/Reverse Engineering scan fixture, call preview then DELETE, and assert HTTP 204. Query the scan and assert it remains with `aws_connection_id IS NULL`; remove only the disposable fixture records afterward.

- [ ] **Step 2: Run required checks**

Run: `pnpm harness:check && pnpm lint && pnpm typecheck && pnpm build`

Expected: all commands exit 0. Report any unrelated failure with its exact command and output.

- [ ] **Step 3: Run cleanup checks**

Run: `rg -n '\[DEBUG-' apps packages || true && git diff --check && pnpm harness:check`

Expected: no debug instrumentation, no whitespace errors, final harness pass.

- [ ] **Step 4: Update `agent-progress.md`**

Record the root cause, changed deletion contract, focused and full verification commands, migration number, cloud-mutation boundary, known risks, and next action in concise English.
