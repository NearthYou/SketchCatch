# Template 형제 리소스 충돌 제거 설계

## 목표

모든 내장 Template이 Gallery와 Template으로 연 Workspace에서 동일한 배치를 사용하며, 보이는 형제 리소스끼리 아이콘·라벨·Area 경계가 겹치지 않게 한다. 포함관계, 실제 Resource Catalog 리소스, Terraform 값, 핵심 트래픽 흐름과 40px 정렬은 유지한다.

## 확인된 원인

현재 topology pass는 저장된 노드 크기만 기준으로 배치하지만 Workspace의 일반 리소스는 48px 아이콘 아래 최대 112px 폭의 라벨을 렌더링한다. 또한 Live Observation 전용 좌표를 일반 배치 후 일부 노드에만 덮어써서, 이미 배치된 형제 노드와 Area 경계를 다시 침범한다. 그 결과 Live Observation에서 보이는 형제 충돌 7쌍이 재현된다.

## 설계

- 충돌 판정은 `getResourceNodeVisualBounds`를 사용하여 실제 아이콘과 라벨 footprint를 기준으로 한다.
- 같은 부모를 가진 렌더 가능한 노드만 서로 비교한다. 부모 Area와 자손의 의도된 포함은 충돌로 계산하지 않는다.
- topology layout의 각 형제 그룹을 결정적으로 순회하고, 충돌한 노드를 가장 가까운 다음 40px grid cell로 이동한다.
- 이동 방향은 기존 흐름 순서를 보존하도록 주 진행축을 우선하며, 동일 위치 후보에서는 원래 노드 순서를 tie-breaker로 사용한다.
- Area 자식 배치를 먼저 해결한 뒤 Area 크기를 다시 맞춘다. 자식의 visual footprint가 부모 padding 안에 완전히 들어가야 한다.
- Live Observation의 curated 좌표는 최종 덮어쓰기가 아니라 선호 배치 입력으로 적용한다. 마지막 단계에서 같은 공통 충돌 검사를 통과시킨다.
- Gallery와 Template Workspace는 `materializeTemplateDiagram`의 같은 결과를 소비하므로 별도 좌표 체계를 만들지 않는다.
- 기존 사용자가 저장한 임의 Workspace 배치는 자동 재정렬하지 않는다. 이 변경은 새로 materialize되는 Template과 Template preview에만 적용한다.

## 대안과 결정

- Live Observation 좌표만 수동 조정하는 방식은 리소스 크기나 라벨 변경 시 재발하므로 제외한다.
- 전체 graph layout 교체는 핵심 흐름과 사용자가 승인한 포함관계를 크게 바꿀 위험이 있어 제외한다.
- 공통 형제 충돌 제거 pass가 현재 topology 구조를 유지하면서 모든 Template에 같은 보장을 제공하므로 채택한다.

## 검증 기준

- 모든 내장 Template에서 렌더 가능한 형제 노드의 visual bounds 교차가 0건이다.
- 모든 명시적·추론된 자식 노드는 부모 Area의 내부 padding 안에 들어간다.
- Live Observation의 S3 Website → ALB → Target Group → ASG 순서와 ASG 내부 Policy/Alarm 관계가 유지된다.
- curated 노드와 Area 좌표·크기는 40px grid를 지킨다.
- Gallery preview와 Workspace Template materialization이 같은 노드 위치를 반환한다.
- 기존 Template, materializer, topology, preview 테스트가 모두 통과한다.

## 비범위

- 사용자가 직접 겹쳐 놓은 기존 저장 Board의 강제 재배치
- Terraform 리소스 수, 파라미터, edge 의미 또는 배포 동작 변경
- 새로운 Resource Catalog 항목이나 이미지 asset 추가
