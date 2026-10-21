# Reverse Engineering Terraform Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 AWS 인프라를 보드에 복원하고, 사용자가 적용한 리소스를 Terraform import를 거쳐 같은 인프라로 안전하게 수정·배포한다.

**Architecture:** 저장된 Reverse Engineering scan을 서버의 신뢰 원본으로 사용한다. 프로젝트 적용 시 각 node에 scan ownership만 남기고, Terraform artifact를 만들 때 서버가 scan의 ready import suggestion과 현재 node identity를 다시 결합해 Terraform `import` block을 생성한다. 기존 deployment plan, 승인, apply 경계는 유지하며 최초 import plan의 delete와 replace를 차단한다.

**Tech Stack:** TypeScript, Fastify, Drizzle/PostgreSQL, Terraform 1.5+ import blocks, Next.js, Node test runner

## Global Constraints

- 기존 리소스를 import 없이 새 resource로 plan하지 않는다.
- AWS 및 SketchCatch 관리 리소스를 프로젝트 Terraform state로 가져오지 않는다.
- 브라우저가 제출한 provider ARN과 import ID를 신뢰하지 않는다.
- 사용자 승인 전에는 Terraform state와 AWS를 변경하지 않는다.
- 새 리소스 타입은 전용 reader, 설정 정규화, import ID, Terraform validate를 모두 갖춘 뒤 활성화한다.

---

### Task 0: 새 프로젝트 미리보기 원본 보존

**Files:**
- Create: `apps/api/drizzle/0057_reverse_engineering_preview_sources.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/reverse-engineering/reverse-engineering-service.ts`
- Modify: `apps/api/src/routes/reverse-engineering.ts`
- Modify: `apps/api/src/routes/projects.ts`
- Modify: `packages/types/src/index.ts`
- Test: 관련 Reverse Engineering route/service tests

**Interfaces:**
- Produces: 사용자에게 공개하지 않는 raw preview source와 짧게 사는 opaque preview ID
- Consumes: 새 프로젝트 적용 시 preview ID와 공개 보드 선택 결과

- [ ] **Step 1: 실패 테스트 작성** — 다른 사용자의 preview, 만료된 preview, 두 번 적용, 조작된 node 선택을 거부하고 transaction 실패 시 다시 적용할 수 있는지 검증한다.
- [ ] **Step 2: RED 확인** — 기존 저장하지 않는 preview 흐름이 raw AWS 원본을 프로젝트 scan으로 넘기지 못하는지 확인한다.
- [ ] **Step 3: 최소 구현** — raw 결과는 서버 DB에만 저장하고 API 응답은 기존 공개 결과만 반환한다.
- [ ] **Step 4: 원자적 적용** — Project, Draft, Snapshot, completed scan, preview 소비 표시를 한 transaction으로 처리하고 실제 scan/draft ID를 node에 기록한다.
- [ ] **Step 5: GREEN 확인** — ownership, expiry, replay, rollback 회귀 테스트를 통과시킨다.
- [ ] **Step 6: 커밋** — `git commit -m "Feat: Reverse Engineering 원본 적용 보존"`

---

### Task 1: Terraform 관리 가능성 계약

