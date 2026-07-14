# Diagram Layout Reference

이 디렉터리는 SketchCatch AI 다이어그램 자동 배치의 시각적 기준을 정리한다. `good`은 재사용할 배치 원칙을 찾기 위한 참고 사례이고, `failure`는 현재 생성 결과에서 피해야 할 실패 사례다. 좋은 예시의 좌표를 그대로 복제하지 않고, 핵심 흐름·경계·정렬·간선·정보 밀도에 관한 공통 원칙을 추출하는 데 사용한다.

## Good Examples

### [architecture.png](./good/architecture.png)

- 분류: 좋은 예시
- 참고할 점: Web UI, 비용, 데이터, 배포처럼 기능별 영역을 분리하면서 번호가 붙은 주 흐름을 왼쪽에서 오른쪽으로 읽게 한다. VPC와 Private Subnet은 실제 내부 리소스를 묶는 데 사용하고 보조 기능은 별도 패널로 격리한다.

### [aws_fargate_privatelink_nlb.png](./good/aws_fargate_privatelink_nlb.png)

- 분류: 좋은 예시
- 참고할 점: 사용자에서 PrivateLink, NLB, ALB, ECS, RDS로 이어지는 주 흐름을 위에서 아래로 고정한다. 두 Availability Zone과 Subnet을 좌우 대칭으로 배치해 고가용성 구조와 계층을 한눈에 비교할 수 있다.

### [centralized_logging.png](./good/centralized_logging.png)

- 분류: 좋은 예시
- 참고할 점: 콘솔, 관리 계층, 로그 파이프라인, 분석 엔진을 열 단위로 나누고 서비스 로그와 애플리케이션 로그를 독립된 병렬 흐름으로 표현한다. 복잡한 시스템에서도 기능 그룹 사이의 이동 방향이 일정하다.

### [cicd_pipeline_ecs_cdk.png](./good/cicd_pipeline_ecs_cdk.png)

- 분류: 좋은 예시
- 참고할 점: CI/CD 순서를 화면 아래의 단일 수평 축으로 놓고 Non-production과 Production 환경을 좌우 대칭으로 비교한다. 빌드, 승인, 배포 단계와 런타임 구조가 섞이지 않는다.

### [clickstream_analytics.png](./good/clickstream_analytics.png)

- 분류: 좋은 예시
- 참고할 점: 사용자 진입과 인증은 왼쪽, 오케스트레이션과 데이터 파이프라인은 오른쪽에 묶는다. 번호와 경계 박스를 함께 사용해 인증 흐름과 분석 흐름을 구분한다.

### [containerized_web_application.png](./good/containerized_web_application.png)

- 분류: 좋은 예시
- 참고할 점: Web client에서 Route 53, CloudFront, API Gateway, ALB, ECS, 데이터 계층으로 이어지는 주 경로가 왼쪽에서 오른쪽으로 읽힌다. 두 Availability Zone을 위아래로 동일하게 반복해 Subnet과 워크로드의 대응 관계를 명확히 한다.

### [data_transfer_hub.png](./good/data_transfer_hub.png)

- 분류: 좋은 예시
- 참고할 점: Customer Account와 AWS Managed Account를 큰 경계로 분리하고, 사용자 UI 흐름과 복제 컴포넌트 흐름을 같은 방향으로 정렬한다. 계정 간 연결은 경계를 가로지르는 짧은 간선만 사용한다.

### [deepracer.png](./good/deepracer.png)

- 분류: 좋은 예시
- 참고할 점: 리소스가 많은 경우 기능별 워크플로를 색이 다른 큰 패널로 분리하고 API Functions를 중심 허브로 둔다. 복잡도를 없애기보다 사용자 관리, 모델 가져오기·내보내기, 학습, 라이브 레이스 같은 업무 단위로 나눈다.

### [distributed_load_testing.png](./good/distributed_load_testing.png)

- 분류: 좋은 예시
- 참고할 점: Front end, API, Backend, Region, Container를 독립된 기능 영역으로 나누고 번호로 영역 간 흐름을 설명한다. 선택 기능은 별도 경계로 표시해 핵심 경로와 선택 경로를 구분한다.

### [ecr_github_action.png](./good/ecr_github_action.png)

