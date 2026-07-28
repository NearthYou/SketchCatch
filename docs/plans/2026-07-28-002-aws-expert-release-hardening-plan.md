---
title: AWS 숙련자용 출시 안정화 - Plan
type: fix
date: 2026-07-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
deepened: 2026-07-28
---

# AWS 숙련자용 출시 안정화 - Plan

## Goal Capsule

- 목표: 이미 구현된 AWS 설계 경로를 출시 가능한 수준으로 좁히고, 임시 데모, 허위값, 미완성 실행 기능을 제거한다. 숙련된 AWS 사용자가 요구사항, Repository, 기존 AWS 구조 중 하나에서 시작해 Architecture Board를 다듬고, 근거가 보이는 추천값으로 Terraform을 검증한 뒤 GitHub PR과 사용자 소유 CI/CD로 넘기는 흐름을 완성한다.
- 권위 순서: 이 대화에서 확정한 단기 범위가 최우선이다. 그다음은 이 계획, 현재 canonical 문서, 코드 순서다. 기존 문서의 multi-cloud와 managed deployment 설명이 충돌하면 이번 출시에서는 이 계획을 따른다.
- 실행 기준: release-dev를 최신 검토된 origin/dev SHA에서 만든 뒤, GitHub Issue에 연결된 프로젝트 규칙형 브랜치를 release-dev 기준으로 순차 생성한다. 브랜치 이름에는 codex 접두사를 쓰지 않는다.
- 작업 공간: 현재 사용자 작업 폴더와 미커밋 변경을 건드리지 않는 sibling git worktree에서만 구현한다.
- 병합 기준: 각 이슈 PR은 release-dev로만 병합한다. dev와 main에는 직접 push하거나 merge하지 않는다.
- 배포 책임: 기존 .github/workflows/deploy-ecs.yml이 SketchCatch 자체 서비스 배포의 유일한 경로다. 최종 검증을 통과한 release-dev의 정확한 SHA를 사용자가 승인한 뒤 수동 배포한다.
- 중단 조건:
  - SketchCatch가 사용자 AWS 계정의 write, create, update, delete, PassRole 권한을 가져야 하는 설계가 필요해지면 중단한다.
  - 장기 AWS access key, GitHub token, Terraform 민감 Plan을 SketchCatch DB나 로그에 저장해야 하면 중단한다.
  - native password 계정 제거 전 production에 실제 사용 계정이 발견되면 계정을 잠그지 말고 사용자에게 전환 정책을 요청한다.
  - DB migration이 불가피해져 번호를 정해야 하면 AGENTS.md의 DB migration 경고 절차를 먼저 수행한다.
  - 유료 AWS API, Bedrock 호출, 실제 리소스 생성, 변경, 삭제가 필요한 acceptance는 예상 호출과 영향을 제시하고 사용자 승인 전에는 실행하지 않는다.
  - 현재 작업 폴더의 agent-progress.md 또는 docs/service-specification.md를 덮어써야 하는 상황이면 중단하고 충돌 해결 방향을 요청한다.

## Product Contract

### Summary

출시 제품은 AWS 아키텍처 설계와 Terraform PR handoff에 집중한다. SketchCatch는 사용자 대신 인프라를 배포하지 않는다. 사용자가 모르는 값을 임의의 sample ID나 ARN으로 채우지 않고, 안전한 기본값, 추천값, 필수 입력, 리소스 참조를 구분해 보여준다. 실제 AWS 계정 접근은 Reverse Engineering을 위한 AssumeRole read session으로만 제한한다. 실제 Terraform Plan, Apply, Destroy는 사용자의 GitHub Actions와 AWS OIDC 역할에서 수행한다.

### Problem Frame

현재 구현은 기능 수는 많지만 출시 경계가 모호하다.

- managed deployment는 두 demo profile과 check-in sample application 계약에 묶여 있다.
- AI, Voice, deep scan 일부가 인증, 소유권, 공유 quota 없이 외부 provider를 호출한다.
- template과 module 일부가 sample ARN, subnet, security group, 공개 CIDR, no-op workload를 실제 입력처럼 사용한다.
- Cost Explorer 실패가 sample 비용으로 바뀌고, 총비용은 resource estimate와 모순된다.
- GitHub CI/CD handoff가 먼저 성공한 직접 배포와 broad AWS role mutation을 요구한다.
- AWS 연결은 AssumeRole과 External ID를 쓰지만 연결 템플릿 자체는 ec2:*, s3:*, 광범위한 IAM과 PassRole을 가진 실행 역할이다.
- 화면에는 Template, Cost, Direct Deployment, Live Observation처럼 이번 출시에서 끝까지 신뢰할 수 없는 선택지가 남아 있다.

이번 작업은 이 문제를 새 기능으로 덮지 않는다. 신뢰할 수 있는 경로만 남기고 각 단계의 입력, 권한, 실패, 증거를 사실대로 만든다.

### Actors

- A1. AWS 숙련 사용자: 아키텍처와 Terraform을 검토하고, 추천값을 수정하며, 자신의 Repository와 CI/CD에서 실행을 승인한다.
- A2. SketchCatch release operator: release-dev의 검증 증거를 확인하고 정확한 SHA만 기존 ECS production workflow로 배포한다.
- A3. GitHub Actions runner: 사용자의 Repository에서 OIDC로 AWS 역할을 받아 Terraform Plan, 승인된 Apply, 승인된 Destroy를 실행한다.
- A4. SketchCatch AI assistant: 제안, 패치 미리보기, Terraform 설명만 수행하며 사용자 프로젝트나 Git 상태를 직접 변경하지 않는다.

### Requirements

#### 출시 표면과 사실성

- R1. 출시 경로는 텍스트 요구사항, GitHub Repository, 기존 AWS 구조의 세 시작점과 Architecture Board, Terraform 검증, GitHub PR handoff로 제한한다.
- R2. Direct Deployment, managed Apply/Destroy, Deployment History와 Auto Cleanup, deployment notification, Live Observation, Cost dashboard, Voice, broad Template gallery, pre-deployment deep scan과 design simulation, demo application release, AWS import/adopt, CodeConnection build environment, automatic Repository settings와 AWS role diff apply 기능은 UI, public API, runtime route registration에서 제거되어야 한다.
- R3. 출시 시점의 AWS region 지원은 ap-northeast-2로 명시한다. 다른 region을 암묵적으로 허용하거나 sample template 값으로 섞지 않는다.
- R4. provider 장애, 분석 불가, 지원하지 않는 resource는 unavailable, partial, unsupported 중 하나로 표시한다. 성공, 비용 0, sample 결과로 위장하지 않는다.

#### 인증, 권한, 데이터 보호

- R5. 유지되는 모든 API는 active user 인증을 요구하고, projectId나 artifact ID를 받는 API는 provider 호출이나 저장소 조회 전에 project ownership을 확인한다.
- R6. 다른 사용자의 project, scan, source repository, Terraform artifact, AI 결과, CI handoff 접근은 존재 여부를 노출하지 않는 404로 끝나며 외부 provider 호출이 발생하지 않아야 한다.
- R7. 비용이 발생하거나 외부 시스템을 호출하는 요청은 user, IP, operation 기준의 shared quota를 통과해야 한다. production Redis가 없거나 일관된 limiter를 사용할 수 없으면 provider 호출 전에 503으로 실패한다.
- R8. native signup과 미완성 password reset은 출시 표면에서 제거하고 OAuth session만 신규 진입점으로 사용한다. 실제 native 계정이 확인되면 계정 전환 결정을 받기 전까지 로그인 제거를 보류한다.
- R9. SketchCatch의 AWS 연결은 External ID가 있는 AssumeRole과 임시 session credential만 사용한다. 연결 역할은 검증된 read action allowlist만 가지며, 매 AssumeRole에는 SketchCatch가 생성한 compact inline session policy를 전달해 사용자 계정에서 변경 가능한 role policy보다 독립적인 권한 상한을 둔다. exact action 정책이 STS 2,048자 제한을 넘으면 service family별 session으로 나누고 mutable customer managed policy ARN만을 상한으로 사용하지 않는다.
- R10. GitHub App installation token은 작업 대상 Repository와 작업별 최소 permission으로 발급하고 memory에서만 사용한다. App private key와 token은 응답, 로그, screenshot, artifact에 포함하지 않는다.
- R11. production CORS는 단일 검증된 public origin만 허용한다. cookie 기반 상태 변경 route는 CSRF token과 Origin 또는 Fetch Metadata 검증을 함께 통과해야 한다.
- R12. 입력 크기, URL host, Repository path, branch, Terraform file name, archive와 file 수, polling 빈도에 한계를 두고 오류 메시지와 로그를 공통 masking한다.
- R13. Terraform Plan과 state는 민감 정보로 취급한다. raw Plan은 SketchCatch에 저장하거나 commit하지 않고, 사용자 GitHub artifact를 사용해야 할 때도 접근 제한과 짧은 retention을 적용한다. 실제 Plan, Apply, Destroy는 사용자가 미리 만든 암호화, versioning, public access block, state locking이 적용된 S3 backend만 사용하며 SketchCatch는 backend나 장기 credential을 만들거나 보관하지 않는다.

#### 숙련자용 설계와 추천

- R14. 첫 AI 요청 전에 사용자 소유 project shell을 만든다. 요구사항, Repository evidence, reverse scan, AI patch와 Terraform artifact는 모두 같은 project에 귀속된다.
- R15. 각 파라미터는 required, recommended, safe_default, user_provided, dependency_reference, observed 중 하나의 출처와 이유를 표시한다. 값이 없는 상태도 명시적으로 표현한다.
- R16. 추천값은 연결된 resource와 사용자 의도에 따라 세트로 적용할 수 있어야 하며, 사용자는 적용 전 diff와 가정을 보고 개별 값 또는 전체 세트를 거절할 수 있어야 한다.
- R17. 출시 module은 작은 검증 목록으로 제한한다. sample account ID, ARN, subnet ID, security group ID, bucket name, 공개 SSH와 DB CIDR, no-op workload를 포함하지 않는다.
- R18. resource와 module은 board_only, terraform_generate, offline_plan_verified, reverse_read_only, unsupported capability를 구분한다. 현재 evidence보다 높은 수준으로 표시하지 않는다.
- R19. Board 저장, AI patch 적용, Terraform 생성과 검증은 동일한 project revision과 resource identity를 사용한다. stale revision이나 unsupported 구성은 명시적 차단 사유를 반환한다.

#### Repository, Reverse Engineering, CI/CD

- R20. Repository 분석은 사용자가 명시적으로 연결한 GitHub installation과 Repository만 읽는다. 분석 coverage, 선택한 commit SHA, 읽은 파일 수, 생략 수와 이유를 결과에 포함한다.
- R21. Repository 내용은 실행하지 않고 untrusted evidence로 AI에 전달한다. prompt injection, oversized file, symlink, binary, secret-like content는 분석 경계에서 차단하거나 제외한다.
- R22. Reverse Engineering은 project-scoped read scan과 Board 복원만 제공한다. 지원 matrix, 누락 권한, partial coverage를 보여주고 Terraform import, state adoption, AWS mutation을 제공하지 않는다.
- R23. GitHub handoff는 Terraform과 검증 workflow를 사용자 확인 가능한 PR로 만든다. SketchCatch의 성공한 직접 배포나 AWS role diff 자동 적용을 선행 조건으로 삼지 않는다.
- R24. 실제 Terraform Plan은 PR의 GitHub Actions에서 OIDC plan role로 실행한다. Apply와 Destroy는 별도 manual dispatch와 target branch에 포함된 exact commit을 요구한다. Repository visibility와 GitHub plan이 required reviewer를 지원하고 사용자가 설정한 경우 protected Environment approval을 추가로 강제한다. 지원하지 않는 private Repository는 typed confirmation과 exact Plan hash를 요구하는 single-operator mode로 사실대로 표시하며 독립 승인으로 표현하지 않는다.
- R25. SketchCatch는 GitHub Actions status와 비민감 summary만 읽는다. workflow가 SketchCatch release callback, check-in endpoint, application secret, runtime convergence API에 의존하지 않아야 한다.

#### 품질, 운영, 증거

- R26. 핵심 세 경로는 dead CTA, 중복 저장, 의미 없는 중간 화면 없이 Board와 PR까지 이어져야 한다. keyboard, focus, loading, empty, partial, retry, permission-denied 상태를 포함한다.
- R27. active 화면과 canonical 문서의 깨진 UTF-8 문구를 복구하고 user-facing Korean copy 회귀 검사를 추가한다.
- R28. route, ownership, IAM, GitHub permission, parameter provenance, module validation, Terraform, browser flow, production readiness가 자동 또는 재현 가능한 검증으로 남아야 한다.
- R29. 제거하거나 보류한 기능은 이유, 재개 전제조건, 완료 조건을 deferred ledger에 남긴다.
- R30. 구현은 release-dev 기준 issue branch와 분리 worktree에서 진행하고, live AWS 비용이나 mutation 없이 검증한다. production 배포는 모든 gate를 통과한 exact SHA와 사용자 승인 후에만 수행한다.

