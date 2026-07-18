# AWS Template Patterns for SketchCatch

## 목적

이 문서는 SketchCatch의 AWS Template 구현 전에 참고할 Architecture Pattern을 정리한 문서다.

여기서 정리하는 내용은 AWS 공부용 요약이 아니라, 나중에 SketchCatch의 Practice Architecture Template과 ArchitectureJson으로 변환할 수 있는 Resource 조합, 관계, Cost Risk, Security Risk 후보를 추출하기 위한 기준 자료다.

Template은 Resource만 던지는 것이 아니라, 사용자가 바로 IaC Preview와 Deployment까지 이어갈 수 있도록 배포 가능한 기본 파라미터를 포함해야 한다. 사용자는 기본값을 받은 뒤 Architecture Board에서 이름, CIDR, instance size, runtime, domain 같은 값을 바꿀 수 있어야 한다.

기본 파라미터는 다음 원칙을 따른다.

- 충돌 가능성이 있는 이름은 `projectSlug`, `templateId`, 짧은 난수 suffix를 조합해 자동 생성한다.
- 비용이 커질 수 있는 값은 작은 학습용 기본값으로 시작한다.
- public exposure는 명시적으로 필요한 Resource에만 둔다.
- domain, certificate, 기존 VPC처럼 사용자 소유 정보가 필요한 값은 optional로 두고, 없으면 기본 배포 경로가 동작해야 한다.
- 기본값만으로도 Terraform plan/apply가 가능한 상태를 목표로 한다.

## 구현·표현에 대한 확정 규칙

### 보드에 표시하는 노드의 정확한 이름

이 문서에서 말하는 두 종류의 노드를 구분한다.

1. **카탈로그 Resource 노드**: Architecture Board에 표시되는 정식 AWS/Kubernetes Resource다. 기존 Resource catalog의 `ResourceDefinition`, icon, label, style, parameter 계약을 통해 생성한다. 예를 들어 `VPC`, `ECS Cluster`, `Internet Gateway`처럼 사용자가 이해할 수 있는 실제 리소스 이름을 표시한다.
2. **Raw Terraform Detail 노드**: Terraform `resource`/`data` block 주소와 내부 설정을 표현하는 구현용 단위다. `aws_s3_bucket.static_web_hosting_workspace`나 일반 `AWS` tile처럼 Terraform logical name을 그대로 표시하는 노드가 여기에 해당한다. 이 노드는 IaC Preview 내부에서만 허용하고 Architecture Board에는 표시하지 않는다.

따라서 첫 번째 그림처럼 Terraform logical name을 보드의 노드 이름으로 노출하거나, 카탈로그에 없는 리소스를 임시 `AWS` 노드로 만들어 연결하는 방식은 사용하지 않는다. 두 번째 그림처럼 기존에 등록된 Resource catalog의 실제 리소스 노드를 끌어다 연결하는 방식만 허용한다.

### 카탈로그에 리소스가 없을 때

필요한 리소스가 기존 catalog에 없으면 Template 구현을 멈추고, 먼저 해당 리소스를 정식 Resource로 등록한다. `ResourceDefinition`, provider identity, icon/label/style, parameter, Terraform Preview/Sync, 필요한 Check Finding과 테스트를 추가한 뒤 Template에서 재사용한다. 임시 노드, 일반 `AWS` fallback tile, `*_workspace` 가시 label을 추가해 진행하지 않는다.

### AWS Role 등록 선행 순서

실제 구현과 배포 검증의 순서는 다음으로 고정한다.

1. 기존 AWS 계정의 Role과 trust policy를 확인한다.
2. 재사용 가능한 Role이 있으면 그것을 연결하고, 없을 때만 필요한 Role을 등록한다. 중복 Role과 임시 Role은 만들지 않는다.
3. SketchCatch의 verified AWS connection에서 STS `AssumeRole`과 `GetCallerIdentity`를 확인한다.
4. 위 연결 검증이 통과한 뒤에만 Template 코드 수정과 Chrome live plan/apply/destroy 검증을 진행한다.

Role 연결 검증 전에는 실제 AWS 리소스 생성이나 Template 구현 완료를 주장하지 않는다.

---

## Static Web Hosting Pattern

### 참고 링크

- https://github.com/aws-samples/amazon-cloudfront-secure-static-site
- https://github.com/aws-samples/amazon-cloudfront-secure-static-site/blob/master/templates/cloudfront-site.yaml

### 원래 패턴 요약

