# AWS Template 실제 배포 검증 기록

기준 설계: [`008_AWS템플릿구현설계_gg.md`](./008_AWS템플릿구현설계_gg.md)

구현 마일스톤: [`010_AWS템플릿구현마일스톤_gg.md`](./010_AWS템플릿구현마일스톤_gg.md)

## 한 줄 결론

여섯 AWS Template을 실제 AWS connection으로 apply한 뒤 destroy까지 완료했다. 모든 최종 Deployment는 `DESTROYED`, Terraform state key `null`, Deployment Resources API 빈 목록으로 확인했다.

## 검증 원칙

- 기본 Template 값을 그대로 사용한다.
- 실제 apply 전에 Architecture Board의 모든 사용자 가시 Resource가 기존 Resource 카탈로그 icon, label, size, style을 사용하는지 확인한다.
- 일반 `AWS` fallback tile 또는 `*_workspace` Terraform logical name이 하나라도 보이면 배포를 시작하지 않고 M5b 결함으로 처리한다.
- Template 선택과 Preview는 Chrome에서 확인하고, 장시간 apply/destroy는 Dashboard와 같은 public Deployment API 경로로 실행했다. 공유 환경의 다른 API watcher가 실행 중 status를 중단으로 덮는 문제가 있어, Terraform child process와 최종 Deployment state를 함께 판정했다.
- 배포 시작 요청 직후 서버가 기록한 `startedAt`부터 terminal state의 `completedAt`까지를 배포 시간으로 측정한다. 이 값은 버튼 클릭 이후의 실제 Terraform 실행 시간을 뜻하며, HTTP 요청 왕복 시간은 포함하지 않는다.
- 성공한 Deployment는 같은 화면의 destroy 경로로 정리하고 terminal state와 잔여 리소스 여부를 확인한다.
- 실패한 결과를 성공으로 기록하지 않는다.
- AWS account id, role ARN, credential, token, Terraform state의 민감한 output은 문서에 남기지 않는다.

## 검증 환경

| 항목 | 값 |
| --- | --- |
| 검증일 | 2026-07-10~2026-07-11 KST |
| 애플리케이션 | M5b Web `http://127.0.0.1:3001`; M5c Web/API 주소는 실행 시 추가 기록 |
| 브라우저 | Chrome extension session으로 Template/Board 확인, public API로 장시간 실행 추적 |
| Terraform provider | AWS `~> 5.0`, Archive, Kubernetes |
| 배포 연결 | verified AWS connection, `AssumeRole`과 assumed identity 확인 완료, 세부 계정 정보 비기록 |

## 자동화 검증

| 검증 | 결과 | 증거 |
| --- | --- | --- |
| Template registry | 통과 | 정확히 6개 Template, deterministic DiagramJson |
| AWS Role connection | 통과 | Chrome에서 Role 복구, 실제 `sts:AssumeRole` 및 `sts:GetCallerIdentity` exit 0 |
| Architecture Board Resource 표현 | 통과 | 6개 Chrome 캡처, catalog icon·parameter default 일치, fallback·raw label·빈 label·clipping 0개 |
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

### Architecture Board Resource 표현 결과

| Template | 보드 노드 | catalog icon | 일반 `AWS` fallback | `*_workspace` 가시 label |
| --- | ---: | ---: | ---: | ---: |
| Static Web Hosting | 6 | 6 | 0 | 0 |
| Minimal Serverless API | 12 | 12 | 0 | 0 |
| Full Serverless Web App | 16 | 16 | 0 | 0 |
| 3-Tier Web App | 30 | 30 | 0 | 0 |
| ECS Fargate Container App | 18 | 18 | 0 | 0 |
| EKS Container App | 19 | 19 | 0 | 0 |

