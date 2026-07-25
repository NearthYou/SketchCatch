# 문서 안내

`docs`에는 현재 제품을 설명하는 canonical 문서만 둔다. 테스트 fixture와 생성된 검증 자료는 해당 코드 가까이에 두고, 과거 작업 기록은 평소 읽기 대상에서 제외한다.

## Canonical 문서

| 문서 | 책임 | 읽는 시점 |
| --- | --- | --- |
| [Product](./product.md) | 제품 정의, MVP 범위, 핵심 여정, 우선순위 | 무엇을 만들지 판단할 때 |
| [Service Specification](./service-specification.md) | 서비스 흐름, 기능 요구사항, 현재 구현 상태 | 제품 방향을 구현 단위로 풀어볼 때 |
| [Data Models](./data-models.md) | DB, API, Web, AI, Terraform 공통 계약 | DTO, schema, state를 변경할 때 |
| [Architecture](./architecture.md) | stack, 저장·실행 경계, 기술 결정 | 시스템 구조나 실행 책임을 변경할 때 |
| [Development](./development.md) | 로컬 실행, Git flow, 협업 규칙, 검증 | 구현 전후 작업 절차를 확인할 때 |
| [Deployment](./deployment.md) | 운영 배포, 사용자 Deployment, cleanup | Terraform 또는 배포 작업을 다룰 때 |

## 읽기 원칙

1. 루트와 가장 가까운 `AGENTS.md`를 먼저 읽는다.
2. 작업과 직접 관련된 canonical 문서만 추가로 읽는다.
3. 현재 상태는 `agent-progress.md`, `feature_list.json`, 필요할 때만 `session-handoff.md`에서 확인한다.
4. 과거 검증 근거가 필요한 경우에만 `docs/agent-history/`를 읽는다.
5. 계약이 충돌하면 shared type과 API schema를 확인하고 canonical 문서를 함께 갱신한다.

## 보조 자료

| 경로 | 용도 |
| --- | --- |
| [`docs/assets`](./assets/) | README와 canonical 문서에서 사용하는 정적 자산 |
| [`docs/agent-history`](./agent-history/) | 오래된 작업·검증 기록 |
| [`agent-progress.md`](../agent-progress.md) | 현재 작업 상태와 최근 검증 결과 |
| [`feature_list.json`](../feature_list.json) | machine-readable 기능 및 검증 tracker |

새 기능 문서, 개인별 폴더, 중복 기획서, 생성된 테스트 evidence를 `docs`에 추가하지 않는다. 새 정보는 책임이 맞는 canonical 문서에 통합한다.
