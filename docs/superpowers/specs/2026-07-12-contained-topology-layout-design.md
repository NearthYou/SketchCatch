# 포함관계 중심 Board 레이아웃 설계

## 목표

모든 Template과 새 Workspace Board가 실제 리소스 카탈로그, Terraform 참조, resource-to-resource 관계를 바탕으로 읽기 쉬운 토폴로지로 시작하게 한다. VPC, Subnet, Security Group, Auto Scaling Group 같은 영역은 자식을 감싸고, 서비스 흐름의 인접 리소스는 같은 영역 안에서 가까이 배치한다.

## 문제

현재 Template은 정의에 적힌 절대 좌표를 그대로 사용한다. Gallery는 그 좌표를 축소해 보이므로 영역 안의 자식과 서비스 흐름이 흩어진다. 같은 Template을 Workspace에서 시작해도 원본 좌표가 그대로 사용되어 작성 순서가 의미 있는 그룹보다 크게 보인다.

## 범위

- 내장 Template과 Repository 분석 Template 모두 새 공통 레이아웃을 거친다.
- Template으로 새 Workspace를 시작하는 모든 진입점은 같은 정돈된 DiagramJson을 받는다.
- AI Draft와 Reverse Engineering은 이미 `workspace-ai-diagram-adapter`의 containment-aware layout을 통해 생성되므로, 그 경로의 레이아웃 계약과 충돌시키지 않는다.
- 기존에 저장된 Board와 사용자가 직접 움직인 노드는 자동으로 재배치하지 않는다.

## 설계

### Catalog materialization 뒤의 순수 Template topology pass

`materializeTemplateDiagram`은 실제 좌측 Resources 패널과 같은 catalog node를 만든 뒤 그 결과에만 `arrangeTemplateTopology`를 적용한다. 저장 draft의 tolerant hydration은 아이콘/카탈로그 보강만 하고 위치를 바꾸지 않는다.

### 실제 Terraform 참조로 containment 보강

명시된 `metadata.parentAreaNodeId`를 최우선으로 보존한다. 없는 경우 `subnetId`, `vpcId`, Route Table Association의 Route Table 참조, Auto Scaling Group 이름 참조에서 실제 area parent를 찾는다. 두 Subnet을 참조하는 리소스처럼 단일 부모를 확정할 수 없으면 공통 VPC로만 올린다. 추측으로 Security Group이나 Subnet을 새 부모로 만들지 않는다.

### 영역 안의 compact flow layout

각 영역의 직접 자식은 edge 방향으로 lane을 정하고, 같은 lane에서는 기존 y 순서와 id로 안정적으로 정렬한다. 영역은 가장 안쪽부터 자식 footprint와 padding에 맞게 확장한다. root-level node도 같은 방식으로 정리하되 영역의 자손은 하나의 cluster로 취급한다. containment edge는 그리지 않고 부모 상자와 z-index로 표현한다.

### Gallery는 동일한 source layout의 축소판

Gallery preview는 정돈된 Template DiagramJson을 그대로 투영한다. 카드 전용으로 노드를 다시 흩트리지 않으며, dense template은 중요한 node만 보여도 그 node가 속한 area frame과 흐름 edge를 함께 유지한다.

## 보존 규칙

- 카탈로그에 없는 resource는 기존 strict named error를 유지한다.
- 참조가 깨졌거나 area가 없는 node는 root group에 남긴다.
- 레이아웃은 id, label, icon, Terraform parameter, edge를 수정하지 않는다. position, area size, derived parent metadata, z-index만 바꾼다.

## 검증 기준

- 모든 Template이 catalog 아이콘을 유지하며, VPC/Subnet/ASG 내부 자식이 해당 area bounds 안에 있다.
- Live Observation Template은 웹, ALB/ASG, observability flow가 겹치지 않는 cluster로 분리된다.
- Gallery projection은 area frame과 visible flow edge를 유지하고 raw label chip을 렌더링하지 않는다.
- 기존 draft hydration은 위치를 바꾸지 않는다.
