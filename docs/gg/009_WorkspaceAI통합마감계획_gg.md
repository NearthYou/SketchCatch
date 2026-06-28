# Workspace AI 통합 마감 계획

이 문서는 이슈 #62에서 gg AI 파트를 MVP 안에서 끝내기 위한 이번 작업 범위를 정리한다.

## 1. 목표

실제 `/workspace`에서 사용자가 자연어로 Architecture Draft를 만들고, 확인 후 Architecture Board에 반영하고, 같은 화면에서 Pre-Deployment Check와 Design Simulation, LLM 설명까지 확인할 수 있게 한다.

`/workspace/ai`는 데모 화면으로 남길 수 있지만, gg AI 파트의 완료 기준은 실제 `/workspace` 통합이다.

## 2. 이번 작업에 포함

- 실제 `/workspace`에 자연어 Architecture Draft 입력 연결
- 생성된 Architecture Draft 요약 표시
- 사용자가 확인한 뒤 Architecture Board에 반영
- 현재 보드 기준 Pre-Deployment Check 실행
- 현재 보드 기준 Design Simulation 실행
- 각 결과 근처에 `AI 설명` 표시
- API key 없음 fallback 확인
- OpenAI key 사용 시 실제 설명 확인

## 3. 이번 작업에서 제외

- Resource 자동 수정
- Terraform Apply 실행
- 실제 AWS 배포 실행
- 채팅형 AI
- 스트리밍 응답
- 설계 버전 비교

## 4. 결정 사항

### 4.1 Workspace 통합 범위

선택: 자연어 Architecture Draft 생성부터 보드 반영, 분석, 설명까지 실제 `/workspace`에 연결한다.

이유:

- 데모 화면만 있으면 실제 작업대 통합이 끝난 것이 아니다.
- 분석만 붙이면 사용자가 Architecture Draft를 보드로 가져오는 흐름이 비어 있다.
- 이번 MVP 이후 gg AI 파트가 따로 남지 않으려면 실제 Workspace 흐름에서 끝까지 확인되어야 한다.

### 4.2 보드 반영 방식

선택: Architecture Draft 생성 직후 자동 반영하지 않고, 사용자가 `보드에 반영` 버튼을 눌렀을 때 반영한다.

이유:

- 기존 보드를 실수로 덮어쓰는 위험을 줄인다.
- 시연 흐름이 `초안 생성 -> 확인 -> 보드 반영`으로 명확해진다.
- AI가 만든 결과를 사용자가 승인한 뒤 적용한다는 경계를 유지한다.

### 4.3 Architecture Draft 보드 변환 경계

선택: `ArchitectureJson`을 실제 보드가 사용하는 `DiagramJson`으로 바꾸는 작은 변환 함수를 만든다.

이유:

- AI API 응답 계약은 `ArchitectureJson`으로 유지한다.
- Architecture Board 내부 구조를 크게 바꾸지 않는다.
- 보드 반영 전용 변환 경계가 있으면 테스트와 디버깅이 쉽다.
- 표시용 데이터를 대충 보드 노드로 매핑하지 않는다.

### 4.4 Workspace AI UI 위치

선택: 오른쪽 패널에 AI 탭/모드를 추가한다.

이유:

- 기존 `/workspace`가 오른쪽 패널에서 Resource, Terraform, Issues, Deploy 역할을 나눠 보여주는 흐름과 맞는다.
- Architecture Board 옆에서 Architecture Draft 생성, 보드 반영, Pre-Deployment Check, Design Simulation을 바로 확인할 수 있다.
- 모달보다 보드와 AI 결과를 비교하기 쉽다.
- 하단 상시 섹션보다 보드 공간을 덜 침범한다.

### 4.5 AI 패널 내부 배치

선택: 하나의 AI 패널 안에 `Architecture Draft 생성 -> 보드 반영 -> Pre-Deployment Check -> Design Simulation` 순서로 세로 배치한다.

이유:

- 사용자가 요구사항 입력부터 분석 확인까지 한 흐름으로 진행할 수 있다.
- 시연할 때 `요구사항 입력 -> 초안 생성 -> 보드 반영 -> 검사 -> 시뮬레이션` 순서가 바로 보인다.
- 오른쪽 패널 안에 다시 기능별 탭을 만들면 조작 단계가 늘어난다.
- Draft만 AI 패널에 두고 Check와 Simulation을 다른 위치에 두면 AI 기능 흐름이 흩어져 보인다.

후속 확장:

- 다른 팀원 작업이 안정된 뒤 Terraform 영역과 Deploy 영역에 AI 기능을 각각 더 자연스럽게 붙인다.
- 이번 MVP에서는 `/workspace` 안에서 gg AI 흐름을 끝까지 확인하는 것이 우선이다.

### 4.6 Architecture Draft 반영 방식

