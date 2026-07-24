# Template Node Labels English-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용 가능한 29개 Template의 Resource 199개와 presentation node 16개 이름을 자연스러운 영어로 통일한다.

**Architecture:** 기존 authored `DiagramNode.label`만 직접 수정하고 Materializer, Terraform identity, AWS-side name과 구조는 유지한다. 하나의 materialized Template 계약 테스트가 29개 전체 node label을 검사하며, 생성된 Board 캡처와 hash·Compiler artifact는 최종 영어 Diagram에 맞춰 갱신한다.

**Tech Stack:** TypeScript, Node test runner, React/Next.js Template library, Terraform CLI, headless Chrome Board capture

## Global Constraints

- 직접 제작 Template 6개와 수집에 성공한 Brainboard Template 23개를 변경한다.
- Resource와 presentation node의 `label`에 한글이 남아서는 안 된다.
- Template 제목, 설명, 태그와 일반 UI 문구는 변경하지 않는다.
- AWS와 Kubernetes의 공식 명칭 및 VPC, IAM, EKS, ECS, ALB, S3, Lambda 같은 약어를 유지한다.
- 역할과 위치를 짧고 자연스러운 영어로 표현한다.
- Resource 수, 관계, Terraform identity, AWS-side name, parameter, node id, 위치, 크기, containment와 routing을 변경하지 않는다.
- 런타임 번역 맵, 자동 이름 생성기와 Resource catalog 이름 변경을 추가하지 않는다.
- 수집 실패 Template `brainboard-aws-instance-db-multiple-networks`는 제외한다.
- 다른 작업자의 dirty worktree 변경을 stage하거나 수정하지 않는다.

---

### Task 1: English-only Materialized Label Contract

**Files:**
- Modify: `apps/web/features/resource-settings/palette-backed-template-resources.test.ts`

**Interfaces:**
- Consumes: `listBoardTemplates()`와 `isBoardTemplateAvailable()`
- Produces: 사용 가능한 29개 Template의 모든 materialized node label에서 한글을 금지하는 회귀 계약

- [ ] **Step 1: Write the failing test**

`palette-backed-template-resources.test.ts`에 다음 테스트를 추가한다.

```ts
test("모든 available Template node 이름은 영어만 사용한다", () => {
  const koreanLabelNodes = listBoardTemplates()
    .filter(isBoardTemplateAvailable)
    .flatMap((template) =>
      template.diagramJson.nodes
        .filter((node) => /[가-힣]/.test(node.label))
        .map((node) => `${template.id}/${node.id}: ${node.label}`)
    );

  assert.deepEqual(koreanLabelNodes, []);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/palette-backed-template-resources.test.ts
```

Expected: FAIL. 출력에는 현재 한국어 이름을 가진 Resource 199개와 presentation node 16개가 포함된다.

- [ ] **Step 3: Commit the failing contract**

```bash
git add apps/web/features/resource-settings/palette-backed-template-resources.test.ts
git commit -m "Test: Template node 이름 영문 계약 추가"
```

### Task 2: Direct Template Labels

**Files:**
- Modify: `packages/types/src/template-definitions.ts`
- Modify: `packages/types/src/template-layout-contract.test.ts`

**Interfaces:**
- Consumes: `templateDefinitions`, `TEMPLATE_PRESENTATION_LAYOUTS`
- Produces: 직접 제작 Template 6개의 영어 Resource 및 presentation label

- [ ] **Step 1: Replace direct Template labels only**

`template-definitions.ts`의 한국어 node label을 AWS 용어를 유지한 영어 이름으로 직접 교체한다. 대표 계약은 다음과 같다.

```text
"정적 웹 S3 Bucket" -> "Static Website S3 Bucket"
"Lambda Proxy 연결" -> "Lambda Proxy Integration"
"애플리케이션 Private Subnet A" -> "Application Private Subnet A"
"ECS Task 실행 권한 연결" -> "ECS Task Execution Policy Attachment"
"애플리케이션 Kubernetes Namespace" -> "Application Kubernetes Namespace"
```

presentation label도 같은 파일에서 바꾼다.

```text
"웹 사용자" -> "Web User"
```

값 객체, resource id, Terraform type/name, 위치와 relationship은 수정하지 않는다.

- [ ] **Step 2: Update direct semantic hashes**

