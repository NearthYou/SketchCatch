# Project Board 캡처 영속화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every behavior change follows red-green-refactor.

**Goal:** 실제 Workspace Board 캡처가 로컬과 프로덕션에서 안정적으로 저장되고 Dashboard 프로젝트 카드에 표시되게 한다.

**Architecture:** API는 provider-neutral `ProjectAssetStorage` 뒤에서 development filesystem과 production S3를 선택한다. Web은 정확한 ReactFlow element가 준비된 뒤 server draft의 thumbnail을 보충하고, server save 뒤 capture를 기다린다. Dashboard는 짧은 bounded retry로 upload/navigation 경합을 흡수한다.

**Tech Stack:** Fastify, Drizzle, AWS SDK v3, Node filesystem, React 19, Next.js 16, html-to-image, Node test runner

## Global Constraints

- 실제 `data-architecture-board-capture-source="true"` Board DOM만 캡처한다.
- 합성 SVG, draft 기반 가짜 preview, placeholder image를 만들지 않는다.
- production은 S3 fail-closed, development/test는 filesystem 기본값이다.
- Project asset route와 Project 삭제는 동일한 storage adapter를 사용한다.
- draft 저장 성공과 thumbnail 실패를 의미상 분리하되 실패를 숨기지 않는다.
- server draft가 없는 local/empty Board는 최초 server save 전에 canonical thumbnail을 만들지 않는다.
- Dashboard retry는 bounded이며 무한 polling을 하지 않는다.
- DB schema와 migration은 변경하지 않는다.

---

### Task 1: Provider-neutral Project asset storage

**Files:**
- Create: `apps/api/src/projects/project-asset-storage.ts`
- Create: `apps/api/src/projects/filesystem-project-asset-storage.ts`
- Create: `apps/api/src/projects/filesystem-project-asset-storage.test.ts`
- Create: `apps/api/src/projects/s3-project-asset-storage.ts`
- Create: `apps/api/src/projects/project-asset-storage-factory.ts`
- Create: `apps/api/src/projects/project-asset-storage-factory.test.ts`
- Modify: `apps/api/src/routes/projects.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/config/env.test.ts`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `docs/development.md`

- [x] Write failing adapter and factory tests for round-trip, exact size, path safety, symlink safety, atomic cleanup, delete cleanup, environment selection, and production fail-closed.
- [x] Run the focused tests and confirm RED.
- [x] Implement the provider-neutral interface, filesystem/S3 adapters, and environment factory.
- [x] Register one adapter per Project route registration and reuse it for upload, read, confirm, abort, thumbnail prune, and default Project deletion.
- [x] Remove route-level `bucketName`, `requireS3BucketName`, AWS command imports, and dead `createUploadUrl` coupling.
- [x] Document local root/backend variables and ignore `.local-data`.
- [x] Run focused API tests, typecheck, lint, and `git diff --check`.

### Task 2: Actual Board capture lifecycle

**Files:**
- Modify: `apps/web/features/diagram-editor/types.ts`
- Modify: `apps/web/features/diagram-editor/DiagramEditor.tsx`
- Modify: `apps/web/features/diagram-editor/WorkspaceProjectBar.tsx`
- Modify: `apps/web/features/workspace/project-board-thumbnail.ts`
- Modify: `apps/web/features/workspace/project-board-thumbnail.test.ts`
- Create: `apps/web/features/workspace/project-board-thumbnail-lifecycle.ts`
- Create: `apps/web/features/workspace/project-board-thumbnail-lifecycle.test.ts`
- Modify: `apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx`
- Modify: `apps/web/features/workspace/project-board-thumbnail-save-trigger.test.ts`
- Modify: `apps/web/features/workspace/workspace.module.css`

- [x] Write failing tests for exact Board element delivery, initial server+missing backfill, existing thumbnail skip, local/empty deferral, awaited stable save capture, failure state/retry, same-project serialization, and Dashboard navigation waiting.
- [x] Run focused tests and confirm RED.
- [x] Add `onBoardReady` without changing DiagramJson or `onDiagramChange` semantics.
- [x] Allow the capture service to receive the exact connected element and retain latest-element serialization.
- [x] Add a small lifecycle coordinator that checks/backfills only server drafts, exposes failure/retry, and disposes safely.
- [x] Await capture after stable server save while preserving draft success independently.
- [x] Await the save/capture path for normal Dashboard link navigation.
- [x] Show only a compact failure/retry control; keep normal UI unchanged.
- [x] Run focused Web tests, typecheck, lint, and `git diff --check`.

### Task 3: Dashboard bounded thumbnail refresh

**Files:**
- Modify: `apps/web/components/dashboard/project-architecture-thumbnail.tsx`
- Create: `apps/web/features/dashboard/project-thumbnail-loader.ts`
- Create: `apps/web/features/dashboard/project-thumbnail-loader.test.ts`
- Create: `apps/web/features/dashboard/project-thumbnail-image-lifecycle.ts`
- Create: `apps/web/features/dashboard/project-thumbnail-image-lifecycle.test.ts`
- Modify: `apps/web/features/dashboard/project-architecture-thumbnail.test.ts`
- Modify: `apps/web/features/workspace/api.ts`
- Modify: `apps/web/features/workspace/api.test.ts`

- [x] Write failing tests for bounded missing/transient retry, permanent-error stop, eventual success, final empty/error state, cancellation, stale completion, and object URL cleanup.
- [x] Run focused tests and confirm RED.
- [x] Implement a dependency-injected bounded loader with short fixed retry delays, no interval polling, and no retry for permanent HTTP failures.
- [x] Connect the Dashboard card component through an object-URL lifecycle while keeping the existing captured raster image component.
- [x] Run focused and full Web tests, typecheck, lint, and `git diff --check`.

### Task 4: Integrated verification and branch handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-project-board-thumbnail-persistence.md`
- Modify: `agent-progress.md`

- [x] Run all API/Web tests affected by Project assets and Workspace persistence.
- [x] Run repository test, typecheck, lint, harness, migration compatibility check, and `git diff --check`.
- [x] Exercise one real local thumbnail PUT→GET flow without AWS credentials when the local app is available.
- [x] Review the complete branch diff for security, concurrency, cleanup, and scope.
- [ ] Commit and push the implementation to the existing feature branch/PR.
