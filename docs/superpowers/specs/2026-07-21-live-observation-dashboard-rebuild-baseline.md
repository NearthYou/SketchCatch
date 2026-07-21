# Live Observation 대시보드 재구축 기준점

작성일: 2026-07-21
기준 HEAD: `c4edbdfc`
범위: 트래픽 애니메이션 아래의 기존 운영 정보 대시보드를 삭제하고, 새 화면 구현 전의 기능 기준점을 남긴다.

## 목적

이번 변경은 새 Live Observation 대시보드를 만들지 않는다. 사용자가 배포 상태를 관측할 때 열리는 모달에서, 트래픽 흐름 아래에 붙어 있던 지표 카드·운영 분석·로그 목록을 완전히 제거한다.

다음 화면은 CloudWatch의 지표 목록을 복제하지 않는다. 문제 발견 → 원인 확인 → 대응 판단에 필요한 정보를 적게, 분명하게 보여주는 별도 설계를 새로 만든다.

## 유지한 실제 사용자 흐름

1. Workspace에서 Live Observation을 연다.
2. 관측 가능한 배포를 고르고 안전한 HTTPS 주소를 확인한다.
3. 관측 세션을 시작한다.
4. 기존 SSE snapshot으로 세션 상태와 트래픽 애니메이션을 갱신한다.
5. 남은 시간을 확인하고 세션을 종료하거나, 만료·오류 뒤 다시 시도한다.
6. QR과 공개 주소를 복사하거나 연다.

이 흐름의 배포 선택, 세션 시작/종료, 재진입, 만료, retry, QR/URL, focus trap, Escape, mobile, reduced motion 계약은 유지한다.

## 보호한 트래픽 표현

다음은 이번 cleanup에서 수정하지 않았다.

- `LiveObservationFocusedFlow.tsx`
- `live-observation-diagram.ts`
- `live-observation-capacity-projection.ts`
- `live-observation-capacity-transitions.ts`
- 실제 요청 burst 계산과 Fargate 용량 전환
- focused flow의 CSS selector와 reduced-motion 처리

삭제 전후 파일 hash와 CSS diff로 위 범위가 바뀌지 않았는지 확인한다. `live-observation-traffic-burst.ts`는 현재 저장소에 없으며, burst 계산은 `live-observation.ts`에 남아 있다.

## 삭제한 기존 표현 계층

### JSX와 상태

- `운영 분석` disclosure
- 현재 상태, 용량/스케일링, 병목/장애, 비용 영향, 개선 권장사항 카드
- snapshot에서 화면용 카드 값을 파생하던 state/memo
- 최근 런타임 로그 disclosure와 목록

### CSS

- 운영 분석 card/grid/status/recommendation selector
- 운영 지표 disclosure selector
- 로그 목록 selector
- 위 표현만을 위한 responsive와 reduced-motion selector

### 전용 모델과 테스트

- provider snapshot을 숫자 카드로 바꾸던 `getLiveObservationProviderEvidence`
- 상태·병목·비용·Terraform 권장사항 문구를 만들던 `getLiveObservationOperationalAnalysis`
- 위 helper의 전용 테스트
- 삭제된 DOM, CSS selector, 문구를 검사하던 modal/UI 테스트

`getLiveObservationPressureLabel`은 다른 consumer가 없는, 삭제된 카드 전용 label helper였으므로 함께 제거했다.

## 유지한 데이터와 공유 계약

다음은 새 대시보드가 다시 사용할 수 있도록 유지한다.

- API route/service와 Live Observation capability/HTTPS 안전 계약
- session과 snapshot shared type
- snapshot의 요청 수, 오류율, 지연, 가용성, 용량, 로그 원본 데이터
- 배포·Release·Terraform Output·Architecture query
- SSE stream, abort, stale session 차단, session state/view state
- read-only Architecture와 traffic flow를 만드는 focused-flow 전용 mapper

원본 snapshot의 logs와 provider 수치는 제거하지 않았다. 지금은 화면으로 렌더링하지 않을 뿐이며, 다음 사용자 친화적 대시보드에서 근거 데이터로 재사용할 수 있다.

## 새 대시보드가 복원하면 안 되는 것

- 원시 숫자를 나열하는 운영 지표 카드
- CloudWatch를 흉내 낸 상태/용량/비용 카드 묶음
- 원문 로그를 시간순으로 긴 목록으로 바로 노출하는 UI
- 근거 없이 Terraform 변경을 권하는 문구
- 기존 DOM 구조나 CSS selector를 재현하기 위한 source-regex UI 테스트
- 트래픽 애니메이션을 장식으로 교체하거나 실제 요청처럼 보이게 하는 변경

## 다음 설계에 남긴 방향

새 화면은 트래픽 구경이 아니라 다음 순서를 중심으로 설계한다.

1. 지금 사용자에게 문제가 있는지
2. 무엇이 달라졌는지와 영향 범위
3. 확인된 사실, 가능성 높은 원인, 아직 모르는 부분
4. 사용자가 직접 선택할 다음 행동

자동 수정이나 자동 정리는 이 화면에서 실행하지 않는다. 배포 변화·아키텍처·로그의 관계를 이해할 수 있게 돕되, 실제 대응은 사용자가 선택한다.

## 검증

다음 검증을 실행했다.

- Web Live Observation focused-flow, session, query, output URL 계약 테스트: 63개 통과
- API Live Observation contract 테스트: 65개 통과
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`: 통과
- 보호 파일 hash와 focused-flow CSS diff 확인: 변경 없음
- 로컬 브라우저: 390×844, 1024×768, 1440×900에서 모달을 열고 닫았다. 가로 넘침 없이 트래픽 흐름은 남고, 삭제한 운영 분석·로그 패널은 보이지 않았다. 안전한 HTTPS 주소가 없는 배포여서 관측 세션은 시작하지 않았다.

`pnpm test` 전체 실행은 이 변경 범위 밖의 기존 실패로 완료되지 않았다. Web의 module thumbnail 1건과 API의 Terraform template/Amazon Q compiler 관련 20건이며, 이번에 수정한 Live Observation 파일과는 겹치지 않는다. 격리 환경에서는 `tsx` 임시 IPC 소켓 권한으로도 한 번 중단되어, 일반 로컬 권한에서 다시 확인했다.

## 후속 구현

이 기준점 위에 `0017-live-observation-ai-signal-dashboard.md`가 하단 AI Signal Dashboard를 추가한다. 기존 트래픽 흐름은 보호한 채, provider-neutral snapshot의 실제·파생·가능성·확인 불가를 분리해 최대 세 개의 신호와 묶인 로그만 읽기 전용으로 표시한다. 새 UI는 기존 운영 분석 JSX/CSS/테스트를 복원하지 않는다.