### Key Flows

- F1. 텍스트 요구사항: OAuth 로그인 → project shell 생성 → 요구사항 확인 → AI 제안 → 사용자 patch 승인 → Board 저장 → 추천 파라미터 검토 → Terraform 검증 → PR preview → PR 생성.
- F2. Repository 시작: OAuth 로그인 → GitHub App installation 선택 → Repository와 commit 확인 → 제한된 정적 분석 → coverage 확인 → project shell에 evidence 저장 → Board 제안 → F1의 Terraform과 PR 단계.
- F3. 기존 AWS 시작: OAuth 로그인 → read-only connection template 확인 → External ID 역할 생성과 검증 → project shell 생성 → project-scoped scan → partial과 unsupported 확인 → 복원 draft 승인 → F1의 Board와 Terraform 단계.
- F4. CI/CD 실행: PR 생성 → GitHub Actions validation과 real Plan → 사용자가 summary와 code review → merge → manual Apply workflow와 실제 Repository capability에 맞는 human confirmation → 필요할 때 별도 Destroy workflow와 재확인.
- F5. 실패와 복구: provider unavailable, quota 초과, missing permission, unsupported resource, stale revision이 발생하면 마지막 저장 project와 사용자 입력을 유지하고 원인, 영향 범위, 재시도 조건을 보여준다. sample 성공으로 바꾸지 않는다.

### Acceptance Examples

- AE1. 로그인하지 않은 사용자가 유지 AI endpoint를 호출하면 401이고 Bedrock, Amazon Q, GitHub, AWS 호출 count는 0이다. Governs R5, R7.
- AE2. 사용자 B가 사용자 A의 projectId로 AI, scan, Terraform, Repository, handoff API를 호출하면 404이고 DB mutation과 provider 호출은 0이다. Governs R6.
- AE3. production origin 외의 Origin으로 preflight 또는 state-changing 요청을 보내면 Access-Control-Allow-Origin이 없고 요청은 거절된다. 허용 origin의 bearer API와 CSRF 검증 cookie API는 정상 동작한다. Governs R11.
- AE4. AWS connection template과 각 AssumeRole inline session policy에는 해당 reader의 read catalog 외 action이 없다. ec2:*, s3:*, iam:PassRole, Create, Update, Put, Delete 계열 action 검사는 실패해야 하고, 각 serialized session policy는 2,048자를 넘지 않는다. 사용자 계정의 attached policy를 broad policy로 바꾼 fixture에서도 session credential의 write 시도는 거절된다. Governs R9.
- AE5. 기존 broad SketchCatchTerraformExecutionRole 연결은 재검증 필요 상태가 되고 scan을 시작하지 못한다. 새 read role로 재연결한 뒤에만 scan이 열린다. Governs R9, R22.
- AE6. 사용자가 subnet ID를 입력하지 않았는데 module이 subnet-123, sg-123, sample ARN으로 채우지 않는다. dependency reference 선택 또는 required 상태를 보여준다. Governs R15-R17.
- AE7. 공개 ingress가 필요한 module은 443의 명시적 public edge만 추천한다. SSH, RDS, Redis public ingress는 기본값으로 생성되지 않으며 사용자가 직접 추가하면 강한 경고와 diff를 본다. Governs R16-R18.
- AE8. 검증된 file 또는 total byte 한도를 넘는 Repository를 분석하면 결과에 적용한 한도, 읽은 파일, 생략 파일, selection rule과 coverage가 표시된다. 완전 분석으로 표시되지 않는다. Governs R20.
- AE9. Repository README에 AI 지시문이 포함되어도 system instruction이나 user scope를 바꾸지 못하고 evidence text로만 처리된다. Governs R21.
- AE10. Reverse Engineering이 일부 permission에서 AccessDenied를 받으면 가능한 graph는 유지하고 service별 partial 상태를 표시한다. import command와 raw provider identifier, secret value는 응답에 없다. Governs R22.
- AE11. PR handoff token은 exact repository ID와 contents, pull_requests, workflows 중 필요한 permission만 요청한다. Administration, Variables, Environments write는 요청하지 않는다. Governs R10, R23.
- AE12. PR Plan 실패 시 Apply workflow는 열리지 않는다. Apply와 Destroy는 workflow_dispatch, target branch ancestry가 검증된 exact SHA, 동일한 saved Plan hash를 통과해야 하며 SketchCatch API callback이 없어도 실행된다. required reviewer가 실제로 지원되고 설정된 Repository는 protected Environment approval도 통과해야 하고, single-operator mode는 typed confirmation과 축소된 승인 보장을 명시한다. Governs R24, R25.
- AE13. 유지된 AI provider 실패는 unavailable로 보이고 sample 결과로 바뀌지 않는다. 제거된 Cost Explorer UI와 API는 404이고 sample 비용, 총비용 0, 가짜 절감 제안이 표시되지 않는다. Governs R2, R4.
- AE14. 제거된 /dashboard/costs, /dashboard/templates, Direct Deployment, Live Observation, Voice route와 API는 production build에서 404이고 navigation, import graph, API client에 진입점이 없다. Governs R2.
- AE15. Terraform raw Plan이나 sensitive value를 포함한 fixture가 로그, PR comment, screenshot, SketchCatch artifact에 나타나지 않는다. Governs R13.

### Success Criteria

| 지표 | 출시 기준 | 증거 |
| --- | --- | --- |
| 비인증 provider route | 0개 | Fastify route matrix와 provider spy |
| cross-user 성공 | 0건 | 두 사용자 ownership negative suite |
| SketchCatch AWS write action | 0개 | policy snapshot, forbidden action test, Access Analyzer 결과 |
| managed policy drift 뒤 session write | 0건 | broad default-version fixture와 inline session authorization test |
| 장기 AWS와 GitHub credential 저장 | 0건 | schema, log, artifact secret scan |
| release module의 sample ID와 ARN | 0건 | catalog static scan과 module tests |
| release module 검증률 | 공개된 module 100% | compiler, init, validate, mock plan, Trivy evidence |
| 제거 기능의 UI와 API 진입점 | 0개 | route denylist, Next route, navigation, import graph test |
| 핵심 사용자 경로 | F1-F3 각 1회 이상 완주 | sanitized browser QA capture와 timing log |
| 숙련자 판단 효율 | 동일 과제의 재입력과 근거 탐색 시간이 baseline보다 감소하고 유용성 5점 척도 4 이상 | AWS 숙련 사용자 또는 release owner의 무진행자 dogfood 기록 |
| PR workflow 권한 | 선언한 최소 권한만 존재 | generated YAML contract test |
| real Terraform backend | 공개된 Plan workflow 100% preflight 통과 | S3 encryption, versioning, public block, lock와 exact key test |
| approval mode 허위 표시 | 0건 | public protected reviewer와 private single-operator capability test |
| production source drift | 0건 | approved SHA, checkout SHA, image tag, digest manifest contract test |
| 문서와 실제 release surface 불일치 | 0건 | canonical docs review와 release manifest |

실제 수치는 구현 전후 evidence manifest에 함께 기록한다. 최소한 API route 수, 외부 호출 가능 route 수, GitHub App permission 수, AWS IAM action 수, release module 수, 검증 통과 수, dead production file 수, F1-F3 수행 시간과 재입력 횟수를 캡처한다.

### Scope Boundaries

| 분류 | 이번 출시 항목 |
| --- | --- |
| 유지와 완성 | OAuth와 project, 텍스트 요구사항, project-scoped AI 제안, 패치, Terraform 설명, Architecture Board, 추천 파라미터, 소수의 검증 module, Terraform 생성과 검증, GitHub Repository 분석, AWS read-only Reverse Engineering, GitHub PR과 Actions status |
| 제거 | native signup과 password reset, Voice, Cost dashboard와 sample cost, Direct Deployment, managed Apply와 Destroy, Deployment History와 Auto Cleanup, deployment notification, Live Observation, demo check-in application release, broad Template gallery, pre-deployment deep scan과 design simulation, AWS import access manager, CodeConnection build environment, automatic Repository settings와 AWS role diff apply |
| 보존하지만 제품에서 비활성 | 기존 deployment와 handoff DB record, migration history. rollback과 감사 목적의 데이터는 파괴하지 않고 신규 route에서 접근하지 않는다 |
| 명시적 출시 제한 | AWS ap-northeast-2, GitHub App 기반 Repository, Terraform-first, 사용자 소유 CI/CD |
| 보류 | Azure, GCP, AWS multi-region, SketchCatch managed execution, Cost Analysis, Voice, Live Observation, import/adopt, broad marketplace, EKS module, organization RBAC, Passkey, native email verification과 recovery |

## Planning Contract

### Context & Research

#### Repository evidence

- apps/api/src/app.ts는 AI, Deployment, Live Observation, CI/CD release worker, Cost, AWS import, build environment route를 같은 production API에 등록한다.
- apps/api/src/routes/ai.ts는 architecture draft의 일부 분기 외 다수 route가 인증 없이 provider를 호출하며 process-local deep scan map을 갖는다.
- apps/web/features/workspace/api.ts는 AI 호출에 postPublicAiJson을 사용하고, project-scoped API와 public AI API가 혼재한다.
- apps/web/app/workspace/ai/use-ai-start-workflow.ts는 AI draft 승인 시점에야 project를 생성한다.
- apps/api/src/aws-connections/aws-connection-service.ts의 CloudFormation template은 ec2:*, s3:*, 광범위 service action, IAM mutation과 PassRole을 연결 역할에 부여한다.
- apps/api/src/aws-connections/aws-connection-runtime-credentials.ts는 External ID AssumeRole과 임시 credential을 사용한다. 이 패턴은 read-only session에도 재사용할 수 있다.
- apps/api/src/aws-connections/aws-import-access-catalog.ts와 reverse-engineering reader는 List, Describe, Get 기반의 scan catalog를 이미 공유한다.
- apps/api/src/git-cicd/git-cicd-handoff-service.ts는 성공한 direct deployment와 승인된 Apply Plan을 handoff 선행조건으로 요구한다.
- apps/api/src/routes/git-cicd-handoffs.ts는 Repository settings와 AWS role diff를 직접 적용하는 mutation endpoint를 노출한다.
- apps/api/src/source-repositories/github-app-client.ts는 installation token을 짧게 사용하지만 repository_ids와 permission profile로 발급 범위를 축소하지 않는다.
- apps/web/features/resource-settings/curated-module-deployment-defaults.ts는 sample subnet, security group, Lambda role ARN과 공개 API 기본값을 주입한다.
- apps/web/features/resource-settings/template-library.ts는 visual reference와 실제 Terraform capability를 같은 available 상태로 취급한다.
- apps/web/features/diagram-editor/default-parameter-values.ts에는 private RDS, encrypted storage, S3 public block처럼 재사용할 안전한 기본값이 있다.
- apps/api/src/services/terraform에는 generation, diagnostics, Trivy, import projection, artifact integrity를 검증하는 기반과 많은 회귀 테스트가 있다.
- docs/service-specification.md 18절의 PR-001부터 PR-035는 현재 감사 근거다. 이 계획은 해당 문서의 사용자 변경을 재작성하지 않고 실행 범위로 재분류한다.

#### External security authorities

- OWASP API Security Top 10은 object ID를 받는 모든 endpoint의 object-level authorization과 resource consumption 제한을 요구한다. https://owasp.org/API-Security/
- OWASP BOLA 지침은 다른 사용자 object에 대한 negative test를 권한 검증의 핵심으로 본다. https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/
- OWASP CSRF 지침은 cookie 기반 상태 변경에 CSRF token, Origin 또는 Referer, Fetch Metadata와 SameSite를 함께 적용하도록 안내한다. https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Logging 지침은 access token, password, DB URL, encryption key와 secret을 로그에서 제거하거나 masking하도록 요구한다. https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- AWS IAM은 third-party cross-account access에 AssumeRole, temporary credential, External ID를 사용하고 장기 IAM user key를 피하도록 권고한다. https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html
- AWS STS AssumeRole은 inline 또는 같은 account의 managed policy ARN을 session policy로 지정할 수 있고 결과 권한을 role policy와 session policy의 교집합으로 제한한다. inline policy와 policy ARN의 전체 plaintext는 2,048자 제한을 받는다. https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html
- AWS customer managed policy는 새 version을 만들고 default version을 바꿔 operative permission을 변경할 수 있다. 따라서 사용자 account의 managed policy ARN은 drift evidence에는 쓸 수 있지만 SketchCatch가 통제하는 immutable session 상한을 대신하지 못한다. https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-versioning.html
- AWS IAM Access Analyzer policy validation은 syntax, security warning, error를 policy 출시 전에 검사한다. https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html
- GitHub App installation token은 repository와 permission을 더 좁혀 발급할 수 있고 1시간 후 만료된다. https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- GitHub OIDC to AWS는 GitHub secret에 장기 AWS credential을 저장하지 않고 workflow가 temporary credential을 받게 한다. https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws
- GitHub required reviewer protection은 Free, Pro, Team에서 public Repository에만 제공된다. private Repository가 이 기능을 가진다고 가정하지 않고 approval capability를 preflight해야 한다. https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- HashiCorp는 sensitive output을 가려도 Terraform Plan과 state에 sensitive value가 남을 수 있으므로 파일 자체를 민감 artifact로 취급하라고 명시한다. https://developer.hashicorp.com/terraform/language/manage-sensitive-data
- HashiCorp S3 backend는 `use_lockfile = true`로 state locking을 제공하고 bucket versioning을 권고하며 state와 lock object의 exact permission을 구분한다. https://developer.hashicorp.com/terraform/language/backend/s3
- CloudFront custom domain의 ACM certificate는 us-east-1에 있어야 하므로 ap-northeast-2-only release module에서는 default CloudFront domain까지만 지원한다. https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html