선택: 사용자가 `보드에 반영`을 누르면 현재 Architecture Board를 Architecture Draft 결과로 통째로 교체한다.

이유:

- 이번 MVP에서는 자연어 입력으로 만든 Architecture Draft가 실제 보드에 들어가는 흐름을 검증하는 것이 우선이다.
- 기존 보드와 AI Draft를 병합하면 Resource 중복, Edge 충돌, id 충돌 규칙이 필요해진다.
- Resource별 선택 적용은 사실상 보드 diff/merge 기능이므로 이번 작업 범위를 넘는다.
- 교체 방식은 시연 흐름이 `초안 생성 -> 확인 -> 보드 교체 -> 검사/시뮬레이션`으로 명확하다.

UI 기준:

- `보드에 반영` 버튼 근처에 현재 보드가 AI 초안으로 교체된다는 안내를 둔다.
- 자동 반영은 하지 않고, 사용자가 버튼을 눌렀을 때만 교체한다.
- 별도 확인 모달은 띄우지 않는다.
- 안내 문구 예: `현재 보드는 AI 초안으로 교체됩니다.`

### 4.7 Terraform Preview 갱신 경계

선택: `보드에 반영` 후 Terraform Preview를 자동 생성하거나 자동 갱신하지 않는다.

이유:

- 이번 MVP의 gg 범위는 Architecture Draft를 실제 Architecture Board에 반영하고, 그 보드 기준으로 Pre-Deployment Check와 Design Simulation을 확인하는 것이다.
- Terraform 생성, 저장, 검증 상태는 sw 흐름과 맞춰야 한다.
- 보드 반영 직후 Terraform Preview를 자동 생성하면 인증, 저장 상태, 기존 Terraform 변경 사항과 엮일 수 있다.
- AI 패널 안에 Terraform 생성 버튼을 넣으면 gg AI 패널이 sw 기능까지 들고 오는 모양이 된다.

UI 기준:

- AI 패널에서는 Terraform Preview 자동 갱신을 하지 않는다.
- Terraform 생성은 기존 Terraform 패널 또는 기존 버튼 흐름을 사용한다.

### 4.8 Pre-Deployment Check와 Design Simulation 실행 타이밍

선택: `보드에 반영` 직후 Pre-Deployment Check와 Design Simulation을 자동 실행하지 않는다.

사용자는 AI 패널 안에서 각각 `검사 실행`, `시뮬레이션 실행` 버튼을 눌러 실행한다.

이유:

- 보드 반영, Pre-Deployment Check, Design Simulation의 성공/실패 상태를 분리할 수 있다.
- 자동 실행하면 로딩 시간이 길어지고 실패 위치가 흐려질 수 있다.
- 사용자가 현재 보드 상태를 확인한 뒤 필요한 분석을 직접 실행하는 흐름이 더 명확하다.
- 이번 MVP에서는 각 API 호출을 독립적으로 시연하고 검증하는 것이 안전하다.

UI 기준:

- `보드에 반영` 완료 후 자동으로 분석 API를 호출하지 않는다.
- `검사 실행` 버튼은 현재 Architecture Board 기준 Pre-Deployment Check를 실행한다.
- `시뮬레이션 실행` 버튼은 현재 Architecture Board 기준 Design Simulation을 실행한다.

### 4.9 분석 기준

선택: Pre-Deployment Check와 Design Simulation은 마지막 AI Draft 원본이 아니라 현재 Architecture Board 상태를 기준으로 실행한다.

구현 기준:

- 현재 Architecture Board 상태를 API 입력용 `ArchitectureJson`으로 변환한다.
- 변환된 `ArchitectureJson`을 Pre-Deployment Check와 Design Simulation API에 전달한다.
- 사용자가 보드를 수정한 뒤 실행하면 수정된 보드 상태를 기준으로 분석한다.

이유:

- 실제 `/workspace` 통합이라고 말하려면 화면에 보이는 Architecture Board가 분석 기준이어야 한다.
- 마지막 AI Draft 원본을 기준으로 분석하면 사용자가 보드를 수정했을 때 화면과 분석 결과가 달라질 수 있다.
- AI Draft로 만든 보드뿐 아니라 사용자가 직접 만든 보드도 같은 분석 흐름을 탈 수 있어야 한다.

UI 기준:

- 분석 결과에는 현재 Architecture Board 기준으로 실행했다는 맥락이 드러나야 한다.
- AI Draft를 생성했지만 아직 보드에 반영하지 않았다면, 분석 버튼은 현재 보드 기준으로 동작한다.

### 4.10 빈 보드와 변환 실패 처리

선택: 현재 Architecture Board가 비어 있거나 API 입력용 `ArchitectureJson`으로 변환할 수 없더라도 분석 버튼은 화면에 보여준다.

사용자가 실행했을 때 안내 메시지를 보여준다.

예:

```text
분석할 Resource가 없습니다. 먼저 Architecture Draft를 보드에 반영하거나 Resource를 추가하세요.
```

이유:

- 버튼을 숨기거나 비활성화하면 사용자가 왜 실행할 수 없는지 놓칠 수 있다.
- 실행 시 안내하면 현재 분석 기준이 Architecture Board라는 점을 같이 설명할 수 있다.
- 빈 보드에 샘플 Architecture Draft를 자동 삽입하면 사용자 의도와 다르게 보드가 바뀐다.

UI 기준:

- 빈 보드에서는 분석 API를 호출하지 않고 안내 메시지를 표시한다.
- 변환 실패 시에도 API를 호출하지 않고 변환 실패 안내를 표시한다.
- 자동으로 샘플 Resource를 추가하지 않는다.

### 4.11 Architecture Draft 생성 실패 처리

선택: Architecture Draft 생성이 실패하면 AI 패널 안에 에러 메시지를 보여주고, 기존 Architecture Board는 그대로 둔다.

예:

```text
Architecture Draft 생성에 실패했습니다. 입력을 줄이거나 다시 시도하세요.
```

이유:

- Draft 생성 실패는 보드 변경 전 단계이므로 기존 Architecture Board를 건드리면 안 된다.
- 실패 시 fallback 샘플 Architecture Draft를 자동으로 보여주면 사용자가 입력한 요구사항과 다른 결과가 나올 수 있다.
- `/workspace/ai` 데모 화면으로 보내는 방식은 실제 `/workspace` 통합 목표와 맞지 않는다.

UI 기준:

- 실패 메시지는 AI 패널 안에 표시한다.
- 기존 보드 상태는 유지한다.
- `보드에 반영` 버튼은 성공한 Architecture Draft가 있을 때만 의미 있게 동작한다.
- 사용자는 같은 입력을 수정하거나 다시 시도할 수 있다.

### 4.12 Architecture Draft preview 표시

선택: Architecture Draft 생성에 성공하면 보드에 반영하기 전 간단한 preview 요약만 보여준다.

표시할 것:

- Architecture Draft 제목 또는 요약
- Resource 개수
- 주요 Resource 타입
- assumptions
- warnings
- `보드에 반영` 버튼

이유:

- 실제 다이어그램은 `보드에 반영` 후 Architecture Board에서 확인하면 된다.
- 오른쪽 패널 안에 작은 preview diagram을 만들면 보드 미니맵을 또 만드는 작업이 된다.
- JSON을 바로 노출하면 개발자에게는 유용하지만 일반 시연 흐름에서는 부담스럽다.
- MVP에서는 사용자가 “이 초안이 어떤 구조인지”만 확인하고 반영할 수 있으면 충분하다.

UI 기준:

- preview 요약은 AI 패널 안에서 접히지 않는 기본 결과로 보여준다.
- 원본 JSON은 기본 사용자 화면에 노출하지 않는다.
- preview diagram은 이번 MVP에서 만들지 않는다.

### 4.13 AI 설명 표시 위치

선택: `AI 설명`은 AI 패널 맨 위의 공통 박스가 아니라 각 기능 결과 바로 아래에 붙인다.

표시 위치:

- Architecture Draft preview 요약 아래
- Pre-Deployment Check 결과 아래
- Design Simulation 결과 아래

이유:

- 사용자가 어떤 결과에 대한 설명인지 바로 이해할 수 있다.
- 공통 상단 박스 하나로 모으면 Draft, Check, Simulation 중 어느 결과 설명인지 헷갈릴 수 있다.
- 접힘 영역 안에 숨기면 시연 중 AI 설명이 붙었다는 점이 잘 보이지 않을 수 있다.
- 서버 응답 구조는 공통 `llmExplanation`을 유지하더라도 화면에서는 target별 결과 근처에 보여주는 것이 자연스럽다.

UI 기준:

- `AI 설명`은 기본으로 펼쳐서 보여준다.
- `fallbackUsed: true`이면 작은 `기본 설명 사용` 표시만 붙인다.
- AI 설명만 보고 Resource를 자동 변경하거나 배포하지 않는다.

### 4.14 보드 변경 후 분석 결과 처리

선택: Pre-Deployment Check 또는 Design Simulation 결과가 나온 뒤 Architecture Board가 변경되면 기존 분석 결과는 유지하되, 오래된 결과라는 표시를 붙인다.

표시 문구 예:

```text
보드가 변경되었습니다. 다시 실행하세요.
```

이유:

- 분석 기준은 현재 Architecture Board이므로 보드가 바뀌면 기존 결과가 최신 상태가 아닐 수 있다.
- 결과를 바로 지우면 사용자가 방금 확인한 내용을 갑자기 잃는다.
- 보드 변경마다 자동 재분석하면 API 호출, loading, 실패 상태가 복잡해진다.
- MVP에서는 사용자가 직접 다시 실행하는 흐름이 가장 명확하다.