S3 Bucket에 정적 파일을 저장하고, CloudFront Distribution을 앞단에 두어 사용자 요청을 edge location에서 처리하는 패턴이다.

참고 Template은 S3 Bucket을 직접 공개하지 않고 CloudFront를 통해서만 접근하게 만드는 보안형 정적 사이트 구성을 보여준다. HTTPS는 ACM Certificate와 CloudFront 설정으로 처리하고, 도메인은 Route 53 record로 CloudFront에 연결한다.

### 실제 AWS 리소스 조합

- S3 Bucket
- S3 Bucket Policy
- CloudFront Distribution
- CloudFront Origin Access Control
- CloudFront Response Headers Policy
- ACM Certificate
- Route 53 Record
- CloudFront logging용 S3 Bucket 후보

### Architecture Board 노드 후보

- S3 Bucket
- S3 Bucket Policy
- CloudFront Distribution
- Origin Access Control
- Response Headers Policy
- ACM Certificate
- Route 53 Record
- CloudFront Origin
- HTTPS Redirect 설정

### 노드 간 관계 후보

- Viewer -> Route 53 Record
- Route 53 Record -> CloudFront Distribution
- ACM Certificate -> CloudFront Distribution
- CloudFront Distribution -> S3 Bucket
- Origin Access Control -> CloudFront Distribution
- Origin Access Control -> S3 Bucket
- S3 Bucket Policy -> S3 Bucket
- Response Headers Policy -> CloudFront Distribution

### SketchCatch 인프라 템플릿으로 만들 때 필요한 리소스

- 정적 파일 저장용 S3 Bucket
- S3 public access 차단 기본값
- CloudFront Distribution의 S3 origin 설정
- CloudFront Origin Access Control
- CloudFront에서 S3에 접근할 수 있게 제한하는 Bucket Policy
- Viewer Protocol Policy의 HTTPS redirect 설정
- 선택형 Custom Domain, ACM Certificate, Route 53 Record
- 선택형 Response Headers Policy

### 배포 가능한 기본 파라미터 후보

- S3 Bucket name: `projectSlug-static-shortId`
- S3 public access block: enabled
- CloudFront default root object: `index.html`
- Viewer protocol policy: `redirect-to-https`
- Custom domain: disabled by default
- ACM Certificate, Route 53 Record: custom domain을 켰을 때만 필요
- Response Headers Policy: 기본 security header preset 사용
- CloudFront price class: 작은 실습용 기본값 사용

### workspace resource definition 확인 필요 항목

- `aws_s3_bucket`
- `aws_s3_bucket_policy`
- `aws_cloudfront_distribution`
- `aws_cloudfront_origin_access_control`
- `aws_cloudfront_response_headers_policy`
- `aws_acm_certificate`
- `aws_route53_record`
- CloudFront Distribution 내부의 origin, cache behavior, viewer certificate, HTTPS redirect를 Board 설정으로 표현할 수 있는지

### 비용 주의점

CloudFront 요청 수, 데이터 전송량, invalidation 요청, S3 저장 용량, S3 request, Route 53 hosted zone과 DNS query가 Cost Risk 후보가 된다.

MVP에서는 비용 수치를 단정하기보다, CloudFront와 S3 traffic이 늘면 비용이 커질 수 있다는 Check Finding으로 표현하는 것이 적합하다.

### 보안 주의점

S3 Bucket을 public으로 직접 열지 않는 것이 핵심이다.

CloudFront Origin Access Control과 Bucket Policy 관계가 빠지면 사용자가 의도하지 않은 public storage가 될 수 있다. HTTPS redirect, security response headers, ACM Certificate 연결도 Security Risk 후보로 표시할 수 있다.

### MVP 구현 가능성

partial.

S3와 CloudFront 중심의 기본 Template은 MVP에 적합하다. 다만 OAC, Response Headers Policy, Route 53, ACM까지 모두 한 번에 지원하려면 Terraform generator와 Board 설정 표현 범위를 먼저 확인해야 한다.

### 구현 난이도

중간.

Resource 수는 많지 않지만 CloudFront Distribution 내부 설정이 중첩 구조라, 단순 노드 추가보다 설정 패널과 관계 표현이 중요하다.

### 비고

이 패턴은 SketchCatch 첫 Template 후보로 좋다. 사용자가 S3와 CloudFront의 관계를 눈으로 이해하기 쉽고, Cost Risk와 Security Risk도 명확하다.

---

## Minimal Serverless API Pattern

### 참고 링크