- 분류: 좋은 예시
- 참고할 점: 사용자와 소스에서 GitHub Actions, ECR Repository, Container Image로 이어지는 CI/CD 경로를 짧은 수평 흐름으로 표현한다. 필요한 경계와 리소스만 남겨 한 화면에서 목적을 이해할 수 있다.

### [ECS_express_mode.png](./good/ECS_express_mode.png)

- 분류: 좋은 예시
- 참고할 점: 애플리케이션 사용자의 트래픽 흐름은 왼쪽에서 중앙으로, 개발자의 배포 흐름은 오른쪽에서 중앙으로 분리한다. ECS 계층을 중첩 경계로 표현하면서 CloudWatch와 ECR은 VPC 밖의 관리형 서비스로 배치한다.

### [fargate_s3.png](./good/fargate_s3.png)

- 분류: 좋은 예시
- 참고할 점: 관계가 단순할 때는 불필요한 컨테이너와 보조 노드를 추가하지 않고 Fargate, S3, Role의 핵심 관계만 큰 아이콘과 넉넉한 간격으로 보여준다.

### [innovation_sandbox.png](./good/innovation_sandbox.png)

- 분류: 좋은 예시
- 참고할 점: Actor, Identity Center, Web UI, API, Workflow를 한 방향으로 배치하고 AWS Organizations와 Account 경계를 중첩한다. 계정 관리 흐름은 주 서비스 흐름 아래에 별도 레인으로 둔다.

### [landing_zone_accelerator.png](./good/landing_zone_accelerator.png)

- 분류: 좋은 예시
- 참고할 점: Management, Log Archive, Audit Account를 독립 패널로 분리하고 Management Account 내부도 Installer, Core, Source, Build, Deployment Stage로 세분화한다. 반복 배포 단계는 겹친 카드 표현으로 축약한다.

### [mutual_tls_eks.png](./good/mutual_tls_eks.png)

- 분류: 좋은 예시
- 참고할 점: Users, Route 53, NLB, NGINX Ingress, Application Service, Pods를 단일 수평 축에 배치한다. VPC와 EKS 경계는 주 흐름을 가리지 않으면서 포함 관계만 명확히 보여준다.

### [orchestration_framework.png](./good/orchestration_framework.png)

- 분류: 좋은 예시
- 참고할 점: GitHub Actions를 중심으로 저장소·Runner·AWS Account가 갈라지는 허브 앤드 스포크 구조를 사용한다. 여러 계정은 동일한 내부 레이아웃을 반복해 비교 가능하게 만든다.

### [parallel_s3.png](./good/parallel_s3.png)

- 분류: 좋은 예시
- 참고할 점: Lambda와 S3의 데이터 경로를 수평으로, Step Functions의 제어 경로를 아래에서 위로 배치한다. 세 리소스만으로 데이터 흐름과 오케스트레이션 관계를 분명하게 설명한다.

### [qna_bot.png](./good/qna_bot.png)

- 분류: 좋은 예시
- 참고할 점: 사용자 채널은 왼쪽, 핵심 Bot 처리와 데이터는 중앙, 분석·선택 기능·대체 데이터 소스는 오른쪽에 배치한다. 복잡한 다이어그램에서도 선택 기능과 WebSocket 같은 부가 흐름을 별도 경계로 구분한다.

### [react_based_spa_to_s3_cloudfront.png](./good/react_based_spa_to_s3_cloudfront.png)

- 분류: 좋은 예시
- 참고할 점: Users에서 Internet, Route 53·CloudFront, S3·API Gateway로 이어지는 진입 흐름을 왼쪽에서 오른쪽으로 유지한다. IAM, CloudWatch, CloudTrail, CloudFormation은 오른쪽 보조 열에 정렬한다.

### [s3_cloudfront.png](./good/s3_cloudfront.png)

- 분류: 좋은 예시
- 참고할 점: Client, CloudFront, WAF, ALB, Lambda, S3의 핵심 경로를 수평으로 배치하고 두 Availability Zone을 위아래 대칭으로 표현한다. Account, Region, VPC, AZ, Subnet 경계가 단계적으로 중첩된다.

### [serverless_cell_router.png](./good/serverless_cell_router.png)

- 분류: 좋은 예시
- 참고할 점: User, API Gateway, Orchestrator를 주 수평 축으로 놓고 Dispatcher·Mapper·Scaler·Validator를 하나의 Workflow 안에 수직 정렬한다. DynamoDB와 SQS는 Workflow 오른쪽의 결과·보조 리소스로 분리한다.

