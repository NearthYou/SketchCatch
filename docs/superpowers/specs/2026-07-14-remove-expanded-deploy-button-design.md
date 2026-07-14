# 확장 패널 Deploy 버튼 제거 설계

## 목적

Workspace 오른쪽 패널이 펼쳐진 상태에서 표시되는 텍스트형 `Deploy` 버튼을 제거한다. 사용자는 프로젝트 상단의 `저장하고 배포` 버튼 또는 오른쪽 패널을 접었을 때 표시되는 로켓 아이콘으로 배포 콘솔을 계속 열 수 있다.

## 변경 범위

- `WorkspaceRightPanel`의 `title="Open deployment console"` 텍스트 버튼 JSX를 제거한다.
- 접힌 오른쪽 패널의 `title="Deploy"` 로켓 아이콘 버튼은 유지한다.
- 프로젝트 상단의 `저장하고 배포` 버튼과 기존 저장 후 배포 콘솔 열기 동작은 유지한다.
- `Live Observation` 버튼과 `panelModeTextButton` 스타일은 그대로 유지한다.

## 동작 경계

이 변경은 배포 콘솔, Deployment API, Terraform 실행 또는 프로젝트 저장 동작을 수정하지 않는다. 펼쳐진 오른쪽 패널에서 중복으로 제공되던 진입 버튼 하나만 렌더링하지 않는다.

## 검증

- 소스 회귀 테스트는 `title="Open deployment console"` 버튼이 없음을 확인한다.
- 같은 테스트에서 접힌 패널의 `data-deployment-console-trigger`와 `title="Deploy"` 버튼이 남아 있음을 확인한다.
- Web 집중 테스트, lint, typecheck, build, harness check를 실행한다.

