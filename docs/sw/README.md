# SW Terraform 문서 인덱스

이 폴더는 Architecture Board, Terraform 변환/동기화/Artifact 저장, Runtime Cache 흐름의 참고 문서를 모은다. 확정 계약은 `docs/data-models.md`, 실행 경계는 `docs/architecture.md`를 우선한다.

## 빠른 읽기 순서

1. Blueprint 리디자인 작업은 [spec2.md](./spec2.md), [plan2.md](./plan2.md), [agents2.md](./agents2.md)를 먼저 본다.
2. 현재 Workspace Snapshot과 Terraform Artifact 작업은 [spec.md](./spec.md)와 [plan.md](./plan.md)를 먼저 본다.
3. Terraform 변환 기본 흐름은 [001_테라폼변환구현가이드_sw.md](./001_테라폼변환구현가이드_sw.md)를 본다.
4. 코드와 다이어그램 동기화는 [002_테라폼변환동기화클론코딩가이드_sw.md](./002_테라폼변환동기화클론코딩가이드_sw.md)와 [003_테라폼동기화구조설명_sw.md](./003_테라폼동기화구조설명_sw.md)를 본다.
5. Terraform 표현식 확장은 [004_테라폼표현식확장설계_sw.md](./004_테라폼표현식확장설계_sw.md)를 본다.
6. Runtime Cache 추상화와 메모리 fallback은 [005_런타임캐시추상화가이드_sw.md](./005_런타임캐시추상화가이드_sw.md)를 본다.
7. Direct Deployment 승인 스냅샷 재검증은 [005_승인스냅샷재검증클론코딩가이드_sw.md](./005_승인스냅샷재검증클론코딩가이드_sw.md)를 본다.
8. Direct Deployment 실패 설명은 [008_배포실패설명가이드_sw.md](./008_배포실패설명가이드_sw.md)를 본다.
9. Redis Runtime Cache adapter는 [007_레디스런타임캐시어댑터가이드_sw.md](./007_레디스런타임캐시어댑터가이드_sw.md)를 본다.
10. Git/CI/CD handoff 계약과 API 생명주기는 [007_GitCicdHandoff계약API클론코딩가이드_sw.md](./007_GitCicdHandoff계약API클론코딩가이드_sw.md)를 본다.

## 문서 목록

| 문서 | 책임 |
| --- | --- |
| [spec.md](./spec.md) | Workspace Snapshot 및 Terraform Artifact 저장 스펙 |
| [plan.md](./plan.md) | Workspace Snapshot 및 Terraform Artifact 구현 계획 |
| [spec2.md](./spec2.md) | Blueprint 리디자인 적용 스펙 |
| [plan2.md](./plan2.md) | Blueprint 리디자인 구현 마일스톤 |
| [agents2.md](./agents2.md) | Blueprint 리디자인 작업 규범 |
| [001_테라폼변환구현가이드_sw.md](./001_테라폼변환구현가이드_sw.md) | Terraform 변환 클론 코딩 가이드 |
| [002_테라폼변환동기화클론코딩가이드_sw.md](./002_테라폼변환동기화클론코딩가이드_sw.md) | Terraform 변환 동기화 클론 코딩 가이드 |
| [003_테라폼동기화구조설명_sw.md](./003_테라폼동기화구조설명_sw.md) | Terraform 변환/검증/동기화 구조 설명 |
| [004_테라폼표현식확장설계_sw.md](./004_테라폼표현식확장설계_sw.md) | Terraform 표현식 확장 설계 메모 |
| [005_런타임캐시추상화가이드_sw.md](./005_런타임캐시추상화가이드_sw.md) | Runtime Cache 추상화, 메모리 fallback, Redis adapter 준비 가이드 |
| [006_승인스냅샷재검증클론코딩가이드_sw.md](./005_승인스냅샷재검증클론코딩가이드_sw.md) | Direct Deployment 승인 스냅샷 재검증 클론 코딩 가이드 |
| [007_레디스런타임캐시어댑터가이드_sw.md](./007_레디스런타임캐시어댑터가이드_sw.md) | Redis Runtime Cache adapter, REDIS_URL 선택 정책, degraded fallback 가이드 |
| [008_배포실패설명가이드_sw.md](./008_배포실패설명가이드_sw.md) | Direct Deployment 실패 설명 DTO, fallback, UI 표시 가이드 |
| [009_GitCicdHandoff계약API클론코딩가이드_sw.md](./007_GitCicdHandoff계약API클론코딩가이드_sw.md) | Git/CI/CD handoff 계약과 API 생명주기 클론 코딩 가이드 |

## 정리 규칙

- 새 Terraform DTO나 artifact 계약은 `docs/data-models.md`에 먼저 반영한다.
- UI 동작 설명은 이 폴더에 남기되, 실행 책임을 frontend로 옮기는 표현은 쓰지 않는다.
- 실제 Terraform CLI 실행은 backend/worker 경계로 유지한다.
- Runtime Cache는 원천 기록이 아니며 Redis를 사용자 Practice Architecture Resource로 설명하지 않는다.