### Key Technical Decisions

- KTD1. 이번 release surface는 AWS-only로 고정하고 provider-neutral domain boundary만 보존한다. (session-settled: user-directed — chosen over Azure와 GCP 동시 확장: 짧은 기간에는 이미 동작하는 AWS 경로의 신뢰성이 우선이다.) Governs R1, R3, R30.
- KTD2. 제거 기능은 숨김 feature flag가 아니라 production route registration, navigation, API client, dead import에서 제거한다. 기존 DB record는 파괴하지 않는다. (session-settled: user-approved — chosen over 임시 비노출 처리: 보안 표면과 의미 없는 기능을 실제로 줄이되 rollback 데이터는 보존한다.) Governs R2, R29.
- KTD3. 신규 인증은 OAuth-only로 전환한다. production native 계정 수가 0이라는 read-only evidence를 얻지 못하면 기존 사용자 잠금 방지를 위해 해당 제거만 중단한다. (session-settled: user-approved — chosen over 메일 없는 password reset 유지: 완성되지 않은 복구 흐름을 출시하지 않는다.) Governs R8.
- KTD4. 모든 유지 AI action은 project route 아래로 옮기고 project shell을 provider 호출 전에 만든다. AI는 proposal만 반환하고 Board 변경은 existing user-accepted revision API를 사용한다. (session-settled: user-approved — chosen over 익명 draft와 승인 시 project 생성: ownership과 복구 가능성을 첫 요청부터 확보한다.) Governs R5, R6, R14, R19.
- KTD5. 외부 provider quota는 production Redis를 required dependency로 사용하고 memory fallback을 금지한다. Redis 장애 시 저장 가능한 project state는 유지하되 provider 호출은 503으로 fail closed한다. Governs R7, R12.
- KTD6. 기존 TerraformExecutionRole을 ArchitectureReadRole로 교체한다. 역할에 붙인 connection-scoped read managed policy는 사용자용 baseline과 drift evidence로 유지하되 immutable security boundary로 신뢰하지 않는다. 매 reader operation에는 SketchCatch가 exact read action으로 만든 compact inline session policy를 전달하고, 2,048자를 넘으면 service family별 AssumeRole session으로 분리한다. user-managed policy ARN만 전달하는 fallback은 금지하며 기존 broad role은 자동 사용하지 않고 재연결 대상으로 표시한다. (session-settled: user-approved — chosen over 기존 실행 역할 재사용: AssumeRole credential이 임시여도 역할 자체의 광범위 권한은 허용할 수 없다.) Governs R9, R22.
- KTD7. SketchCatch 안의 Terraform 단계는 generation, format, validate, deterministic diagnostics, Trivy와 mock/offline plan evidence까지다. account-aware real Plan은 사용자 GitHub Actions에서 실행한다. (session-settled: user-directed — chosen over SketchCatch managed Plan과 Apply: Plan은 유지하되 실행 credential과 비용 책임은 사용자 CI 경계에 둔다.) Governs R13, R19, R23, R24.
- KTD8. broad Template gallery를 네 개 이하의 intent module과 capability matrix로 교체한다. Network baseline, private-origin static web, Serverless API, ECS Fargate service를 release 후보로 검증한다. Private PostgreSQL은 resource recommendation만 유지하고 별도 module 공개는 보류한다. (session-settled: user-approved — chosen over 많은 sample template 유지: 사용자가 원하는 값을 모를 때도 안전한 세트와 근거를 제공하는 것이 수량보다 중요하다.) Governs R15-R18.
- KTD9. parameter value와 recommendation provenance를 분리 저장하고 Terraform renderer는 최종 value와 dependency reference만 소비한다. AI confidence나 UI 설명이 Terraform argument로 유출되지 않게 한다. Governs R15, R16, R19.
- KTD10. Repository evidence는 GitHub API의 exact installation, repository, commit에서만 가져오며 prompt와 source text를 untrusted data envelope로 전달한다. public URL fetch와 임의 archive upload는 이번 출시에서 제거한다. Governs R10, R20, R21.
- KTD11. Reverse Engineering은 scan과 Board restore까지만 제공한다. import block, import command, management adoption, import access policy manager는 release contract에서 제외한다. (session-settled: user-approved — chosen over 부분 지원 import 노출: 지원되지 않는 설정을 관리 대상으로 오인시키지 않는다.) Governs R22.
- KTD12. GitHub App permission은 analysis, PR write, status와 approval preflight read의 세 profile로 분리한다. status는 Actions read만, protected reviewer를 검증하는 operation만 Environments read를 추가한다. Administration, Variables, Environments write와 AWS role diff 자동 적용을 제거한다. Governs R10, R20, R23, R25.
- KTD13. generated workflow는 PR Plan과 manual Apply, Destroy를 분리한다. required reviewer를 지원하고 사용자가 설정한 Repository는 GitHub Environment approval을 human boundary로 사용한다. 지원하지 않는 private Repository는 workflow_dispatch actor 한 명의 승인만 보장하는 single-operator mode로 낮추고 typed confirmation, target branch ancestry, exact SHA와 Plan hash를 강제한다. 두 mode를 같은 보안 수준으로 표현하지 않는다. raw tfplan이 필요하면 exact commit에 묶인 1일 이하 private artifact로만 전달한다. Governs R13, R24, R25.
- KTD14. ap-northeast-2 제한을 selector, connection, module capability, Terraform provider 설정에 같은 release constant로 사용한다. multi-region은 숨겨진 hardcode가 아니라 deferred capability다. Governs R3, R18.
- KTD15. 기존 deployment, Live Observation, cost, import record를 제거하는 destructive DB migration은 이번 출시에서 하지 않는다. route와 신규 write를 끊고 legacy lifecycle을 deferred ledger에 남긴다. Governs R2, R29.
- KTD16. blog와 Notion 재료는 제품 기능으로 만들지 않고 sanitized evidence bundle로 남긴다. 실제 결과가 나온 뒤 별도 Codex task가 그림 중심 Notion 글을 작성한다. (session-settled: user-approved — chosen over 구현 중 서술형 글 작성: 문제, 판단, 원인, 수치, 결과를 실제 evidence에 근거하게 한다.) Governs R28-R30.
- KTD17. 사용자 CI의 Terraform state는 사용자가 미리 만든 ap-northeast-2 S3 backend를 사용한다. Terraform 1.10 이상, bucket versioning, server-side encryption, public access block, `use_lockfile = true`를 release contract로 고정하고 backend bucket은 생성 Terraform이 관리하지 않는다. plan role은 해당 state key와 lock에 필요한 최소 S3 write와 대상 인프라 read만 가지며 apply role과 분리한다. Governs R13, R23, R24.

### High-Level Technical Design

아래 구조가 방향을 설명한다. 구체적인 type과 함수 형태는 구현자가 기존 pattern을 조사해 결정한다.

~~~mermaid
flowchart LR
  User["OAuth user"]
  Web["SketchCatch Web"]
  Guard["API auth + project ownership"]
  Project["Project, Draft, Artifact"]
  Quota["Required Redis quota"]
  AI["AI provider adapter"]
  GH["GitHub App exact-repo token"]
  AWSRead["AWS STS read-only session"]
  Board["Architecture Board"]
  Validate["Terraform generate + validate + Trivy"]
  PR["GitHub Pull Request"]
  Plan["GitHub Actions real Plan"]
  Approval["Verified human confirmation mode"]
  Apply["User CI Apply or Destroy"]

  User --> Web
  Web --> Guard
  Guard --> Project
  Guard --> Quota
  Quota --> AI
  Guard --> GH
  Guard --> AWSRead
  Project --> Board
  AI --> Board
  GH --> Board
  AWSRead --> Board
  Board --> Validate
  Validate --> PR
  GH --> PR
  PR --> Plan
  Plan --> Approval
  Approval --> Apply

  AWSRead -. "never write" .-> Apply
  Guard -. "never receives apply credential" .-> Apply
~~~

핵심 신뢰 경계는 다음과 같다.

| 데이터 또는 credential | 허용 위치 | 금지 위치 | 수명 |
| --- | --- | --- | --- |
| SketchCatch access token | Web process memory | localStorage, sessionStorage, URL, log, screenshot | 짧은 JWT 만료 |
| SketchCatch refresh token | raw 값은 HttpOnly cookie, hash만 DB | JavaScript, URL, log, screenshot | 기존 rotation과 revoke 정책 |
| OAuth provider access token | server callback request memory | SketchCatch DB, browser, log, screenshot | profile 조회 직후 폐기 |
| AWS AssumeRole temporary credential | API request memory와 AWS SDK client | DB, response, log, artifact | STS session 최대치보다 짧게 |
| AWS role policy ARN, fingerprint, session-cap contract version | owner-scoped connection contract | 다른 connection의 AssumeRole request | connection lifecycle |
| AWS inline session policy | API request memory에서 reader operation별 생성 | DB, response, log, mutable policy fallback | 해당 AssumeRole request |
| AWS External ID | owner-scoped connection record와 CloudFormation template | public log, screenshot | connection lifecycle |
| GitHub App installation token | single operation memory | DB, localStorage, log | GitHub 발급 만료, 재사용 cache 없음 |
| Requirement와 Repository evidence | owner-scoped project artifact | cross-project cache, provider log | project lifecycle |
| raw Terraform Plan | user GitHub private artifact when unavoidable | SketchCatch DB, PR comment, commit, screenshot | 1일 이하 |
| redacted Plan summary | GitHub job summary와 owner-scoped status read | public endpoint | workflow record lifecycle |

#### Release module contract

module은 아래 contract를 만족한 것만 release catalog에 노출한다. 표의 required input이 해결되지 않으면 Board 편집은 유지하되 Terraform 생성과 PR CTA를 차단한다. recommendation은 적용 전 diff와 비용, 보안 가정을 보여주고 user-provided 값은 다시 덮어쓰지 않는다.

| module | required 또는 dependency reference | recommendation과 safe default | 명시적 intent choice | release 차단 조건 |
| --- | --- | --- | --- | --- |
| Network baseline | 겹치지 않는 VPC CIDR, AZ와 subnet 수 | DNS support, private route table, public subnet의 public IP 자동 할당 끔, flow log 대상은 optional recommendation | NAT 없음, single NAT, AZ별 NAT 중 비용과 가용성 선택 | 기존 network와 CIDR 충돌, region 불일치, 공개 SSH ingress |
| Private-origin static web | project-derived unique bucket name 또는 user-provided name | S3 encryption, versioning, public access block, CloudFront OAC, HTTPS redirect, CloudFront default domain | cache policy와 price class | public S3 origin, sample domain이나 ARN, custom domain 또는 cross-region certificate 입력 |
| Serverless API | version 또는 digest가 고정된 Lambda image URI, memory와 timeout | HTTP API, execution log, 최소 execution role, secret은 value가 아닌 reference | public HTTPS edge 여부와 custom domain | mutable latest tag, placeholder code, secret literal, unsupported runtime dependency |
| ECS Fargate service | digest가 고정된 image URI, container port, health path, VPC와 subnet reference | public IP 끔, read-only root filesystem 가능 여부 추천, validated CPU와 memory pair | desired count, autoscaling, public ALB를 쓰면 443 certificate와 security group reference | no-op image, latest tag, public SSH, unresolved network 또는 certificate |

Private PostgreSQL은 이 표의 release module이 아니다. Board resource recommendation은 private subnet, encryption, deletion protection, backup, final snapshot, secret reference를 제안하지만 independent module acceptance가 끝날 때까지 `terraform_generate`보다 높은 capability를 표시하지 않는다.

