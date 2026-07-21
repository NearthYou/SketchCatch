# Live Observation은 최대 세 개의 근거 기반 신호로 판단을 돕는다

Live Observation의 상단 트래픽 흐름은 실제 관측 세션의 요청과 용량 변화를 표현하는 독립된 화면으로 유지한다. 그 아래는 CloudWatch처럼 많은 지표를 나열하는 대시보드가 아니라, 사용자가 **문제 발견 → 사용자 영향 확인 → 근거 확인 → 다음 판단** 순서로 읽는 AI Signal Dashboard로 구성한다.

여기서 AI Signal 자체는 별도의 AI 호출 결과가 아니다. 현재 AWS Provider Adapter가 검증해 전달한 snapshot을 Web이 결정론적으로 정리한 표현이다. 다만 실시간 요청 압력이 경고 이상이면 기존 AI Design Simulation을 읽기 전용 권장안으로 요청할 수 있고, 이 결과는 신호 판정 근거가 아니라 별도의 다음 행동 설명으로만 사용한다.

## 결정

- 상태 요약, 중요 신호 최대 3개, 선택한 신호 상세, 실제로 가능한 다음 확인만 보여준다.
- signal은 사용자 영향, 심각도, 이번 세션에서 새로 나타났는지, 직접 근거 품질, stable signal key 순서로 결정론적으로 정렬한다. 근거가 부족하면 3개를 채우지 않는다.
- presentation model은 `actual`, `derived`, `inferred`, `unknown`을 구분한다.
  - `actual`: AWS snapshot, 마스킹된 runtime log, immutable Deployment/Architecture에서 직접 읽은 값
  - `derived`: 실제 값으로 고정 규칙을 적용해 계산한 값. 현재 하단 signal 후보에는 관측용 테스트 요청량을 넣지 않는다.
  - `inferred`: 하나 이상의 evidence ID를 가진 가능성. 원인으로 단정하지 않는다.
  - `unknown`: 값·비교 기준·이전 Deployment 증거가 없어 현재 확인할 수 없는 내용
- 비교 가능한 이전 상태가 없으면 응답 시간, 배포와 장애의 인과관계, Terraform 변경 권고를 만들지 않는다. 요청이 0건이면 `errorRate: 0`과 `availability: 100`도 정상 근거가 아니며, missing 값은 0, 정상, 변화 없음으로 바꾸지 않는다.
- `available` snapshot은 현재 값을 읽을 수 있지만, `delayed`는 마지막 완전 관측값이 남아 있어도 최신 상태 결정에 사용하지 않고 `확인 중`으로 표시한다. `unavailable`은 서비스 장애가 아니라 관측값을 받지 못한 상태로 표시한다.
- 같은 오류는 정규화한 마스킹 message의 opaque fingerprint로 묶는다. 현재 Web contract에는 source/level이 없으므로 runtime log의 마스킹된 message만으로 보수적으로 묶고, 대표 원문은 닫힌 disclosure에서만 연다. 오류·경고·복구·확인 필요 로그는 한 묶음 목록에서 모두 볼 수 있다.
- current session history는 Web 메모리에만 두고 session ID별 최대 120개, 최대 15분으로 제한한다. 페이지 재진입이나 session 변경에서는 복원하지 않는다. 실제 값이 두 개 이상일 때만 작은 SVG history를 보여준다. 단일 오류는 이 세션의 이전 fingerprint와 비교할 수 있을 때만 `새 오류`라고 표시한다.
- 사고 흐름은 실제 배포 완료·신호·로그 시각 중 두 종류 이상이 있을 때만 닫힌 disclosure로 표시한다. 시간의 근접성은 원인 관계로 표현하지 않는다.
- Dashboard에는 실행되지 않는 버튼을 만들지 않는다. 대표 로그 disclosure와, 안전한 단일 용량 수정안을 실제로 만들 수 있을 때의 `Project Draft 수정`만 제공한다. 후자는 사용자가 버튼을 눌렀을 때만 정확히 하나의 ECS Application Auto Scaling Target에서 정수 `max_capacity`를 1 늘려 Project Draft에 저장한다. Deployment·Board·AWS Resource·Plan/Apply는 변경하지 않는다.
- 현재 aggregate snapshot에는 관측 대상 Resource ID가 없으므로 추측성 관련 Resource chip을 표시하지 않는다. 전체 Architecture diagram, 가짜 edge, 가짜 multi-cloud 데이터는 다시 그리지 않는다. 실제 Resource ID 매핑이 추가된 뒤에만 이를 재검토한다.

