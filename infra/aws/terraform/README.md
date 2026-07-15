# ECS/Fargate production runtime

이 Terraform root는 SketchCatch production의 ECS/Fargate runtime을 관리합니다. Route53 production alias는 하나의 ECS ALB를 가리키며, ALB가 nginx 없이 API와 web service로 직접 path routing합니다.

```text
Route53 -> ECS ALB
  /api, /api/*, /health, /health/db -> API target group -> API service
  /*                                     -> web target group -> web service
API -> ECS RunTask one-off worker
```

기존 EC2, EC2 ALB, legacy nginx ECS service와 target group은 삭제되었습니다. warm rollback은 없으며 복구는 암호화된 sanitized AMI, 검증된 Docker artifact, `infra/aws/production/legacy-rollback` Terraform root와 `docs/deployment.md` runbook을 사용하는 cold rollback입니다.

배포 안정화 시간은 service 특성에 맞춰 관리합니다. API target group은 SSE와 장시간 요청을 위해 60초, web은 30초의 deregistration delay를 사용합니다. 두 target group은 10초 간격과 healthy threshold 2를 사용하며, ECS health check grace period는 API 60초와 web 30초입니다. 안전한 교체를 위해 두 service 모두 `minimumHealthyPercent=100`, `maximumPercent=200`, circuit breaker rollback을 유지합니다.

## 관리 리소스

- API/web ECR repository와 최근 tagged image 20개 lifecycle
- ECS cluster, API/web service, API/web/worker task definition
- API/web/worker execution role, task role, security group
- 기존 internal Runtime Cache 보안 그룹에 대한 ECS API/worker Redis ingress
- API/web `ip` target group, HTTP redirect, HTTPS listener와 API path rule
- API/web/worker CloudWatch log group, error/CPU/memory/ALB/RDS availability alarm
- API/web Application Auto Scaling target과 CPU target-tracking policy
- `sketchcatch_public_base_url`에서 presigned browser upload를 허용하는 기존 artifact bucket CORS
- 선택적 Route53 alias. 기존 production state에서는 현재 ECS alias를 보존합니다.

nginx repository와 log group은 마지막 검증 image의 cold rollback 추적을 위해 당분간 보존할 수 있지만 running service나 listener target은 아닙니다.

## 비용 기준

- API와 web은 service별 `min=1`, `max=2`입니다. 평소에는 API 1 task와 web 1 task만 실행합니다.
- 평균 CPU 60%를 목표로 scale out하며, scale-in 300초와 scale-out 60초 cooldown을 사용합니다.
- ALB, 두 baseline Fargate task, log 보관, ECR 저장, CloudWatch custom metric/alarm 비용이 발생합니다.
- Container Insights는 비용 때문에 기본 활성화하지 않습니다. serving task 0은 ALB `HealthyHostCount`로 감시합니다.
- NAT Gateway는 만들지 않습니다. task는 public subnet과 public IP를 사용합니다.
- worker는 service desired count가 없는 one-off `RunTask`라 실행한 시간만 비용이 발생합니다.

## 배포 소유권

`Deploy Production ECS`는 API image를 API와 worker task definition에, web image를 web task definition에 등록합니다. worker revision을 먼저 등록한 뒤 API와 web을 병렬 배포합니다. 둘 중 하나가 실패하면 전체 workflow가 실패합니다.

GitHub Actions가 service의 task revision을 관리하고 Application Auto Scaling이 desired count를 관리하므로 Terraform service lifecycle은 `task_definition`과 `desired_count` drift를 무시합니다. Terraform이 base task definition을 변경하면 workflow를 다시 실행해 service에 반영해야 합니다. network, load balancer, deployment circuit breaker, `minimumHealthyPercent=100`, `maximumPercent=200`은 Terraform이 관리합니다.

## 필수 runtime 입력

```hcl
vpc_id                     = "vpc-..."
public_subnet_ids           = ["subnet-...", "subnet-..."]
artifact_bucket_name        = "sketchcatch-..."
sketchcatch_public_base_url = "https://sketchcatch.net"
oauth_redirect_base_url     = "https://sketchcatch.net"
certificate_arn             = "arn:aws:acm:ap-northeast-2:...:certificate/..."
runtime_cache_security_group_id = "sg-..."
runtime_cache_port              = 6379

ecs_desired_count                  = 1
enable_ecs_service_autoscaling     = true
ecs_autoscaling_min_capacity       = 1
ecs_autoscaling_max_capacity       = 2
ecs_autoscaling_target_cpu_percent = 60
```

API 민감 값은 secret 원문이 아니라 Secrets Manager 또는 SSM Parameter Store ARN으로 전달합니다. `DATABASE_URL`, `AUTH_TOKEN_SECRET`, `CLOUDFORMATION_TEMPLATE_TOKEN_SECRET`, `REDIS_URL`, OAuth secret, GitHub App secret와 `OPENAI_API_KEY`는 `api_secret_arns`에 있어야 합니다. Web Push를 켤 때는 `WEB_PUSH_VAPID_PRIVATE_KEY`와 `WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY`도 `api_secret_arns`로만 전달합니다. public URL, client ID, bucket name, region, VAPID public key와 subject만 일반 environment에 둡니다.

`runtime_cache_security_group_id`에는 `infra/aws/cloudformation/runtime-cache-elasticache.yml` stack output `SecurityGroupId`를 입력합니다. runtime Terraform은 이 보안 그룹에 현재 ECS API와, worker dispatch가 활성화된 경우 ECS worker 보안 그룹만 Redis 포트로 허용합니다. `live_observation_enabled=true` 또는 `enable_ecs_worker_dispatch=true`인데 이 값이 없으면 plan이 실패합니다.

## 적용 절차

1. remote state와 production tfvars를 백업합니다.
2. `terraform plan`에서 Runtime Cache ingress source가 현재 ECS API/worker 보안 그룹이고 Redis 포트 하나만 여는지 확인합니다.
3. 저장한 plan을 승인 후 apply합니다.
4. API/web service가 안정화되고 target이 healthy인지 확인합니다.
5. `/`, `/health`, `/health/db`, 인증이 필요한 `/api/projects`를 smoke합니다.
6. Live Observation이 활성화된 경우 존재하지 않는 UUID로 public bootstrap을 호출해 `404 LIVE_OBSERVATION_COLLECTOR_NOT_FOUND`가 반환되는지 확인합니다. `503 LIVE_OBSERVATION_COLLECTOR_UNAVAILABLE`은 Runtime Cache 연결 실패입니다.
7. 최종 refresh-only plan과 task revision, desired/running count, alarm 상태를 기록합니다.

## 정적 검증

```powershell
terraform -chdir=infra/aws/terraform fmt -check -recursive
terraform -chdir=infra/aws/terraform init -backend=false -input=false
terraform -chdir=infra/aws/terraform validate
terraform -chdir=infra/aws/terraform test
node scripts/check-production-infra.mjs
```

backend key는 `production/ecs-foundation/terraform.tfstate`이며 사용자 Deployment state와 공유하지 않습니다.
