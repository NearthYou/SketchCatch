# Workspace AI 작업실 리팩토링 결정

## 1. 작업 식별

- 이슈: `#409`
- 범위: Workspace 진입 이후 AI 작업 경험
- 기준 문서: 이 문서, `docs/adr/0012-workspace-ai-chat-통합.md`, 같은 폴더의 `000_아키텍처보드컴파일러설계_gg.md`

이 문서는 AI가 Architecture Board와 Terraform을 분석하고 변경안을 제시한 뒤, 사용자 승인으로 적용하는 화면 계약을 정의한다. 기존 AI 채팅의 레이아웃·스타일·컴포넌트 구조는 재사용하지 않고 기능·데이터·API 계약만 유지한다.

## 2. 화면 구조

- 닫힌 상태: 글자가 함께 보이는 `AI 작업실` launcher
- desktop: Board 위에 떠 있는 비모달 작업 창
- desktop 왼쪽 mode rail: `설계 제안`, `오류 분석`, `에이전트 리뷰`
- 작업 영역: 제목, 현재 상태, transcript, 결과 artifact, 승인 action, 필요한 경우에만 composer
- mobile: `768px` 이하 전체 화면 작업실과 상단 가로 탭

세 mode는 대화 내역, 입력문, 요청 상태, 오류, 결과와 승인 대기 상태를 각각 독립적으로 보존한다. `설계 제안`만 자유 입력 composer를 제공하며, 별도 후속 대화 API가 없는 `오류 분석`과 `에이전트 리뷰`에는 가짜 입력창을 표시하지 않는다.

## 3. 상호작용 계약

### Desktop

- AI 작업실을 열어도 Board, Inspector, Terraform 등 오른쪽 패널을 닫지 않는다.
- 작업실 바깥은 pointer event를 막지 않으므로 Board와 오른쪽 패널을 계속 조작할 수 있다.
- 오른쪽 패널이 열리면 작업실은 해당 패널 왼쪽으로 이동해 겹치지 않는다.
- Terraform Issue와 Preview의 AI action은 각각 `오류 분석`, `에이전트 리뷰` mode를 선택한다. 해당 action이 단순 문맥 선택인 경우 작업실을 강제로 열지 않는다.
- desktop 작업실은 `aria-modal`과 focus trap을 사용하지 않는다.

### Mobile

- `768px` 이하에서는 작업실을 `100dvh` 전체 화면 modal로 연다.
- mode rail은 가로 탭으로 바뀐다.
- `aria-modal=true`와 focus 순환을 사용하며 safe area와 가로 overflow를 처리한다.

### Focus와 상태 복원

- 최초 열기에서만 사용할 수 있는 입력 또는 선택 지점으로 focus를 이동한다.
- `Escape` 또는 닫기 버튼으로 닫고 launcher로 focus를 복원한다.
- 닫았다 열어도 mode별 내역과 마지막 선택 mode를 유지한다.
- 일반 launcher는 마지막 mode를 복원한다.

## 4. 기능 계약

- AI는 Architecture 또는 Terraform 변경안을 제안할 수 있지만 자동 적용하지 않는다.
- `Board에 적용`, `수정 적용` 등 명시적인 승인 action을 사용자가 눌러야 실제 상태가 바뀐다.
- preview와 승인 대기 상태에서는 원본 Board와 Terraform을 변경하지 않는다.
- Board revision 또는 fingerprint가 달라진 제안은 `오래된 제안`으로 남기되 적용을 막고 다시 생성만 허용한다.
- 오류 수정은 현재 fingerprint에 맞는 안전한 수정만 제공한다. 여러 수정의 일괄 적용은 원자적으로 처리한다.
- 적용 시 정확한 파일 코드와 revision을 검증하고, 성공 후 Terraform 갱신·검증·저장을 수행한다.
- 요청 중에는 상태와 `요청 중지`를 표시하고 실제 요청을 취소한다. 취소 뒤 늦게 도착한 응답은 반영하지 않는다.
- 기존 Draft/Patch, Terraform 오류 분석, Preview 리뷰 API와 프로젝트별 history 저장 계약을 유지한다.

## 5. 시각 원칙

- AI 작업실 전용 stylesheet와 `--ai-workbench-*` token만 사용한다.
- 흰 작업면, 얇은 경계, 절제된 상태 색으로 작업 정보의 우선순위를 표현한다.
- 채팅 말풍선보다 분석 결과와 적용 artifact를 중심으로 구성한다.
- 코드와 Terraform 비교처럼 필요한 영역만 dark surface를 사용한다.
- 기능 없는 장식, fake streaming, fake composer를 추가하지 않는다.
- icon만으로 의미를 전달해야 하는 버튼에는 접근 가능한 이름을 제공한다.

## 6. 완료 조건

- 세 mode의 상태와 history가 서로 섞이지 않는다.
- desktop에서 AI 작업실을 연 채 Board와 오른쪽 패널을 조작할 수 있다.
- mobile에서 전체 화면, focus trap, safe area, 키보드 입력이 동작한다.
- 처리 중, 오류, 결과, 미리보기, 승인 대기, 오래된 제안 상태가 실제 상태와 일치한다.
- 사용자 승인 전에는 Board와 Terraform이 바뀌지 않는다.
- `Escape`, focus 이동·복원, 탭 키보드 이동, 요청 취소가 동작한다.
- `375px`, `768px`, `1280px` 이상에서 가로 overflow와 주요 UI 겹침이 없다.
- 관련 테스트, lint, typecheck와 production build가 통과한다.

## 7. 구현 결과

- 기존 dock 외형을 `AI 작업실` work window와 mode rail 구조로 교체했다.
- 기능 상태와 API 호출은 기존 controller에 유지하고, 화면 표현을 전용 workbench component와 stylesheet로 분리했다.
- 결과를 대화 문자열로만 보여주지 않고 분석 artifact, 기술 세부 내용, 수정 action과 승인 tray로 구분했다.
- desktop 비모달 상호작용과 오른쪽 패널 회피, mobile 전체 화면 modal을 각각 적용했다.
- launcher, focus 복원, safe area, reduced motion, 세 mode와 승인 handler 계약을 회귀 테스트로 고정했다.
