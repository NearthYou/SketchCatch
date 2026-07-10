# ECS/Fargate 운영 기반

이 Terraform 루트는 SketchCatch 운영 배포를 EC2/SSM/docker run에서 ECS/Fargate로 전환하기 위한 Phase 1 기반입니다. 현재 EC2/SSM 운영 경로를 제거하지 않고, 별도의 parallel ECS ALB를 만들어 smoke test 후 Route53 alias를 전환할 수 있게 합니다.

## 포함 리소스

- ECR repositories: `api`, `web`, `nginx`
- ECS cluster
- ECS task definition: `nginx`, `web`, `api` 3개 컨테이너를 하나의 Fargate task에 배치
- ECS service: ALB target group은 Fargate `awsvpc`와 맞는 `ip` target mode
- Task execution role, task role, scoped inline policies
- CloudWatch log groups
- Parallel public ALB, listener, target group
- ECS ALB/security group, ECS service/security group
- 선택적 Route53 alias. 기본값은 `false`라 EC2 production alias를 건드리지 않습니다.

## 비용이 발생하는 리소스

- ALB와 LCU
- Fargate task CPU/memory. 기본 `ecs_desired_count = 1`, `ecs_task_cpu = 1024`, `ecs_task_memory = 2048`
- CloudWatch Logs 저장량. 기본 retention은 14일입니다.
- ECR image storage. lifecycle policy는 최근 tagged image 20개만 유지합니다.

Phase 1 기본값은 NAT Gateway를 만들지 않습니다. Fargate task는 public subnet에서 `assign_public_ip = true`로 AWS API/ECR/CloudWatch/S3에 접근합니다. private runtime은 별도 phase에서 VPC endpoint 또는 NAT 비용을 명시한 뒤 전환합니다.

## 운영 적용 전 필수 입력

실제 apply는 이 작업 범위 밖입니다. 이후 운영자가 plan/apply를 준비할 때 최소한 아래 값을 제공해야 합니다.

```hcl
vpc_id                    = "vpc-..."
public_subnet_ids          = ["subnet-...", "subnet-..."]
artifact_bucket_name       = "sketchcatch-..."
sketchcatch_public_base_url = "https://sketchcatch.net"
oauth_redirect_base_url    = "https://sketchcatch.net"
certificate_arn            = "arn:aws:acm:ap-northeast-2:...:certificate/..."
```

Phase 3 전까지 secret migration은 완료되지 않았으므로 `api_secret_arns`는 placeholder/reference로만 사용합니다. ECS에서 실제 API를 기동하려면 최소한 아래 secret env가 Secrets Manager 또는 SSM SecureString ARN으로 연결되어야 합니다.

```hcl
api_secret_arns = {
  DATABASE_URL                         = "arn:aws:secretsmanager:..."
  AUTH_TOKEN_SECRET                    = "arn:aws:secretsmanager:..."
  CLOUDFORMATION_TEMPLATE_TOKEN_SECRET = "arn:aws:secretsmanager:..."
  REDIS_URL                            = "arn:aws:ssm:..."
  OPENAI_API_KEY                       = "arn:aws:secretsmanager:..."
}
```

OAuth/GitHub App을 production에서 켜려면 다음 값도 secret ARN으로 제공해야 합니다.

```hcl
api_secret_arns = {
  NAVER_OAUTH_CLIENT_SECRET = "arn:aws:secretsmanager:..."
  KAKAO_OAUTH_CLIENT_SECRET = "arn:aws:secretsmanager:..."
  GIT_OAUTH_CLIENT_SECRET   = "arn:aws:secretsmanager:..."
  GIT_APP_PRIVATE_KEY_BASE64 = "arn:aws:secretsmanager:..."
  GIT_APP_STATE_SECRET      = "arn:aws:secretsmanager:..."
}
```

## 정적 검증

AWS 리소스를 만들지 않는 검증만 실행합니다.

```powershell
terraform -chdir=infra/aws/terraform fmt -check -recursive
terraform -chdir=infra/aws/terraform init -backend=false
terraform -chdir=infra/aws/terraform validate
```

`terraform plan`은 provider credential과 원격 상태를 읽을 수 있으므로 Phase 1 로컬 검증에서는 실행하지 않습니다.

## Phase 3 ECS 런타임 설정 모델

ECS 경로에서는 EC2 배포처럼 `api.env` 또는 `web.env` 파일을 생성하거나 S3 presigned URL로 다운로드하지 않습니다. ECS task definition이 런타임 설정의 source of truth이며, 비민감 값은 `environment`, 민감 값은 `secrets`로 분리합니다.

API container의 민감 값은 `api_secret_arns`로만 전달합니다. 값은 secret 원문이 아니라 Secrets Manager 또는 SSM Parameter Store `SecureString` ARN이어야 합니다.

```hcl
api_secret_arns = {
  DATABASE_URL                         = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/database-url-..."
  GIT_APP_PRIVATE_KEY_BASE64           = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/git-app-private-key-base64-..."
  OPENAI_API_KEY                       = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/openai-api-key-..."
  NAVER_OAUTH_CLIENT_SECRET            = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/naver-oauth-client-secret-..."
  KAKAO_OAUTH_CLIENT_SECRET            = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/kakao-oauth-client-secret-..."
  GIT_OAUTH_CLIENT_SECRET              = "arn:aws:secretsmanager:ap-northeast-2:<account-id>:secret:sketchcatch/production/git-oauth-client-secret-..."
  AUTH_TOKEN_SECRET                    = "arn:aws:ssm:ap-northeast-2:<account-id>:parameter/sketchcatch/production/auth-token-secret"
  CLOUDFORMATION_TEMPLATE_TOKEN_SECRET = "arn:aws:ssm:ap-northeast-2:<account-id>:parameter/sketchcatch/production/cloudformation-template-token-secret"
  GIT_APP_STATE_SECRET                 = "arn:aws:ssm:ap-northeast-2:<account-id>:parameter/sketchcatch/production/git-app-state-secret"
  REDIS_URL                            = "arn:aws:ssm:ap-northeast-2:<account-id>:parameter/sketchcatch/production/redis-url"
}
```

Terraform validation은 위 secret 이름을 `api_environment`에 넣는 것을 막고, `api_secret_arns` 값이 Secrets Manager 또는 SSM ARN 형식인지 확인합니다. OAuth client ID, GitHub App ID, public URL, bucket name, region, AI feature flag처럼 원문 secret이 아닌 값은 계속 일반 ECS environment 변수로 둡니다.

`secret_kms_key_arns`는 customer managed KMS key로 암호화한 secret만 사용할 때 설정합니다. AWS managed key를 쓰는 Secrets Manager/SSM 기본 구성에서는 비워 둡니다.
