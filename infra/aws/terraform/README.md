# ECS/Fargate 운영 기반

이 Terraform root는 SketchCatch production의 parallel ECS ALB 경로를 관리합니다. Phase 8 steady state는 nginx 없이 ALB path routing으로 API와 web Fargate service에 직접 전달합니다. 기존 EC2/SSM/docker run 경로와 nginx 자산은 rollback 보존 기간 동안 유지합니다.

이 root는 Phase 9 management group 중 `runtime`이며 기존 backend key `production/ecs-foundation/terraform.tfstate`를 유지합니다. Route53/ACM, S3/RDS/Redis, EC2 rollback의 분리 state와 import 정책은 `infra/aws/production/README.md`를 따릅니다. 이 production state는 사용자 Deployment state와 공유하지 않습니다.

ecs_cutover_stage = warmup이 안전 기본값입니다. 이 단계는 기존 nginx target weight를 100, 새 API/web target weight를 0으로 유지합니다. 두 target이 healthy이고 direct ALB smoke가 통과한 뒤에만 split으로 바꿉니다.

## 최종 ECS layout

~~~text
Route53 production alias -> EC2 ALB                 # cutover 전/rollback

Parallel ECS ALB
-> warmup: legacy nginx 100, API/web 0
-> split
   -> /api, /api/*, /health, /health/db -> API 100
   -> default /*                         -> web 100
   -> legacy nginx                       -> weight 0 rollback
~~~

포함 리소스:

- ECR repositories: ECS steady state용 `api`, `web`; EC2 rollback 보존용 `nginx`
- ECS cluster
- API와 web의 독립된 Fargate task definition 및 ECS service
- smoke 완료 전 보호되는 legacy nginx task definition, service, target group
- one-off worker task definition, 전용 execution/task role, inbound 없는 worker security group
- web 전용 permissionless task role과 RDS allowlist에 포함되지 않는 web security group
- API/web `ip` target group과 ALB listener rule
- Task execution role, task role, scoped inline policies
- API/web CloudWatch log group과 legacy nginx/worker log group
- Parallel public ALB와 security group
- 공유 ECS service security group. 기존 RDS allowlist 연속성을 위해 API/web가 함께 사용합니다.
- 선택적 Route53 alias. `create_route53_alias = false`가 기본값입니다.

ALB가 `X-Forwarded-For`와 `X-Forwarded-Proto`를 전달하며 API의 Fastify `trustProxy`가 이를 해석합니다. Web client는 same-origin `/api`를 사용합니다.

## 비용이 발생하는 리소스

- ALB와 LCU
- API Fargate task: 기본 `ecs_task_cpu = 1024`, `ecs_task_memory = 2048`
- web Fargate task: 기본 `web_task_cpu = 256`, `web_task_memory = 512`
- `ecs_desired_count = 1`은 API와 web 각각에 적용되므로 최소 2개의 steady-state task가 실행됩니다.
- CloudWatch Logs 저장량. 기본 retention은 14일입니다.
- ECR image storage. lifecycle policy는 최근 tagged image 20개만 유지합니다.
- `enable_ecs_observability_alarms = true`일 때 custom metrics와 alarms

기본값은 NAT Gateway를 만들지 않습니다. Fargate task는 public subnet에서 `assign_public_ip = true`로 AWS API/ECR/CloudWatch/S3에 접근합니다. private runtime 전환은 VPC endpoint 또는 NAT 비용과 egress allowlist를 별도 검토해야 합니다.

## nginx와 rollback

ECS task definition, service, target group, deploy workflow에서는 nginx를 사용하지 않습니다. 다음 자산은 EC2/SSM rollback 보존을 위해 의도적으로 남깁니다.

- `docker/nginx.Dockerfile`, `docker/nginx.conf`
- nginx ECR repository
- nginx CloudWatch log group
- `.github/workflows/deploy.yml`과 `deploy/ec2` 경로

rollback 보존 종료가 승인되기 전에는 이 자산을 제거하지 않습니다. nginx ECR/log group 정리와 EC2 cleanup은 별도 issue 및 Terraform plan/apply 승인으로 진행합니다.

## 운영 적용 전 필수 입력

실제 plan/apply는 이 phase 범위 밖입니다. 운영자가 적용할 때 최소한 아래 값을 제공해야 합니다.

```hcl
vpc_id                     = "vpc-..."
public_subnet_ids           = ["subnet-...", "subnet-..."]
artifact_bucket_name        = "sketchcatch-..."
sketchcatch_public_base_url = "https://sketchcatch.net"
oauth_redirect_base_url     = "https://sketchcatch.net"
certificate_arn             = "arn:aws:acm:ap-northeast-2:...:certificate/..."
```

API container의 민감 값은 secret 원문이 아니라 Secrets Manager 또는 SSM Parameter Store `SecureString` ARN으로 전달합니다.

```hcl
api_secret_arns = {
  DATABASE_URL                         = "arn:aws:secretsmanager:..."
  AUTH_TOKEN_SECRET                    = "arn:aws:ssm:..."
  CLOUDFORMATION_TEMPLATE_TOKEN_SECRET = "arn:aws:ssm:..."
  REDIS_URL                            = "arn:aws:ssm:..."
  OPENAI_API_KEY                       = "arn:aws:secretsmanager:..."
  NAVER_OAUTH_CLIENT_SECRET            = "arn:aws:secretsmanager:..."
  KAKAO_OAUTH_CLIENT_SECRET            = "arn:aws:secretsmanager:..."
  GIT_OAUTH_CLIENT_SECRET              = "arn:aws:secretsmanager:..."
  GIT_APP_PRIVATE_KEY_BASE64           = "arn:aws:secretsmanager:..."
  GIT_APP_STATE_SECRET                 = "arn:aws:ssm:..."
}
```

Terraform validation은 secret 이름을 `api_environment`에 넣는 것을 막고, `api_secret_arns` 값이 Secrets Manager 또는 SSM ARN 형식인지 확인합니다. OAuth client ID, GitHub App ID, public URL, bucket name, region처럼 민감하지 않은 값만 일반 ECS environment에 둡니다.

`secret_kms_key_arns`는 customer managed KMS key로 암호화한 secret에만 설정합니다. AWS managed key를 쓰는 기본 구성에서는 비워 둡니다.

## 배포와 staged cutover

Deploy Production ECS workflow는 image를 한 번 build/push한 뒤 deploy-api와 deploy-web job을 병렬 실행합니다. 두 service가 모두 안정화되어야 summary job이 실행됩니다. nginx image는 steady-state ECS workflow에서 build/push하지 않습니다.

운영 적용은 다음 순서를 지킵니다.

1. remote state를 백업하고 refresh-only plan으로 drift를 확인합니다.
2. warmup, worker dispatch disabled plan에서 legacy service/TG/SG delete 또는 replace가 없는지 확인합니다.
3. 저장한 warm-up plan을 apply하고 API/web service stability와 target health를 확인합니다.
4. production Host와 TLS SNI를 사용해 ECS ALB의 root, /health, /health/db를 direct smoke합니다.
5. worker task role ARN을 기존 사용자 Terraform execution role trust에 추가하고 worker smoke를 확인합니다.
6. split과 승인된 worker mode를 별도 plan/apply합니다.
7. direct ALB smoke를 반복한 뒤 Route53 alias를 별도 change batch로 전환합니다.
8. 관찰 시간이 끝날 때까지 EC2 ALB와 legacy nginx ECS service를 유지합니다.

worker는 API image의 node dist/deployment-worker.cjs를 사용하지만 task definition, execution role, task role, security group을 분리합니다. API role은 worker task family/cluster에 제한한 RunTask, task ARN에 제한한 StopTask/DescribeTasks/TagResource, worker 두 role에 대한 PassRole만 가집니다. enable_ecs_worker_dispatch = false가 기본값이며 활성화 시 connection setup의 caller principal은 worker task role ARN으로 바뀝니다.

warm-up 기간에는 legacy app, API, web의 3개 Fargate task가 실행됩니다. worker는 service desired count 없이 요청마다 one-off 비용만 발생합니다.

추가 필수 입력:

~~~hcl
ecs_cutover_stage            = "warmup"
enable_ecs_worker_dispatch   = false
worker_rds_security_group_id = "sg-..."
~~~

## 정적 검증

AWS API나 remote state를 사용하지 않는 검증만 실행합니다.

```powershell
terraform -chdir=infra/aws/terraform fmt -check -recursive
terraform -chdir=infra/aws/terraform init -backend=false -input=false
terraform -chdir=infra/aws/terraform validate
terraform -chdir=infra/aws/terraform test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke/ecs-ops-preflight.ps1 -PreflightOnly
```

`terraform plan`, `terraform apply`, live ALB/Route53 확인은 별도 명시 승인 없이는 실행하지 않습니다.
