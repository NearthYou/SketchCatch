# SketchCatch production infrastructure Terraform

이 디렉터리는 SketchCatch 자체 production infrastructure를 Terraform으로 관리하는 경계입니다. 사용자가 SketchCatch에서 실행하는 IaC Preview/Plan/Apply와 완전히 별개이며, product API나 ECS worker가 이 state를 읽거나 변경하지 않습니다.

## management group

| group | Terraform root | state key | 범위 | Phase 9 상태 |
| --- | --- | --- | --- | --- |
| `runtime` | `infra/aws/terraform` | `production/ecs-foundation/terraform.tfstate` | ECS, ALB, target group/listener, ECR, runtime IAM, CloudWatch, ECS security group | 기존 key/address 유지, state audit 선행 |
| `edge` | `infra/aws/production/edge` | `production/edge/terraform.tfstate` | Route53, ACM, certificate validation | 빈 import gate, live ownership 금지 |
| `data` | `infra/aws/production/data` | `production/data/terraform.tfstate` | S3 artifact bucket, RDS, Redis/ElastiCache | 빈 import gate, persistent resource 보호 |
| `legacy-rollback` | `infra/aws/production/legacy-rollback` | `production/legacy-rollback/terraform.tfstate` | encrypted AMI 기반 임시 EC2/ALB cold restore | 기본 disabled, incident 승인 때만 생성 |

`runtime` root를 이동하거나 backend key를 바꾸지 않습니다. 기존 state가 있는 상태에서 directory/key를 함께 바꾸면 state migration과 resource address 변경이 섞이므로 Phase 9 범위 밖입니다. 현재 `aws_route53_record.ecs_alias`가 runtime root에 정의되어 있다면 edge state에 중복 import하지 않고, 별도 승인된 state move 또는 ownership handoff를 먼저 설계합니다.

## backend와 locking

모든 group은 같은 production state bucket의 서로 다른 key를 사용합니다.

- bucket: `sketchcatch-terraform-state-555980271919-ap-northeast-2`
- region: `ap-northeast-2`
- encryption: `encrypt = true`
- locking: `use_lockfile = true`
- recovery: state bucket Versioning 필수
- DynamoDB lock table: 신규 사용하지 않음

backend bucket은 자신이 저장하는 state에서 관리하지 않습니다. bucket Versioning, encryption, public access block, bucket policy가 준비됐다는 별도 evidence가 있어야 remote plan을 허용합니다. backend 예시는 `infra/aws/production/backend/*.s3.tfbackend.example`에 있습니다.

plan role의 backend 권한은 선택한 key와 `<key>.tflock`에만 제한합니다. bucket에는 해당 prefix의 `s3:ListBucket`, state object에는 `s3:GetObject`와 `s3:PutObject`, lock file에는 `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`가 필요합니다. state file의 `s3:DeleteObject` 권한은 주지 않습니다. 이 role은 AWS resource API에는 read-only이지만 backend state/lock에는 위 exact-object write 예외를 가집니다.

## import 순서

실제 resource 목록과 group은 `import-manifest.json`이 machine-readable 기준입니다.

1. **runtime state audit**: backend key, `terraform state list`, 실제 resource ID와 현재 HCL address를 대조합니다. 이미 state에 있는 remote object는 다시 import하지 않습니다.
2. **runtime 보완**: state에 없는 ECS/ALB/ECR/IAM/CloudWatch resource만 한 종류씩 resource/import block PR로 준비합니다.
3. **edge 격리**: Route53 TTL, 현재 alias target, ACM renewal/validation owner, DNS rollback owner를 기록합니다. runtime의 Route53 state를 edge로 옮길 때는 중복 import가 아니라 별도 state move 계획을 사용합니다.
4. **data 격리**: S3 backup/versioning, RDS snapshot/deletion protection, Redis snapshot/maintenance 설정을 먼저 확보합니다. S3, RDS, Redis는 같은 import/apply에서 함께 다루지 않습니다.
5. **cold rollback 격리**: warm EC2/ALB와 legacy ECS service는 제거된 상태를 유지합니다. `legacy-rollback` root는 `enable_cold_rollback=false`가 기본이며 incident 승인 때만 별도 state에 임시 복구 자원을 만듭니다.

