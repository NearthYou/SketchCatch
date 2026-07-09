# SW 문서 인덱스

이 폴더는 SketchCatch의 Terraform 변환, IaC Preview 동기화, Deployment, Git/CI/CD, Runtime Cache 관련 SW 참고 문서를 모은다.

범위와 계약이 충돌하면 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`를 우선한다. 이 폴더의 완료된 계획 문서는 유지하지 않고, 현재 구현이나 남은 검증에 필요한 문서만 남긴다.

## 현재 남은 실행 기준

| 문서 | 책임 |
| --- | --- |
| [spec6.md](./spec6.md) | Git/CI/CD 자동 배포 E2E 계약과 남은 live smoke 기준 |
| [plan6.md](./plan6.md) | Git/CI/CD 자동 배포 E2E 구현 상태와 미완료 smoke 추적 |
| [agents3.md](./agents3.md) | Git/CI/CD 자동 배포 작업 전용 안전 규범 |
| [git-cicd-live-smoke.md](./git-cicd-live-smoke.md) | Git/CI/CD live smoke 실행 절차 |
| [git-cicd-live-smoke-preflight-current.json](./git-cicd-live-smoke-preflight-current.json) | 최신 preflight 증거 |
| [git-cicd-live-smoke-pr-created-current.json](./git-cicd-live-smoke-pr-created-current.json) | PR 생성 smoke 증거 |

## 구현 참고 스펙

아래 문서는 이미 구현된 흐름의 배경과 경계를 설명한다. 새 작업의 최종 계약은 반드시 canonical 문서와 shared type/API schema에서 다시 확인한다.

| 문서 | 책임 |
| --- | --- |
| [spec.md](./spec.md) | Workspace snapshot 및 Terraform artifact 저장 흐름 |
| [spec2.md](./spec2.md) | Blueprint UI 리디자인 기준 |
| [spec3.md](./spec3.md) | Deployment, GitHub App, Runtime Cache 운영 검증 범위 |
| [spec5.md](./spec5.md) | Demo Web Service E2E 범위와 safety profile |

## 구현 가이드

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
- agent 규범 문서는 현재 실행 중인 workstream에 필요할 때만 유지한다.
- 완료된 마일스톤 계획은 `docs/sw`에 보존하지 않는다. 남겨야 할 계약은 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md` 또는 구현 참고 스펙으로 합친다.
- Terraform 실행, AWS SDK 호출, 배포 mutation은 API 또는 worker 경계에 둔다.
- Redis는 내부 Runtime Cache이며 Practice Architecture Resource로 설명하지 않는다.
