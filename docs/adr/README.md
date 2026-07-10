# ADR 문서 인덱스

이 폴더는 되돌리기 어렵거나 여러 파트에 영향을 주는 결정을 남기는 곳이다. 구현 아이디어나 임시 메모는 담당자별 참고 문서에 두고, 확정된 결정만 ADR로 남긴다.

## 읽는 순서

| 문서 | 결정 | 언제 읽는가 |
| --- | --- | --- |
| [0001-ai-assists-deterministic-architecture-flow.md](./0001-ai-assists-deterministic-architecture-flow.md) | AI는 설계를 보조하고 deterministic architecture flow와 사용자 수락을 기준으로 상태를 바꾼다 | AI 추천, Architecture Draft, User-Accepted Change 경계를 바꿀 때 |
| [0002-service-execution-paths-and-provider-boundary.md](./0002-service-execution-paths-and-provider-boundary.md) | Direct Deployment Path와 Git/CI/CD Deployment Path를 함께 두고 Provider Adapter 경계를 유지한다 | Deployment, Git/CI/CD handoff, Reverse Engineering, provider 확장을 다룰 때 |
| [0003-gg-template-selection-ai-handoff.md](./0003-gg-template-selection-ai-handoff.md) | gg는 선택한 Template 하나와 분석 근거를 AI 파트에 전달하고 후보 목록은 전달하지 않는다 | Repository Analysis, Template Selection, AI Handoff 계약을 다룰 때 |
| [0004-gg-repository-analysis-evidence-boundary.md](./0004-gg-repository-analysis-evidence-boundary.md) | gg는 제한된 evidence를 정적으로 분석하고 Repository를 실행하지 않는다 | Repository Analysis 범위와 안전 경계를 다룰 때 |
| [0005-monorepo-analysis-and-template-selection.md](./0005-monorepo-analysis-and-template-selection.md) | monorepo는 하나의 Repository Analysis와 여러 Application Unit으로 표현하고 Template은 저장소 전체에 하나를 선택한다 | monorepo 분석 결과와 Template Selection 구조를 다룰 때 |
| [0006-template-selection-failure-on-repository-mismatch.md](./0006-template-selection-failure-on-repository-mismatch.md) | 지원 Template과 맞지 않으면 Template을 고르지 않고 불일치 이유를 반환한다 | Template과 맞지 않는 Repository Analysis 결과를 다룰 때 |
| [0007-template-selection-failure-ai-handoff.md](./0007-template-selection-failure-ai-handoff.md) | Template Selection Failure도 fallback 없이 AI Handoff로 전달한다 | Template 선택 실패와 AI 파트 연결을 다룰 때 |
| [0008-non-persistent-repository-analysis.md](./0008-non-persistent-repository-analysis.md) | Repository Analysis 결과를 저장하지 않고 요청마다 새로 정적 분석한다 | 분석 결과 저장과 재분석 조건을 다룰 때 |

## 추가 규칙

- 새 ADR은 다음 번호를 사용한다.
- 이미 결정된 내용을 바꿀 때는 기존 ADR을 조용히 덮어쓰지 말고 새 ADR에서 변경 이유와 이전 결정과의 관계를 남긴다.
- ADR 내용이 제품 범위, 데이터 모델, 실행 경계를 바꾸면 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`도 함께 갱신한다.
