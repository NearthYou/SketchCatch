# CI/CD 1차 단순화 설계

## 목적

CI/CD 화면은 사용자가 현재 배포 상태와 다음 행동을 빠르게 판단하도록 돕는다. 이번 변경은 기능을 제거하지 않고 같은 readiness와 갱신 행동을 여러 위치에서 반복하는 UI만 줄인다.

## 승인 범위

1. 헤더의 readiness 배지와 `구성 및 실행` 우측 완료·조치 카운트를 제거한다.
2. 상태 블록과 같은 의미를 반복하는 얇은 진행 막대를 제거한다.
3. `자동 설정 결과` 아코디언을 없애고 `프로젝트 배포 타깃` 내부의 `감지된 배포 정보`로 병합한다.
4. 상단 버튼이 Delivery Profile, Deployment, Handoff, GitHub Pipeline Run을 함께 갱신하는 `전체 새로고침`이 되게 하고 Pipeline 행의 별도 새로고침을 제거한다.

## 정보 위계

- 헤더: `CI/CD`, 마지막 확인 시각, `전체 새로고침`만 표시한다.
- 상태보드: Delivery 연결, 배포 준비, 배포 PR, Pipeline 상태와 한 개의 현재 행동을 표시한다.
- 배포 PR이 준비되지 않았을 때 PR 값은 readiness 비율을 반복하지 않고 `대기`로 표시한다.
- 상세 blocker, PR 검토, Repository·Branch·Plan 확인, Pipeline Activity·Logs는 안전 정보이므로 유지한다.

## 컴포넌트 경계

- `DeliveryCenterPanel`은 헤더와 Delivery Profile을 소유하고 `CicdConsoleScreenHandle.refreshAll()`을 호출한다.
- `CicdConsoleScreen`은 기존 `manualRefresh()`를 공개 handle로 노출한다. 이 함수만 전체 갱신을 조정한다.
- `CicdPipelineRunsPanel`은 상태와 상세만 표시하며 독립 갱신 버튼을 소유하지 않는다.
- `CicdAutomaticSetupSummary`는 재사용하되 배포 타깃 아코디언 내부에서 렌더링한다.

## 상태와 오류

- 전체 갱신 중에는 상단 버튼을 비활성화하고 `새로고침 중`을 표시한다.
- Profile이 아직 없으면 기존 `다시 시도` 동작으로 Profile만 다시 요청한다.
- 전체 갱신 오류, GitHub 권한 복구, PR 승인 안전 게이트는 기존 동작을 유지한다.

## 검증

- 소스 계약 테스트로 중복 요소 제거, 요약 병합, 전체 갱신 handle 연결을 고정한다.
- 기존 CI/CD heading, readiness, Pipeline presentation, 반응형 계약을 함께 실행한다.
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`를 통과해야 한다.

## 범위 밖

- Delivery 연결과 GitOps 감시 설정 통합
- PR·Pipeline 기본 열림 정책 변경
- API 또는 DB 계약 변경
- 실제 배포, GitHub PR 생성, AWS 변경