- https://serverlessland.com/patterns/apigw-lambda-dynamodb
- https://github.com/aws-samples/serverless-patterns/tree/main/apigw-lambda-dynamodb
- https://raw.githubusercontent.com/aws-samples/serverless-patterns/main/apigw-lambda-dynamodb/template.yaml

### 원래 패턴 요약

API Gateway가 HTTP 요청을 받고, Lambda Function이 실행된 뒤 DynamoDB Table에 데이터를 쓰는 최소 서버리스 API 패턴이다.

참고 Template은 POST 요청이 API Gateway를 통해 Lambda로 전달되고, Lambda가 DynamoDB에 item을 저장하는 흐름을 보여준다. SAM의 간결한 문법을 사용하지만, SketchCatch에서는 이를 실제 Terraform Resource와 Board 노드 관계로 풀어서 표현해야 한다.

### 실제 AWS 리소스 조합

- API Gateway
- API route 또는 resource
- API method
- API integration
- Lambda Function
- Lambda execution IAM Role
- Lambda Permission
- DynamoDB Table
- CloudWatch Log Group 후보

### Architecture Board 노드 후보

- API Gateway
- API Route
- API Method
- API Integration
- Lambda Function
- Lambda Permission
- IAM Role
- IAM Policy
- DynamoDB Table
- CloudWatch Log Group

### 노드 간 관계 후보

- Client -> API Gateway
- API Gateway -> API Route 또는 API Resource
- API Route 또는 API Method -> API Integration
- API Integration -> Lambda Function
- Lambda Permission -> Lambda Function
- Lambda Function -> DynamoDB Table
- Lambda Function -> IAM Role
- IAM Role -> IAM Policy
- Lambda Function -> CloudWatch Log Group

### SketchCatch 인프라 템플릿으로 만들 때 필요한 리소스

- API Gateway endpoint
- POST route 또는 method
- Lambda integration
- Lambda Function
- Lambda가 DynamoDB에 접근할 수 있는 IAM Role/Policy
- DynamoDB Table
- API Gateway가 Lambda를 호출할 수 있는 Lambda Permission
- 선택형 CloudWatch Log Group

### 배포 가능한 기본 파라미터 후보

- API name: `projectSlug-api-shortId`
- Route: `POST /items`
- Stage: `prod`
- Lambda function name: `projectSlug-handler-shortId`
- Lambda timeout: 작은 API용 기본 timeout
- Lambda memory: 작은 API용 기본 memory
- DynamoDB table name: `projectSlug-items-shortId`
- DynamoDB billing mode: on-demand
- DynamoDB partition key: `id`
- CloudWatch log retention: 짧은 실습용 보관 기간
- Auth: disabled by default, Security Risk로 표시

### workspace resource definition 확인 필요 항목

- `aws_api_gateway_rest_api` 또는 `aws_apigatewayv2_api`
- `aws_api_gateway_resource`
- `aws_api_gateway_method`
- `aws_api_gateway_integration`
- `aws_api_gateway_deployment`
- `aws_api_gateway_stage`
- `aws_lambda_function`
- `aws_lambda_permission`
- `aws_dynamodb_table`
- `aws_iam_role`
- `aws_iam_policy` 또는 role policy attachment
- `aws_cloudwatch_log_group`

### 비용 주의점

API Gateway request 수, Lambda invocation과 실행 시간, Lambda memory 설정, DynamoDB read/write 사용량, CloudWatch Logs 저장량이 Cost Risk 후보가 된다.

작은 API는 시작 비용이 낮지만 요청량이 늘면 API Gateway와 DynamoDB 사용량이 비용 중심이 될 수 있다.

### 보안 주의점

Minimal pattern은 인증이 없는 공개 API로 시작하기 쉽다.

MVP Template에서는 인증 없는 API라는 점을 명확히 표시하고, Lambda IAM Role은 대상 DynamoDB Table에 필요한 권한만 갖도록 제한해야 한다. 공개 POST endpoint, 과도한 IAM policy, 로그에 민감정보가 남는 설정은 Security Risk 후보다.

### MVP 구현 가능성

partial.

API Gateway, Lambda, DynamoDB 흐름은 MVP에 적합하다. 다만 SAM의 implicit API/permission을 Terraform Resource로 명시해야 하므로, API Gateway v1/v2 중 어떤 모델을 우선 지원할지 먼저 정해야 한다.

### 구현 난이도

중간.

