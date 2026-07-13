---
pattern_id: serverless-api
provider: aws
workload: api
runtime: lambda
availability: regional-managed
terraform_ready: true
reviewed_at: 2026-07-10
---

# API Gateway + Lambda Serverless API 패턴

API Gateway가 HTTP 요청을 받고 Lambda가 비즈니스 로직을 실행하는 관리형 API 패턴이다. 데이터 저장소는 요구사항이 있을 때만 DynamoDB, S3 또는 RDS를 추가한다.

## 적용 조건

- 사용자가 서버리스, 완전 관리형, 낮은 운영 부담 또는 요청 기반 과금을 선호한다.
- stateless HTTP API, webhook, 간단한 backend 또는 비동기 작업 진입점이 필요하다.
- 트래픽 변동이 크고 항상 실행 중인 서버가 필요하지 않다.
- Lambda 실행 시간, payload, 동시성 제한 안에서 처리할 수 있다.

장시간 연결, 특수 OS/daemon, 고정 host, 지속적인 고CPU 작업 또는 EC2 직접 관리를 요구하면 다른 패턴을 선택한다.

## 필수 리소스

| SketchCatch ResourceType | Terraform resource | 역할 |
| --- | --- | --- |
| `API_GATEWAY_REST_API` | `aws_api_gateway_rest_api` | API 진입점 |
| `API_GATEWAY_RESOURCE` | `aws_api_gateway_resource` | URL path |
| `API_GATEWAY_METHOD` | `aws_api_gateway_method` | HTTP method와 authorization |
| `API_GATEWAY_INTEGRATION` | `aws_api_gateway_integration` | API Gateway에서 Lambda invocation 연결 |
| `API_GATEWAY_DEPLOYMENT` | `aws_api_gateway_deployment` | API snapshot 배포 |
| `API_GATEWAY_STAGE` | `aws_api_gateway_stage` | stage, logging, throttling |
| `LAMBDA` | `aws_lambda_function` | application runtime |
| `LAMBDA_PERMISSION` | `aws_lambda_permission` | API Gateway의 Lambda invoke 허용 |
| `IAM_ROLE` | `aws_iam_role` | Lambda execution role |
| `CLOUDWATCH_LOG_GROUP` | `aws_cloudwatch_log_group` | API/Lambda 로그와 retention |

선택 리소스는 `DYNAMODB_TABLE`, `SQS_QUEUE`, `SNS_TOPIC`, `EVENTBRIDGE_RULE`, `S3`, `SECRETS_MANAGER_SECRET`, `KMS_KEY`, `WAF_WEB_ACL`, `COGNITO_USER_POOL`이다. 요구가 없으면 자동 추가하지 않는다.

## 금지 조건

- serverless 요구에 EC2, ASG, ECS runtime을 함께 생성한다.
- API Gateway와 Lambda가 보이지만 integration 또는 Lambda permission이 없다.
- database 필요 없음인데 RDS/DynamoDB를 임의로 추가한다.
- file upload 없음인데 upload bucket과 S3 event trigger를 추가한다.
- Lambda 환경 변수나 Terraform variable default에 secret을 평문 저장한다.
- public API인데 authentication, throttling, logging 요구를 검토하지 않는다.
- Lambda를 VPC에 넣을 이유가 없는데 private subnet/NAT를 자동 추가한다.

## 리소스 연결 순서

```text
Client
  -> API Gateway REST API
  -> Resource + Method
  -> Lambda proxy Integration
  -> Lambda Permission
  -> Lambda
  -> optional data/messaging service
```

`aws_api_gateway_deployment`는 method와 integration 생성 후 배포되어야 하며, stage가 deployment를 참조한다. API Gateway execution ARN 범위와 Lambda permission의 `source_arn`이 일치해야 한다.

## 권장 수량

| 항목 | 기본값 |
| --- | --- |
| REST API | 서비스 경계당 1개 |
| Stage | 환경당 1개 (`dev`, `stage`, `prod`) |
| Lambda | 독립 배포/권한/확장 경계당 1개 |
| Lambda reserved concurrency | downstream 보호가 필요할 때 명시 |
| Log group | Lambda 함수 및 API stage별 관리 |
| DynamoDB/SQS | 요구 capability당 필요한 최소 수량 |

## 프라이빗/퍼블릭 서브넷 배치

API Gateway와 기본 Lambda는 VPC subnet에 배치하지 않는 regional managed service다. Lambda가 private RDS, ElastiCache 또는 내부 endpoint에 접근해야 할 때만 최소 두 private subnet과 Lambda security group을 연결한다. 이 경우 NAT Gateway 또는 필요한 VPC Endpoint, DNS, egress를 함께 검증한다.

## Terraform 필수 파라미터

| 리소스 | 필수 파라미터/검증 |
| --- | --- |
| `aws_api_gateway_rest_api` | API name, endpoint type(REGIONAL 권장), binary media 필요 여부 |
| method | `http_method`, `authorization`, request parameters/validator |
| integration | `type = "AWS_PROXY"`, `integration_http_method = "POST"`, Lambda `invoke_arn` |
| deployment/stage | integration 이후 redeployment trigger, stage name, access log, metrics, throttling |
| `aws_lambda_function` | immutable artifact/image, `handler`, `runtime`, memory, timeout, role ARN, tracing, architecture |
| permission | `principal = "apigateway.amazonaws.com"`, 제한된 `source_arn` |
| IAM role/policy | CloudWatch Logs와 실제 downstream 작업만 최소 권한으로 허용 |
| log group | 명시적 retention과 필요 시 KMS encryption |

## 배포 전 검증 조건

- Terraform 정적 검사와 plan이 성공한다.
- 모든 method에 integration이 있고 deployment가 integration 변경 시 갱신된다.
- API stage invoke URL에 대한 정상, 인증 실패, validation 실패, Lambda 오류 테스트가 통과한다.
- Lambda permission의 `source_arn`이 필요한 API/stage/method 범위보다 넓지 않다.
- timeout은 API Gateway 제한과 downstream timeout보다 작고 재시도 특성을 고려한다.
- concurrency와 throttling이 downstream database/API를 압도하지 않는다.
- secret은 Secrets Manager 또는 SSM Parameter에서 런타임에 참조한다.
- DLQ 또는 비동기 실패 처리가 필요한 이벤트 흐름에만 SQS/SNS를 추가한다.
- file upload, database, realtime 같은 금지/선택 capability가 사용자 요구와 정확히 일치한다.

## 잘못된 구조 예시

```text
API Gateway     Lambda
(no integration, no permission)

EC2 + ASG also added although runtime=serverless
```

리소스가 화면에 존재하는 것만으로 API가 동작하지 않는다. `Method -> Integration -> Lambda Permission -> Lambda` 연결과 deployment/stage가 모두 필요하다.

## 근거

- [AWS: API Gateway serverless API 시작하기](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started.html)
- [AWS: API Gateway serverless front door](https://docs.aws.amazon.com/serverless/latest/devguide/starter-apigw.html)
- [AWS Samples: Building Serverless Applications with Terraform](https://github.com/aws-samples/building-serverless-applications-with-terraform)