모든 페이지는 마지막 M5b 코드 수정 뒤 Chrome에서 양쪽 패널을 접고 새로 열어 `Fit view`를 적용해 캡처했다. 노드별 가시 label 존재와 viewport clipping 0개도 DOM 경계에서 확인했다. 오른쪽 Resources/configurator의 Terraform address는 내부 배포 식별 정보이며, 이 표의 Architecture Board node label 판정에는 포함하지 않는다.

최종 캡처 여섯 장과 카탈로그 합성 소스를 각각 검토한 독립 설계·기능 리뷰와 시각 정밀 리뷰는 모두 `PASS`였고 blocking finding은 없었다.

## 실제 배포 결과

아래 시간은 최종 성공 run의 서버 기록이다. `시작→종료`는 apply/destroy 요청이 `RUNNING`으로 기록된 시각부터 terminal state까지다.

| Template | apply 시작 | terminal state | 클릭-종료 시간 | destroy 결과 | destroy 시간 | 잔여 리소스 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Static Web Hosting | `SUCCESS` | `SUCCESS` | 3분 23.529초 | `DESTROYED` | 3분 37.763초 | 없음 | Deployment `96b40785…` |
| Minimal Serverless API | `SUCCESS` | `SUCCESS` | 27.396초 | `DESTROYED` | 10.964초 | 없음 | Deployment `2f7ad0c5…` |
| Full Serverless Web App | `SUCCESS` | `SUCCESS` | 22.396초 | `DESTROYED` | 10.940초 | 없음 | Deployment `2581425a…` |
| 3-Tier Web App | `SUCCESS` | `SUCCESS` | 5분 31.590초 | `DESTROYED` | 6분 50.526초 | 없음 | Deployment `fdfe017b…` |
| ECS Fargate Container App | `SUCCESS` | `SUCCESS` | 3분 29.929초 | `DESTROYED` | 8분 6.856초 | 없음 | Deployment `ad461382…` |
| EKS Container App | `SUCCESS` | `SUCCESS` | 9분 32.693초 | `DESTROYED` | 8분 3.310초 | 없음 | Deployment `8a4057c7…` |

### 실제 실행에서 수정·복구한 항목

- Lambda가 `data.archive_file`로 만든 ZIP은 plan 작업 디렉터리에만 있었고, apply는 새 디렉터리에서 approved plan을 실행해 ZIP을 찾지 못했다. apply 직전에 archive data source가 있는 Terraform만 별도 non-approved materialize plan으로 다시 평가해 local bundle을 만들고, approved `tfplan` 자체는 그대로 적용하도록 수정했다.
- 초기 API `.env`의 Windows plugin cache path가 macOS에서 init timeout을 일으켰다. macOS 임시 cache를 사용한 단일 API worker로 실행했다.
- 3-Tier의 encrypted RDS는 실행 Role에 AWS 관리형 RDS KMS key 접근과 RDS master secret 생성 권한이 없어 실패했다. Role에 `kms:DescribeKey/CreateGrant/ListGrants/RevokeGrant`와 `rds!*` secret 범위의 Secrets Manager lifecycle 권한만 인라인으로 추가했다. 암호화 설정을 낮추지 않았다.
- 공유 DB에 연결된 다른 API watcher가 시작할 때 `RUNNING` deployment를 중단으로 오인해 `FAILED`로 덮는 상태 경쟁이 재현됐다. Terraform child가 종료될 때까지 기다려 실제 성공/삭제 결과를 재확인했다. 실패한 partial run은 모두 explicit destroy로 정리했다.

### 최종 cleanup 증거

- 성공 run 여섯 개는 모두 `stateObjectKey=null`이며, deployment resources endpoint가 빈 목록을 반환했다.
- 3-Tier의 이전 partial run 두 개, ECS의 중단 표기 run, EKS DNS 실패 run도 각각 destroy를 거쳐 state key가 비워졌다.
- Resource Board의 사용자 가시 노드는 여섯 Template 모두 기존 catalog ResourceDefinition만 사용한다. 일반 `AWS` fallback tile과 `*_workspace` visible label은 0개다.

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