Resource 수는 작지만 API Gateway의 route/method/integration/stage 관계가 Board에서 흐릿해지기 쉽다. 사용자가 이해할 수 있는 최소 노드 단위를 정해야 한다.

### 비고

첫 서버리스 Template은 API Gateway -> Lambda -> DynamoDB만 포함하는 것이 좋다. Cognito나 S3 frontend는 Full Serverless Web App Pattern에서 다루는 편이 낫다.

---

## Full Serverless Web App Pattern

### 참고 링크

- https://github.com/aws-samples/lambda-refarch-webapp
- https://github.com/aws-samples/lambda-refarch-webapp/blob/master/template.yaml

### 원래 패턴 요약

정적 frontend hosting, 인증, REST API, 여러 Lambda Function, DynamoDB Table을 조합한 서버리스 웹 앱 패턴이다.

참고 Repository는 Amplify frontend hosting, Cognito User Pool, API Gateway REST API, Lambda Functions, DynamoDB, CloudWatch Logs, IAM Roles를 함께 사용한다. 그대로 복제할 대상이 아니라, SketchCatch Template에서는 Resource 조합과 관계만 추출해야 한다.

### 실제 AWS 리소스 조합

- Amplify App
- Amplify Branch
- API Gateway REST API
- API Gateway Authorizer 후보
- Lambda Functions
- DynamoDB Table
- Cognito User Pool
- Cognito User Pool Client
- Cognito User Pool Domain
- CloudWatch Log Group
- IAM Roles
- IAM Policies
- API Gateway access log 설정
- API Gateway usage plan 또는 throttling 후보

### Architecture Board 노드 후보

- Amplify App
- Amplify Branch
- API Gateway REST API
- API Route 또는 Resource
- API Method
- API Gateway Authorizer
- Lambda Function
- DynamoDB Table
- Cognito User Pool
- Cognito User Pool Client
- Cognito Domain
- CloudWatch Log Group
- IAM Role
- IAM Policy

### 노드 간 관계 후보

- User -> Amplify App
- Amplify App -> API Gateway REST API
- User -> Cognito User Pool
- Cognito User Pool Client -> Cognito User Pool
- Cognito Domain -> Cognito User Pool
- API Gateway REST API -> API Gateway Authorizer
- API Gateway Authorizer -> Cognito User Pool
- API Gateway Method -> Lambda Function
- Lambda Function -> DynamoDB Table
- Lambda Function -> IAM Role
- IAM Role -> IAM Policy
- API Gateway REST API -> CloudWatch Log Group
- Lambda Function -> CloudWatch Log Group

### SketchCatch 인프라 템플릿으로 만들 때 필요한 리소스

- Frontend hosting Resource
- Cognito User Pool, Client, Domain
- API Gateway REST API
- Cognito Authorizer 연결
- Lambda Function 여러 개
- Lambda별 DynamoDB 권한
- DynamoDB Table
- CloudWatch Log Group
- API Gateway access logging
- IAM Role/Policy

### 배포 가능한 기본 파라미터 후보

- App name: `projectSlug-serverless-web-shortId`
- Frontend branch: `main`
- API stage: `prod`
- Cognito User Pool name: `projectSlug-users-shortId`
- Cognito User Pool Client name: `projectSlug-web-client`
- Cognito Domain prefix: `projectSlug-shortId`
- Lambda names: route 역할이 드러나는 이름으로 자동 생성
- DynamoDB table name: `projectSlug-app-shortId`
- DynamoDB billing mode: on-demand
- CloudWatch log retention: 짧은 실습용 보관 기간
- API throttling: 작은 실습용 요청량 기준

### workspace resource definition 확인 필요 항목

- `aws_amplify_app`
- `aws_amplify_branch`
- `aws_api_gateway_rest_api`
- `aws_api_gateway_authorizer`
- `aws_api_gateway_resource`
- `aws_api_gateway_method`
- `aws_api_gateway_integration`
- `aws_lambda_function`
- `aws_dynamodb_table`
- `aws_cognito_user_pool`
- `aws_cognito_user_pool_client`
- `aws_cognito_user_pool_domain`
- `aws_cloudwatch_log_group`
- `aws_iam_role`
- `aws_iam_policy`
- API Gateway usage plan, throttling, access log 설정을 지원하는지

### 비용 주의점

Amplify hosting, API Gateway request, Lambda invocation/duration, DynamoDB 사용량, Cognito 월간 활성 사용자, CloudWatch Logs 저장량이 Cost Risk 후보가 된다.