**Files:**
- Create: `apps/api/src/reverse-engineering/reverse-engineering-management-policy.ts`
- Test: `apps/api/src/reverse-engineering/reverse-engineering-management-policy.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `classifyReverseEngineeringManagement(resource): ReverseEngineeringManagementDecision`
- States: `managed`, `reference`, `aws_managed`, `sketchcatch_managed`, `needs_mapping`

- [ ] **Step 1: 실패 테스트 작성** — S3는 `managed`, AMI는 `reference`, service-linked Role은 `aws_managed`, `SketchCatchImport*`는 `sketchcatch_managed`, 일반 UNKNOWN은 `needs_mapping`인지 검증한다.
- [ ] **Step 2: RED 확인** — `pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/reverse-engineering-management-policy.test.ts`
- [ ] **Step 3: 최소 구현** — provider type, 공개 config의 ownership 값, 안전한 이름 prefix만 사용한 결정론적 분류기를 만든다.
- [ ] **Step 4: GREEN 확인** — 같은 테스트가 모두 통과하는지 확인한다.
- [ ] **Step 5: 커밋** — `git commit -m "Feat: Reverse Engineering 관리 경계 추가"`

### Task 2: 저장된 scan 기반 import 대상 검증

**Files:**
- Create: `apps/api/src/reverse-engineering/reverse-engineering-import-targets.ts`
- Test: `apps/api/src/reverse-engineering/reverse-engineering-import-targets.test.ts`
- Modify: `apps/api/src/reverse-engineering/reverse-engineering-service.ts`

**Interfaces:**
- Consumes: node config의 `reverseEngineeringSourceScanId`, `reverseEngineeringDraftId`
- Produces: `resolveVerifiedImportTargets({ projectId, diagramJson }): VerifiedTerraformImportTarget[]`

- [ ] **Step 1: 실패 테스트 작성** — 다른 프로젝트 scan, 다른 draft, 보호 리소스, stale node, browser가 조작한 import ID를 거부하고 같은 프로젝트의 ready suggestion만 반환하는지 검증한다.
- [ ] **Step 2: RED 확인** — 대상 단위 테스트를 실행해 resolver 부재로 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — 기존 `ReverseEngineeringRepository.findAccessibleScan`으로 scan JSONB를 읽어 node source ownership과 교차 검증한다.
- [ ] **Step 4: GREEN 확인** — resolver 단위 테스트를 통과시킨다.
- [ ] **Step 5: 커밋** — `git commit -m "Feat: Reverse Engineering import 대상 검증"`

### Task 3: Terraform import block artifact

**Files:**
- Create: `apps/api/src/services/terraform/terraform-import-blocks.ts`
- Test: `apps/api/src/services/terraform/terraform-import-blocks.test.ts`
- Modify: `apps/api/src/routes/terraform.ts`
- Modify: `apps/api/src/deployments/deployment-plan-service.ts`

**Interfaces:**
- Consumes: `VerifiedTerraformImportTarget[]`
- Produces: 별도 `imports.tf` 파일과 canonical artifact fingerprint

- [ ] **Step 1: 실패 테스트 작성** — `import { to = aws_s3_bucket.example id = "bucket" }` 형식, 중복 주소 거부, 문자열 escaping, data source 제외를 검증한다.
- [ ] **Step 2: RED 확인** — import block 생성 테스트가 함수 부재로 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — HCL 문자열 escape와 주소 allowlist를 가진 순수 생성기를 만든다.
- [ ] **Step 4: plan service 연결** — main Terraform bundle과 `imports.tf`가 같은 artifact 검증·승인 해시에 포함되게 한다.
- [ ] **Step 5: GREEN 확인** — Terraform preview 및 deployment plan 회귀 테스트를 통과시킨다.
- [ ] **Step 6: 커밋** — `git commit -m "Feat: 기존 AWS Terraform import plan 추가"`

### Task 4: 최초 import plan 안전 게이트

**Files:**
- Modify: `apps/api/src/deployments/deployment-plan-service.ts`
- Modify: `apps/api/src/deployments/deployment-safety-gate.ts`
- Test: `apps/api/src/deployments/deployment-plan-service.test.ts`
- Test: `apps/api/src/deployments/deployment-safety-gate.test.ts`

**Interfaces:**
- Consumes: Terraform show JSON의 import, create, update, replace, delete actions
- Produces: import 요약과 차단 사유

- [ ] **Step 1: 실패 테스트 작성** — import-only와 import+update는 승인 후보, 최초 import의 replace/delete/create collision은 차단되는지 검증한다.
- [ ] **Step 2: RED 확인** — 기존 safety gate가 import 위험을 구분하지 못해 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — import 대상 주소별 action을 분석하고 위험 action을 blocker로 만든다.
- [ ] **Step 4: GREEN 확인** — plan, approval, apply 회귀 테스트를 통과시킨다.
- [ ] **Step 5: 커밋** — `git commit -m "Fix: 기존 AWS import 변경 안전 차단"`

### Task 5: 리소스별 관리 지원

**Files:**
- Modify: `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.ts`
- Modify: `apps/api/src/reverse-engineering/aws-provider-adapter.ts`
- Test: `apps/api/src/reverse-engineering/aws-provider-adapter.test.ts`
- Test: `apps/api/src/services/terraform/terraform-preview.test.ts`

**Interfaces:**
- Produces: type별 완전한 read config, stable import ID, Terraform-ready config

- [ ] **Step 1: CloudWatch Log Group** — name, retention, KMS, class를 정규화하고 import 후 validate한다.
- [ ] **Step 2: CloudWatch Alarm** — dimensions와 metric block을 정규화하고 import 후 validate한다.
- [ ] **Step 3: IAM** — customer Role/Policy/Profile의 전체 문서와 관계를 읽고 AWS/SketchCatch 소유 대상을 제외한다.
- [ ] **Step 4: Lambda** — code source, role, runtime, handler, layers, environment의 비밀값 경계를 정하고 Function/Permission을 import한다.
- [ ] **Step 5: API Gateway** — API, resource, method, integration, stage를 하나의 관계 그래프로 읽고 import한다.
- [ ] **Step 6: KMS/EventBridge** — customer-managed Key만 고위험 승인으로 다루고 Rule/Target을 import한다.
- [ ] **Step 7: 커밋** — 리소스 묶음마다 독립 커밋을 만든다.

### Task 6: 실제 import와 수정 배포 검증

**Files:**
- Create: `apps/api/src/services/terraform/reverse-engineering-import-validation.ts`
- Test: `apps/api/src/services/terraform/reverse-engineering-import-validation.test.ts`
- Modify: `docs/agent-progress.md`

**Interfaces:**
- Consumes: disposable AWS fixture와 generated Terraform bundle
- Produces: import plan, no-op plan, single-field update plan evidence

- [ ] **Step 1: disposable fixture 생성** — 테스트 전용 S3와 Log Group을 만들고 scan한다.
- [ ] **Step 2: import plan 확인** — create가 아니라 import action인지 확인한다.
- [ ] **Step 3: import apply 후 no-op 확인** — 같은 보드의 두 번째 plan이 변경 없음인지 확인한다.
- [ ] **Step 4: 보드 수정 확인** — retention 같은 한 필드 변경이 update 하나만 만드는지 확인한다.
- [ ] **Step 5: 전체 검증** — API/Web test, lint, typecheck, build, harness를 실행한다.
- [ ] **Step 6: 커밋** — `git commit -m "Test: Reverse Engineering import 배포 검증"`
