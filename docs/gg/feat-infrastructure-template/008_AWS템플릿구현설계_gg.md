# AWS Template 구현 설계

## 한 줄 결론

여섯 AWS Template을 단순한 보드 샘플이 아니라, 기본값으로 IaC Preview와 Direct Deployment까지 이어지는 공통 `TemplateDefinition` 기반의 배포 가능한 Practice Architecture로 구현한다.

## 1. 이번 작업의 확정 범위

대상 Template은 다음 여섯 가지다.

1. Static Web Hosting
2. Minimal Serverless API
3. Full Serverless Web App
4. 3-Tier Web App
5. ECS Fargate Container App
6. EKS Container App

각 Template은 다음 조건을 만족해야 한다.

- 기본값만으로 Terraform `validate`, `plan`, `apply` 경로를 구성할 수 있다.
- 보드에서 리소스와 관계를 확인할 수 있다.
- 사용자가 이름, 네트워크 범위, instance size, runtime, domain 같은 값을 바꿀 수 있다.
- Cost Risk, Security Risk, 누락 설정이 Pre-Deployment Check에 연결된다.
- 실제 배포 버튼을 Chrome에서 눌러 배포 완료 여부와 소요 시간을 확인할 수 있다.
- 배포가 끝나면 같은 Deployment의 destroy 경로까지 확인해 비용이 남지 않도록 한다.

템플릿 마켓플레이스의 서버 저장, 좋아요, 공유 링크는 이번 구현의 필수 범위가 아니다. 현재는 재사용 가능한 Template 카탈로그와 실제 배포 흐름을 먼저 완성한다.

## 2. 현재 문제

현재 웹의 `template-library.ts`는 소수의 `DiagramJson`을 브라우저 코드에 직접 보관한다. 이 방식은 화면에 노드를 보여주기에는 충분하지만 다음을 보장하지 못한다.

- Terraform에 필요한 리소스와 nested block이 모두 존재하는지
- 리소스 간 참조가 올바른지
- 기본값으로 AWS 배포가 가능한지
- 보드, Terraform Preview, parameter panel, Cost/Security 분석이 같은 모델을 사용하는지

따라서 여섯 Template을 각각 화면 코드에 복사하지 않고, 공통 정의에서 보드와 IaC 입력을 함께 생성한다.

## 3. 핵심 용어

### Template

사용자가 빈 보드 대신 선택할 수 있는 재사용 가능한 starter Practice Architecture다.

### TemplateDefinition

Template 하나의 리소스 구성, 관계, Terraform identity, 기본 파라미터, 배포 조건을 한 곳에 모은 내부 설계도다. 이 정의를 기준으로 `DiagramJson`, Infrastructure Graph, Terraform Preview, parameter panel 입력값을 만든다.

### Deployable Default

사용자가 domain, certificate, 기존 VPC 같은 소유 정보를 입력하지 않아도 기본 경로가 중단되지 않는 값이다. 자동 생성 가능한 값은 `projectSlug`, `templateId`, 짧은 suffix 조합으로 만든다.

### Deployment Duration

사용자가 Chrome에서 배포 버튼을 누른 시점부터 Deployment가 성공 또는 실패로 terminal state에 도달한 시점까지의 사용자 체감 시간이다. 서버 단계별 시간도 함께 보존한다.

## 4. 선택한 구조

`TemplateDefinition`은 shared types에서 소비할 수 있는 provider-neutral 계약으로 둔다. AWS Template의 Terraform identity와 AWS 전용 기본값은 AWS Template adapter에 둔다.

흐름은 다음과 같다.

```text
TemplateDefinition
  -> DiagramJson
  -> InfrastructureGraph
  -> Terraform Preview
  -> Pre-Deployment Check
  -> user approval
  -> Direct Deployment Path
  -> logs / outputs / duration / cleanup
```

정의에 포함할 최소 정보는 다음과 같다.

- `id`, title, description, tags, pattern category
- Resource 목록과 각 Resource의 `ResourceDefinition` id
- stable node id, label, parent area, position, z-index
- Terraform block type, resource type, resource name
- 기본 parameter values와 사용자 입력 가능 여부
- Resource 간 관계와 Terraform reference 방향
- required provider 또는 staged deployment 여부
- Cost Risk, Security Risk, prerequisite와 cleanup 주의점

Template 카탈로그는 이 정의를 읽어 `DiagramJson`을 반환하고, 기존 `buildInfrastructureGraphFromDiagramJson`와 Terraform Preview 경로를 재사용한다. 보드가 Terraform 경로와 다른 별도 모델을 갖지 않도록 한다.

## 5. 리소스가 없는 경우의 구현 규칙

문서에 필요한 리소스가 현재 catalog 또는 Terraform 경로에 없으면 Template에 임시 노드만 추가하지 않는다. 다음 순서로 실제 지원을 추가한다.