Full pattern은 Resource 수가 많아 작은 실습용으로는 비용 예측이 어려울 수 있다. MVP에서는 부분 Template으로 제공하거나 경고를 강하게 표시하는 편이 안전하다.

### 보안 주의점

Cognito Authorizer 연결이 빠지면 인증이 필요한 API가 공개될 수 있다.

IAM Role은 Lambda별 최소 권한으로 나누는 것이 좋다. CORS, API throttling, access log, CloudWatch log retention, Cognito client 설정도 Security Risk 또는 운영 위험 후보로 표시할 수 있다.

### MVP 구현 가능성

partial.

Minimal Serverless API를 먼저 구현한 뒤 Cognito와 frontend hosting을 추가하는 확장 Template로 보는 것이 적합하다. Full Web App을 처음부터 supported로 두기에는 Resource 수와 관계가 많다.

### 구현 난이도

높음.

API, Auth, Frontend hosting, IAM, Logging이 모두 얽혀 있다. Template 자체보다 Board에서 사용자가 이해할 수 있는 묶음과 관계 표현이 어렵다.

### 비고

참고 Repository는 2024-06-26 기준 archived 상태였다. 구현 시 최신 권장 방식과 Terraform provider 지원 상태를 다시 확인해야 한다.

---

## 3-Tier Web App Pattern

### 참고 링크

- https://github.com/aws-samples/quickstart-aws-vpc-3tier
- https://github.com/aws-samples/quickstart-aws-vpc-3tier/blob/main/aws-vpc-3tier.yml

### 원래 패턴 요약

하나의 VPC 안에 public tier, application tier, database tier를 두고, 각 tier를 2개 Availability Zone에 나누는 VPC foundation 패턴이다.

참고 Template은 Web/App/DB workload 자체보다, 3-tier 구조를 담을 네트워크 기반을 만든다. Public Subnet은 Internet Gateway로 나가고, App/DB Subnet은 NAT Gateway를 통해 outbound internet access를 갖는 구조다.

### 실제 AWS 리소스 조합

- VPC
- Public Subnet A/B
- App Subnet A/B
- DB Subnet A/B
- Internet Gateway
- NAT Gateway
- Elastic IP
- Public Route Table
- App Route Table
- DB Route Table
- Route Table Associations
- Public route to Internet Gateway
- Private route to NAT Gateway

### Architecture Board 노드 후보

- VPC
- Availability Zone A
- Availability Zone B
- Public Subnet
- App Subnet
- DB Subnet
- Internet Gateway
- NAT Gateway
- Elastic IP
- Route Table
- Route
- Route Table Association

### 노드 간 관계 후보

- VPC -> Public Subnet A
- VPC -> Public Subnet B
- VPC -> App Subnet A
- VPC -> App Subnet B
- VPC -> DB Subnet A
- VPC -> DB Subnet B
- Internet Gateway -> VPC
- Elastic IP -> NAT Gateway
- NAT Gateway -> Public Subnet A
- Public Route Table -> Internet Gateway
- App Route Table -> NAT Gateway
- DB Route Table -> NAT Gateway
- Route Table Association -> Subnet

### SketchCatch 인프라 템플릿으로 만들 때 필요한 리소스

- VPC CIDR 입력
- 2 AZ 선택
- 6개 Subnet CIDR 입력 또는 자동 분할
- Internet Gateway
- NAT Gateway
- Elastic IP
- tier별 Route Table
- Route Table Association
- public/app/db tier metadata

### 배포 가능한 기본 파라미터 후보

- VPC CIDR: `10.0.0.0/16`
- Public Subnet A/B CIDR: `10.0.0.0/24`, `10.0.1.0/24`
- App Subnet A/B CIDR: `10.0.10.0/24`, `10.0.11.0/24`
- DB Subnet A/B CIDR: `10.0.20.0/24`, `10.0.21.0/24`
- Availability Zone: 현재 region의 앞 2개 AZ 자동 선택
- NAT Gateway count: MVP 기본값은 1개
- Route Table names: `public`, `app`, `db` tier가 드러나게 자동 생성
- Tags: `Project`, `Template`, `Tier` 기본 포함

### workspace resource definition 확인 필요 항목

- `aws_vpc`
- `aws_subnet`
- `aws_internet_gateway`
- `aws_eip`
- `aws_nat_gateway`
- `aws_route_table`
- `aws_route`
- `aws_route_table_association`
- Subnet을 public/app/db tier로 표시하는 Board metadata
- Availability Zone grouping 표현
- CIDR 자동 생성 또는 입력 방식