UI 기준:

- 기존 Pre-Deployment Check 결과와 Design Simulation 결과는 화면에 유지한다.
- 보드 변경 감지 후 결과 영역 근처에 `다시 실행 필요` 상태를 표시한다.
- 사용자가 `검사 실행` 또는 `시뮬레이션 실행`을 다시 누르면 최신 보드 기준 결과로 갱신한다.
- 보드 변경만으로 분석 API를 자동 호출하지 않는다.

### 4.15 로딩 상태

선택: AI 패널의 로딩 상태는 기능별로 따로 둔다.

구분:

- `초안 생성 중`
- `검사 실행 중`
- `시뮬레이션 실행 중`

이유:

- Architecture Draft, Pre-Deployment Check, Design Simulation은 각각 다른 API 요청이다.
- 사용자가 어떤 작업이 진행 중인지 바로 알 수 있어야 한다.
- 하나의 공통 로딩만 두면 실패했을 때 어느 기능에서 실패했는지 흐려진다.
- 로딩 없이 버튼 disabled만 처리하면 API가 느릴 때 멈춘 것처럼 보일 수 있다.

UI 기준:

- 실행 중인 기능의 버튼과 결과 영역에만 로딩 상태를 표시한다.
- 다른 기능 결과는 지우지 않는다.
- `AI 설명 생성 중` 같은 LLM 전용 로딩 상태는 따로 만들지 않는다.

### 4.16 `/workspace/ai` 데모 화면 처리

선택: `/workspace/ai` 데모 화면은 이번 작업에서 제거하거나 숨기지 않는다.

이유:

- 기존 API 수동 확인과 시연 보조용으로 계속 사용할 수 있다.
- 이번 작업의 완료 기준은 실제 `/workspace` 통합이므로 데모 화면을 제거할 필요는 없다.
- 데모 화면을 없애거나 크게 수정하면 이번 MVP 마감 범위가 늘어난다.

기준:

- `/workspace/ai`는 유지한다.
- 실제 사용자 흐름과 완료 기준은 `/workspace` 기준으로 본다.
- 이번 작업에서는 `/workspace/ai` 안내 문구 추가나 접근 제한을 하지 않는다.

## 5. 완료 기준

이번 작업은 API와 컴포넌트가 존재하는 것만으로 끝난 것으로 보지 않는다.

실제 `/workspace`에서 아래 흐름을 수동으로 한 번 끝까지 확인해야 완료로 본다.

```text
자연어 입력
→ Architecture Draft 생성
→ preview 요약 확인
→ 보드에 반영
→ 검사 실행
→ 시뮬레이션 실행
→ 각 결과 아래 AI 설명 확인
```

완료 확인 항목:

- `/workspace` 오른쪽 AI 패널에서 Architecture Draft를 생성할 수 있다.
- 생성된 Architecture Draft preview 요약을 확인할 수 있다.
- `보드에 반영`을 누르면 Architecture Board가 Draft 결과로 교체된다.
- 빈 보드 또는 변환 실패 시 안내 메시지가 나온다.
- 현재 Architecture Board 기준으로 Pre-Deployment Check를 실행할 수 있다.
- 현재 Architecture Board 기준으로 Design Simulation을 실행할 수 있다.
- Draft, Check, Simulation 결과 아래에 각각 `AI 설명`이 보인다.
- OpenAI API key가 없어도 fallback 설명으로 흐름이 깨지지 않는다.
- 보드 변경 후 기존 분석 결과에 `다시 실행 필요` 상태가 보인다.
- `/workspace/ai`는 유지되지만 완료 기준은 `/workspace` 기준으로 판단한다.

## 6. 구현 중 범위 운영

선택: 구현 중 발견되는 작은 개선은 이번 브랜치에서 같이 처리할 수 있다.

허용하는 작은 개선:

- 완료 기준 흐름을 더 잘 보이게 하는 문구 정리
- 버튼 disabled, loading, error 표시의 작은 UX 보강
- 반복 문구 제거
- 결과 영역의 간단한 배치 정리
- 타입/테스트를 안정시키기 위한 작은 구조 정리

이번 브랜치에 넣지 않을 것:

- 완료 기준에 없는 새 기능
- Terraform Preview 자동 생성
- Deployment 흐름 직접 연결
- Resource 자동 수정
- preview diagram
- 채팅형 AI
- streaming 응답

기준:

- 작은 개선은 `/workspace` 완료 흐름을 더 안정적으로 만들 때만 한다.
- 기능 경계가 커지면 `003_고도화.md`에 남기고 이번 브랜치에서는 하지 않는다.
- 구현 중 작은 개선을 하더라도 완료 기준은 이 문서의 `## 5. 완료 기준`으로 판단한다.