### Delivery and Branching Strategy

현재 local과 origin에는 release-dev가 없다. 구현 시작 시 최신 origin/dev를 fetch하고 기준 SHA를 기록한 뒤 release-dev를 만든다. 이미 remote release-dev가 생겼다면 덮어쓰지 않고 사용자에게 기준을 확인한다.

docs/service-specification.md 감사 이슈 #574를 상위 근거로 사용하고, 아래 workstream을 별도 GitHub Issue로 만든다.

1. release surface와 API security
2. expert parameter와 Terraform compiler
3. GitHub Repository와 AWS read-only Reverse Engineering
4. PR과 OIDC CI/CD handoff
5. UX, 문서, release acceptance

각 issue branch는 project naming rule을 따르고 release-dev를 base로 GitHub Development에 연결한다. worktree는 현재 폴더의 sibling directory에 둔다. 한 workstream의 PR과 검증이 끝나 release-dev에 병합된 뒤 다음 branch를 최신 release-dev에서 시작한다. 큰 삭제와 shared app.ts 변경이 여러 branch에서 충돌하지 않게 순차 진행한다.

release-dev의 final SHA는 CI artifact, screenshot manifest, security checklist에 동일하게 기록한다. production deploy는 .github/workflows/deploy-ecs.yml의 workflow_dispatch만 사용한다. infra Terraform Apply, production data migration, 사용자 AWS resource mutation은 이 release deploy에 포함하지 않는다.

### Implementation Constraints

- current dirty files와 사용자 branch를 수정하거나 reset하지 않는다.
- .github/workflows/deploy-ecs.yml, .github/workflows/migrate.yml, .github/workflows/production-infra-plan.yml은 SketchCatch 자체 운영 경계이므로 product CI/CD 삭제 대상이 아니다.
- frontend component에서 AWS SDK, GitHub mutation, Terraform CLI를 실행하지 않는다.
- provider call은 ownership, input validation, quota 검사를 통과한 뒤에만 시작한다.
- error handler는 provider raw error를 user response에 전달하지 않는다.
- recommendation은 안전한 value가 없는 경우 required를 반환한다. placeholder로 통과시키지 않는다.
- release capability는 automated evidence가 있는 수준까지만 올린다.
- 실제 AWS acceptance는 read-only 또는 기존 ECS rollout으로 제한하고 사용자 승인 없는 신규 비용 resource를 만들지 않는다.

### Sequencing

~~~mermaid
flowchart TD
  U1["U1 Release surface"]
  U2["U2 Security foundation"]
  U3["U3 OAuth and project AI"]
  U4["U4 Expert defaults and modules"]
  U5["U5 Board and Terraform truth"]
  U6["U6 Repository and GitHub token"]
  U7["U7 AWS read-only connection"]
  U8["U8 Reverse Engineering"]
  U9["U9 PR and OIDC CI/CD"]
  U10["U10 Flow UX"]
  U11["U11 Cleanup, docs, evidence"]
  U12["U12 Release gates and deploy"]

  U1 --> U2
  U2 --> U3
  U3 --> U4
  U4 --> U5
  U2 --> U6
  U2 --> U7
  U7 --> U8
  U5 --> U9
  U6 --> U9
  U8 --> U10
  U9 --> U10
  U10 --> U11
  U11 --> U12
~~~

## Implementation Units

### Unit Index

| Unit | 제목 | 주요 파일 | 의존 |
| --- | --- | --- | --- |
| U1 | Release surface 고정 | apps/api/src/app.ts, apps/web/components/dashboard/dashboard-shell.tsx | 없음 |
| U2 | 공통 보안 경계 | apps/api/src/auth, apps/api/src/runtime-cache, apps/api/src/config/env.ts | U1 |
| U3 | OAuth와 project-scoped AI | apps/api/src/routes/ai.ts, apps/web/app/workspace/ai | U2 |
| U4 | 추천값과 검증 module | apps/web/features/parameter-input, apps/web/features/resource-settings | U3 |
| U5 | Board와 Terraform 사실성 | apps/api/src/routes/terraform.ts, apps/api/src/services/terraform | U4 |
| U6 | Repository와 GitHub token | apps/api/src/source-repositories, apps/web/app/workspace/repository | U2 |
| U7 | AWS read-only 연결 | apps/api/src/aws-connections, apps/web/app/dashboard/settings | U2 |
| U8 | read-only Reverse Engineering | apps/api/src/reverse-engineering, apps/api/src/routes/reverse-engineering.ts | U7 |
| U9 | PR와 OIDC CI/CD | apps/api/src/git-cicd, apps/web/features/workspace/CicdConsoleScreen.tsx | U5, U6 |
| U10 | 핵심 경로 UX | apps/web/features/workspace, apps/web/app/workspace | U8, U9 |
| U11 | dead code, 문서, evidence | docs, feature_list.json, product dead modules | U10 |
| U12 | release 검증과 rollout | .github/workflows/ci.yml, docs/evidence | U11 |

### U1. Release surface를 allowlist로 고정한다

Goal:

출시하지 않는 기능을 production UI와 API에서 즉시 제거하고, 이후 작업이 다시 노출하지 못하도록 route와 navigation 계약을 만든다.

Requirements:

R1-R4, R30

Files:

- apps/api/src/app.ts
- apps/api/src/app.test.ts
- apps/web/components/dashboard/dashboard-shell.tsx
- apps/web/features/workspace/WorkspaceRightPanel.tsx
- apps/web/features/workspace/DeploymentConsoleShell.tsx
- apps/web/features/workspace/api.ts
- apps/web/app/dashboard/templates
- apps/web/app/dashboard/costs
- apps/web/app/password-reset
- apps/web/app/signup
- apps/api/src/routes의 제거 대상 route tests
- 새 release surface contract test

Approach:

- Fastify production composition에 유지 route만 등록한다. health, OAuth와 session, projects와 drafts, project-scoped AI, source repositories, Terraform, AWS read connection, Reverse Engineering, 단순화한 CI handoff만 허용한다.
- Deployment, application release, Live Observation, public collector, Cost, deployment notification, AWS import access, build environment, GitHub release와 infrastructure callback route를 unregister한다.
- dashboard와 workspace에서 Templates, Costs, Direct Deployment, Live Observation, Voice 진입점과 상태를 제거한다.
- 제거 route는 인증 여부와 관계없이 404가 되게 한다. deprecated payload나 가짜 성공 응답을 남기지 않는다.
- app route snapshot과 frontend navigation contract를 추가해 removed prefix가 다시 나타나면 CI가 실패하게 한다.
- SketchCatch 자체 production workflow 파일과 health/readiness 운영 route는 제거하지 않는다.

Test Scenarios:

- 익명과 인증 사용자 모두 제거 API를 호출하면 404이고 해당 service spy는 호출되지 않는다.
- production app route 목록에 removed prefix가 없고 retained prefix가 모두 존재한다.
- dashboard navigation과 workspace action 목록에 제거 기능 label, href, callback이 없다.
- Next production build에서 제거 page가 route로 생성되지 않는다.
- local dev 전용 /app/dev는 기존 NODE_ENV gate를 유지하고 production에서 접근되지 않는다.

Verification:

- AE14가 자동 test로 통과한다.
- route와 navigation before와 after count가 evidence manifest에 기록된다.

### U2. 인증, ownership, quota, origin, masking을 공통 경계로 만든다

Goal:

각 route가 제각각 인증과 제한을 구현하지 않도록 retained provider action 앞에 재사용 가능한 security boundary를 둔다.

Requirements:

R5-R7, R10-R13

Files:

- apps/api/src/auth/current-user.ts
- apps/api/src/app.ts
- apps/api/src/config/env.ts
- apps/api/src/rate-limit
- apps/api/src/runtime-cache
- apps/api/src/deployments/log-masking.ts 또는 대체 공통 masking module
- apps/api/src/network
- apps/web/lib/api-client.ts
- apps/api/src의 security contract tests

Approach:

- active user 확인, project ownership 확인, request correlation, operation quota를 provider 호출 전 순서로 묶는다.
- project ownership 실패는 기존 ProjectAccessContext pattern처럼 404로 정규화한다.
- AI, GitHub, AWS read operation별 quota key를 user, IP, operation으로 구성한다. production은 shared Redis limiter만 허용하고 memory fallback이면 provider action을 시작하지 않는다.
- production 시작 시 public base URL, Redis, token secret, GitHub App 설정의 필수값과 origin을 검증한다. browser 요청의 Origin은 exact public origin만 허용하고 localhost CORS는 development와 test에서만 허용한다. Origin이 없는 요청은 bearer 기반 non-browser API에서만 허용하며 cookie 상태 변경에서는 거절한다.
- bearer API와 cookie API의 CSRF 차이를 문서화하고 cookie state change에 double-submit token, Origin과 Fetch Metadata 검증을 적용한다.
- body size, path length, pagination, polling과 timeout을 route category별로 제한한다.
- authorization, cookie, AWS credential, GitHub token, provider request ID, Terraform sensitive marker를 공통 sanitizer로 가린다. masking test는 response, structured log, exception chain을 모두 검사한다.

Test Scenarios:

- 두 app instance가 같은 Redis fixture를 사용할 때 quota가 합산되고 restart로 초기화되지 않는다.
- Redis unavailable인 production provider action은 503이고 provider spy는 0회다.
- 악성 Origin, 누락 CSRF, oversized body, invalid branch와 path가 provider 호출 전에 거절된다.
- user A와 user B의 project matrix가 404와 no-side-effect를 검증한다.
- secret corpus가 error cause와 nested metadata에 있어도 log와 response에서 검출되지 않는다.

Verification:

- AE1-AE3, AE15가 통과한다.
- production env validation이 fail-open configuration을 거절한다.

### U3. OAuth-only 진입과 project-scoped AI workflow를 완성한다

Goal:

미완성 native auth와 public AI를 제거하고, AI 제안이 처음부터 사용자 project에 귀속되는 복구 가능한 흐름을 만든다.

Requirements:

R5-R8, R14, R19

Files:

- apps/api/src/routes/auth.ts
- apps/api/src/routes/oauth.ts
- apps/api/src/routes/ai.ts
- apps/api/src/routes/ai-architecture-draft-stream.test.ts
- apps/api/src/services/aiArchitectureDrafts.ts
- apps/api/src/services/aiLlmExplanation.ts
- apps/web/app/login/login-form.tsx
- apps/web/app/workspace/ai/page.tsx
- apps/web/app/workspace/ai/use-ai-start-workflow.ts
- apps/web/features/workspace/WorkspaceAiChatDock.tsx
- apps/web/features/workspace/api.ts
- apps/web/features/workspace/use-browser-voice-input.ts

Approach:

- production native account 수를 read-only로 확인하는 release preflight를 만든다. 0이면 signup, password login, password reset route와 UI를 제거한다. 1개 이상이면 다른 U는 진행하되 auth 제거만 stop condition으로 올린다.
- AI workspace를 WorkspaceAuthGate로 감싸고 prompt 제출 전에 project shell과 requirement draft를 저장한다.
- 유지 endpoint를 project route로 재구성한다. architecture draft와 stream, architecture patch preview, Terraform preview와 error explanation처럼 Board에 실제 연결된 action만 남긴다.
- public source analysis, GitHub draft duplicate, pre-deployment deep scan, design simulation, Voice Transcribe를 제거한다.
- postPublicAiJson을 제거하고 authenticated apiFetch에 projectId와 expected revision을 전달한다.
- AI proposal은 apply하지 않는다. 사용자가 diff를 승인할 때 existing project draft revision API를 사용한다.
- provider failure와 cancellation은 project requirement와 이전 Board를 유지하고 retry 가능한 상태를 보여준다.

Test Scenarios:

- 로그인하지 않은 AI page는 OAuth login으로 이동하고 API provider call은 없다.
- user가 prompt를 제출하면 project가 먼저 저장되고 그 projectId로만 AI가 호출된다.
- project 생성 실패 시 AI가 호출되지 않는다.
- stale expected revision은 patch를 적용하지 않고 현재 revision을 다시 불러오도록 안내한다.
- AI cancellation과 provider failure 뒤 reload해도 requirement와 저장 draft를 복구한다.
- removed AI와 Voice endpoint는 404다.

Verification:

- AE1, AE2와 F1 실패와 복구 시나리오가 통과한다.
- native account preflight 결과와 결정을 release evidence에 기록한다.

### U4. 숙련자용 parameter provenance와 검증 module을 만든다

Goal:

사용자가 값을 몰라도 안전한 세트를 시작점으로 받고, 숙련자는 각 값의 근거와 diff를 빠르게 검토할 수 있게 한다.

Requirements:

R15-R18

Files:

- packages/types/src/index.ts
- apps/web/features/parameter-input/ParameterInputPanel.tsx
- apps/web/features/parameter-input/catalog.ts
- apps/web/features/parameter-input/catalog-overrides.ts
- apps/web/features/parameter-input/validation.ts
- apps/web/features/diagram-editor/default-parameter-values.ts
- apps/web/features/resource-settings/module-catalog.ts
- apps/web/features/resource-settings/curated-module-deployment-defaults.ts
- apps/web/features/resource-settings/template-library.ts
- apps/web/features/architecture-board-compiler/architecture-board-knowledge.ts
- scripts/validate-curated-module-terraform.ts
- 관련 parameter, module, compiler tests

Approach:

- parameter decision metadata에 상태, source, rationale, prerequisite, affected resource를 둔다. value 자체와 provenance를 분리한다.
- 기존 safe default를 재사용하고 위험한 default를 명시적으로 고친다.
  - S3는 public block과 encryption을 켜고 force destroy를 끈다.
  - EC2는 public IP를 끄고 IMDSv2를 요구하며 SSH ingress를 만들지 않는다.
  - RDS는 private, encrypted, deletion protection, backup과 final snapshot을 기본으로 하고 secret reference를 필수로 둔다.
  - security group의 0.0.0.0/0은 사용자가 public edge를 선택한 443에만 허용하고 80은 redirect 선택일 때만 제안한다.
  - NAT Gateway, multi-AZ, high availability처럼 비용과 가용성이 충돌하는 값은 silent default가 아니라 intent choice로 보여준다.
- sample subnet ID, security group ID, account ID, ARN, bucket name을 삭제한다. 생성 resource reference, data source, 또는 required user input으로 대체한다.
- broad template gallery를 release module 목록에서 분리한다. module은 각 capability와 검증 evidence를 가진 경우만 노출한다.
- module 적용 전 affected node, 추가와 변경 parameter, 비용과 보안 가정, unresolved required 값을 diff로 보여준다.
- 개별 override와 전체 세트 거절을 지원하고, user override는 재추천 때 덮어쓰지 않는다.

Test Scenarios:

- 각 release module을 빈 project에 적용하면 fake ID와 unsafe public default가 없다.
- dependency resource가 있으면 reference가 자동 연결되고, 없으면 required로 남는다.
- user-provided value는 AI 재추천과 module 재적용 후에도 유지된다.
- safe default, recommendation, observed scan value가 UI에서 서로 다른 provenance로 표시된다.
- offline_plan_verified가 아닌 module은 PR handoff CTA를 열지 못한다.
- module catalog static scan이 sample, example, placeholder ARN, 0.0.0.0/0의 비허용 사용을 발견하면 실패한다.

Verification:

- AE6, AE7이 통과한다.
- 공개 module 100%가 compiler, init, validate, mock plan, Trivy evidence를 갖는다.

### U5. Board와 Terraform의 project revision, capability, 검증 결과를 일치시킨다

Goal:

Board가 보여주는 구조와 생성 Terraform, validation status, PR artifact가 같은 revision과 capability를 가리키게 한다.

Requirements:

R13, R18, R19, R23

Files:

- apps/api/src/routes/terraform.ts
- apps/api/src/services/terraform/diagram-to-terraform.ts
- apps/api/src/services/terraform/terraform-preview.ts
- apps/api/src/services/terraform/terraform-diagnostics.ts
- apps/api/src/services/terraform/trivy-terraform-scan.ts
- apps/api/src/services/terraform/terraform-artifact-service.ts
- apps/api/src/deployments/terraform-artifact-safety.ts 또는 새 공통 artifact safety 위치
- apps/web/features/architecture-board-compiler
- apps/web/features/workspace의 Terraform panel
- packages/types/src의 Terraform response types
- scripts/terraform-resource-validation-audit.ts

Approach:

- Terraform generate, validate, sync request를 projectId, draft revision, architecture identity에 묶는다.
- renderer는 최종 parameter value와 typed resource reference만 읽고 UI provenance와 reverse scan raw metadata를 출력하지 않는다.
- capability matrix가 unsupported resource나 unresolved required parameter를 발견하면 artifact 생성 전에 resource와 parameter path를 포함한 진단을 반환한다.
- local validation 단계 이름을 Terraform Plan으로 표시하지 않는다. format, init without backend, validate, deterministic diagnostics, Trivy, mock plan을 각각 사실대로 표시한다.
- artifact hash와 source revision을 저장하고 PR handoff가 같은 hash만 사용하게 한다.
- file name과 module path를 allowlist하고 temporary workspace 밖으로 나가는 path를 거절한다.
- raw Terraform 또는 error explanation에 sensitive literal이 있을 때 provider prompt와 response에서 masking한다.

Test Scenarios:

- Board revision이 바뀐 뒤 이전 Terraform artifact로 PR을 만들면 stale conflict가 발생한다.
- unsupported resource와 missing parameter는 구체적인 Board focus target과 함께 차단된다.
- reference는 Terraform expression으로 렌더링되고 sample literal로 변하지 않는다.
- provenance와 observed provider metadata는 Terraform argument에 나타나지 않는다.
- malicious file name과 oversized Terraform input은 workspace 생성 전에 거절된다.
- sensitive variable fixture는 log와 AI explanation payload에서 가려진다.

Verification:

- AE15와 release module validation 기준이 통과한다.
- generated artifact와 Board revision hash가 PR preview에서 일치한다.

### U6. GitHub Repository 분석과 installation token을 exact scope로 제한한다

Goal:

숙련 사용자가 개인과 조직 Repository를 명확히 선택하고, SketchCatch가 필요한 commit evidence만 최소 권한으로 읽게 한다.

Requirements:

R10, R20, R21

Files:

- apps/api/src/source-repositories/github-app-client.ts
- apps/api/src/source-repositories/source-repository-service.ts
- apps/api/src/source-repositories/repository-analysis.ts
- apps/api/src/routes/source-repositories.ts
- apps/api/src/config/github-app-user-authorization-config.ts
- apps/web/app/integrations/github/callback/page.tsx
- apps/web/app/workspace/repository/repository-start-client.tsx
- apps/web/features/workspace/api.ts
- packages/types/src의 Repository analysis types
- GitHub App client, source repository, repository UI tests

Approach:

- Repository를 고르기 전 discovery token은 installation의 Repository 목록을 읽는 Metadata-only 범위로 제한한다. Repository 선택 뒤 token 발급 request에는 exact repository ID와 operation permission profile을 넣는다.
- analysis profile은 exact Repository의 Contents read만, PR profile은 Contents, Pull requests, Workflows의 필요한 write만 요청한다. status profile은 Actions read만 사용하고 protected reviewer preflight operation에서만 Environments read를 별도 요청한다. single-operator mode에는 Environments permission을 요청하지 않는다.
- 여러 installation을 계정 단위 오류로 막지 않고 user가 project별 installation과 Repository를 선택하게 한다. 선택 snapshot을 project source record에 고정한다.
- branch 이름이 아니라 resolved commit SHA를 분석 권위로 사용한다.
- file 후보 수, byte limit, binary, symlink, generated file, secret-like file exclusion을 적용하고 coverage DTO를 추가한다. 현재 코드의 256 KiB per-file과 2 MiB total ceiling을 초기 검증 기준으로 중앙화하고, 고정된 24-file 같은 demo 개수 대신 byte budget과 deterministic priority로 선택한다. 한도 변경은 provider token budget과 분석 시간 evidence가 있을 때만 한다.
- GitHub API host 외 arbitrary URL fetch를 제거한다.
- source text를 AI instruction과 분리한 untrusted evidence envelope로 전달한다.
- GitHub raw error와 request ID를 masking하고 revoked installation은 disconnected 상태로 전환한다.

Test Scenarios:

- installation token request body가 exact repository ID와 예상 permission을 포함한다.
- 다른 project Repository ID, installation ID, owner와 name 조합 spoof는 404 또는 authorization failure로 끝난다.
- multiple installation user가 명시적으로 하나를 선택하고 callback state가 같은 user와 project에만 적용된다.
- large monorepo 분석이 coverage와 omitted count를 반환한다.
- symlink, binary, oversized file, .env, credential-like file은 evidence에 들어가지 않는다.
- prompt injection fixture가 system behavior를 바꾸지 않는다.
- revoked token과 rate limit 오류는 secret 없는 actionable 상태를 반환한다.

Verification:

- AE8, AE9, AE11이 통과한다.
- GitHub App 설정 문서와 실제 operation profile 사이에 permission drift가 없다.

### U7. AWS 연결을 ArchitectureReadRole과 bounded STS session으로 교체한다

Goal:

SketchCatch가 사용자 AWS 구조를 읽는 데 필요한 최소 권한만 얻고, 기존 broad Terraform execution role을 더 이상 사용하지 않게 한다.

Requirements:

R3, R9, R12, R22

Files:

- apps/api/src/aws-connections/aws-connection-service.ts
- apps/api/src/aws-connections/aws-connection-runtime-credentials.ts
- apps/api/src/aws-connections/aws-connection-test-service.ts
- apps/api/src/aws-connections/aws-import-access-catalog.ts
- apps/api/src/aws-connections/aws-connection-template-storage.ts
- apps/api/src/routes/aws-connections.ts
- apps/api/src/routes/aws-import-access.ts
- apps/api/src/aws-connections/aws-codeconnection-service.ts
- packages/types/src의 AwsConnection types
- apps/web/app/dashboard/settings AWS connection UI
- infra/aws/terraform의 API task AssumeRole caller policy
- AWS connection tests와 policy snapshot

Approach:

- role 이름과 template을 SketchCatchArchitectureReadRole 계열로 바꾼다.
- CloudFormation template은 External ID trust, connection-scoped read managed policy, role attachment, connection tag만 만든다. CodeBuild boundary, Terraform Apply policy, Cost, CodeConnection, IAM mutation, PassRole을 제거한다.
- read catalog를 실제 reader invocation에서 역추적해 최소화한다. GetSecretValue, SSM value read, S3 object read, DynamoDB item read, Lambda code URL처럼 architecture에 불필요한 data-plane 또는 secret action을 금지한다.
- 실제 reader action을 service family별 exact allowlist로 묶어 compact inline session policy를 만든다. 매 AssumeRole 호출의 `Policy`에 해당 policy를 전달하고 serialized plaintext가 2,048자를 넘으면 더 작은 service session으로 나눈다. role에 다른 권한이 추가돼도 SketchCatch가 만든 inline cap과의 교집합을 넘지 못하며, user-managed policy ARN만 사용하는 fallback은 없다.
- read policy 이름과 ARN은 connection ID와 account ID에서 결정적으로 만들고 policy fingerprint와 contract version을 검증한다. fingerprint drift는 재검증 상태를 만들지만 session 안전성은 inline cap으로 별도 보장한다. 다른 connection이나 다른 account의 policy ARN은 거절한다.
- connection verification은 account, role name, External ID trust, region, bounded read probe와 sanitized missing permission을 확인한다.
- 기존 TerraformExecutionRole 연결은 scan 불가와 migration 안내를 반환한다. 사용자가 새 stack을 만든 뒤 검증되면 전환한다. 기존 broad role 삭제는 자동화하지 않고 AWS Console cleanup 절차를 제공한다.
- AWS import access manager와 CodeConnection creation, cleanup route를 제거한다.
- role policy와 operation-scoped inline session policy 모두 Access Analyzer validation과 forbidden action test를 policy release gate로 둔다.

Test Scenarios:

- generated template과 session policy에 write, wildcard service, PassRole action이 없다.
- customer managed policy의 default version을 broad fixture로 바꿔도 inline-capped session의 write authorization simulation이 거절된다.
- malicious user가 broad role ARN 또는 잘못된 role name을 제출하면 verification이 실패한다.
- AssumeRole request가 External ID, role session name, duration, reader-specific inline session policy를 모두 포함하고 모든 serialized policy가 STS 제한 안에 있다.
- read probe의 AccessDenied가 필요한 service 이름만 반환하고 ARN, provider request ID, credential은 가린다.
- existing broad connection으로 scan을 시작하면 재연결 required이고 AWS reader는 호출되지 않는다.
- cross-user connection read, verify, template, delete가 404다.

Verification:

- AE4, AE5가 통과한다.
- role policy와 모든 inline session policy의 Access Analyzer 결과에 error와 security warning이 없거나, warning이 있으면 근거와 사용자 승인이 release evidence에 남는다.

### U8. Reverse Engineering을 project-scoped read scan과 Board restore로 제한한다

Goal:

기존 AWS 구조를 안전하게 이해하는 기능을 유지하되, 부분 지원을 import 가능성으로 과장하지 않는다.

Requirements:

R14, R18, R22

Files:

- apps/api/src/routes/reverse-engineering.ts
- apps/api/src/reverse-engineering/reverse-engineering-service.ts
- apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.ts
- apps/api/src/reverse-engineering/aws-detailed-reverse-engineering-reader.ts
- apps/api/src/reverse-engineering/aws-project-read-sanitizer.ts
- apps/api/src/reverse-engineering/reverse-engineering-public-errors.ts
- apps/api/src/reverse-engineering/reverse-engineering-management-policy.ts
- apps/api/src/reverse-engineering/existing-reverse-engineering-draft-apply-service.ts
- apps/api/src/services/terraform/terraform-import-blocks.ts
- apps/web/app/workspace의 Reverse Engineering start와 result UI
- reverse engineering route, gateway, sanitizer, Board apply tests

Approach:

- project 없는 preview scan을 제거하고 project shell을 먼저 만든 뒤 scan을 시작한다.
- scan, logs, cancel, delete, result를 user와 project ownership에 묶는다.
- service별 supported, partial, missing_permission, unsupported 상태와 coverage를 응답에 포함한다.
- raw ARN, account ID, policy document, Lambda environment, code URL, secret metadata를 최소화하거나 owner-only sanitized form으로 제한한다.
- Board restore는 observed provenance를 남기되 Terraform renderer에서 제거한다.
- importSuggestions, importCommand, import decision editor, import block generation, imported resource management classification을 release UI와 public DTO에서 제거한다.
- scan cancellation과 timeout이 partial result를 성공으로 저장하지 않게 한다.

Test Scenarios:

- user B가 user A scan ID를 조회, cancel, delete해도 404이며 scan state가 바뀌지 않는다.
- core service 하나가 AccessDenied여도 다른 service graph와 partial coverage가 보존된다.
- sensitive AWS fixture가 result, logs, error, Board metadata 공개 영역에 없다.
- cancelled와 timeout scan은 completed로 바뀌지 않는다.
- Board restore가 같은 scan과 project revision에서만 승인되고 다른 scan의 node metadata를 섞지 않는다.
- public DTO와 UI에 import command, import action, adoption CTA가 없다.

Verification:

- AE10과 F3가 통과한다.
- support matrix와 실제 reader test 목록이 일치한다.

### U9. CI/CD handoff를 PR, OIDC Plan, 사용자 승인 Apply와 Destroy로 재구성한다

Goal:

SketchCatch managed deployment 의존성을 없애고, 숙련 사용자가 자신의 Repository와 AWS 역할에서 검토 가능한 Terraform workflow를 운영하게 한다.

Requirements:

R10, R13, R23-R25

Files:

- apps/api/src/git-cicd/git-cicd-handoff-service.ts
- apps/api/src/git-cicd/git-cicd-workflows.ts
- apps/api/src/git-cicd/github-app-git-provider.ts
- apps/api/src/git-cicd/github-actions-run-provider.ts
- apps/api/src/git-cicd/git-cicd-repository-settings-service.ts
- apps/api/src/git-cicd/aws-role-diff-apply-service.ts
- apps/api/src/routes/git-cicd-handoffs.ts
- apps/api/src/routes/git-cicd-readiness.ts
- apps/api/src/routes/git-cicd-release-runs.ts
- apps/api/src/routes/git-cicd-infrastructure-runs.ts
- apps/web/features/workspace/CicdConsoleScreen.tsx
- apps/web/features/workspace/CicdHandoffPanel.tsx
- apps/web/features/workspace/cicd-readiness-presentation.ts
- packages/types/src의 GitCicd types
- generated workflow와 handoff tests

Approach:

- sourceDeploymentId, approved direct Apply Plan, deployment target, runtime application release를 handoff precondition에서 제거한다.
- handoff 입력은 source Repository, Terraform artifact hash, 기존 S3 backend bucket과 key, ap-northeast-2, plan role ARN, apply role ARN, approval mode, protected environment가 필요한 경우 그 이름, target branch로 단순화한다.
- backend는 Terraform 1.10 이상의 S3 `use_lockfile = true`만 허용한다. bucket은 미리 존재해야 하며 versioning, encryption, public access block과 exact state key 접근을 preflight한다. workflow는 bucket을 만들거나 삭제하지 않고 backend coordinate를 GitHub variable로만 읽는다. secret과 access key를 backend file에 쓰지 않는다.
- plan role은 exact backend state와 lock에 필요한 S3 access, 대상 인프라 read만 가진다. apply role은 별도 trust와 policy를 사용한다. static validation은 AWS credential 없이 실행하고 fork PR에는 OIDC token을 발급하지 않는다.
- automatic Repository settings apply, Variables write, Environment write, AWS role diff apply endpoint와 setup action을 제거한다. 필요한 GitHub branch protection과 environment 설정은 checklist와 direct link로 안내한다.
- PR에는 Terraform source, lockfile policy, release manifest, Plan, Apply, Destroy workflow를 넣는다. 사용자 기존 workflow와 충돌하면 덮어쓰지 않고 diff와 manual resolution을 요구한다.
- generated workflow와 SketchCatch production workflow의 third-party action은 full commit SHA로 pin하고 allowlisted owner만 사용한다. `pull_request_target`은 생성하지 않으며 fork PR은 format, validate, security scan만 수행한다. same-Repository Plan도 exact repository와 event subject로 제한한 read-only infrastructure role을 사용한다.
- PR workflow는 exact head commit에서 format, validate, security scan, real Plan을 실행하고 redacted action count와 diagnostics만 summary에 남긴다.
- Apply workflow는 merged exact SHA를 input으로 받고 먼저 plan role로 fresh Plan을 만든다. 그 Plan의 summary와 hash가 확정된 뒤 별도 apply job이 선택한 approval mode의 human confirmation을 기다리고 동일한 saved Plan만 적용한다.
- Destroy workflow도 선택한 exact SHA에서 destroy Plan을 먼저 만들고, 별도 confirmation input과 선택한 approval mode의 human confirmation 뒤 동일한 saved Plan만 적용한다.
- Apply와 Destroy는 입력 SHA가 configured target branch에 포함되는지 검증하고 workflow definition은 trusted target branch에서 실행한다. protected approval mode는 required reviewer 설정을 non-mutating preflight로 확인한다. GitHub plan이나 private Repository 제약으로 이를 확인할 수 없으면 single-operator mode만 제공하고 Repository, action, exact SHA, Plan hash를 모두 일치시키는 typed confirmation을 요구한다.
- OIDC trust example은 exact owner, repository, branch 또는 environment subject와 audience를 사용한다. 장기 AWS secret을 만들지 않는다.
- raw tfplan이 Plan과 Apply job 사이에 필요하면 private artifact retention을 1일 이하로 고정하고 exact SHA와 hash를 검증한다.
- SketchCatch는 Actions read token으로 workflow status와 URL만 읽는다. heartbeat, check-in, application artifact, release callback을 제거한다.
- 단순화 후 참조되지 않는 GitOps reconciler와 direct release code는 U11에서 삭제한다.

Test Scenarios:

- direct deployment record가 없는 project도 valid Terraform artifact와 Repository로 PR preview를 만들 수 있다.
- token permission 부족은 필요한 profile만 안내하고 broad permission을 요구하지 않는다.
- generated Plan workflow의 permissions가 contents: read, id-token: write와 필요한 최소 범위다.
- fork PR과 `pull_request_target` fixture에는 AWS OIDC가 없고 모든 external action reference가 approved full commit SHA다.
- backend bucket이 없거나 versioning, encryption, public block, state lock가 기준에 맞지 않으면 Plan 전에 실패하며 create-bucket 호출은 없다.
- PR Plan 또는 fresh Apply Plan failure, stale SHA, changed Terraform hash, Plan artifact hash mismatch는 Apply를 막는다.
- exact SHA가 target branch ancestry에 없거나 approval mode의 실제 GitHub capability와 설정이 다르면 Apply와 Destroy를 막는다.
- Apply와 Destroy는 push나 pull_request event로 자동 실행되지 않는다.
- OIDC subject가 다른 owner, Repository, branch, environment이면 trust test가 실패한다.
- raw plan과 sensitive variable이 job log와 PR comment에 없다.
- SketchCatch callback URL이 없어도 workflow contract test가 통과한다.
- cross-user handoff와 status read는 404다.

Verification:

- AE11, AE12, AE15와 F4가 통과한다.
- GitHub App permission count, generated workflow permission diff, backend preflight, approval mode와 action pin diff가 evidence manifest에 기록된다.

### U10. 세 시작점에서 Board와 PR까지 이어지는 UX를 정리한다

Goal:

숙련 사용자가 불필요한 화면을 건너뛰고 판단이 필요한 지점만 자연스럽게 검토하게 한다.

Requirements:

R1, R14-R26

Files:

- apps/web/app/workspace/new
- apps/web/app/workspace/ai
- apps/web/app/workspace/repository
- apps/web/app/workspace의 Reverse Engineering entry
- apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx
- apps/web/features/workspace/WorkspaceRightPanel.tsx
- apps/web/features/workspace/WorkspaceAiChatDock.tsx
- apps/web/features/workspace/CicdConsoleScreen.tsx
- apps/web/features/parameter-input/ParameterInputPanel.tsx
- apps/web/components/dashboard
- 관련 CSS와 presentation tests

Approach:

- start 화면은 요구사항으로 설계, Repository에서 설계, 기존 AWS에서 복원의 세 선택만 제공한다.
- Board 우측 흐름을 Resource, Parameters, Terraform, Delivery의 네 목적에 맞춰 정리한다. Direct Deployment와 Live Observation overlay 상태를 제거한다.
- Parameters는 required count, recommended set, user override, unresolved dependency를 한눈에 보여주고 각 값의 근거를 펼쳐본다.
- Terraform은 생성, 정적 검증, 보안 검사, offline plan evidence와 actual GitHub Plan을 별도 상태로 표시한다.
- Delivery는 PR diff, required setup, Plan run과 승인 상태를 보여준다. 제품 안 Apply button은 두지 않는다.
- Delivery는 protected reviewer와 single-operator 중 실제 approval mode, 누가 승인할 수 있는지, 독립 승인 보장 여부를 Plan 실행 전에 보여준다. 유료 기능이 없으면 upgrade를 유도하지 않고 축소된 보장을 명시한다.
- loading, empty, partial, permission, quota, stale, retry 상태에서 사용자가 다음 행동을 한 문장으로 알 수 있게 한다.
- keyboard focus, dialog close, tab order, color contrast, screen reader label을 검증한다.
- active Korean copy의 mojibake와 demo 용어를 제거한다.

Test Scenarios:

- F1-F3가 browser back, refresh, provider failure 뒤에도 저장 project로 복귀한다.
- unresolved required parameter가 있으면 PR CTA가 막히고 해당 parameter로 focus 이동한다.
- module recommendation을 거절해도 manual Board edit와 Terraform flow를 계속 사용할 수 있다.
- actual GitHub Plan과 local validation label이 혼동되지 않는다.
- private Repository의 single-operator mode를 protected approval로 표시하지 않고 typed confirmation 요구를 안내한다.
- removed feature의 keyboard shortcut, localStorage key, modal portal이 남지 않는다.
- keyboard-only로 start, Board, parameter review, PR preview까지 이동할 수 있다.
- mobile은 지원 범위를 명확히 안내하고 desktop 핵심 화면을 깨뜨리지 않는다.

Verification:

- F1-F3의 sanitized browser QA를 완주한다.
- 각 경로의 시간, 클릭과 재입력 수, dead-end 수를 before와 after manifest에 기록한다.
- AWS 숙련 사용자 또는 release owner가 설명 없이 module 추천 하나와 기존 AWS 복원 하나를 수행하고, 거절한 추천과 그 이유, 찾지 못한 근거, 다시 사용할 의향을 기록한다. 유용성 4 미만 또는 위험한 추천을 한 건이라도 신뢰한 경우 해당 flow는 release blocker다.

### U11. dead code를 제거하고 canonical 문서와 evidence를 현재 release truth로 맞춘다

Goal:

비활성 기능의 production code와 오래된 설명을 정리하고, 보류 기능을 나중에 재개할 수 있는 조건과 실제 개선 evidence를 남긴다.

Requirements:

R2, R27-R29

Files:

- 제거 기능의 apps/api/src/deployments, live-observation, releases, costs, build-environments, notifications, git-cicd runtime modules
- 제거 기능의 apps/web/features/workspace, apps/web/app/dashboard, dead demo workspace files
- packages/types/src/index.ts의 unreachable DTO
- package.json과 test scripts
- docs/product.md
- docs/architecture.md
- docs/data-models.md
- docs/service-specification.md
- docs/development.md
- docs/deployment.md
- feature_list.json
- agent-progress.md
- docs/assets/release-hardening
- docs/evidence/release-hardening

Approach:

- app registration과 new CI path에서 참조되지 않는 production module, client, component, test fixture를 import graph와 build로 확인한 뒤 삭제한다.
- test-only fixture는 test 폴더로 격리하고 production bundle에서 참조되지 않게 한다.
- legacy DB table과 migration은 삭제하지 않는다. 새 write와 route가 없음을 문서화하고 future archival 조건을 deferred ledger에 둔다.
- root test script에서 제거 기능 전용 sandbox와 import mutation smoke를 제외하고 새 release security, module, CI contract를 포함한다.
- canonical 문서의 제품 scope, API boundary, data lifecycle, AWS credential, CI/CD, 운영 배포를 현재 release와 일치시킨다.
- feature_list.json에서 Direct First Release, Live Observation, Deployment Sandbox, Build Cache를 release blocker가 아닌 removed 또는 deferred 상태로 옮기고 이유를 연결한다.
- UTF-8 검사와 user-facing copy test를 추가한다.
- before와 after screenshot, security diagram, policy diff, permission diff, flow timing, test result를 sanitized fixture로 캡처한다. 실제 account ID, ARN, Repository private name, token, plan value를 가린다.
- evidence bundle이 끝난 뒤 별도 Codex task에 Notion 글 작성을 요청한다. 글은 문제 배경, 판단, 원인, 해결 과정, 수치, 결과, 남은 발전 항목 순서로 구성하고 그림과 caption을 본문보다 우선한다.

Test Scenarios:

- rg와 production build에서 removed symbol, route, label, localStorage key, API client가 발견되지 않는다.
- canonical docs가 managed deployment를 현재 기능으로 설명하지 않는다.
- existing production deployment workflow와 infra docs가 product handoff 삭제로 함께 제거되지 않는다.
- encoding check가 known mojibake token과 invalid UTF-8을 발견하면 실패한다.
- screenshot secret scan이 account ID, ARN, token, private URL pattern을 발견하면 publishing을 막는다.
- deferred ledger 각 항목이 이유, prerequisite, completion criteria를 가진다.

Verification:

- dead production file 수와 문서 drift check가 evidence에 기록된다.
- blog와 Notion source bundle만 만들고 출시 기능을 추가하지 않는다.

### U12. 전체 release gate, 보안 검토, exact SHA rollout을 수행한다

Goal:

로컬 통과를 출시 완료로 오인하지 않고, 비용과 rollback 경계를 지키며 release-dev exact SHA를 production에 전달한다.

Requirements:

R28-R30

Files:

- .github/workflows/ci.yml
- .github/workflows/deploy-ecs.yml
- scripts/check-harness.mjs
- evaluator-rubric.md
- docs/evidence/release-hardening/final-manifest.md
- agent-progress.md

Approach:

- isolated worktree에서 dependency를 설치하고 현재 worktree에서 실패한 harness precondition을 먼저 해결한다. 기존 node_modules를 자동 삭제하지 않는다.
- U1-U11의 targeted tests 후 전체 lint, typecheck, build, test, Terraform, Docker gate를 실행한다.
- security review는 auth, cross-user, provider quota, mutable IAM policy와 inline session cap, GitHub permission과 approval capability, remote state, workflow supply chain, secret masking, path validation, artifact retention을 독립 체크한다.
- live acceptance는 세 등급으로 나눈다.
  - 비용 없는 local, mock, static 검증
  - 사용자 승인 후 가능한 read-only STS, Access Analyzer, GitHub App permission 검증
  - final exact SHA의 기존 ECS rolling deployment
- Bedrock live call이나 사용자 AWS resource Plan, Apply, Destroy는 별도 승인 없이는 release smoke에 포함하지 않는다.
- `.github/workflows/deploy-ecs.yml`의 기존 `image_tag` 입력은 free-form tag가 아니라 승인된 40자 source SHA로 강제하거나 명시적 `source_sha` 입력으로 교체한다. workflow 시작 시 event checkout SHA, release-dev ancestry, final manifest SHA, CI artifact SHA가 모두 같은지 검증하고 모든 checkout job이 그 SHA를 사용한다. image tag는 검증된 SHA에서만 파생한다.
- production workflow와 generated user workflow의 external action은 allowlisted owner의 full commit SHA로 pin한다. version 갱신은 별도 dependency update와 검증을 거치며 floating major tag를 release gate에서 거절한다.
- managed Terraform worker와 release worker 참조를 제거하기 전에 ECS service, scheduled task, task definition 사용 여부를 read-only로 확인한다. 실행 중 항목이 있으면 workflow에서 자동 제거하거나 중단하지 않고 사용자에게 요청한다. 미사용이 확인되면 worker variable, validation, register-worker job만 workflow에서 제거하고 AWS task definition과 IAM resource 삭제는 deferred로 남긴다.
- production deploy 전 current task definition, image digest, DB migration 여부와 rollback target을 기록한다.
- deploy 후 public health, OAuth, project CRUD, Board save, Terraform local validation, GitHub App connection의 비파괴 smoke만 실행한다.
- error rate, target health, task restart, latency를 관찰하고 임계치 위반 시 이전 task definition으로 rollback한다.

Test Scenarios:

- fresh worktree와 frozen lockfile에서 모든 gate가 재현된다.
- CI가 removed route, broad IAM, broad GitHub permission, sample default를 다시 추가한 change를 차단한다.
- deploy input SHA와 built image label, task definition image digest가 일치한다.
- 승인 SHA와 다른 ref, branch head 이동, free-form image tag, floating action tag는 deployment job 전에 실패한다.
- retained worker가 있으면 기존 registration이 유지되고, 미사용 evidence가 있는 경우에만 worker registration 의존성이 제거된다.
- health 또는 core smoke 실패 시 rollout이 완료로 기록되지 않고 rollback 절차가 실행 가능하다.
- production smoke가 Bedrock, Terraform Apply, Destroy, 신규 AWS resource 생성 없이 끝난다.

Verification:

- final manifest가 exact SHA, command results, browser capture, policy hash, workflow hash, deferred items, rollback target을 포함한다.
- 사용자가 final manifest를 확인하고 배포를 승인하기 전에는 workflow_dispatch를 실행하지 않는다.

## Verification Contract

### Gate 0. Isolated baseline

현재 사용자 worktree에서 pnpm harness:check는 pnpm이 non-TTY 환경에서 modules directory 제거를 시도해 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY로 중단됐다. 제품 test 실패로 오인하지 않는다. isolated worktree에서 dependency 상태를 새로 만들고 다음 순서로 baseline을 고정한다.

~~~text
pnpm install --frozen-lockfile
pnpm harness:check
~~~

실패하면 node와 pnpm version, lockfile, workspace dependency 상태를 기록하고 제품 코드를 수정하기 전에 해결한다.

### Gate 1. Targeted security and contract

~~~text
pnpm --filter @sketchcatch/types test
pnpm --filter @sketchcatch/api test
pnpm --filter @sketchcatch/web test
~~~

필수 관찰 결과:

- unauthenticated와 cross-user matrix가 provider no-call을 증명한다.
- removed route와 page가 404다.
- CORS, CSRF, shared quota, masking, input bounds가 통과한다.
- AWS policy forbidden action과 GitHub operation permission profile이 통과한다.

### Gate 2. Catalog, compiler, Terraform

~~~text
pnpm catalog:check
pnpm architecture-board-knowledge:check
pnpm architecture-board-evidence-review:check
pnpm modules:validate
pnpm reference-palette:validate
pnpm test:terraform
pnpm migration:compatibility:check
~~~

제거된 broad template script는 package.json에서 함께 제거한다. release module은 init without backend, validate, mock plan과 Trivy가 모두 통과해야 offline_plan_verified가 된다.

### Gate 3. Repository-wide quality

~~~text
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm docker:build
~~~

실패한 test를 삭제해 green으로 만들지 않는다. 제거된 제품 계약을 검증하던 test는 새 404, capability, handoff contract test로 대체한다.

### Gate 4. Browser and accessibility

sanitized local users와 fixture Repository를 사용해 F1-F3를 desktop viewport에서 수행한다. keyboard-only pass, focus order, screen reader labels, refresh recovery, provider failure, permission failure를 포함한다. before와 after는 같은 viewport와 fixture를 사용한다.

추가로 AWS 숙련 사용자 또는 release owner가 facilitator 설명 없이 두 과제를 수행한다. 하나는 요구사항에서 module 추천과 PR preview까지, 다른 하나는 partial AWS scan에서 Board 복원과 unsupported 판단까지다. 완료 시간, 재입력, 근거를 찾기 위해 연 화면, 잘못 신뢰한 추천, 5점 유용성 응답을 기록한다. 위험한 추천을 신뢰했거나 유용성이 4 미만이면 원인을 수정하고 같은 fixture로 다시 검증한다.

### Gate 5. External non-mutating acceptance

사용자 승인 후에만 다음을 수행한다.

- 새 AWS read policy를 IAM Access Analyzer로 validate한다.
- STS AssumeRole와 bounded read probe가 임시 credential, External ID, session policy를 사용하는지 확인한다.
- GitHub App permission과 exact Repository token scope를 test Repository에서 확인한다.
- generated PR의 Plan workflow를 user-owned sandbox Repository에서 실행한다. AWS resource change가 없는 no-op 또는 mock-safe configuration만 사용하고, 미리 만든 S3 backend의 encryption, versioning, public block, lockfile과 exact key permission을 확인한다.
- public Repository의 protected reviewer mode와 지원되지 않는 private Repository의 single-operator mode를 각각 확인하고 UI와 manifest의 보안 보장 표시가 실제 설정과 일치하는지 검증한다.

실제 Apply, Destroy, import, role mutation, Cost Explorer sample, Bedrock 부하 test는 이 gate에 포함하지 않는다.

### Gate 6. Production release

- release-dev final SHA와 CI artifact SHA를 대조한다.
- 사용자 승인을 받는다.
- 기존 Deploy Production ECS workflow를 exact SHA로 수동 실행하고 event checkout SHA, approved source SHA, image tag와 manifest SHA가 모두 같은지 첫 job에서 확인한다.
- ALB target health, API readiness, Web, OAuth, project CRUD, Board save, Terraform validation을 확인한다.
- 새 task의 error rate, restart, latency가 baseline을 벗어나거나 core smoke가 실패하면 이전 task definition으로 rollback한다.
- release 결과와 실제 수치를 final manifest에 기록한다.

## System-Wide Impact

### Interface and data lifecycle

- API: public AI와 deployment 중심 route가 사라지고 project-scoped AI, read scan, simplified handoff가 남는다. removed route는 404다.
- Shared types: deployment DTO 일부가 production contract에서 제거되고 parameter provenance, capability, Repository coverage, read scan status가 추가된다.
- Database: project, draft, source Repository, scan, Terraform artifact, handoff는 유지한다. legacy deployment와 observation table은 read/write route를 끊지만 drop하지 않는다.
- Browser storage: removed modal과 template backup key를 삭제한다. recoverable project data는 DB가 authority다.
- Terraform artifact: project revision과 hash가 handoff authority가 된다. raw Plan은 GitHub 쪽에만 존재한다.

### Failure propagation

- Redis 장애는 AI, GitHub, AWS provider action 503으로 전파되며 fake fallback을 만들지 않는다.
- AI 장애는 project와 requirement를 보존하고 Board 변경을 만들지 않는다.
- GitHub token과 permission 실패는 Repository 연결이나 PR 생성만 실패시키며 Terraform artifact를 잃지 않는다.
- AWS missing permission은 scan의 service별 partial 상태가 되며 write 권한 요청으로 자동 승격하지 않는다.
- GitHub Plan 실패는 Apply와 Destroy를 차단한다.

### Security posture

- BOLA 검증이 route별 사후 처리에서 provider 전 공통 guard로 이동한다.
- AWS credential은 temporary read session만 남고 apply credential은 사용자 GitHub OIDC 경계로 이동한다.
- AWS read session은 SketchCatch가 생성한 operation-scoped inline policy로 상한을 두므로 사용자 account의 managed policy가 바뀌어도 write 권한으로 넓어지지 않는다.
- GitHub App broad admin mutation을 제거하고 operation-scoped token을 사용한다.
- GitHub workflow는 fork와 untrusted event에 OIDC를 주지 않고 external action을 immutable commit에 pin한다.
- raw provider error, secret, Plan을 log와 evidence에서 제거한다.

### Operational posture

- ECS API와 Web production infra는 유지한다.
- managed Terraform worker와 GitHub release worker의 startup entrypoint와 package build target은 참조가 없음을 검증한 뒤 U11에서 제거한다. 이에 따른 deploy workflow의 worker job과 variable 정리는 U12가 read-only runtime 확인 후 수행한다. AWS에 남은 dormant task definition과 IAM resource의 실제 삭제는 별도 cost-safe infrastructure follow-up으로 기록한다. 실행 중 service나 scheduled task가 발견되면 자동 중단하지 않고 사용자에게 요청한다.
- production health는 이번 scope에서 retained dependencies의 readiness를 보여줘야 한다. 제거 서비스의 readiness를 필수로 요구하지 않는다.
- runtime monitoring은 current CloudWatch와 ALB를 사용한다. 새 paid monitoring service를 추가하지 않는다.