### 비용 주의점

NAT Gateway hourly charge와 data processing이 가장 중요한 Cost Risk 후보가 된다.

Subnet, Route Table, Route Table Association 자체는 보통 비용 중심 Resource가 아니지만, NAT Gateway와 Elastic IP, 그리고 이 네트워크 위에 올라갈 ALB/RDS/EC2/ECS가 비용을 만든다.

### 보안 주의점

Public route는 Public Subnet에만 연결되어야 한다.

App/DB Subnet이 Internet Gateway로 직접 route되면 private tier 의도가 깨진다. DB Subnet의 public exposure, NAT Gateway 단일 AZ 구성으로 인한 availability trade-off, Security Group 미연결 상태도 Check Finding 후보로 둘 수 있다.

### MVP 구현 가능성

partial.

VPC foundation 자체는 MVP Template로 만들기 좋다. 하지만 사용자가 기대하는 "3-Tier Web App"에는 ALB, app compute, database까지 포함될 수 있으므로, 이 문서의 패턴은 우선 "3-Tier VPC Foundation"으로 명확히 표시하는 것이 안전하다.

### 구현 난이도

중간.

Resource 수는 많지만 대부분 관계가 명확하다. 어려운 부분은 6개 subnet의 CIDR/Availability Zone/tier를 자동으로 깔끔하게 배치하는 것이다.

### 비고

이 패턴은 다른 Template의 기반으로 재사용될 가능성이 높다. ECS, EKS, 3-tier web app Template이 모두 이 네트워크 foundation 위에 올라갈 수 있다.

---

## ECS Fargate Container App Pattern

### 참고 링크

- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/working-with-templates.html
- https://github.com/aws-samples/developing-on-amazon-ecs-with-cloudformation
- https://github.com/nathanpeck/aws-cloudformation-fargate

### 원래 패턴 요약

Container image를 ECS Task Definition으로 정의하고, Fargate launch type의 ECS Service로 실행하는 container app 패턴이다.

참고 자료들은 ECS Cluster, Task Definition, ECS Service, Fargate, ALB, Target Group, Listener, CloudWatch Logs, Task Execution Role, VPC/Subnet/Security Group 연결을 함께 보여준다. Public Load Balancer가 외부 요청을 받고, Target Group이 Fargate Task로 traffic을 전달하는 구조가 기본이다.

### 실제 AWS 리소스 조합

- ECS Cluster
- ECS Task Definition
- Container Definition
- ECS Service
- Fargate launch type
- Application Load Balancer
- Target Group
- Listener
- Listener Rule 후보
- CloudWatch Log Group
- Task Execution Role
- Task Role 후보
- VPC
- Subnet
- Security Group

### Architecture Board 노드 후보

- ECS Cluster
- ECS Task Definition
- Container
- ECS Service
- Fargate
- Application Load Balancer
- Target Group
- Listener
- CloudWatch Log Group
- Task Execution Role
- Task Role
- VPC
- Public Subnet
- Private Subnet
- Security Group

### 노드 간 관계 후보

- User -> Application Load Balancer
- Application Load Balancer -> Listener
- Listener -> Target Group
- Target Group -> ECS Service
- ECS Service -> ECS Task Definition
- ECS Task Definition -> Container
- ECS Service -> ECS Cluster
- ECS Service -> Subnet
- ECS Service -> Security Group
- ECS Task Definition -> Task Execution Role
- Container -> CloudWatch Log Group
- Task Execution Role -> IAM Policy

### SketchCatch 인프라 템플릿으로 만들 때 필요한 리소스

- ECS Cluster
- Task Definition with Fargate compatibility
- Container image, port, CPU, memory 설정
- ECS Service desired count
- awsvpc network configuration
- ALB, Target Group, Listener
- Security Group for ALB
- Security Group for Service
- Subnet 선택
- CloudWatch Log Group
- Task Execution Role

### 배포 가능한 기본 파라미터 후보

- Cluster name: `projectSlug-ecs-shortId`
- Service name: `projectSlug-service`
- Desired count: `1`
- Launch type: `FARGATE`
- Network mode: `awsvpc`
- Container image: 사용자가 바꾸기 전까지 배포 가능한 public sample image
- Container port: `80`
- Task CPU/memory: 작은 실습용 Fargate size
- ALB listener port: `80`
- Target Group health check path: `/`
- CloudWatch log retention: 짧은 실습용 보관 기간
- Service subnet: private subnet 우선, 없으면 Template에서 생성한 subnet 사용

