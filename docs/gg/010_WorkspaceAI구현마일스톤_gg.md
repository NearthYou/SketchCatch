# Workspace AI 구현 마일스톤

이 문서는 이슈 #62 구현을 마일스톤 단위로 쪼개기 위한 작업 기준이다.

기준 문서:

- `docs/gg/009_WorkspaceAI통합마감계획_gg.md`
- `docs/gg/003_고도화.md`

완료 기준은 실제 `/workspace`에서 아래 흐름이 한 번 끝까지 되는 것이다.

```text
자연어 입력
→ Architecture Draft 생성
→ preview 요약 확인
→ 보드에 반영
→ 검사 실행
→ 시뮬레이션 실행
→ 각 결과 아래 AI 설명 확인
```

## 마일스톤 1. 보드 변환 경계 만들기

목표:

- `ArchitectureJson`을 현재 Architecture Board가 쓰는 `DiagramJson`으로 바꾸는 변환 경계를 만든다.
- 현재 Architecture Board 상태를 API 입력용 `ArchitectureJson`으로 바꾸는 변환 경계를 만든다.

TDD 기준:

- 변환 함수 테스트를 먼저 작성한다.
- 빈 보드, Resource, Edge, 알 수 없는 값 처리 기준을 테스트로 고정한다.

커밋 기준:

- 변환 함수와 테스트가 함께 통과하면 커밋한다.

## 마일스톤 2. 오른쪽 AI 패널 기본 흐름 연결

목표:

- 실제 `/workspace` 오른쪽 패널에 AI 모드를 추가한다.
- Requirement Prompt 입력, Architecture Draft 생성 버튼, preview 요약, `보드에 반영` 버튼을 연결한다.
- `보드에 반영`은 현재 보드를 Architecture Draft 결과로 교체한다.

TDD 기준:

- 순수 상태 변환이나 helper는 테스트를 먼저 작성한다.
- UI 배치는 필요하면 수동 QA로 확인한다.

커밋 기준:

- `/workspace`에서 Draft 생성과 보드 반영 흐름이 보이면 커밋한다.

## 마일스톤 3. 분석 실행 연결

목표:

- AI 패널에서 현재 Architecture Board 기준 Pre-Deployment Check를 실행한다.
- AI 패널에서 현재 Architecture Board 기준 Design Simulation을 실행한다.
- 두 분석은 `보드에 반영` 직후 자동 실행하지 않는다.

TDD 기준:

- 보드 상태를 분석 API 입력으로 만드는 helper는 테스트를 먼저 작성한다.
- API 호출 UI는 mock 가능한 경계가 있으면 테스트한다.

커밋 기준:

- 검사와 시뮬레이션이 각각 독립 버튼으로 실행되면 커밋한다.

## 마일스톤 4. UX 안전장치와 AI 설명 표시

목표:

- 빈 보드와 변환 실패 안내를 표시한다.
- 기능별 loading 상태를 분리한다.
- 보드 변경 후 기존 분석 결과에 `다시 실행 필요` 상태를 표시한다.
- Draft, Check, Simulation 결과 아래에 각각 `AI 설명`을 표시한다.
- `fallbackUsed: true`일 때 작은 `기본 설명 사용` 표시만 붙인다.

TDD 기준:

- stale 판정이나 표시용 helper가 생기면 테스트를 먼저 작성한다.
- UI 문구와 배치는 수동 QA로 확인한다.

커밋 기준:

- 실패/로딩/stale/fallback 표시가 실제 화면에서 확인되면 커밋한다.

## 마일스톤 5. 마감 검증

목표:

- API key 없음 상태에서 fallback 흐름을 확인한다.
- OpenAI key가 있는 경우 실제 설명 품질을 확인한다.
- `/workspace`에서 완료 기준 흐름을 수동으로 확인한다.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행한다.

커밋 기준:

- 검증 중 발견한 작은 UX 보강이 있으면 관련 코드와 함께 커밋한다.
- 검증만 수행하고 코드 변경이 없으면 커밋하지 않는다.

## 이번 브랜치에서 하지 않을 것

- Terraform Preview 자동 생성
- Deployment 흐름 직접 연결
- Resource 자동 수정
- preview diagram
- 채팅형 AI
- streaming 응답
- `/workspace/ai` 제거 또는 접근 제한

위 항목은 필요하면 `docs/gg/003_고도화.md`에 남긴다.