## CloudWatch와 역할 분리

CloudWatch는 원시 Metric, 긴 시계열, 알람 설정, 원문 로그 검색을 담당한다. SketchCatch는 현재 배포에서 지금 확인해야 할 신호를 최대 세 개로 좁히고, 사용자 영향·근거·불확실성·관측 로그를 함께 보여준다. CloudWatch Console을 여는 기존 안전한 action이 생기기 전까지 비작동 버튼이나 URL을 만들지 않는다.

## 보호 범위

다음 트래픽 표현의 JSX, 계산, CSS selector, motion, 크기와 위치는 바꾸지 않는다.

- `LiveObservationFocusedFlow.tsx`
- `live-observation.ts`의 traffic burst 계산
- `live-observation-diagram.ts`
- `live-observation-capacity-projection.ts`
- `live-observation-capacity-transitions.ts`
- 기존 focused-flow, capacity, traffic, animation test와 CSS reduced-motion 범위

Signal Dashboard는 `LiveObservationModal`에서 focused flow 다음 sibling으로 조립하고, 별도 CSS Module을 사용한다.

## Provider 경계

API는 AWS-specific manifest와 AWS Provider Adapter를 server 경계 안에서 provider-neutral `LiveObservationV2Snapshot`으로 바꾼다. Web Signal model은 이 공통 snapshot만 읽으며 AWS ARN, SDK action, raw provider payload, credential, raw exception을 알지 못한다. 현재 AWS adapter 하나만 구현돼 있고 Azure/GCP adapter 또는 placeholder는 만들지 않는다.

## 외부 참고

아래 저장소는 구현 의존성이 아니라 정보 계층과 상호작용만 참고했다. 코드, CSS, 색상값, 전역 shell을 복사하지 않았고 SketchCatch의 React·TypeScript·CSS Module 구조로 새로 작성했다.

| 저장소    | 확인한 commit                              | 라이선스                               | 참고한 화면·상호작용                                                                                    |
| --------- | ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Coroot    | `aa91fee4aa02a84c2a1c653adb89fceebdb2e72e` | Apache-2.0                             | application 상태 요약, 문제와 관련 서비스 연결, 반복 로그 묶기, 배포 전후를 원인으로 단정하지 않는 표현 |
| HyperDX   | `e6e0907f7b0eccc06febcccd13a0afdf4bb5267c` | MIT                                    | 로그·지표·오류 사이의 조사 흐름, 반복/새 이벤트 구분, 대표 원문을 펼쳐 보는 방식                        |
| obs_theme | `4b0a0d8ebd0329af50462c9959f7ff168119dbf2` | 저장소 안에서 LICENSE 파일을 찾지 못함 | 밝은 incident summary, compact card, timeline/log explorer의 데스크톱·모바일 정보 밀도                  |

## 결과

- Live Observation은 트래픽을 계속 표현하지만, 하단은 트래픽 구경이 아니라 판단을 돕는 읽기 전용 워크벤치가 된다.
- 사용자는 인프라 변경 전에 확인된 사실과 아직 모르는 부분을 분리해 볼 수 있다.
- 새 provider나 더 풍부한 snapshot이 생겨도 Web model의 unknown 경계를 유지한 채 adapter를 확장할 수 있다.
- 자동 대응이나 자동 정리는 이 결정의 범위 밖이다. 용량 수정안도 사용자가 명시적으로 승인해야 하며 기존 User-Accepted Change 경계를 유지한다.