### workspace resource definition 확인 필요 항목

- `aws_ecs_cluster`
- `aws_ecs_task_definition`
- `aws_ecs_service`
- Container Definition을 Resource로 표현할지, Task Definition 설정으로 표현할지
- `aws_lb`
- `aws_lb_target_group`
- `aws_lb_listener`
- `aws_lb_listener_rule`
- `aws_cloudwatch_log_group`
- `aws_iam_role`
- `aws_security_group`
- `aws_subnet`
- `aws_vpc`
- Fargate `awsvpc` network mode, launch type, task execution role 설정 지원 여부

### 비용 주의점

Fargate CPU/memory 할당, ECS Service desired count, ALB hourly charge, ALB processed bytes, NAT Gateway, CloudWatch Logs 저장량, container image 저장소 사용량이 Cost Risk 후보가 된다.

Private Subnet에서 외부 image pull이나 outbound access가 필요하면 NAT Gateway 비용도 같이 커질 수 있다.

### 보안 주의점

ALB Security Group은 외부 접근을 받지만, ECS Service Security Group은 ALB에서 오는 traffic만 받도록 제한하는 것이 좋다.

Task Execution Role과 Task Role을 구분해야 한다. Container image, environment variable, log 출력에 민감정보가 섞이지 않도록 경고할 수 있다.

### MVP 구현 가능성

partial.

ECS Fargate app은 실사용 가치가 높지만, Task Definition의 nested container definition과 ALB/Target Group/Service 관계를 정확히 표현해야 한다. MVP에서는 "single container + public ALB + Fargate service"로 범위를 줄이면 가능하다.

### 구현 난이도

높음.

Network, IAM, Load Balancing, Container 설정이 함께 필요하다. Template 구현 전에 Resource definition과 Terraform generator가 ECS nested configuration을 어디까지 지원하는지 확인해야 한다.

### 비고

3-Tier VPC Foundation과 조합하기 좋다. Public Subnet에는 ALB를 두고, Private Subnet에는 ECS Service를 두는 구성이 기본 후보다.

---

## EKS Container App Pattern

### 참고 링크

- https://github.com/aws-samples/amazon-eks-refarch-cloudformation
- https://github.com/aws-samples/eks-workshop-v2
- https://www.eksworkshop.com/docs/introduction/getting-started/about

### 원래 패턴 요약

AWS EKS Cluster 위에 Kubernetes workload를 배포하는 container app 패턴이다.

참고 자료는 EKS Cluster, Managed Node Group 또는 NodeGroup, Kubernetes application workload, Service, Ingress/LoadBalancer, Namespace, Container Image, VPC/Subnet/Security Group 연결을 함께 봐야 한다는 점을 보여준다.

### 실제 AWS 리소스 조합

- EKS Cluster
- EKS Managed Node Group 또는 NodeGroup
- Node IAM Role
- Cluster IAM Role
- VPC
- Subnet
- Security Group
- Kubernetes Namespace
- Kubernetes Deployment
- Pod
- Container
- Kubernetes Service
- Ingress 또는 LoadBalancer Service
- Logging/Monitoring 후보

### Architecture Board 노드 후보

- EKS Cluster
- Managed Node Group
- Worker Node
- Kubernetes Namespace
- Kubernetes Deployment
- Pod
- Container
- Kubernetes Service
- Ingress
- LoadBalancer
- Container Image
- VPC
- Subnet
- Security Group
- IAM Role
- CloudWatch Logs 또는 Observability 후보

### 노드 간 관계 후보

- EKS Cluster -> Managed Node Group
- Managed Node Group -> Worker Node
- EKS Cluster -> Kubernetes Namespace
- Namespace -> Deployment
- Deployment -> Pod
- Pod -> Container
- Service -> Pod
- Ingress 또는 LoadBalancer -> Service
- EKS Cluster -> VPC
- EKS Cluster -> Subnet
- Managed Node Group -> Subnet
- EKS Cluster -> Security Group
- Cluster IAM Role -> EKS Cluster
- Node IAM Role -> Managed Node Group

### SketchCatch 인프라 템플릿으로 만들 때 필요한 리소스

- EKS Cluster
- Cluster IAM Role
- Managed Node Group
- Node IAM Role
- VPC/Subnet/Security Group 연결
- Kubernetes Namespace
- Deployment
- Service
- Ingress 또는 LoadBalancer Service
- Container image 설정
- Logging/Monitoring 후보