각 import PR은 discovery evidence, destination address, import ID 형식, backup, rollback owner, 예상 plan을 포함해야 합니다. 생성된 HCL은 초안으로만 사용하고, import를 수행하기 전 `0 add / 0 change / 0 destroy`에 수렴하도록 검토합니다. import block의 실제 반영도 `terraform apply`이므로 live approval 없이는 실행하지 않습니다.

## review and approved apply workflow

`.github/workflows/production-infra-plan.yml`은 `workflow_dispatch` 전용입니다. 일반 검토는 선택한 group과 정확히 일치하는 `<group>-review-only` 확인 문자열과 GitHub Environment `production-infra-plan` reviewer 승인이 필요합니다. Runtime Cache 장애 복구 apply는 성공한 review-only run ID, 현재 40자리 head SHA, `runtime-cache-ingress-apply-<run-id>` 확인 문자열을 모두 요구하며 `production` Environment의 배포 역할로 넘어갑니다.

필수 GitHub Environment 설정:

```text
vars.AWS_REGION=ap-northeast-2
vars.AWS_ROLE_TO_ASSUME=<resource-read-only, state-key-scoped production infra plan role ARN>
vars.PRODUCTION_INFRA_STATE_BUCKET=sketchcatch-terraform-state-555980271919-ap-northeast-2
secrets.PRODUCTION_INFRA_RUNTIME_TFVARS_JSON=<complete runtime tfvars JSON>
```

runtime plan은 production 값을 누락해 secret ARN이나 runtime 설정을 제거하는 잘못된 diff를 만들지 않도록 전체 tfvars JSON이 없으면 실패합니다. tfvars JSON에는 secret 원문을 넣지 않고 ECS task가 참조할 Secrets Manager/SSM ARN만 넣습니다. review-only 경로는 binary plan artifact를 저장하지 않습니다. 승인된 Runtime Cache apply 경로만 새 plan의 변경 주소, `create` 동작, Redis TCP 6379, 공통 cache 보안 그룹과 서로 다른 API/worker source를 검증한 뒤 binary plan을 1일 retention artifact로 전달하고, `production` Environment에서 그 파일만 apply한 다음 즉시 삭제합니다. `destroy`, `import`, `-auto-approve`는 포함하지 않습니다.

plan role에는 다음 두 경계만 허용합니다.

- 선택한 backend prefix의 state read/write와 `.tflock` 생성/삭제
- ECS, ELBv2, ECR, IAM, CloudWatch Logs/Alarms, Route53, ACM, S3 configuration, RDS, ElastiCache의 `Get*`, `List*`, `Describe*` read-only 조회

AWS API가 resource-level scope를 지원하지 않는 read action만 `Resource: "*"`를 허용하며, create/update/delete/tag/pass-role action은 plan role에 넣지 않습니다. OIDC trust는 repository와 `production-infra-plan` environment subject로 제한합니다.

## 정적 검증

AWS credential이나 backend 접속 없이 실행합니다.

```powershell
node scripts/check-production-infra.mjs
terraform -chdir=infra/aws/terraform init -backend=false -input=false
terraform -chdir=infra/aws/terraform validate
terraform -chdir=infra/aws/production/edge init -backend=false -input=false
terraform -chdir=infra/aws/production/edge validate
terraform -chdir=infra/aws/production/data init -backend=false -input=false
terraform -chdir=infra/aws/production/data validate
terraform -chdir=infra/aws/production/legacy-rollback init -backend=false -input=false
terraform -chdir=infra/aws/production/legacy-rollback validate
```

## live operation blockers

아래가 모두 충족되기 전에는 remote plan/import/apply/destroy를 실행하지 않습니다.

- backend bucket Versioning/encryption/public access evidence
- group별 state key와 lockfile IAM scope 검토
- complete production tfvars와 secret ARN mapping
- read-only plan role 및 Environment required reviewer
- state audit와 duplicate ownership 검사
- high-risk resource backup/restore evidence
- 잔존 Route53/ACM과 data resource ownership 확인
- cold rollback artifact 무결성과 임시 자원 cleanup 계획
- 명시적인 live operation 승인과 담당자/rollback 시간대
