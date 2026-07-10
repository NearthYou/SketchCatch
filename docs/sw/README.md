# SW 문서 인덱스

이 폴더는 SketchCatch의 Terraform 변환, IaC Preview, Deployment, Git/CI/CD, Runtime Cache 관련 실행 참고 문서를 둔다.

범위와 계약이 충돌하면 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`를 우선한다. `docs/sw`는 source of truth가 아니라 현재 남은 작업과 구현 참고 자료를 빠르게 찾기 위한 보조 인덱스다.

## 현재 실행 기준

현재 `docs/sw`의 active workstream은 ECS 전환 및 RunTask Worker 전환이다. 작업자는 아래 세 문서를 먼저 읽고 phase를 시작한다.

| 문서 | 책임 |
| --- | --- |
| [spec.md](./spec.md) | ECS 전환 및 RunTask Worker 전환 6개월 운영형 제품/운영 계약 |
| [plan.md](./plan.md) | 우선순위 기반 phase 마일스톤과 완료 기준 |
| [agents.md](./agents.md) | ECS 전환 작업자가 지켜야 할 규범 |

## 구현 참고 계약

| 문서 | 책임 |
| --- | --- |
| [spec6.md](./spec6.md) | Git/CI/CD 자동 배포 E2E 구현 계약 참고 |

## 구현 참고 가이드

아래 문서는 구현 배경을 이해하기 위한 참고 자료다. 새 작업의 최종 계약은 canonical 문서, shared type, API schema에서 다시 확인한다.

| 문서 | 책임 |
| --- | --- |
| [001_테라폼변환구현가이드_sw.md](./001_테라폼변환구현가이드_sw.md) | Terraform 변환 기본 구현 |
| [002_테라폼변환동기화클론코딩가이드_sw.md](./002_테라폼변환동기화클론코딩가이드_sw.md) | Terraform 변환/동기화 |
| [003_테라폼동기화구조설명_sw.md](./003_테라폼동기화구조설명_sw.md) | Terraform 동기화 구조 |
| [004_테라폼표현식확장설계_sw.md](./004_테라폼표현식확장설계_sw.md) | Terraform 표현식 확장 |
| [005_런타임캐시추상화가이드_sw.md](./005_런타임캐시추상화가이드_sw.md) | Runtime Cache 추상화 |
| [005_승인스냅샷재검증클론코딩가이드_sw.md](./005_승인스냅샷재검증클론코딩가이드_sw.md) | Direct Deployment 승인 snapshot 재검증 |
| [007_GitCicdHandoff계약API클론코딩가이드_sw.md](./007_GitCicdHandoff계약API클론코딩가이드_sw.md) | Git/CI/CD handoff 계약/API |
| [007_레디스런타임캐시어댑터가이드_sw.md](./007_레디스런타임캐시어댑터가이드_sw.md) | Redis Runtime Cache adapter |
| [008_배포실패설명가이드_sw.md](./008_배포실패설명가이드_sw.md) | Direct Deployment 실패 설명 |
| [009_Direct_Deployment_신뢰도_UX_클론코딩가이드_sw.md](./009_Direct_Deployment_신뢰도_UX_클론코딩가이드_sw.md) | Direct Deployment 신뢰도 UX |
| [010_Deployment_Runtime_Cache_상태로그커서가이드_sw.md](./010_Deployment_Runtime_Cache_상태로그커서가이드_sw.md) | Deployment status/log cursor Runtime Cache |
| [010_GitHub_PR_Handoff_v0_클론코딩가이드_sw.md](./010_GitHub_PR_Handoff_v0_클론코딩가이드_sw.md) | GitHub PR handoff provider |
| [011_GitCicd_Pipeline_Status_클론코딩가이드_sw.md](./011_GitCicd_Pipeline_Status_클론코딩가이드_sw.md) | Git/CI/CD pipeline status |

## 정리 규칙

- 일반 문서는 한국어로 작성한다.
- 완료된 마일스톤 계획과 오래된 임시 스펙은 `docs/sw`에 계속 보존하지 않는다.
- 남겨야 할 계약은 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`로 이관한다.
- workstream 전용 agent 규칙이 필요하면 별도 파일로 흩뜨리지 않고 해당 실행 문서에 합친다.
- Terraform 실행, AWS SDK 호출, 배포 mutation은 API 또는 worker 경계에 둔다.
- Redis는 내부 Runtime Cache이며 Practice Architecture Resource로 설명하지 않는다.