### 배포 가능한 기본 파라미터 후보

- Cluster name: `projectSlug-eks-shortId`
- Kubernetes version: 최신 지원 version을 구현 시점에 확인해 기본값으로 지정
- Node group name: `projectSlug-ng`
- Node desired size: `1`
- Node min/max size: 작은 실습용 범위
- Node instance type: 작은 범용 instance 후보
- Namespace: `default` 또는 `projectSlug`
- Deployment replicas: `1`
- Container image: 사용자가 바꾸기 전까지 배포 가능한 public sample image
- Service type: MVP에서는 `ClusterIP`, 외부 공개 Template에서는 `LoadBalancer`
- Logging/Monitoring: MVP에서는 optional

### workspace resource definition 확인 필요 항목

- `aws_eks_cluster`
- `aws_eks_node_group`
- `aws_iam_role`
- `aws_iam_policy`
- `aws_vpc`
- `aws_subnet`
- `aws_security_group`
- Kubernetes provider Resource를 SketchCatch Resource로 다룰지 여부
- `kubernetes_namespace`
- `kubernetes_deployment`
- `kubernetes_service`
- `kubernetes_ingress_v1`
- Container, Pod를 독립 노드로 보여줄지 Deployment 내부 설정으로 보여줄지
- EKS add-on, logging, monitoring 지원 범위

### 비용 주의점

EKS control plane hourly charge, worker node 또는 Fargate compute, Load Balancer, NAT Gateway, EBS volume, CloudWatch Logs와 monitoring이 Cost Risk 후보가 된다.

학습용 Template에서도 EKS control plane은 켜져 있는 동안 비용이 발생하므로 Auto Cleanup과 강하게 연결하는 것이 좋다.

### 보안 주의점

EKS는 AWS IAM과 Kubernetes RBAC가 함께 작동한다.

Cluster IAM Role, Node IAM Role, aws-auth 또는 access entry, Namespace 격리, Service exposure type, Ingress 공개 범위, Pod security 설정이 Security Risk 후보가 된다.

### MVP 구현 가능성

unsupported.

EKS Cluster 자체는 AWS Resource지만, 실제 app Template은 Kubernetes Resource model까지 필요하다. 현재 Template MVP에서는 EKS infra만 partial로 검토하고, full EKS Container App은 별도 단계로 두는 것이 안전하다.

### 구현 난이도

매우 높음.

AWS Resource와 Kubernetes Resource가 동시에 필요하고, Board에서 둘을 같은 Practice Architecture로 표현하는 모델이 필요하다.

### 비고

참고 EKS refarch Repository는 archived 상태였다. 구현 시 최신 EKS 권장 방식, managed node group, add-on, access management 방식을 다시 확인해야 한다.

---

## 패턴별 지원 가능성 요약

| 패턴 | 예상 상태 | 이유 |
| --- | --- | --- |
| Static Web Hosting | partial | S3 + CloudFront 중심 Template은 가능성이 높지만, OAC, Response Headers Policy, ACM, Route 53, HTTPS redirect 지원 여부 확인이 필요하다. |
| Minimal Serverless API | partial | API Gateway -> Lambda -> DynamoDB 흐름은 MVP 후보지만, API route/method/integration/stage와 Lambda permission 표현을 확인해야 한다. |
| Full Serverless Web App | partial | Minimal Serverless API에 Cognito, Amplify, logging, IAM 세부 구성이 추가되어 Resource와 관계가 많다. |
| 3-Tier Web App | partial | VPC foundation은 가능성이 높지만, 이 문서의 참고 Template은 compute/database workload보다 3-tier network 기반에 가깝다. |
| ECS Fargate Container App | partial | 실사용 가치가 높지만 ECS Task Definition nested config, ALB, Target Group, Service, IAM, Network 연결 지원 확인이 필요하다. |
| EKS Container App | unsupported | EKS app Template은 AWS Resource와 Kubernetes Resource model을 함께 요구하므로 MVP에서는 별도 단계로 두는 것이 안전하다. |

## 다음 구현 단계에서 확인할 것

- 현재 workspace resource definition 목록
- ArchitectureJson 구조
- Board가 요구하는 node/edge 형식
- Terraform generator가 지원하는 리소스
- Safety/Cost 분석이 연결되는 방식
- Template Resource의 기본 파라미터가 Terraform plan/apply 가능한 값으로 채워지는 방식
- 사용자 입력이 필요한 값과 자동 생성 가능한 값의 구분
