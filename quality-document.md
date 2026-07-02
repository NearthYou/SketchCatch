# 품질 문서

이 문서는 SketchCatch 코드베이스와 하네스의 건전성을 시간에 따라 추적하는 스냅샷이다. 아래 등급은 2026-07-02 기준의 문서 중심 초기 평가이며, 전체 코드 감사 결과가 아니다.

## 등급 규칙

- A: 경계, 검증, handoff가 명확하고 반복 실행 가능하다.
- B: 주요 경계는 명확하지만 자동 검증이나 세부 증거가 더 필요하다.
- C: 방향은 있으나 다음 세션이 재발견해야 할 맥락이 많다.
- D: 신뢰하기 어렵고 먼저 정리해야 한다.

## 제품 도메인 스냅샷

| 도메인 | 등급 | 강점 | 주요 격차 |
| --- | --- | --- | --- |
| Product SSOT | A- | `docs/product.md`가 multi-cloud-ready IaC operations service 방향과 MVP 여정을 명확히 잡고 있다 | 기능별 실제 구현 상태를 기계 가독 형태로 추적하지 않는다 |
| Architecture and boundaries | B+ | `docs/architecture.md`가 web/api/types/storage/execution 경계를 분리한다 | provider adapter와 worker 경계의 실제 enforcement는 코드 감사가 필요하다 |
| Deployment safety | B+ | 승인, plan/apply/destroy, logs, cleanup, secret masking 원칙이 문서화되어 있다 | 실제 cloud path의 E2E smoke와 cleanup evidence가 하네스에 자동 연결되어 있지 않다 |
| Shared contracts | B | `packages/types`와 `docs/data-models.md`를 우선하는 규칙이 있다 | 세션 시작 때 계약 drift를 자동으로 감지하는 하네스는 없다 |
| Frontend workspace UX | B | workspace 관련 테스트가 다수 존재하고 UI/API 경계 규칙이 있다 | 실제 브라우저 기반 대표 여정 검증은 별도 하네스가 필요하다 |
| Agent harness | B- | AGENTS, progress, feature list, clean checklist, rubric, handoff가 생겼다 | `HARNESS-006`, `HARNESS-007` 자동화 전까지는 사람이 갱신 규율을 지켜야 한다 |

## 아키텍처 레이어 스냅샷

| 레이어 | 등급 | 경계 적용 상태 | 에이전트 가독성 |
| --- | --- | --- | --- |
| `apps/web` | B | UI와 mutation responsibility 분리 규칙이 명시되어 있다 | workspace 파일이 많아 작업 전 local AGENTS와 feature tests를 반드시 찾아야 한다 |
| `apps/api` | B | Terraform/AWS execution이 backend 쪽에 있어야 한다는 경계가 명시되어 있다 | route/service/test 배치 확인이 필요하다 |
| `packages/types` | B+ | shared type 우선 규칙이 명확하다 | DTO/Zod drift 자동 검출은 별도 작업이다 |
| `docs` | A- | canonical 문서 책임이 분리되어 있다 | 하네스 문서와 canonical 문서가 충돌하지 않게 갱신 루프가 필요하다 |
| `infra`/`deploy` | B | 운영 배포와 cloud 실행 경계가 문서화되어 있다 | 실제 배포 명령은 승인/환경 확인 없이는 실행하면 안 된다 |

## 다음 품질 개선 후보

1. `HARNESS-006`: `feature_list.json`, `agent-progress.md`, `session-handoff.md`를 검사하는 automated harness lint 추가
2. `HARNESS-007`: Representative Use Journey의 최소 browser/API smoke 정의
3. 코드 변경 시 package별 nearest `AGENTS.md`와 canonical docs를 읽었는지 확인하는 PR 템플릿 또는 CI 체크 추가
4. 실제 Direct Deployment Path의 cleanup evidence를 세션 산출물과 연결하는 run report 형식 추가

## 업데이트 규칙

- 중요한 기능 세션 후 변경된 도메인 등급만 갱신한다.
- 등급을 올릴 때는 검증 증거를 같이 적는다.
- 하네스 구성요소를 제거하거나 단순화할 때는 제거 전후 품질 스냅샷을 비교한다.
- "느낌상 좋아짐"은 등급 상승 근거가 아니다.
