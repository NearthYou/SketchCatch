# 프로젝트 단위 배포 운영 완성 마일스톤

> **For agentic workers:** REQUIRED SUB-SKILL: 각 이슈 구현 전 `superpowers:executing-plans`를 사용하고, 이슈 단위로 TDD·검증·리뷰·커밋을 완료한다.

**Goal:** `docs/sw/spec2.md`의 프로젝트 단위 배포 운영 계약을 우선순위와 의존성에 따라 독립적으로 검증 가능한 수직 슬라이스로 구현한다.

**Architecture:** 프로젝트 단일 배포 타깃과 공통 릴리즈 원장을 중심에 두고 Direct Deployment와 GitOps runtime adapter를 연결한다. Live Observation, CI 로그, 알림은 Deployment/ApplicationRelease terminal evidence를 소비하며, AWS 구현은 provider-neutral 계약 뒤에 둔다.

**Tech Stack:** TypeScript, Next.js, Fastify, Zod, PostgreSQL/RDS, Redis, Terraform, AWS ECS/Fargate, Lambda, CodeDeploy, S3/CloudFront, CloudWatch, GitHub Actions.

## 전역 제약

- canonical 요구사항은 `docs/sw/spec2.md`와 root `AGENTS.md`다.
- RAG 기반 Fargate 추천과 저장소 분석의 Amazon Q RAG 직접 연결은 구현하지 않는다.
- 한 번에 `feature_list.json`의 `in_progress` workstream은 하나만 유지한다.
- 현재 `LIVE-OBSERVATION-V2-001`을 먼저 종료한 뒤 다음 마일스톤으로 이동한다.
- 모든 이슈는 schema/API/storage/UI/test가 연결된 수직 슬라이스로 끝낸다.
- 일반 PR base는 `dev`이며 `main`, `dev`에 직접 push하지 않는다.
- 실제 AWS/GitHub mutation은 명시 승인된 non-production sandbox에서만 수행한다.

## 마일스톤 우선순위

