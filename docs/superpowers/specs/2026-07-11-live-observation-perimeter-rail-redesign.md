# Live Observation 외곽 레일 시스템 맵 개편 설계

## 목표

Live Observation 모달을 기존의 세로 카드 묶음에서 거의 전체 화면을 쓰는 운영 화면으로 개편한다. 중앙 시스템 맵은 사용자가 제공한 레퍼런스처럼 `Audience → S3 Page → ALB → ASG → EC2`를 왼쪽에서 오른쪽으로 읽게 하며, 요청 펄스는 노드 내부를 관통하지 않고 각 노드의 위·아래 외곽 레일과 노드 사이 연결선을 따라 이동한다.

기존 API, SSE, 관측 세션, QR, presenter boost, AWS 상태 계산과 Terraform 경계는 변경하지 않는다.

## 승인된 시각 방향

사용자가 선택한 1번 안을 사용한다.

- 모달 바깥 Workspace는 어둡게 가린다.
- 모달은 데스크톱에서 `calc(100vw - 24px) × calc(100dvh - 24px)`를 사용하고 최대 `1800px × 1080px`까지만 확장한다.
- 상단에는 얇은 흰색 운영 헤더와 두 개의 수평 근거 레일을 둔다.
- 중앙 70~75%는 하나의 대형 다크 네이비 시스템 맵이다.
- 하단에는 얇은 scaling activity와 presenter boost 제어 레일을 둔다.
- 중앙 맵 안에 별도의 카드형 근거 패널이나 설명 문단을 쌓지 않는다.

## 검토한 구현 접근

### 1. HTML 노드 + SVG 레일 혼합 방식 — 채택

노드와 텍스트는 접근 가능한 HTML 요소로 렌더하고, 정적 레일과 이동 펄스는 동일 좌표계의 SVG로 그린다. 노드 위치와 SVG 경로는 하나의 geometry 모듈을 사용한다.

장점:

- 노드 텍스트, 상태, 아이콘의 접근성과 반응형 처리가 쉽다.
- 펄스가 실제 SVG 경로만 따라가므로 외곽 레일과 정확히 일치한다.
- 기존 React 상태와 CSS Module 구조를 유지하면서 시각 구조만 교체할 수 있다.

### 2. 모든 요소를 단일 SVG로 구현 — 제외

경로 정렬은 쉽지만 Deployment 상태, 긴 lifecycle 문자열, focus 상태와 반응형 텍스트가 SVG 내부에 묶인다. 운영 UI의 접근성과 유지보수 비용이 커진다.

### 3. Canvas 또는 WebGL — 제외

광원과 입자 표현은 자유롭지만 현재 요구에는 과하다. 텍스트 접근성, 상태별 테스트, reduced-motion과 DOM 기반 포커스 동작을 별도로 다시 만들어야 한다.

## 화면 구조

```text
LiveObservationModal
├─ ObservationChromeHeader
│  ├─ title / live status / countdown
│  ├─ Deployment selector / 관측 시작
│  └─ Audience access utility
├─ ObservationEvidenceRail
│  ├─ Browser report metrics
│  └─ AWS measured metrics
├─ LiveObservationSystemMap
│  ├─ static perimeter rails
│  ├─ HTML service nodes
│  ├─ finite request pulses
│  └─ overflow count
└─ ObservationControlRail
   ├─ latest scaling activity
   └─ traffic boost / session controls
```

### 상단 운영 헤더

- 높이는 약 `64px`로 유지한다.
- 왼쪽에는 `Live Observation`, 프로젝트명, 연결 상태, 남은 시간을 둔다.
- 중앙 또는 오른쪽에는 Deployment select와 `관측 시작`을 둔다.
- QR은 큰 고정 카드로 두지 않는다. `QR access` 버튼을 누르면 헤더 아래 compact utility panel이 열리고 QR, URL 복사, 새 창 열기를 제공한다.
- close 버튼은 우측 상단 고정 위치를 유지한다.

### 근거 레일

