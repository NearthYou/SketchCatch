# SW 문서 인덱스

이 폴더는 SketchCatch의 Terraform, Deployment, Git/CI/CD, Runtime Cache, Demo Web Service E2E 관련 SW 문서를 모은다.

범위와 계약이 충돌하면 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`를 우선한다.

## 최신 구현 기준

1. [Demo Web Service E2E 스펙](./spec5.md)
2. [Demo Web Service E2E 구현 마일스톤](./plan5.md)
3. [Demo Web Service E2E Agent Rules](./agents.md)
4. [Deployment, GitHub App, Runtime Cache 운영 검증 스펙](./spec3.md)
5. [Deployment, GitHub App, Runtime Cache 구현 마일스톤](./plan3.md)
6. [Blueprint 리디자인 스펙](./spec2.md)
7. [Blueprint 리디자인 구현 마일스톤](./plan2.md)
8. [Workspace Snapshot 및 Terraform Artifact 스펙](./spec.md)
9. [Workspace Snapshot 및 Terraform Artifact 구현 계획](./plan.md)

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
- agent 규범 문서는 영어로 작성한다.
- Terraform 실행, AWS SDK 호출, 배포 mutation은 API 또는 worker 경계에 둔다.
- Redis는 내부 Runtime Cache이며 Practice Architecture Resource로 설명하지 않는다.
