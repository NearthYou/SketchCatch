# 템플릿 전체보기 Portal 설계

## 목적

Workspace 왼쪽 Template 패널의 전체보기 동작을 명확한 이름으로 제공하고, 모달이 상단 프로젝트 네비게이터나 다른 Workspace 레이어와 겹치지 않게 한다.

## 사용자 경험

- 전체보기 진입 버튼의 화면 문구, `aria-label`, 모달 접근성 이름은 `템플릿 전체보기`로 통일한다.
- 상단 프로젝트 네비게이터 64px는 모달이 열린 동안에도 밝게 유지한다.
- 반투명 딤 영역은 네비게이터 아래부터 시작하며 그 아래 Workspace 입력을 차단한다.
- 모달은 남은 화면 안에서 가운데 정렬되고, 내용이 길면 모달 내부에서 스크롤된다.
- 템플릿을 선택하면 기존처럼 현재 Board에 적용하고 모달을 닫는다.

## 구조

`TemplateLibraryModal`은 `createPortal(..., document.body)`로 렌더링한다. 이로써 `leftRail`의 `z-index: 21`, `overflow: hidden`, stacking context에서 벗어나 독립된 모달 레이어가 된다.

Portal은 클라이언트 DOM이 준비된 뒤에만 생성한다. 오버레이는 `inset: 64px 0 0`을 사용하고, 모달 최대 높이는 `calc(100dvh - 112px)`로 제한해 64px 네비게이터와 상하 24px 여백을 모두 보존한다.

## 접근성

- dialog에 `aria-modal="true"`와 `aria-label="템플릿 전체보기"`를 제공한다.
- 전체보기 진입 버튼의 `aria-label`과 화면에 보이는 기능명도 `템플릿 전체보기`로 통일한다. 큰 화면 비교와 Board 비적용 안내는 기능명과 분리된 설명으로 제공한다.
- 모달이 열리기 전 활성 요소를 저장하고 닫기 버튼으로 초기 포커스를 이동한다.
- `Escape`는 모달을 닫고, `Tab`과 `Shift+Tab`은 dialog의 첫 번째와 마지막 focusable 요소 사이에서 순환한다.
- Portal overlay를 제외한 `document.body` 직계 자식은 기존 `inert` 값을 보존한 뒤 모달이 열린 동안 비활성화한다. 같은 기간 body 스크롤도 잠근다.
- cleanup은 keydown listener, 각 body 자식의 `inert`, body overflow, 열기 전 포커스를 모두 원래 상태로 복원한다.
- 닫기 버튼은 keyboard focus에 2px visible outline을 제공한다.
- 바깥 클릭 닫기 동작은 추가하지 않는다.

## 검증

- 소스 계약 테스트로 `createPortal`, `document.body`, 통일된 문구를 검증한다.
- CSS 계약 테스트로 오버레이의 64px 상단 오프셋과 모달의 남은 화면 높이 계산을 검증한다.
- 기존 Template 카드의 즉시 적용과 전체보기 버튼의 모달 전용 동작이 그대로 유지되는지 회귀 테스트한다.
- source regression으로 React ref 연결, 최신 close callback과 mount-only lifecycle effect를 검증한다.
- 새 의존성 없이 Node `EventTarget` 기반 fake DOM regression으로 초기/복원 포커스, Escape, 양방향 Tab 순환, body `inert`/overflow 보존과 cleanup을 실제 실행한다.
- 닫기 버튼의 `:focus-visible` CSS가 2px outline과 offset을 유지하는지 검증한다.
