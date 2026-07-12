# Live Observation 발표용 미니멀 디자인

## 목표

Live Observation이 전체 인프라 다이어그램의 축소판처럼 보이지 않도록 한다. 저장된 프로젝트 다이어그램과 실제 관측 snapshot을 근거로 사용하되, 발표 화면에는 청중이 즉시 이해해야 하는 메인 데이터 경로만 크게 표시한다.

메인 경로는 다음 네 단계로 고정한다.

`Audience → Public ALB → ECS Service → Fargate Tasks`

Listener, Target Group, VPC, AZ, Subnet, Security Group, IAM, CloudWatch Logs 등은 관측 화면에서 표시하지 않는다. 이 리소스들은 배포 다이어그램과 Terraform에서 계속 유지되며 관측 대상 탐색에도 사용될 수 있지만, 발표용 시각 요소에는 포함하지 않는다.

## 데이터 근거

- 프로젝트의 저장된 `DiagramJson`에서 Audience, ALB, ECS Service, capacity-unit 노드를 찾는다.
- 숨겨진 Listener와 Target Group을 포함한 실제 edge 연결을 탐색해 네 단계의 순서를 검증한다.
- 화면에 표시되는 리소스 이름과 AWS 아이콘은 해당 DiagramJson 노드에서 가져온다.
- 요청량, pressure, desired/running capacity, 최신 scaling activity는 기존 `LiveObservationSnapshot`을 그대로 사용한다.
- 별도의 데모 전용 리소스 목록이나 고정된 가짜 토폴로지는 만들지 않는다.

## 화면 구성

### 상단 정보

- 제목, 대상 deployment, LIVE/polling 상태를 한 줄로 표시한다.
- 요청량, pressure, Fargate capacity, CloudWatch 지연을 얇은 정보 레일에 표시한다.
- 카드가 중첩된 형태는 사용하지 않는다.

### 메인 흐름

- 네 단계를 동일한 중심선 위에 일정한 간격으로 배치한다.
- 노드는 기존 Board와 같은 밝은 배경, 실제 AWS 아이콘, 짧은 라벨을 사용한다.
- Stage 전체는 Workspace의 `#ffffff`, `#fafafa`, 얇은 회색 선과 동일한 톤을 사용한다.
- 파랑은 정상 데이터 흐름에만 사용한다.
- 주황은 task 시작 중 상태, 빨강은 실제 critical pressure에만 사용한다.
- Region/VPC/AZ/Subnet 경계와 보조 리소스는 렌더링하지 않는다.

### Capacity 표현

- ECS Service 오른쪽에 Fargate Task 슬롯 두 개를 같은 행에 배치한다.
- desired capacity가 1일 때 두 번째 슬롯은 공간만 예약하고 시각적으로 숨긴다.
- scale-out이 시작되면 두 번째 task가 pop/fade 애니메이션으로 등장한다.
- pending/provisioning은 주황, running은 정상 상태로 표시한다.
- 슬롯 공간을 항상 예약해 scale-out 순간에 전체 레이아웃이 움직이지 않게 한다.

### 활동 정보

- 최신 ECS scaling activity는 메인 흐름 아래 한 줄로 표시한다.
- scaling activity가 없으면 불필요한 빈 패널 대신 짧은 대기 상태만 표시한다.

## 애니메이션

- 연결선에 진행 방향을 보여주는 marching highlight를 지속적으로 표시한다.
- 새 audience event가 수신되면 요청 입자 여러 개가 Audience에서 Fargate Task 방향으로 이동한다.
- 각 주요 노드는 요청 도착 시 짧은 pulse ring으로 반응한다.
- pressure가 높아지면 Target 경로가 아닌 ALB 이후의 메인 흐름 색상이 주황 또는 빨강으로 변한다.
- scale-out 시 두 번째 task는 한 번 크게 등장한 뒤 pending pulse로 전환하고, running이 되면 안정 상태로 바뀐다.
- `prefers-reduced-motion`에서는 이동 입자를 제거하고 색상과 상태 텍스트만 유지한다.

## 컴포넌트 경계

- `live-observation-diagram.ts`: DiagramJson에서 발표용 네 단계와 연결 순서를 계산하는 순수 모델을 담당한다.
- `LiveObservationDiagramMap.tsx`: 발표용 모델과 snapshot을 받아 노드, 연결선, 입자, capacity 상태를 렌더링한다.
- `LiveObservationModal.tsx`: deployment 선택, polling/stream, snapshot lifecycle만 담당한다.
- backend API와 `LiveObservationSnapshot` 계약은 변경하지 않는다.

## 예외 처리

- 필수 경로 노드가 없으면 기존 전체 다이어그램으로 돌아가지 않는다. 관측 경로를 구성할 수 없다는 명시적인 빈 상태를 표시한다.
- 아이콘이 없는 노드는 공통 fallback을 사용하되 리소스 이름은 유지한다.
- snapshot이 아직 없으면 다이어그램 경로는 표시하고 metric과 task 상태만 대기 상태로 표시한다.
- inactive task는 접근성 트리에서도 활성 capacity로 읽히지 않게 한다.

## 반응형과 접근성

- 데스크톱에서는 네 단계를 한 줄로 유지한다.
- 좁은 화면에서는 줄바꿈으로 순서를 바꾸지 않고 최소 너비와 가로 스크롤을 사용한다.
- 각 노드는 리소스 이름과 관측 상태를 포함한 accessible name을 가진다.
- 색상 외에도 `RUNNING`, `STARTING`, `CRITICAL` 텍스트로 상태를 구분한다.

## 테스트

- 숨겨진 Listener/Target Group을 통과해 네 발표 단계를 올바른 순서로 계산하는지 검증한다.
- 보조 리소스와 area 노드가 발표 모델에서 제외되는지 검증한다.
- desired/running/pending capacity에 따라 두 번째 task가 hidden, launching, running으로 변하는지 검증한다.
- event burst가 활성 task까지만 요청 입자를 생성하는지 검증한다.
- critical pressure와 reduced-motion 상태가 각각 올바른 클래스와 렌더링 결과를 만드는지 검증한다.
- 데스크톱과 모바일 viewport에서 한 줄 순서, 텍스트 잘림, modal overflow를 브라우저로 확인한다.

## 완료 기준

- 관측 화면에 Audience, ALB, ECS Service, Fargate Tasks만 크게 보인다.
- 원본 DiagramJson에서 리소스와 연결 순서를 가져오며 별도 고정 토폴로지를 사용하지 않는다.
- 모든 메인 노드가 일정한 간격의 한 줄에 정렬된다.
- 트래픽, pressure, scale-out 변화가 애니메이션과 비색상 상태 텍스트로 명확하게 구분된다.
- 기존 polling, simulated provider, 실제 ECS provider 동작은 유지된다.