`template-layout-contract.test.ts`의 `EXPECTED_SEMANTIC_HASHES`에서 영어 label 때문에 변경된 6개 hash만 현재 `createSemanticHash()` 결과로 교체한다. layout, routing, viewport 기대값은 수정하지 않는다.

- [ ] **Step 3: Verify direct Templates**

Run:

```bash
pnpm --filter @sketchcatch/types test
```

Expected: 63/63 PASS.

Run a read-only projection over `REPOSITORY_TEMPLATE_IDS` and assert `/[가-힣]/` matches zero node labels. The full 29-Template contract remains RED because Brainboard labels are not changed yet.

- [ ] **Step 4: Commit direct labels**

```bash
git add packages/types/src/template-definitions.ts packages/types/src/template-layout-contract.test.ts
git commit -m "Fix: 직접 제작 Template node 이름 영문 통일"
```

### Task 3: Brainboard Network and Compute Labels

**Files:**
- Modify: `packages/types/src/brainboard-templates/sources/aws-asg-load-balancer-vpc.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-bastion.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-cost-monitoring.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-dashcam-video-processing.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-ecs-fargate.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-elastic-beanstalk.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-fsx.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-iam-users.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-jenkins-ec2.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-kubernetes-native-cnis.ts`

**Interfaces:**
- Consumes: Brainboard authored source `diagramJson.nodes[].label`
- Produces: 위 10개 source의 영어 Resource 및 presentation label

- [ ] **Step 1: Translate authored labels in place**

각 source에서 한국어가 포함된 `label` 문자열만 바꾼다. 공식 Resource type과 역할을 함께 사용한다.

```ts
"웹 VPC" -> "Web VPC"
"Bastion Route 연결" -> "Route Table Association - Bastion"
"전체 월간 비용 Budget" -> "Total Monthly Cost Budget"
"영상 처리 ECS Cluster" -> "Video Processing ECS Cluster"
"ECS Task 실행 권한 연결" -> "ECS Task Execution Policy Attachment"
"PostgreSQL 연결 로그 설정" -> "PostgreSQL Connection Log Parameter Group"
"MFA 필수 IAM Policy" -> "MFA Required IAM Policy"
"ALB HTTPS 인바운드 허용" -> "Security Group Rule - ALB HTTPS Ingress"
"ECR 읽기 권한 연결" -> "ECR Read Policy Attachment"
```

presentation label도 포함한다. 예: `승인된 사용자`는 `Approved User`, 환경이나 계정 Group은 자연스러운 영어 제목을 사용한다.

- [ ] **Step 2: Verify this source group**

Run a materialized Template projection limited to these source IDs and assert no label matches `/[가-힣]/`. Run Brainboard normalization tests:

```bash
pnpm --filter @sketchcatch/types test
```

Expected: 63/63 PASS. Full English-only contract may remain RED only for the second Brainboard group.

- [ ] **Step 3: Commit this source group**

```bash
git add packages/types/src/brainboard-templates/sources/aws-asg-load-balancer-vpc.ts packages/types/src/brainboard-templates/sources/aws-bastion.ts packages/types/src/brainboard-templates/sources/aws-cost-monitoring.ts packages/types/src/brainboard-templates/sources/aws-dashcam-video-processing.ts packages/types/src/brainboard-templates/sources/aws-ecs-fargate.ts packages/types/src/brainboard-templates/sources/aws-elastic-beanstalk.ts packages/types/src/brainboard-templates/sources/aws-fsx.ts packages/types/src/brainboard-templates/sources/aws-iam-users.ts packages/types/src/brainboard-templates/sources/aws-jenkins-ec2.ts packages/types/src/brainboard-templates/sources/aws-kubernetes-native-cnis.ts
git commit -m "Fix: Brainboard 네트워크·컴퓨팅 이름 영문 통일"
```

### Task 4: Remaining Brainboard Labels and GREEN Contract

**Files:**
- Modify: `packages/types/src/brainboard-templates/sources/aws-load-balancer-target-group.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-multi-account-management.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-rds.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-rest-api-documentdb.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-s3-api-gateway.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-secure-s3-bucket.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-serverless-cdn.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-three-tier-database.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-vpc-subnets-security-groups-2az.ts`
- Modify: `packages/types/src/brainboard-templates/sources/cross-account-aws-s3.ts`
- Modify: `packages/types/src/brainboard-templates/sources/training-aws-onboarding.ts`
- Modify: `apps/web/features/resource-settings/palette-backed-template-resources.test.ts`