### [web_application.png](./good/web_application.png)

- 분류: 좋은 예시
- 참고할 점: Client와 Edge·Auth 서비스는 왼쪽, API Gateway는 중앙, 기능별 Lambda는 수직 정렬, DynamoDB는 오른쪽에 둔다. 간선에 요청 목적을 설명하는 라벨을 붙여 경로가 겹쳐도 의미를 추적할 수 있다.

### [web_hosting.png](./good/web_hosting.png)

- 분류: 좋은 예시
- 참고할 점: 두 Availability Zone을 좌우 대칭으로 놓고 Web, App, DB 계층을 위에서 아래로 정렬한다. DNS·CDN·보안은 VPC 위쪽, 공유 스토리지와 캐시는 VPC 옆에 배치해 네트워크 계층과 관리형 서비스를 구분한다.

## Failure Examples

### [1.png](./failure/1.png)

- 분류: 실패 사례
- 문제: VPC와 Subnet 경계가 서로 겹치고 비어 있는 컨테이너가 많다. Compute, S3, RDS, IAM, Monitoring 사이의 긴 간선이 화면 전체를 가로질러 핵심 사용자·애플리케이션·데이터 흐름을 찾기 어렵다.

### [2.png](./failure/2.png)

- 분류: 실패 사례
- 문제: Compute는 중앙에 몰려 있지만 CI/CD 리소스와 스토리지는 오른쪽에 산발적으로 배치되고, 비어 있는 ASG와 Subnet이 큰 공간을 차지한다. 실선과 점선이 여러 영역을 반복해서 가로질러 배포 흐름과 런타임 흐름이 섞인다.

### [3.png](./failure/3.png)

- 분류: 실패 사례
- 문제: 네트워크 보조 리소스가 화면 아래와 오른쪽에 흩어지고 빈 Subnet 컨테이너가 주 흐름 사이를 차지한다. ALB, Compute, Database의 서비스 경로보다 Route Table, Association, Listener 같은 구현 세부 관계가 더 강하게 보인다.

### [4.png](./failure/4.png)

- 분류: 실패 사례
- 문제: 넓은 VPC 안의 왼쪽과 중앙은 비어 있는데 핵심 런타임 리소스가 오른쪽에 밀집되어 있다. Public·Private Subnet과 Security Group 박스는 실제 자식을 제대로 포함하지 못하고, 리소스 일부는 VPC 밖에 고립되어 있다.

### [5.png](./failure/5.png)

- 분류: 실패 사례
- 문제: AWS Managed Services와 VPC 사이에 과도한 빈 공간이 있고 핵심 리소스는 VPC 오른쪽 아래에 겹치듯 몰려 있다. Browser와 GitHub Actions에서 시작한 매우 긴 간선 때문에 사용자 트래픽과 배포 흐름을 한눈에 구분할 수 없다.

### [6.png](./failure/6.png)

- 분류: 실패 사례
- 문제: 리소스 수가 적은데도 대부분의 라벨과 관계 설명이 없어 아이콘 의미를 추측해야 한다. 빈 서비스 VPC가 실제 리소스와 떨어져 있고, CloudFront·S3·Load Balancer 사이의 순환형 간선 방향도 불분명하다.

### [8.png](./failure/8.png)

- 분류: 실패 사례
- 문제: Compute, Database, Storage를 잇는 긴 간선이 중첩되고 Monitoring 간선이 화면 전체 폭을 사용한다. 여러 Subnet 경계가 비어 있거나 겹쳐 있어 고가용성 배치와 실제 포함 관계를 파악하기 어렵다.

### [9.png](./failure/9.png)

- 분류: 실패 사례
- 문제: 다이어그램이 지나치게 세로로 길고 Serverless 리소스와 VPC 워크로드 사이에 큰 공백이 생긴다. 빈 Subnet이 상단과 하단에 고립되고, Lambda 중심 흐름과 Compute·Database 흐름의 관계가 여러 장거리 간선에 묻힌다.

### [10.png](./failure/10.png)

- 분류: 실패 사례
- 문제: 캔버스가 극단적으로 커져 노드와 라벨을 기본 화면에서 읽을 수 없다. Route Table Association, IAM, Alarm 같은 보조 리소스가 핵심 ALB·Compute·Database 흐름과 동일한 시각적 비중을 차지하고 장거리 간선과 교차를 대량으로 만든다.
