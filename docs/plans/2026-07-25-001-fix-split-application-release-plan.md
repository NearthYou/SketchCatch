---
title: 분리 앱 배포의 인프라 결과 동기화 수정
type: fix
date: 2026-07-25
---

# 분리 앱 배포의 인프라 결과 동기화 수정

## Summary

`인프라만` 배포 뒤 실행하는 `앱만` 배포가 최신 Terraform Apply 결과를 다시 동기화한 뒤 ReleaseCandidate를 준비하도록 수정한다. `인프라+앱` 배포가 같은 실행 안에서 사용하는 최신 runtime 좌표와 분리 배포가 사용하는 영속 target의 차이를 없앤다.

## Problem Frame

`full_stack` 경로는 Apply 직후 출력과 리소스를 `reconcileEcsFargateOutput`에 직접 전달하지만, `application` 경로는 이미 `outputUrl`이 존재하면 최신 성공한 인프라 배포와 target을 다시 맞추지 않는다. 인프라 배포 직후 metadata 동기화가 경고로 종료되거나 target 일부가 남아 있으면 앱 배포는 오래된 ECS/ALB/CloudFront 좌표로 runtime 검증을 수행할 수 있다. production의 세부 runtime failure stage는 마스킹되어 있으므로 이 상태 전이를 로컬 회귀 테스트로 재현하고 실제 분리 배포로 최종 확인한다.

## Requirements

- R1. `application` 범위의 ECS/Fargate Plan은 ReleaseCandidate 준비 전에 최신 성공한 직접 인프라 배포 결과로 project deployment target을 갱신하고, 갱신하지 못하면 준비를 중단해야 한다.
- R2. 기존 target에 `outputUrl`이 있어도 최신 인프라 결과 확인을 생략하지 않아야 한다.
- R3. 최신 인프라 배포의 AWS connection을 기준으로 승인된 Apply Plan과 outputs/resources를 검증해야 하며 stale target의 connection을 우선하지 않아야 한다.
- R4. `full_stack`과 `infrastructure` 범위의 기존 실행 순서와 동작은 바뀌지 않아야 한다.
- R5. 분리 배포 회귀 테스트는 완전해 보이지만 오래된 ECS target이 최신 인프라 결과로 교체되고, 동기화 실패 시 artifact 준비가 시작되지 않는 상태 전이를 검증해야 한다.

## Key Technical Decisions

- KTD1. `GitCicdReadinessService`에 application preparation용 strict 동기화 경계를 추가한다: readiness snapshot용 best-effort `refresh`와 달리 최신 성공 인프라 배포를 선택하고 target 저장까지 완료하지 못하면 예외를 반환한다.
- KTD2. strict 동기화는 최신 인프라 배포의 `awsConnectionId`를 기준으로 승인된 Apply Plan을 검증한다: stale target의 connection이 최신 Plan 선택을 방해하는 순환 의존성을 제거한다.
- KTD3. application Plan은 ECS/Fargate target의 `outputUrl` 존재 여부와 관계없이 strict 동기화를 호출한다: URL 완전성은 target 최신성을 증명하지 않는다.
- KTD4. 수정은 Plan 준비 경계와 readiness target reconciliation에 한정한다: Terraform Apply, trusted release worker, runtime convergence 계약은 변경하지 않는다.

## Implementation Units

- U1. `apps/api/src/git-cicd/git-cicd-readiness-service.ts`에 최신 성공 인프라 배포와 그 connection을 선택해 `requireReconciledDeploymentTarget`을 실행하는 strict application 동기화 API를 추가해 R1-R3을 충족한다.
- U2. `apps/api/src/deployments/deployment-service.ts`의 application 전용 사전 동기화를 ECS/Fargate target이면 항상 strict API로 실행하도록 바꿔 R1-R4를 충족한다.
- U3. `apps/api/src/git-cicd/git-cicd-readiness-service.test.ts`에 완전하지만 오래된 target과 최신 outputs/resources를 구성해 runtimeConfig/runtimeTarget/fingerprint 교체를 검증하고, 최신 증거가 불완전하면 strict 동기화가 실패하는 시나리오를 추가한다.
- U4. `apps/api/src/deployments/deployment-plan-service.test.ts`에서 strict 동기화가 artifact 준비보다 먼저 완료되며 실패 시 artifact 준비가 호출되지 않는 순서를 검증해 R5를 충족한다.
- U5. `agent-progress.md`에 원인, 변경 범위, 실행한 검증과 남은 실제 AWS 확인 사항을 기록한다.

## Risks & Dependencies

- 최신 인프라 증거의 Plan artifact나 repository checkout 검증이 유효하지 않으면 application preparation이 실패한다. 기존 stale target으로 rollout을 진행하지 않는 것을 로컬에서 검증하고, production 오류의 세부 runtime stage가 마스킹된 한계는 실제 AWS 분리 배포로 최종 확인한다.