**Interfaces:**
- Consumes: 나머지 Brainboard authored source labels
- Produces: 29개 전체 materialized Template의 English-only label 계약

- [ ] **Step 1: Translate remaining authored labels in place**

```ts
"애플리케이션 EC2" -> "Application EC2 Instance"
"DocumentDB 자격 증명" -> "DocumentDB Credentials Secret"
"S3 전체 접근 IAM Policy" -> "S3 Full Access IAM Policy"
"보안 S3 Bucket" -> "Secure S3 Bucket"
"웹사이트 CloudFront Distribution" -> "Website CloudFront Distribution"
"웹 Auto Scaling Group" -> "Web Auto Scaling Group"
"계정 간 공유 S3 Bucket" -> "Cross-Account Shared S3 Bucket"
"Cluster API HTTPS 허용" -> "Security Group Rule - Cluster API HTTPS"
```

presentation label `사용자`, `클라이언트`, `웹 EC2 A/B`, `애플리케이션 EC2 A/B`, `Prod 환경`, `Dev 환경`, `Staging 환경`, `AWS 계정`, `변수 기반 사용자 계정`도 영어로 바꾼다.

- [ ] **Step 2: Update exact label expectations**

`palette-backed-template-resources.test.ts`의 Cross-account 기대 배열을 다음으로 바꾼다.

```ts
["Cross-Account Shared S3 Bucket", "prod.txt S3 Object", "test.txt S3 Object"]
```

- [ ] **Step 3: Verify GREEN**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/palette-backed-template-resources.test.ts
```

Expected: 모든 테스트 PASS, 한국어 label violation 0개.

- [ ] **Step 4: Commit remaining labels**

```bash
git add packages/types/src/brainboard-templates/sources/aws-load-balancer-target-group.ts packages/types/src/brainboard-templates/sources/aws-multi-account-management.ts packages/types/src/brainboard-templates/sources/aws-rds.ts packages/types/src/brainboard-templates/sources/aws-rest-api-documentdb.ts packages/types/src/brainboard-templates/sources/aws-s3-api-gateway.ts packages/types/src/brainboard-templates/sources/aws-secure-s3-bucket.ts packages/types/src/brainboard-templates/sources/aws-serverless-cdn.ts packages/types/src/brainboard-templates/sources/aws-three-tier-database.ts packages/types/src/brainboard-templates/sources/aws-vpc-subnets-security-groups-2az.ts packages/types/src/brainboard-templates/sources/cross-account-aws-s3.ts packages/types/src/brainboard-templates/sources/training-aws-onboarding.ts apps/web/features/resource-settings/palette-backed-template-resources.test.ts
git commit -m "Fix: Brainboard 데이터·애플리케이션 이름 영문 통일"
```

### Task 5: Decision Documentation

**Files:**
- Create: `docs/adr/0031-template-node-labels-use-english-only.md`
- Modify: `CONTEXT.md`
- Modify only the matching index line: `docs/adr/README.md`

**Interfaces:**
- Consumes: ADR 0025의 bilingual naming 결정
- Produces: Template node label에 한해 English-only로 대체하는 새 결정

- [ ] **Step 1: Record the superseding ADR**

ADR에는 다음 결정을 명시한다.

```md
# Template Node Label은 영어만 사용

