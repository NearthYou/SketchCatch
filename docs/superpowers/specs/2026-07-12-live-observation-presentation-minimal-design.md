# Live Observation 발표용 미니멀 디자인

## 목표

Live Observation이 전체 인프라 다이어그램의 축소판처럼 보이지 않도록 한다. 저장된 프로젝트 다이어그램과 실제 관측 snapshot을 근거로 사용하되, 발표 화면에는 청중이 즉시 이해해야 하는 메인 데이터 경로만 크게 표시한다.

메인 경로의 리소스 종류와 단계 수는 고정하지 않는다. `DiagramJson`의 실제 node와 방향성 edge를 분석해 트래픽 시작점에서 현재 관측 중인 capacity까지 이어지는 경로를 계산한다. 이번 ECS/Fargate 데모에서는 분석 결과가 `Audience → Public ALB → ECS Service → Fargate Tasks`로 보이지만, ASG 다이어그램에서는 EC2/ASG 경로가, 다른 아키텍처에서는 해당 다이어그램의 실제 메인 경로가 표시되어야 한다.

메인 경로에 포함되지 않은 VPC, AZ, Subnet, Security Group, IAM, CloudWatch Logs 등의 보조 리소스는 관측 화면에서 표시하지 않는다. Listener나 Target Group도 고정적으로 숨기지 않고, 다이어그램 분석 결과에서 실제 트래픽 단계로 분류되는지에 따라 포함 여부를 결정한다.

## 데이터 근거

- 프로젝트의 저장된 `DiagramJson` node와 방향성 edge로 그래프를 구성한다.
- `liveObservationRole`이 명시된 node와 edge를 우선 사용하고, 역할이 없으면 리소스 정의의 traffic capability와 그래프 연결성으로 source, hop, capacity controller, capacity unit을 추론한다.
- 현재 snapshot의 관측 대상과 연결된 capacity node에서 역방향으로 탐색해 유효한 traffic source까지 이어지는 주 경로를 선택한다.
- 후보 경로가 여러 개면 명시적 역할, 관측 대상 연결 여부, traffic capability, 경로 길이 순으로 점수를 계산하고 동일 입력에서 항상 같은 경로를 선택한다.
- capacity unit으로 갈라지는 마지막 분기는 하나의 capacity 단계로 묶고 내부에서 task 또는 instance를 확장한다.
- 화면에 표시되는 리소스 이름과 AWS 아이콘은 해당 DiagramJson 노드에서 가져온다.
- 요청량, pressure, desired/running capacity, 최신 scaling activity는 기존 `LiveObservationSnapshot`을 그대로 사용한다.
- 별도의 데모 전용 리소스 목록, 고정된 리소스 순서, 고정된 가짜 토폴로지는 만들지 않는다.

## 화면 구성

### 상단 정보

- 제목, 대상 deployment, LIVE/polling 상태를 한 줄로 표시한다.
- 요청량, pressure, 현재 관측 대상의 capacity, CloudWatch 지연을 얇은 정보 레일에 표시한다.
- 카드가 중첩된 형태는 사용하지 않는다.

### 메인 흐름

- 분석된 메인 경로의 모든 단계를 동일한 중심선 위에 일정한 간격으로 배치한다.
- 노드는 기존 Board와 같은 밝은 배경, 실제 AWS 아이콘, 짧은 라벨을 사용한다.
- Stage 전체는 Workspace의 `#ffffff`, `#fafafa`, 얇은 회색 선과 동일한 톤을 사용한다.
- 파랑은 정상 데이터 흐름에만 사용한다.
- 주황은 task 시작 중 상태, 빨강은 실제 critical pressure에만 사용한다.
- 계산된 메인 경로 밖의 area와 보조 리소스는 렌더링하지 않는다.

### Capacity 표현

- 계산된 capacity controller 오른쪽에 task 또는 instance 슬롯을 같은 행에 배치한다.
- 최대 표시 capacity만큼 안정적인 공간을 예약하고 현재 desired capacity 밖의 슬롯은 시각적으로 숨긴다.
- scale-out이 시작되면 새 capacity unit이 pop/fade 애니메이션으로 등장한다.
- pending/provisioning은 주황, running/InService는 정상 상태로 표시한다.
- 슬롯 공간을 항상 예약해 scale-out 순간에 전체 레이아웃이 움직이지 않게 한다.

### 활동 정보