- 전체 높이는 약 `68~76px`로 제한한다.
- 왼쪽 절반은 `Browser report`, 오른쪽 절반은 `AWS measured`다.
- Browser 영역은 `acceptedEventCount`, `projectedRequestsPerMinute`, `pressurePercent`, `pressureLevel`만 사용한다.
- AWS 영역은 `RequestCountPerTarget`, CloudWatch 지연 상태, `InService / desired / max`만 사용한다.
- 두 영역은 배경과 source label로 구분하지만 별도 카드처럼 떠 보이지 않게 하나의 수평 레일로 연결한다.

### 중앙 시스템 맵

- 시스템 맵은 남은 높이를 모두 차지하며 데스크톱 최소 높이를 `560px`로 둔다.
- 기준 SVG 좌표계는 `1600 × 640`이다.
- 노드 순서는 `Audience`, `S3 Page`, `ALB`, `ASG`, `EC2`다.
- `ASG` 이후 EC2는 최대 두 개를 위·아래로 배치한다.
- 각 노드는 dark navy surface, service별 단색 outline과 lucide icon을 사용한다.
- 실제 `InService`, `launching`, `transitioning`, 예상 상태는 기존 marker state와 텍스트로 구분한다.

## 외곽 레일 geometry

각 노드는 `x`, `y`, `width`, `height`, `cornerRadius`, `entry`, `exit` 좌표를 가진다. 정적 레일은 다음 두 경로를 모두 그린다.

```text
entry → top-left curve → node top rail → top-right curve → exit
entry → bottom-left curve → node bottom rail → bottom-right curve → exit
```

노드 사이에서는 두 경로가 중앙 exit에서 합쳐져 하나의 직선 connector가 되고, 다음 노드 entry 직전에 다시 위·아래로 분리된다. 레일은 노드 border 바깥 `8~12px` 간격을 유지하며 노드 내부를 지나지 않는다.

ASG 뒤에서는 중앙 connector가 실제 표시 EC2 슬롯 수만큼 분기한다.

- EC2 0개: ASG까지만 표시하고 뒤쪽 분기를 그리지 않는다.
- EC2 1개: 중앙에 배치한 EC2 한 개로만 연결한다.
- EC2 2개: 위 EC2와 아래 EC2로 곡선 분기한다.

EC2 노드도 동일하게 위·아래 외곽 레일을 가지며 펄스는 해당 레일을 돈 뒤 fade-out한다.

## 요청 펄스

- `acceptedEventCount`의 양수 delta가 생길 때만 생성한다.
- 한 burst에 논리 요청을 최대 5개만 표시하고 나머지는 `+N`으로 압축한다.
- 논리 요청 하나는 동일한 target을 향하는 `upper`와 `lower` 펄스 한 쌍으로 렌더한다. 두 펄스는 같은 시각에 출발하고 같은 이동 시간을 사용한다.
- 모바일에서는 동일 규칙을 `left`와 `right` 펄스 한 쌍으로 전환한다.
- 한 논리 요청이 시각적으로 두 개의 펄스가 되더라도 accepted count, overflow, burst stagger는 논리 요청 수를 기준으로 계산한다.
- 펄스 경로는 static rail을 만드는 geometry helper가 반환한 동일 path를 사용한다.
- 이동 시간은 `1,520ms`, 논리 요청 쌍 사이 stagger는 `110ms`로 둔다.
- 펄스는 실제 표시된 `InService` marker로만 이동한다.
- 실제 요청별 처리 instance 정보가 없으므로 특정 EC2가 실제 처리했다고 단정하는 문구는 추가하지 않는다.
- node 도착 시 노드 전체를 확대하지 않는다. 외곽 border와 해당 lane만 짧게 밝아진다.
- decorative infinite animation은 사용하지 않는다.

`prefers-reduced-motion: reduce`에서는 이동 원을 렌더하지 않고, 같은 route의 stroke와 실제 대상 노드 outline을 한 번 갱신한다.

## 목업 확인 동작

- development 환경의 `목업 애니메이션 재생` 버튼은 유지한다.
- 별도의 작은 mock card를 추가하지 않는다.
- 관측 시작 전에는 중앙의 실제 `LiveObservationSystemMap`이 mock instance 두 개와 mock burst를 렌더한다.
- 버튼을 누르면 production과 동일한 geometry, pulse, target flash 경로가 재생된다.
- mock 상태는 화면에 `목업 데이터 · 개발 확인용`으로 명시한다.