| 순서 | GitHub Milestone | 우선순위 | 완료 가치 | 선행 조건 |
| --- | --- | --- | --- | --- |
| 1 | [`P0-1 Live Observation v2 운영화`](https://github.com/NearthYou/SketchCatch/milestone/2) | P0 | 현재 활성 workstream을 운영 가능한 공개 관측 흐름으로 종료 | 없음 |
| 2 | [`P0-2 프로젝트 단위 배포 기반`](https://github.com/NearthYou/SketchCatch/milestone/3) | P0 | 프로젝트 타깃, 릴리즈 원장, Direct 3단계 흐름 완성 | Milestone 1 |
| 3 | [`P0-3 GitOps 주요 런타임 릴리즈`](https://github.com/NearthYou/SketchCatch/milestone/4) | P0 | ECS, Lambda, EC2, Static 실제 artifact 릴리즈 완성 | Milestone 2의 공통 계약 |
| 4 | [`P1-1 운영 알림 및 샌드박스 검증`](https://github.com/NearthYou/SketchCatch/milestone/1) | P1 | 영속 알림, 실제 요청, rollback, cleanup 증거 완성 | Milestone 1~3 |

## Milestone 1. P0-1 Live Observation v2 운영화

### Issue #370. 서버 검증형 공개 관측 세션

- Priority: P0
- Issue title: `Feat: Live Observation v2를 서버 검증형 공개 세션으로 운영화`
- GitHub issue: [#370](https://github.com/NearthYou/SketchCatch/issues/370)
- Branch: `feature/sw/370-live-observation-v2`
- PR title: `Feat: Live Observation v2를 서버 검증형 공개 세션으로 운영화`
- Blocked by: 없음
- User story: 개발자는 검증된 Deployment의 Output URL에 대해 15분 QR 세션을 만들고 실제 요청과 CloudWatch 지표를 안전하게 관측한다.

범위:

- provider-neutral Store contract와 in-memory/Redis adapter를 같은 contract suite로 완성한다.
- HMAC capability, 만료, rate limit, session request budget, redaction을 서버에서 검증한다.
- `/observe/:publicId` QR 흐름과 검증된 HTTPS Output URL 요청을 연결한다.
- AWS runtime별 CloudWatch request/error/p95/availability/capacity/log evidence를 공통 snapshot으로 정규화한다.
- demo profile과 production-disabled 전용 분기를 제거하고 feature gate를 운영 조건으로 대체한다.

완료 기준:

- [ ] capability 원문이 URL, RDS, Redis, browser storage, 로그에 남지 않는다.
- [ ] 15분 만료, IP당 분당 30회, 세션당 10,000회 제한이 테스트된다.
- [ ] redirect, response body 저장, 미검증 Output URL 요청이 차단된다.
- [ ] desktop/mobile/reduced-motion 브라우저 흐름과 lifecycle cleanup이 통과한다.
- [ ] 명시 승인된 sandbox에서 실제 요청과 CloudWatch snapshot이 일치한다.

검증:

- focused API/web contract tests
- Redis adapter integration test
- browser QR acceptance
- 승인 시 AWS read-only CloudWatch evidence

## Milestone 2. P0-2 프로젝트 단위 배포 기반

### Issue #371. 프로젝트 배포 타깃과 공통 릴리즈 원장

- Priority: P0
- Issue title: `Feat: 프로젝트 배포 타깃과 공통 릴리즈 원장 구축`
- GitHub issue: [#371](https://github.com/NearthYou/SketchCatch/issues/371)
- Branch: `feature/sw/371-project-deployment-release-ledger`
- PR title: `Feat: 프로젝트 배포 타깃과 공통 릴리즈 원장 구축`
- Blocked by: #370
- User story: 개발자는 프로젝트의 유일한 배포 타깃을 설정하고 Direct/GitOps 릴리즈의 version, SHA, digest, Output URL을 한 이력에서 본다.

범위:

- provider-neutral shared type, Zod DTO, RDS migration, repository/API, 프로젝트 설정 UI를 연결한다.
- project당 한 target, runtime kind, confirmed build config, rollout strategy를 저장한다.
- `application_releases`와 기존 Deployment 연결을 추가한다.
- legacy live profile을 호환 backfill하고 기존 plan/apply API를 adapter로 유지한다.
- 릴리즈 버전 우선순위와 provider revision drift 검증을 구현한다.

완료 기준:

- [ ] 프로젝트당 활성 배포 타깃이 하나만 존재한다.
- [ ] 권한 없는 connection/region/target 변경이 차단된다.
- [ ] Direct/GitOps 릴리즈가 같은 조회 API와 History UI에 표시된다.
- [ ] SemVer tag, manifest version, SHA fallback과 digest가 결정적으로 계산된다.
- [ ] migration 전후 기존 Deployment 조회와 승인 snapshot이 호환된다.

검증:

- migration/backfill tests
- API authorization and schema tests
- frontend settings/history tests
- release identity and drift tests

### Issue #372. 저장 연동 Direct Deployment 3단계 전환

- Priority: P0
- Issue title: `Feat: Direct Deployment를 저장 연동 3단계 흐름으로 전환`
- GitHub issue: [#372](https://github.com/NearthYou/SketchCatch/issues/372)
- Branch: `feature/sw/372-direct-deploy-three-stage`
- PR title: `Feat: Direct Deployment를 저장 연동 3단계 흐름으로 전환`
- Blocked by: #371
- User story: 개발자는 Board를 단축키로 저장하고 `저장하고 바로 배포`를 눌러 검증, 승인, 배포 세 단계만 거쳐 실행한다.

범위:

- `Ctrl+S`/`Command+S`가 diagram과 Terraform draft를 하나의 server flush로 저장하게 한다.
- 저장 성공 뒤 prepare API를 호출하고 scope 자동 감지/수정을 제공한다.
- infrastructure/application/full_stack의 validation/approval/deployment 상태를 정규화한다.
- Deployment console을 summary-first로 축소하고 중복·demo 전용 텍스트를 제거한다.
- Destroy와 History도 같은 세 단계와 공통 릴리즈 증거를 사용한다.

완료 기준:

- [ ] 저장 실패나 stale revision이면 Deployment가 생성되지 않는다.
- [ ] UI에 외부 단계가 정확히 세 개만 표시된다.
- [ ] approval snapshot과 execute snapshot이 다르면 실행이 차단된다.
- [ ] 기본 화면에는 상태, scope, change count, blocker, 비용, version, action, Output URL만 보인다.
- [ ] raw diagnostics와 전체 로그는 접힌 상세 영역에서 접근 가능하다.

검증:

- draft manager and hotkey unit tests
- prepare/approve/execute API state tests
- browser save-and-deploy acceptance
- Direct deployment regression suite

## Milestone 3. P0-3 GitOps 주요 런타임 릴리즈

### Issue #373. 저장소 감지 기반 ECS/Fargate GitOps 릴리즈

- Priority: P0
- Issue title: `Feat: 저장소 감지 기반 ECS/Fargate GitOps 릴리즈 구현`
- GitHub issue: [#373](https://github.com/NearthYou/SketchCatch/issues/373)
- Branch: `feature/sw/373-ecs-gitops-release`
- PR title: `Feat: 저장소 감지 기반 ECS/Fargate GitOps 릴리즈 구현`
- Blocked by: #371
- User story: 개발자는 자동 감지된 Docker build 설정을 확인하고 commit push만으로 immutable ECS/Fargate 릴리즈와 로그를 얻는다.

범위:

- build evidence 감지, 구조화된 설정 확인, CodeBuild/ECR artifact 경계를 연결한다.
- Docker image를 immutable ECR digest로 만들고 ECS task definition을 갱신한다.
- immediate replacement와 circuit breaker rollback을 적용한다.
- GitHub workflow job/step 로그를 기존 cursor 로그 계약으로 연결한다.
- 실제 ECS revision을 API가 재조회해 release ledger와 대조한다.

완료 기준:

- [x] 모호하거나 미확인 build config는 workflow 실행을 차단한다.
- [x] release가 version, SHA, image digest, task revision, Output URL을 기록한다.
- [x] minimum healthy 0, maximum 100과 circuit breaker rollback이 검증된다.
- [x] CI/CD 화면에서 build, publish, deploy, health 단계와 masked log를 본다.
- [ ] sandbox ECS 배포와 의도된 실패 rollback evidence가 남는다.

### Issue #374. Lambda AllAtOnce GitOps 릴리즈

- Priority: P0
- Issue title: `Feat: Lambda AllAtOnce GitOps 릴리즈 구현`
- GitHub issue: [#374](https://github.com/NearthYou/SketchCatch/issues/374)
- Branch: `feature/sw/374-lambda-gitops-release`
- PR title: `Feat: Lambda AllAtOnce GitOps 릴리즈 구현`
- Blocked by: #373
- User story: 개발자는 Lambda 저장소 변경을 push하고 version publish, AllAtOnce alias 전환, 이전 version rollback을 같은 릴리즈 화면에서 본다.

완료 기준:

- [x] SAM/package evidence가 확인된 저장소만 빌드한다.
- [x] artifact digest, Lambda version, alias revision이 release ledger와 일치한다.
- [x] `LambdaAllAtOnce` 성공과 실패 시 이전 alias 복원이 테스트된다.
- [x] workflow stage/log와 Output URL health evidence가 표시된다.
- [ ] sandbox deploy/rollback/cleanup이 통과한다.

실제 AWS sandbox mutation과 cleanup evidence는 공통 승인 게이트를 적용하는 Issue #378에서 수집한다.

### Issue #375. EC2/ASG CodeDeploy AllAtOnce 릴리즈

- Priority: P0
- Issue title: `Feat: EC2 ASG CodeDeploy AllAtOnce 릴리즈 구현`
- GitHub issue: [#375](https://github.com/NearthYou/SketchCatch/issues/375)
- Branch: `feature/sw/375-ec2-codedeploy-release`
- PR title: `Feat: EC2 ASG CodeDeploy AllAtOnce 릴리즈 구현`
- Blocked by: #373
- User story: 개발자는 EC2/ASG 앱 변경을 push하고 versioned bundle, CodeDeploy 상태, 전체 instance 검증과 rollback을 확인한다.

완료 기준:

- [x] AppSpec과 versioned S3 bundle digest가 확인된다.
- [x] `CodeDeployDefault.AllAtOnce`와 ASG 대상이 최소 권한으로 연결된다.
- [x] 일부 instance 실패도 전체 release 실패로 처리한다.
- [x] 이전 검증 bundle rollback과 health evidence가 기록된다.
- [ ] sandbox deploy/rollback/cleanup이 통과한다.

실제 AWS sandbox mutation과 cleanup evidence는 공통 승인 게이트를 적용하는 Issue #378에서 수집한다.

### Issue #376. Static GitOps 릴리즈와 공통 CI 로그 정리

- Priority: P0
- Issue title: `Feat: Static S3 CloudFront GitOps 릴리즈와 공통 로그 정리`
- GitHub issue: [#376](https://github.com/NearthYou/SketchCatch/issues/376)
- Branch: `feature/sw/376-static-gitops-release`
- PR title: `Feat: Static S3 CloudFront GitOps 릴리즈와 공통 로그 정리`
- Blocked by: #373
- User story: 개발자는 정적 앱 변경을 push하고 versioned S3 release, CloudFront 반영, 공통 CI 단계와 실제 Output URL을 확인한다.

완료 기준:

- [x] static output 감지와 개발자 확인이 없으면 배포하지 않는다.
- [x] versioned prefix, object digest, active pointer, invalidation이 추적된다.
- [x] ECS/Lambda/EC2/Static run이 같은 stage/log/release UI 계약을 사용한다.
- [x] branch/path 설정은 프로젝트 설정에 있고 CI/CD 화면에는 실행 정보만 남는다.
- [ ] sandbox deploy와 이전 release pointer rollback, cleanup이 통과한다.

## Milestone 4. P1-1 운영 알림 및 샌드박스 검증

### Issue #377. 영속 Inbox와 Web Push 완료 알림

- Priority: P1
- Issue title: `Feat: 배포 완료 알림을 영속 Inbox와 Web Push로 전환`
- GitHub issue: [#377](https://github.com/NearthYou/SketchCatch/issues/377)
- Branch: `feature/sw/377-durable-deployment-notifications`
- PR title: `Feat: 배포 완료 알림을 영속 Inbox와 Web Push로 전환`
- Blocked by: #371, #372, #373, #374, #375, #376
- User story: 개발자는 화면을 떠나도 Direct/GitOps 배포 성공·실패 알림을 Inbox와 Web Push로 한 번만 받는다.

완료 기준:

- [x] terminal event가 idempotent outbox를 거쳐 한 번만 알림을 만든다.
- [x] Inbox 읽음 상태가 세션을 넘어 유지된다.
- [x] 인증된 SSE와 service worker Web Push가 같은 notification을 전달한다.
- [x] subscription endpoint/key가 암호화되고 로그에 남지 않는다.
- [x] 권한 거부, 만료 subscription, 재시도, 90일 retention이 테스트된다.

### Issue #378. 프로젝트 배포 운영 샌드박스 E2E

- Priority: P1
- Issue title: `Test: 프로젝트 배포 운영 샌드박스 E2E와 cleanup 검증`
- GitHub issue: [#378](https://github.com/NearthYou/SketchCatch/issues/378)
- Branch: `test/sw/378-deployment-sandbox-e2e`
- Implementation status: `구현 완료 / 실환경 인수 대기`. The three-stage runner, runtime contracts, logs, release reconciliation, rollback/cleanup safeguards, and UI wiring are implemented; the unchecked criteria below require a separately approved real sandbox run.
- PR title: `Test: 프로젝트 배포 운영 샌드박스 E2E와 cleanup 검증`
- Blocked by: #370~#377
- User story: 운영자는 승인된 non-production sandbox에서 전체 흐름이 실제로 동작하고 비용을 남기지 않도록 cleanup됐다는 증거를 확인한다.

완료 기준:

- [ ] Direct 세 scope와 GitOps 네 runtime이 실제로 완료된다.
- [ ] commit 감지, CI 로그, release identity, Output URL이 서로 일치한다.
- [ ] QR 실제 요청, CloudWatch snapshot, Inbox/Web Push가 연결된다.
- [ ] 의도된 실패에서 runtime별 rollback이 검증된다.
- [ ] destroy와 ECR/S3/CodeBuild/CloudWatch 임시 artifact cleanup이 검증된다.
- [ ] Production mutation 없이 실행 보고서와 known risk가 기록된다.

## 이슈 게시와 브랜치 연결 규칙

1. Milestone은 위 순서대로 GitHub에 만든다.
2. 이슈는 blocker가 적은 순서대로 만들고 `enhancement`, `ready-for-agent` label을 붙인다. Issue 9는 `ready-for-agent`만 사용해도 된다.
3. 이 문서에 기록된 이슈 번호와 branch 이름을 source of truth로 사용한다.
4. 모든 branch는 `gh issue develop <number> --base dev --name <branch>`로 Development에 연결되어 있다.
5. 하나의 milestone/issue branch만 활성 workstream으로 checkout한다.
6. 각 PR은 해당 issue를 닫고 다음 blocker issue가 시작 가능한지 tracker와 handoff에 기록한다.

## 공통 완료 게이트

- focused tests와 변경된 package test
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- 변경된 Terraform root의 `terraform fmt -check`, `terraform validate`, `terraform test`, 안전한 plan
- deployment/contract/safety 변경은 `evaluator-rubric.md` adversarial self-review
- 실제 sandbox 작업은 비용 범위, rollback, cleanup owner, secret masking evidence 포함
