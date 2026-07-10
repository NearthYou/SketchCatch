# AWS Template 실제 배포 검증 기록

기준 설계: [`008_AWS템플릿구현설계_gg.md`](./008_AWS템플릿구현설계_gg.md)

구현 마일스톤: [`010_AWS템플릿구현마일스톤_gg.md`](./010_AWS템플릿구현마일스톤_gg.md)

## 한 줄 결론

여섯 AWS Template의 Terraform 정적 검증과 AWS Role 연결 검증은 완료했다. Chrome 실제 apply/destroy와 클릭부터 terminal state까지의 시간 측정은 M5b의 Resource 노드 표현 결함을 수정한 뒤 이 문서에 관찰값으로 기록한다.

## 검증 원칙

- 기본 Template 값을 그대로 사용한다.
- 실제 apply 전에 Architecture Board의 모든 사용자 가시 Resource가 기존 Resource 카탈로그 icon, label, size, style을 사용하는지 확인한다.
- 일반 `AWS` fallback tile 또는 `*_workspace` Terraform logical name이 하나라도 보이면 배포를 시작하지 않고 M5b 결함으로 처리한다.
- Chrome의 실제 Template 선택, Terraform Preview, Pre-Deployment Check, 승인, 배포 버튼 경로를 사용한다.
- 배포 버튼 클릭 직전 시각부터 Deployment의 `SUCCESS` 또는 `FAILED` 상태를 화면에서 확인한 시각까지 측정한다.
- 성공한 Deployment는 같은 화면의 destroy 경로로 정리하고 terminal state와 잔여 리소스 여부를 확인한다.
- 실패한 결과를 성공으로 기록하지 않는다.
- AWS account id, role ARN, credential, token, Terraform state의 민감한 output은 문서에 남기지 않는다.

## 검증 환경

| 항목 | 값 |
| --- | --- |
| 검증일 | 2026-07-10~2026-07-11 KST |
| 애플리케이션 | Web `http://127.0.0.1:3010`, API `http://127.0.0.1:4010` |
| 브라우저 | 사용자의 Chrome extension session |
| Terraform provider | AWS `~> 5.0`, Archive, Kubernetes |
| 배포 연결 | verified AWS connection, `AssumeRole`과 assumed identity 확인 완료, 세부 계정 정보 비기록 |

## 자동화 검증

| 검증 | 결과 | 증거 |
| --- | --- | --- |
| Template registry | 통과 | 정확히 6개 Template, deterministic DiagramJson |
| AWS Role connection | 통과 | Chrome에서 Role 복구, 실제 `sts:AssumeRole` 및 `sts:GetCallerIdentity` exit 0 |
| Web Template/Workspace | 통과 | catalog, template library, Terraform panel 관련 41 tests |
| API Terraform 경로 | 통과 | resource coverage, preview, diagnostics, workspace 관련 75 tests |
| Terraform CLI | 통과 | 6개 Template 각각 `terraform init`과 `terraform validate`, exit code 0 |
| Repository harness | 통과 | `pnpm harness:check` |

### Terraform CLI 결과

| Template | init | validate | init부터 validate 종료까지 |
| --- | --- | --- | --- |
| Static Web Hosting | exit 0 | exit 0 | 32.028초 |
| Minimal Serverless API | exit 0 | exit 0 | 30.899초 |
| Full Serverless Web App | exit 0 | exit 0 | 66.784초 |
| 3-Tier Web App | exit 0 | exit 0 | 29.620초 |
| ECS Fargate Container App | exit 0 | exit 0 | 40.209초 |
| EKS Container App | exit 0 | exit 0 | 29.946초 |

모든 `terraform validate` 출력은 `Success! The configuration is valid.`였다. 이 시간은 provider 초기화와 정적 검증 시간이며, 아래 Chrome 실제 배포 시간과 구분한다.

## Chrome 실제 배포 결과

아래 표는 Chrome 화면에서 실제 terminal state와 cleanup을 확인한 뒤에만 채운다.

| Template | apply 시작 | terminal state | 클릭-종료 시간 | destroy 결과 | destroy 시간 | 잔여 리소스 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Static Web Hosting | 대기 | 대기 | 대기 | 대기 | 대기 | 미확인 |  |
| Minimal Serverless API | 대기 | 대기 | 대기 | 대기 | 대기 | 미확인 |  |
| Full Serverless Web App | 대기 | 대기 | 대기 | 대기 | 대기 | 미확인 |  |
| 3-Tier Web App | 대기 | 대기 | 대기 | 대기 | 대기 | 미확인 |  |
| ECS Fargate Container App | 대기 | 대기 | 대기 | 대기 | 대기 | 미확인 |  |
| EKS Container App | 대기 | 대기 | 대기 | 대기 | 대기 | 미확인 |  |

## 패턴별 확인 항목

### Static Web Hosting

- private S3 bucket과 public access block
- CloudFront OAC와 제한된 bucket policy
- `index.html` 기본 object
- CloudFront 생성 완료 후 destroy cleanup

### Minimal Serverless API

- API Gateway route/method/integration/deployment/stage
- Lambda permission, inline archive, CloudWatch log group
- DynamoDB table 한정 IAM policy

### Full Serverless Web App

- private frontend bucket과 CloudFront
- Cognito user pool/client와 API Gateway authorizer
- Lambda, DynamoDB, 제한된 IAM policy

### 3-Tier Web App

- 두 AZ의 public/app/db subnet
- NAT Gateway, ALB, Auto Scaling Group, RDS
- workload와 database security group 경계

### ECS Fargate Container App

- ECS cluster, task definition, service
- task role과 execution role 분리
- ALB target group 연결과 public subnet network configuration

### EKS Container App

- EKS cluster와 managed node group
- cluster/node IAM role과 managed policy dependency
- Kubernetes namespace/deployment/service 적용
- infra와 workload 단계별 상태 및 총 소요 시간

## 미완료 조건

Chrome 로그인이 연결되지 않았거나 verified AWS connection을 확인하지 못한 상태에서는 실제 apply를 시작하지 않는다. 또한 Raw Terraform Detail 노드가 Architecture Board에 보이면 M5c를 시작하지 않고 M5b 수정부터 완료한다.