## 반응형

### 1200px 이상

- 가로 `1600 × 640` 좌표계를 비율에 맞춰 확장한다.
- map은 가로 흐름을 유지하고 EC2는 위·아래로 배치한다.

### 760~1199px

- 헤더와 evidence rail은 두 행이 될 수 있다.
- map은 가로 비율을 유지하되 노드와 레일 전체를 함께 축소한다.
- 노드만 따로 재배치해 SVG와 어긋나는 구조는 허용하지 않는다.

### 759px 이하

- 모달은 `100vw × 100dvh`다.
- 별도의 vertical geometry를 사용해 `Audience → S3 → ALB → ASG → EC2`를 위에서 아래로 배치한다.
- 위·아래 외곽 레일 의미는 모바일에서 좌·우 외곽 레일로 전환한다.
- footer control은 2열 또는 full-width로 쌓는다.

## 접근성

- portal, `role="dialog"`, `aria-modal`, title binding, Escape, focus trap, focus 복원, body scroll lock을 유지한다.
- 각 서비스 노드는 읽기 가능한 label과 상태 문자열을 가진다.
- 장식용 SVG와 pulse는 `aria-hidden="true"`다.
- pressure와 instance 상태는 색상뿐 아니라 텍스트로 표시한다.
- QR utility trigger와 panel의 focus-visible 상태를 제공한다.
- screen reader에 request pulse마다 announcement를 발생시키지 않는다.

## 데이터와 오류 경계

- backend, API DTO, SSE, Redis, AWS adapter, Terraform 코드는 변경하지 않는다.
- snapshot이 없거나 AWS가 unavailable이면 Browser report는 계속 유지하고 AWS measured 영역과 instance text만 unavailable 상태로 표시한다.
- stopped 또는 expired면 map snapshot은 남기고 boost 버튼만 비활성화한다.
- QR 생성 실패 시 기존 오류 메시지와 URL 새 창 열기 경로를 유지한다.
- 실제 AWS 또는 traffic 호출을 시각 검증 과정에서 실행하지 않는다.

## 테스트 전략

1. geometry 단위 테스트
   - 각 노드의 upper/lower rail이 node interior를 침범하지 않는다.
   - connector가 node exit과 다음 node entry를 연결한다.
   - EC2 슬롯이 0/1/2일 때 분기 수가 각각 0/1/2다.
   - animated path와 static path가 같은 geometry 결과를 사용한다.
2. modal source/render 계약 테스트
   - 거의 full-screen dialog 크기와 대형 map 최소 높이를 검증한다.
   - 기존 audience 큰 카드와 중복 mock map이 제거되었는지 검증한다.
   - QR utility와 기존 action이 유지되는지 검증한다.
3. motion 테스트
   - 양수 delta, 최대 5개, actual InService target, finite duration을 유지한다.
   - 각 논리 요청이 동일 target을 향하는 upper/lower 동시 펄스 한 쌍을 만든다.
   - 모바일에서는 각 논리 요청이 left/right 동시 펄스 한 쌍을 만든다.
   - 펄스 수가 두 배가 되어도 overflow와 burst lifetime은 논리 요청 수 기준을 유지한다.
   - reduced-motion에서 moving pulse가 사라진다.
4. 회귀 검증
   - Live Observation focused tests, Web lint/typecheck/build, root lint/typecheck/build, harness check를 실행한다.

## 완료 기준

- 모달이 Workspace viewport 대부분을 실제로 사용한다.
- 중앙 시스템 맵이 화면의 70% 이상을 차지한다.
- 정적 레일과 펄스가 노드 내부를 관통하지 않는다.
- 각 요청의 동시 펄스 한 쌍이 node 외곽 upper/lower rail과 node 사이 connector를 정확히 따라간다.
- ASG 뒤 분기가 표시된 실제 EC2 슬롯 수와 일치한다.
- 근거 수치와 제어는 얇은 상·하단 운영 레일로 정리된다.
- 기존 관측, QR, boost, 종료, 접근성, 안전 경계가 유지된다.