## Risks & Dependencies

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| 기존 AWS 연결 역할이 broad policy를 유지 | 사용자가 역할을 삭제하기 전 계정에 불필요한 권한이 남음 | 기존 연결을 사용 중지하고 새 read role 전환 절차와 old stack cleanup checklist를 제공한다. SketchCatch session은 caller-generated inline policy로 제한한다 |
| customer managed read policy가 verification 뒤 변경됨 | user-managed policy ARN을 session 상한으로 재사용하면 write 권한까지 넓어질 수 있음 | managed policy fingerprint는 drift evidence로만 사용하고 모든 reader operation에 compact inline session cap을 전달한다. 길이 초과 시 service session을 분할한다 |
| OAuth-only 전환이 기존 native user를 잠금 | production 접근 상실 | read-only account count가 0일 때만 제거하고, 1개 이상이면 사용자 결정 전까지 기존 login을 유지한다 |
| GitHub permission 축소로 기존 installation 동작 변경 | Repository 분석과 PR 실패 | operation profile preflight와 재승인 안내, test Repository acceptance를 제공한다 |
| Plan artifact의 sensitive value 노출 | secret 유출 | raw Plan을 SketchCatch에 저장하지 않고 private short-retention artifact와 redacted summary만 사용한다 |
| remote state contract가 누락되거나 backend가 자동 생성됨 | Plan과 Apply가 다른 state를 보거나 state가 유실, 노출됨 | pre-existing S3 backend, encryption, versioning, public block, `use_lockfile`, exact key permission을 preflight하고 생성과 삭제를 금지한다 |
| private Repository에서 protected reviewer를 사용할 수 없음 | workflow가 영원히 막히거나 실제보다 강한 승인으로 오인됨 | GitHub capability와 설정을 preflight하고 protected reviewer와 single-operator mode를 분리 표시한다. 조직 정책이 독립 승인을 요구하면 fail closed한다 |
| workflow ref나 action tag가 승인 뒤 움직임 | 검토하지 않은 코드 또는 action이 production credential로 실행됨 | target branch ancestry, exact source SHA, Plan hash, immutable action SHA를 검증하고 fork와 `pull_request_target` OIDC를 금지한다 |
| 큰 삭제 diff가 운영 workflow까지 침범 | production deploy 불가 | product flow와 repository 운영 workflow를 별도 allowlist로 검증하고 PR을 workstream별로 나눈다 |
| ap-northeast-2 제한이 숙련 사용자 기대보다 좁음 | 일부 계정에 사용 불가 | UI 첫 단계에서 명시하고 incompatible region을 즉시 차단하며 multi-region 완료 조건을 deferred ledger에 남긴다 |
| AI live acceptance에 비용 발생 | 예기치 않은 AWS 청구 | mock과 contract test를 기본으로 하고 live Bedrock은 예상 call과 비용을 제시해 별도 승인받는다 |
| legacy table과 code 제거 순서 오류 | build 또는 rollback 실패 | route 제거, new path 전환, import graph 확인, dead code 삭제 순서로 진행하고 DB drop은 하지 않는다 |

## Deferred Ledger

| 항목 | 보류 이유 | 재개 전제조건 | 완료 조건 |
| --- | --- | --- | --- |
| Azure와 GCP | 단기 AWS 신뢰성보다 범위가 큼 | provider-neutral resource와 capability contract가 AWS에서 안정화 | provider별 auth, scan, compiler, Plan fixture, ownership, security acceptance가 AWS와 같은 gate 통과 |
| AWS multi-region과 CloudFront custom domain | 현재 connection과 fixture가 Seoul 전제이고 CloudFront ACM certificate는 별도 region 계약이 필요 | region-independent module과 reader fixture, certificate region, pricing과 service variance 조사 | 두 개 이상 region의 compiler, read scan, CI Plan acceptance와 UI support matrix, custom domain certificate acceptance |
| SketchCatch managed Plan, Apply, Destroy | broad credential과 demo profile 위험 | 별도 execution plane, per-resource capability, approval artifact, cost와 cleanup policy | user account least privilege, exact plan approval, failure recovery, cleanup, external live acceptance |
| Live Observation | demo topology와 managed deployment에 결합 | provider-neutral telemetry contract와 실제 workload instrumentation | 실제 scale cycle, ownership, retention, cost, partial failure acceptance |
| Cost Analysis | provider 실패가 sample로 위장되고 계산이 모순 | versioned price source, unknown propagation, last-success snapshot | resource 합계와 total 일치, source timestamp, unavailable 처리, actual billing comparison |
| Voice | browser SpeechRecognition과 unowned Transcribe job | authenticated upload, project/job ownership, durable transcript, explicit confirm | cross-user, retry, expiry, edit history, Requirement 생성 acceptance |
| broad Template marketplace | visual reference와 deployability 혼재 | capability taxonomy와 release module evidence 자동화 | 각 template의 prerequisite, safe defaults, init, validate, Plan, security evidence |
| pre-deployment deep scan과 design simulation | public AI route, process-local state, demo success 표현에 결합 | project-scoped durable job, bounded input, deterministic finding contract | ownership, quota, cancel과 resume, provider failure, false-positive benchmark acceptance |
| EKS release module | IAM, network, addon, 운영 전제가 큼 | cluster lifecycle, OIDC, node, upgrade, cost profile 설계 | no sample ARN, private baseline, upgrade와 destroy test, CI Plan acceptance |
| Reverse Engineering import와 adopt | 일부 설정만 projection 가능하고 state mutation 위험 | resource별 round-trip completeness와 state backup, rollback | import preview, exact ID, state isolation, rollback, unsupported block, live sandbox acceptance |
| CodeConnection build environment와 automatic Repository settings | broad GitHub와 AWS mutation을 요구하고 user-owned CI 경계와 충돌 | 별도 least-privilege setup product와 reversible change preview | exact diff, approval, rollback, audit, cross-user, permission revocation acceptance |
| Deployment History, Auto Cleanup, deployment notification | managed deployment record와 demo application lifecycle에 결합 | user-owned CI event를 신뢰할 독립 contract와 retention, ownership 설계 | callback 없이 검증 가능한 status source, cleanup dry-run, retention, notification delivery acceptance |
| organization RBAC와 Passkey | 현재 single-user 목표 밖 | organization과 membership domain, recovery 정책 | role matrix, invitation, audit, WebAuthn recovery, cross-tenant negative suite |
| native email/password | mail delivery와 verified contact model 없음 | verified identity와 mail provider, abuse protection, account merge | verification, reset delivery, expiry, revoke, resend, OAuth merge acceptance |
| application deployment | sample check-in과 secret 계약에 결합 | workload-neutral build, health, secret, artifact contract | representative static, serverless, container workload의 independent release acceptance |
| legacy deployment DB archival | rollback과 감사 데이터 보존 필요 | retention 기간과 production backup 확인 | read-only export, retention approval, reversible migration, post-migration verification |

## Definition of Done

### Global completion

- R1-R30의 acceptance가 자동 test, browser evidence, 또는 명시된 external acceptance로 추적된다.
- P0 또는 P1 security finding, unauthenticated provider route, cross-user success, broad AWS write role, long-lived credential 저장이 0이다.
- user-managed IAM policy drift가 write session으로 넓어지지 않고 generated 또는 production workflow가 untrusted ref와 floating action을 실행하지 않는다.
- Terraform real Plan, Apply, Destroy는 검증된 pre-existing remote backend와 명시된 approval mode에서만 열린다.
- release module은 공개한 capability evidence를 모두 통과하고 sample ID와 ARN, unsafe default가 없다.
- 제거 기능은 production UI, route, API client, import graph, canonical docs에 남지 않는다.
- abandoned implementation, temporary flag, commented demo branch, unused fixture를 최종 diff에서 제거한다.
- current user worktree와 미커밋 파일은 변경되지 않는다.
- final manifest와 deferred ledger가 실제 SHA와 검증 결과를 가리킨다.
- production deploy는 사용자 승인, exact SHA, rollback target을 갖고 core smoke를 통과한다.

### Per-unit completion

| Unit | 완료 조건 |
| --- | --- |
| U1 | release route와 navigation allowlist가 CI에서 고정되고 removed surface가 404 |
| U2 | retained provider action이 auth, ownership, shared quota, input, masking gate 뒤에서만 실행 |
| U3 | OAuth project-first AI가 reload와 failure recovery를 지원하고 public, Voice, deep scan API 제거 |
| U4 | parameter provenance와 safe module set이 fake value 없이 검증 |
| U5 | Board revision, capability, Terraform artifact hash와 validation status 일치 |
| U6 | exact Repository token scope, coverage, untrusted evidence, multiple installation 선택 검증 |
| U7 | read role와 caller-generated inline session policy에 write action이 없고 managed policy drift와 old broad connection 차단 |
| U8 | project-scoped partial scan과 Board restore만 노출되고 import와 mutation 제거 |
| U9 | direct deployment 없이 PR Plan이 생성되고 Apply와 Destroy가 remote state, exact SHA, OIDC와 사실대로 표시된 human approval 뒤에만 실행 |
| U10 | F1-F3 browser flow, keyboard, failure state가 dead-end 없이 완주 |
| U11 | dead code, canonical docs, UTF-8, evidence, deferred ledger 정리 완료 |
| U12 | 전체 gate, security review, immutable action, final manifest, 승인된 exact SHA rollout과 rollback 준비 완료 |

## Appendix

### Audit Reclassification

| 기존 감사 | 이번 처리 |
| --- | --- |
| PR-001, PR-002, PR-006 | managed deployment와 demo application release 제거 |
| PR-003, PR-011, PR-012, PR-013 | project auth, shared quota, provider fail-closed로 수정 |
| PR-004, PR-005, PR-023 | Voice와 native auth의 미완성 진입 제거 |
| PR-007, PR-008, PR-009, PR-010 | exact demo preset, sample cost, 모순 total, approval-dependent deployment surface 제거 |
| PR-014-PR-018, PR-029 | broad gallery를 safe release module과 capability evidence로 교체 |
| PR-019, PR-027, PR-030 | retained production dependency readiness와 release manifest에서 점검 |
| PR-020, PR-028 | Repository coverage와 multiple installation 선택 수정 |
| PR-021, PR-022 | Seoul-only와 Reverse Engineering partial support를 사실대로 노출 |
| PR-024, PR-025, PR-031, PR-032 | local state, origin, encoding, dead demo code 수정과 삭제 |
| PR-026, PR-033, PR-034 | 운영 artifact와 legacy naming은 retained release에 필요한 범위만 정리하고 나머지는 deferred |
| PR-035 | canonical 문서 update의 근거로 사용 |

### Evidence Capture List

모든 capture는 동일한 sanitized fixture와 viewport를 사용한다.

1. Before release surface: dashboard의 Template과 Cost, workspace의 Direct Deployment와 Live Observation, public AI route matrix.
2. Before security: broad AWS policy action count, GitHub App permission count, sample parameter 발견 수.
3. After start: 요구사항, Repository, 기존 AWS의 세 진입 화면.
4. After expert defaults: required, recommended, user-provided, reference provenance와 module diff.
5. After Repository analysis: exact commit, selected와 omitted file, byte budget, coverage, prompt-injection과 secret exclusion 결과.
6. After AWS read boundary: role policy와 inline session cap diff, serialized policy 크기, managed policy drift write-denial test, partial scan 화면.
7. After Terraform truth: Board revision과 artifact hash, local validation과 real Plan label 분리, remote backend preflight와 state lock evidence.
8. After GitHub handoff: PR file diff, exact-repo token permission, pinned action SHA, protected reviewer와 single-operator mode 비교 화면.
9. Failure recovery: quota 503, missing permission partial, unsupported resource, stale revision, retry 뒤 저장 project 복구 화면.
10. Flow result: F1-F3별 before와 after 시간, 클릭 수, 재입력 수, dead-end 수를 같은 fixture와 viewport로 비교한 chart.
11. Release proof: 전체 test와 security gate 요약, approved source SHA와 image digest 일치, ECS target health와 rollback target.

각 capture에는 한 문장 caption과 원인 또는 판단 근거를 붙인다. 수치는 동일 fixture의 before와 after를 한 화면에서 비교하고, account ID, ARN, private Repository 이름, token, raw Plan과 state 값이 남으면 evidence bundle 발행을 중단한다.
Notion 글은 각 section마다 한 개의 주장, 한 개의 그림, 한 개의 수치 또는 검증 결과를 우선 배치한다. Deferred Ledger는 한 장의 roadmap diagram으로 만들고 비밀값이 보이는 console, AWS account ID, ARN, private Repository, Terraform Plan raw output은 capture하지 않는다.
