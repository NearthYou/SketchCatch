# Live Observation Template 시각 정돈 설계

## 목표

`실시간 트래픽 · ASG 관측` Template을 Terraform 리소스 목록이 아니라 `Audience Site → ALB → Target Group → ASG → Scale-out` 흐름이 한눈에 읽히는 대표 Architecture로 만든다.

## 설계

- Terraform 보조 리소스는 DiagramJson과 IaC 값에 그대로 보존한다.
- `isRenderableDiagramNode`가 숨기는 Route Association, Launch Template, S3 정책 같은 helper는 topology 배치 크기 계산에서 제외한다.
- helper를 제외해 생긴 빈 Subnet/Security Group 영역은 Workspace에서 작은 boundary로 유지한다.
- Audience traffic edge의 시작점을 숨겨진 S3 Website helper가 아니라 보이는 Audience S3 Bucket으로 바꾼다.
- Listener가 ALB를 참조하고 Alarm이 ASG/Policy를 참조하는 실제 Terraform 관계를 containment 계산에 사용한다.
- Gallery에서는 보이는 자손이 없는 빈 area frame을 생략하고, VPC·ASG와 핵심 흐름 아이콘에 슬롯을 우선 배정한다.

## 보존 규칙

- 리소스 수, Terraform values, 배포 동작은 변경하지 않는다.
- 다른 Template의 의미와 기존 저장 Board의 사용자 배치는 변경하지 않는다.
- Gallery와 Workspace 모두 실제 resource catalog icon만 사용한다.

## 검증 기준

- Live Observation의 Workspace layout 높이와 폭이 helper 개수에 따라 늘어나지 않는다.
- 보이는 핵심 edge는 Audience S3 → ALB → Target Group → ASG 순서로 이어진다.
- Gallery preview에는 빈 Subnet/Security Group frame이 핵심 아이콘 슬롯을 차지하지 않는다.
- 모든 기존 Template, materializer, preview 테스트가 통과한다.