Template에서 최초 생성되는 Resource Display Name과 Architecture Area Title은 영어만 사용한다.
이 결정은 ADR 0025의 한국어 application-role 허용 부분을 대체한다.
Terraform identity, AWS-side name, 구조와 일반 UI 언어는 바꾸지 않는다.
```

- [ ] **Step 2: Update glossary and ADR index**

`CONTEXT.md`의 Resource Display Name과 Architecture Area Title 정의에서 Template initial label은 English-only라고 명시한다. Dirty `docs/adr/README.md`에서는 0031 한 줄만 index에 stage하고 다른 작업자의 줄은 포함하지 않는다.

- [ ] **Step 3: Commit documentation**

```bash
git add CONTEXT.md docs/adr/0031-template-node-labels-use-english-only.md
git commit -m "Docs: Template node 영문 이름 결정 기록"
```

### Task 6: Thumbnail, Hash, and Compiler Artifacts

**Files:**
- Modify: `apps/web/features/resource-settings/template-thumbnail-manifest.ts`
- Modify: `apps/web/features/resource-settings/brainboard-template-thumbnail-manifest.ts`
- Modify: `apps/web/features/architecture-board-compiler/architecture-board-knowledge.generated.ts`
- Modify: `docs/diagram-layout-reference/compiler-evidence-report.json`
- Modify: `docs/diagram-layout-reference/compiler-evidence-review.json`
- Modify: `apps/web/public/template-thumbnails/v1/*.webp`
- Modify: `apps/web/public/template-thumbnails/brainboard/v1/*.webp`

**Interfaces:**
- Consumes: 최종 materialized 29개 English-only `DiagramJson`
- Produces: 현재 Diagram과 일치하는 29개 WebP, hash와 Compiler evidence

- [ ] **Step 1: Update all 29 diagram hashes**

각 available Template에 대해 다음 값을 계산한다.

```ts
createHash("sha256").update(JSON.stringify(template.diagramJson)).digest("hex")
```

직접 제작 6개는 `TEMPLATE_DIAGRAM_HASHES`, Brainboard 23개는 `BRAINBOARD_DIAGRAM_HASHES`에 반영한다. 실패 source-preview 1개는 변경하지 않는다. 전체 검증 결과는 `templates=29 stale=0`이어야 한다.

- [ ] **Step 2: Generate knowledge and evidence**

```bash
pnpm architecture-board-knowledge:generate
pnpm architecture-board-evidence:generate
pnpm architecture-board-evidence-review:generate
```

Expected: 세 artifact가 현재 영어 Diagram fingerprint로 갱신된다.

- [ ] **Step 3: Capture actual Boards**

개발 서버가 `127.0.0.1:3000`에서 실행 중인지 확인한 뒤 실행한다.

```bash
pnpm --config.verify-deps-before-run=false template-thumbnails:generate
```

Expected: 6개 direct와 23개 Brainboard WebP가 1280×720로 생성되고 전체 batch 성공 뒤 교체된다.

- [ ] **Step 4: Verify assets and artifact checks**

```bash
pnpm architecture-board-knowledge:check
pnpm architecture-board-evidence:check
pnpm architecture-board-evidence-review:check
```

Expected: 모두 PASS. WebP 검사는 `BOARD_CAPTURES=29 BAD=0`이어야 한다.

- [ ] **Step 5: Commit generated artifacts**

관련 manifest, generated knowledge/evidence와 29개 versioned WebP만 stage한다.

```bash
git commit -m "Chore: 영어 Template Board 미리보기 동기화"
```

### Task 7: Final Regression and Terraform Validation

**Files:**
- Verify only; source edits are allowed only for failures caused by Tasks 1–6.

**Interfaces:**
- Consumes: English-only Template source and generated artifacts
- Produces: 검증 결과와 clean task-owned diff

- [ ] **Step 1: Run focused regression**

```bash
pnpm --filter @sketchcatch/types test
pnpm --filter @sketchcatch/web exec tsx --test features/architecture-board-compiler/architecture-board-compiler.test.ts features/resource-settings/palette-backed-template-resources.test.ts features/resource-settings/template-thumbnail-diagram.test.ts features/workspace/automatic-diagram-layout.test.ts features/workspace/terraform-sync-proposals.test.ts ../../scripts/generate-template-thumbnails.test.ts
```

Expected: Types 63/63, focused Web tests all PASS.

- [ ] **Step 2: Validate all Terraform Templates**

```bash
pnpm --config.verify-deps-before-run=false templates:validate
```

Expected: 29/29 `terraform init` 및 `terraform validate` PASS. 기존 provider deprecation warning은 실패로 취급하지 않는다.

- [ ] **Step 3: Run repository checks**

```bash
pnpm --config.verify-deps-before-run=false harness:check
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false test
```

Expected: harness, lint, typecheck와 build PASS. Full test가 다른 작업의 기존 실패로 중단되면 정확한 실패와 이번 label 변경의 관련 여부를 분리해 기록한다.

- [ ] **Step 4: Inspect and commit any task-owned correction**

```bash
git diff --check
git status --short
```

Task-owned 파일만 stage한다. 다른 에이전트의 API, AWS access, ADR와 루트 문서 변경은 그대로 둔다.