1. `packages/types/src/resource-definitions.ts`에 shared `ResourceDefinition`을 추가한다.
2. Web resource catalog와 parameter catalog에 표시 이름, 아이콘, 기본 입력을 연결한다.
3. Infrastructure Graph가 해당 Resource를 renderable node로 인식하도록 한다.
4. Terraform generator가 단순 attribute와 nested block, Terraform reference를 렌더링하도록 보강한다.
5. Terraform sync와 validation이 같은 Resource identity를 이해하도록 한다.
6. Cost/Security rule이 필요한 경우 Check Finding을 추가한다.
7. 해당 Resource를 포함한 Template Preview 테스트와 실제 배포 전 검증을 추가한다.

이 규칙에 따라 현재 `unsupported`로 표시된 EKS Container App도 구현 대상에서 제외하지 않는다. AWS `EKS` Resource와 Kubernetes `Namespace`, `Deployment`, `Service` Resource가 함께 필요하면 두 provider 경계를 명시적으로 추가한다.

## 6. 여섯 Template의 배포 기준

### Static Web Hosting

S3 private bucket, public access block, CloudFront Distribution, Origin Access Control, restricted bucket policy를 기본 경로로 둔다. Custom domain, ACM, Route 53은 optional parameter로 두고 기본 배포에는 요구하지 않는다.

### Minimal Serverless API

API Gateway, route/method/integration, Lambda, Lambda permission, least-privilege IAM role/policy, DynamoDB on-demand table, optional log group을 포함한다. 기본 route는 인증 없이 동작하지만 Security Risk로 표시한다.

### Full Serverless Web App

Frontend hosting, Cognito User Pool/Client, API Gateway authorizer, Lambda, DynamoDB, IAM, logging을 포함한다. 기본 API는 Cognito authorizer를 연결해 인증 누락 상태를 기본값으로 만들지 않는다.

### 3-Tier Web App

VPC, 두 Availability Zone의 public/app/db subnet, route table, Internet Gateway, NAT Gateway, security group과 workload 연결을 포함한다. NAT Gateway는 비용 위험을 명시하고, 학습용 기본값은 최소 수량으로 둔다.

### ECS Fargate Container App

VPC/network, ECS cluster, task definition, execution/task IAM role, Fargate service, load balancer/target group을 포함한다. 작은 public sample image와 최소 task count를 기본값으로 사용한다.

### EKS Container App

EKS cluster, cluster/node IAM role, managed node group, VPC/subnet/security group, Kubernetes namespace/deployment/service를 포함한다. EKS 생성 후 Kubernetes API가 준비되어야 workload를 적용할 수 있으므로, 사용자 화면에서는 하나의 Deployment로 보이되 내부 실행은 infra stage와 workload stage로 나눌 수 있다. 총 시간과 각 stage 시간을 모두 기록한다.

## 7. 배포 시간 측정과 Chrome QA

배포 버튼 클릭 직전에 브라우저에서 `startedAt`을 기록하고, Deployment가 `SUCCESS` 또는 `FAILED`가 되는 순간 `finishedAt`을 기록한다. 화면에는 `분 초` 형식으로 보여주고, 검증 문서에는 ISO timestamp와 milliseconds를 함께 남긴다.

각 Template의 QA는 다음 순서다.

1. Chrome에서 로그인 상태와 verified AWS connection 확인
2. Template 선택
3. 기본값을 변경하지 않고 보드와 Terraform Preview 확인
4. Pre-Deployment Check와 승인 흐름 확인
5. 배포 버튼 클릭 시각 기록
6. Chrome 화면, Deployment logs, terminal state 확인
7. 성공 시 resources/outputs 확인
8. destroy plan과 destroy 실행
9. destroy 완료와 잔여 리소스 없음 확인
10. 패턴별 배포 시간, 실패 원인, cleanup 결과를 `docs/gg/feat-infrastructure-template/` 검증 문서에 기록

AWS 연결이 끊기거나 verified 상태가 아니면 live apply를 계속하지 않고 사용자에게 알린다. 자격 증명과 secret은 코드, 로그, 검증 문서에 남기지 않는다.

## 8. 제외 범위

- Template marketplace의 DB persistence, like, share link
- 사용자가 입력한 domain/certificate 없이 custom domain을 자동 추정하는 기능
- EKS workload를 Kubernetes Resource가 아닌 임의의 AWS 노드로 위장하는 방식
- 실제 AWS apply를 우회한 성공 판정
- Chrome에서 확인하지 않은 배포 결과를 성공으로 기록하는 것

## 9. 구현 완료 기준

- 여섯 Template이 catalog에 나타난다.
- 각 Template을 새 보드에 적용할 수 있다.
- 각 Template의 모든 renderable Resource가 `ResourceDefinition`에 존재한다.
- 각 Template의 Terraform Preview가 기본값으로 생성된다.
- 관련 단위 테스트와 `terraform validate`가 통과한다.
- Chrome에서 여섯 Template의 배포 버튼을 실제로 눌러 성공 여부를 확인한다.
- 각 배포의 소요 시간을 보고하고, 성공한 리소스를 destroy로 정리한다.
- 실패한 패턴은 성공으로 표시하지 않고 원인과 남은 리소스를 기록한다.
