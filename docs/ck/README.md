# CK 배포 실행 문서 인덱스

이 폴더는 Deployment, AWS Role 연결, Terraform Plan/Apply/Destroy, cleanup, AI 다이어그램 검수 관련 구현 참고 문서를 모은다. 실제 공통 정책은 `docs/deployment.md`, API/DB 계약은 `docs/data-models.md`, 실행 경계는 `docs/architecture.md`가 우선한다.

## 빠른 읽기 순서

1. 전체 상태는 [001_배포실행파트구현계획.md](./001_배포실행파트구현계획.md)를 본다.
2. 개념과 사용자 여정은 [002_배포실행파트개념과구현흐름정리.md](./002_배포실행파트개념과구현흐름정리.md)를 본다.
3. 파트 간 입력/출력은 [003_배포파트의존성정리.md](./003_배포파트의존성정리.md)를 본다.
4. 실제 구현 순서는 [005_배포파트구현순서.md](./005_배포파트구현순서.md)와 [006_실제배포실행구현순서.md](./006_실제배포실행구현순서.md)를 본다.
5. Apply/Destroy 세부는 [010_TerraformApply실행흐름정리.md](./010_TerraformApply실행흐름정리.md)와 [012_TerraformDestroy실행흐름정리.md](./012_TerraformDestroy실행흐름정리.md)를 본다.
6. AI 다이어그램을 검수할 때는 [ai/002_아키텍처다이어그램검수가이드.md](./ai/002_아키텍처다이어그램검수가이드.md)를 본다.

## 문서 목록

| 문서 | 책임 |
| --- | --- |
| [001_배포실행파트구현계획.md](./001_배포실행파트구현계획.md) | 배포 실행 파트 작업 체크리스트와 완료 상태 |
| [002_배포실행파트개념과구현흐름정리.md](./002_배포실행파트개념과구현흐름정리.md) | Deployment 개념, 사용자 흐름, 안전 경계 설명 |
| [003_배포파트의존성정리.md](./003_배포파트의존성정리.md) | 배포 파트가 다른 파트와 주고받는 입력/출력 |
| [004_배포파트결정사항초안.md](./004_배포파트결정사항초안.md) | 구현 범위와 타입/API/DB/안전 결정 초안 |
| [005_배포파트구현순서.md](./005_배포파트구현순서.md) | 배포 파트 구현 순서와 작업 단위 |
| [006_실제배포실행구현순서.md](./006_실제배포실행구현순서.md) | Terraform 실행, apply, 결과 저장 상세 순서 |
| [007_AWSRole연결구현변경정리.md](./007_AWSRole연결구현변경정리.md) | AWS Role 연결 방식과 검증 흐름 |
| [008_배포Plan실행흐름정리.md](./008_배포Plan실행흐름정리.md) | Terraform Plan 실행 흐름 |
| [009_Plan실행속도개선정리.md](./009_Plan실행속도개선정리.md) | Provider cache와 Plan 속도 개선 |
| [010_TerraformApply실행흐름정리.md](./010_TerraformApply실행흐름정리.md) | Terraform Apply 실행, 승인 snapshot, 로그/결과 저장 |
| [011_TerraformApply보안보강정리.md](./011_TerraformApply보안보강정리.md) | Apply 보안 보강 내용 |
| [012_TerraformDestroy실행흐름정리.md](./012_TerraformDestroy실행흐름정리.md) | Terraform Destroy와 cleanup 실행 흐름 |
| [013_PlanApplyDestroy실행속도개선정리.md](./013_PlanApplyDestroy실행속도개선정리.md) | Plan/Apply/Destroy 실행 속도 개선 |
| [014_PlanApplyDestroy문제해결흐름정리.md](./014_PlanApplyDestroy문제해결흐름정리.md) | Plan/Apply/Destroy 문제 해결 흐름 |
| [ai/001_AIProvider실행흐름정리.md](./ai/001_AIProvider실행흐름정리.md) | AI Provider 실행 흐름과 승인 경계 |
| [ai/002_아키텍처다이어그램검수가이드.md](./ai/002_아키텍처다이어그램검수가이드.md) | 일반 클라우드 아키텍처 다이어그램 검수 기준 |

## 정리 규칙

- 완료 상태를 바꿀 때는 `001_배포실행파트구현계획.md`를 먼저 갱신한다.
- 실제 실행 정책이 바뀌면 `docs/deployment.md`에도 반영한다.
- shared type, DB, DTO가 바뀌면 `docs/data-models.md`와 코드 계약을 함께 갱신한다.
- AI 다이어그램 지식 문서는 특정 구현 상태보다 일반 개념과 검수 기준을 우선한다.