- 현재 관측 대상의 최신 scaling activity는 메인 흐름 아래 한 줄로 표시한다.
- scaling activity가 없으면 불필요한 빈 패널 대신 짧은 대기 상태만 표시한다.

## 애니메이션

- 연결선에 진행 방향을 보여주는 marching highlight를 지속적으로 표시한다.
- 새 traffic event가 수신되면 요청 입자 여러 개가 계산된 source에서 활성 capacity unit 방향으로 이동한다.
- 각 주요 노드는 요청 도착 시 짧은 pulse ring으로 반응한다.
- pressure가 높아지면 계산된 경로 중 관측 대상에 가까운 후반 구간의 색상이 주황 또는 빨강으로 변한다.
- scale-out 시 두 번째 task는 한 번 크게 등장한 뒤 pending pulse로 전환하고, running이 되면 안정 상태로 바뀐다.
- `prefers-reduced-motion`에서는 이동 입자를 제거하고 색상과 상태 텍스트만 유지한다.

## 컴포넌트 경계

- `live-observation-diagram.ts`: DiagramJson 그래프에서 동적 메인 경로, 표시 단계, capacity 분기를 계산하는 순수 모델을 담당한다.
- `LiveObservationDiagramMap.tsx`: 발표용 모델과 snapshot을 받아 노드, 연결선, 입자, capacity 상태를 렌더링한다.
- `LiveObservationModal.tsx`: deployment 선택, polling/stream, snapshot lifecycle만 담당한다.
- backend API와 `LiveObservationSnapshot` 계약은 변경하지 않는다.

## 예외 처리

- source와 관측 대상 사이의 유효한 경로를 결정할 수 없으면 전체 다이어그램이나 고정 경로로 돌아가지 않는다. 경로를 분석할 수 없다는 명시적인 빈 상태를 표시한다.
- 아이콘이 없는 노드는 공통 fallback을 사용하되 리소스 이름은 유지한다.
- snapshot이 아직 없으면 다이어그램 경로는 표시하고 metric과 task 상태만 대기 상태로 표시한다.
- inactive task는 접근성 트리에서도 활성 capacity로 읽히지 않게 한다.

## 반응형과 접근성

- 데스크톱에서는 계산된 모든 메인 경로 단계를 한 줄로 유지한다.
- 좁은 화면에서는 줄바꿈으로 순서를 바꾸지 않고 최소 너비와 가로 스크롤을 사용한다.
- 각 노드는 리소스 이름과 관측 상태를 포함한 accessible name을 가진다.
- 색상 외에도 `RUNNING`, `STARTING`, `CRITICAL` 텍스트로 상태를 구분한다.

## 테스트

- ECS/Fargate, ASG/EC2, serverless 예제 DiagramJson에서 서로 다른 메인 경로를 올바른 순서로 계산하는지 검증한다.
- 명시적 observation role이 추론 결과보다 우선하는지 검증한다.
- 후보 경로가 여러 개인 다이어그램에서 동일한 주 경로가 결정적으로 선택되는지 검증한다.
- 보조 리소스와 area 노드가 발표 모델에서 제외되는지 검증한다.
- desired/running/pending capacity에 따라 두 번째 task가 hidden, launching, running으로 변하는지 검증한다.
- event burst가 활성 task까지만 요청 입자를 생성하는지 검증한다.
- critical pressure와 reduced-motion 상태가 각각 올바른 클래스와 렌더링 결과를 만드는지 검증한다.
- 데스크톱과 모바일 viewport에서 한 줄 순서, 텍스트 잘림, modal overflow를 브라우저로 확인한다.

## 완료 기준

- 관측 화면에는 현재 DiagramJson에서 분석된 메인 트래픽 경로와 capacity 분기만 크게 보인다.
- ECS/Fargate, ASG/EC2 등 서로 다른 다이어그램을 입력하면 관측 화면의 단계와 리소스가 실제 경로에 맞게 달라진다.
- 원본 DiagramJson에서 리소스와 연결 순서를 가져오며 별도 고정 토폴로지나 고정 단계 목록을 사용하지 않는다.
- 모든 메인 노드가 일정한 간격의 한 줄에 정렬된다.
- 트래픽, pressure, scale-out 변화가 애니메이션과 비색상 상태 텍스트로 명확하게 구분된다.
- 기존 polling, simulated provider, 실제 ECS/ASG provider 동작은 유지된다.
