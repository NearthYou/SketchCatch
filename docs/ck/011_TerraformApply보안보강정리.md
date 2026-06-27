# Terraform Apply 보안 보강 정리

작성일: 2026-06-28  
범위: AWS role 자체의 IAM 권한 설계는 제외하고, SketchCatch API 안에서 Terraform live Deployment를 실행하기 전후로 막아야 하는 보안 문제를 정리한다.

## 1. 왜 이 문서를 만들었나

이번 작업은 `Deployment`가 실제 AWS에 `terraform init`, `terraform plan`, `terraform apply`를 실행할 수 있게 된 뒤, 코드 경계가 충분히 안전한지 다시 확인하면서 진행했다.

처음 구현된 흐름은 다음 큰 구조를 갖고 있었다.

1. 사용자가 Terraform artifact를 S3에 업로드한다.
2. Deployment row가 Terraform artifact, Architecture, AWS connection을 참조한다.
3. API가 Terraform workspace를 만들고 `terraform init` / `plan` / `apply`를 실행한다.
4. plan 결과를 저장하고 사용자가 승인하면 apply를 실행한다.
5. apply 후 state, outputs, resources를 저장한다.

이 구조는 기능적으로는 맞지만, live apply는 실제 AWS 리소스를 만들 수 있기 때문에 단순히 "정상 동작한다" 수준으로는 부족했다. 특히 사용자가 업로드한 Terraform 코드가 서버에서 실행되는 구조라서, 다음 문제가 있었다.

- Terraform 코드가 허용 범위 밖의 block이나 resource를 만들 수 있음
- `module`, `data`, `provisioner`, provider override를 통해 실행 범위를 우회할 수 있음
- Terraform 코드가 서버 로컬 파일을 읽거나, Terraform runner 로그를 과도하게 만들 수 있음
- plan 승인 이후 artifact나 tfplan, AWS connection이 바뀌어도 apply가 이어질 수 있음
- 실패한 apply를 다시 눌렀을 때 예전 approval이 남아 있으면 재실행될 수 있음
- 에러와 로그에 내부 오류나 secret-like 값이 노출될 수 있음
- SSE log stream이 무제한 열리면 API 자원을 계속 잡아먹을 수 있음

사용자가 명시한 범위는 "AWS role 권한 문제 제외"였기 때문에, IAM policy의 최소 권한 설계는 이 문서의 직접 범위에서 제외했다. 대신 API와 Terraform 실행 경계에서 막을 수 있는 문제를 우선 처리했다.

## 2. 변경 전 핵심 위험

### 2.1 Terraform artifact가 너무 신뢰되고 있었다

Terraform artifact는 사용자가 업로드하는 파일이다. 그런데 live Deployment에서는 이 파일이 그대로 서버의 Terraform CLI 입력이 된다.

이때 공격 또는 실수로 다음 코드가 들어갈 수 있다.

```hcl
module "network" {
  source = "git::https://example.com/network.git"
}
```

```hcl
data "aws_ami" "ubuntu" {
  most_recent = true
}
```

```hcl
resource "aws_instance" "web" {
  provisioner "local-exec" {
    command = "echo unsafe"
  }
}
```

문제는 이 코드들이 Terraform 문법상 유효하다는 점이다. Terraform CLI 관점에서는 정상 입력이지만, SketchCatch MVP의 live apply 범위에서는 허용하면 안 된다.

왜 문제인가:

- `module`은 외부 소스에서 알 수 없는 Terraform 코드를 가져올 수 있다.
- `data` source는 AWS 계정 정보를 조회할 수 있고, 향후 민감한 조회 경로가 생길 수 있다.
- `provisioner`와 `connection`은 Terraform이 로컬 명령 또는 원격 접속을 수행하게 만들 수 있다.
- `provider_meta`, `dynamic`, `backend`, `cloud` 같은 block은 실행 위치, 상태 저장소, provider 동작을 흐릴 수 있다.
- 허용되지 않은 resource type이 들어오면 MVP가 예상하지 않은 AWS 리소스를 만들 수 있다.

그래서 "Terraform 문법이 맞는가"와 "SketchCatch live apply에 안전한가"를 분리해야 했다.

### 2.2 AWS credentials를 준비하기 전에 artifact 검사가 충분하지 않았다

기존 흐름에서는 init/plan 과정에서 Terraform artifact를 안전성 검사하기 전에 AWS 임시 credential을 준비할 수 있었다.

문제는 artifact가 명백히 unsafe한 경우에도 AWS role assume 같은 인증 흐름이 먼저 일어날 수 있다는 점이다. 실제 AWS 리소스 변경은 `plan`/`apply`에서 일어나더라도, 보안 경계상 "실행해도 되는 Terraform인지"를 먼저 판단한 뒤 credential을 준비하는 편이 맞다.

판단:

- 안전하지 않은 Terraform artifact는 AWS credential 준비 전에 차단되어야 한다.
- `init`, `plan`, `approval`, `apply` 모두 같은 검사 함수를 통과해야 한다.
- 검사 실패 시 Deployment는 실패 상태로 기록되어야 하며 workspace는 정리되어야 한다.

### 2.3 plan 승인 뒤 artifact나 AWS connection이 바뀔 수 있었다

Terraform apply는 "사용자가 본 plan"을 그대로 적용해야 한다. 그런데 다음 값 중 하나라도 바뀌면 사용자가 승인한 대상과 실제 apply 대상이 달라진다.

- Terraform artifact id
- Terraform artifact content hash
- tfplan artifact id
- tfplan content hash
- AWS account id
- AWS region

문제 시나리오:

1. 안전한 Terraform으로 plan을 만든다.
2. 사용자가 plan을 승인한다.
3. apply 전에 Terraform artifact 또는 tfplan이 바뀐다.
4. 사용자는 A를 승인했는데 실제 apply는 B로 실행된다.

그래서 approval 시점과 apply 시점에 snapshot을 저장하고 다시 비교해야 했다.

### 2.4 실패 또는 취소된 Deployment가 예전 approval로 다시 apply될 수 있었다

Terraform apply가 실패하거나 취소되면 AWS 리소스가 일부 변경되었을 수 있다. 이 상태에서 같은 approval로 다시 apply를 허용하면 사용자가 새 plan을 확인하지 않고 재시도할 수 있다.

판단:

- `FAILED` 또는 `CANCELLED` 상태에서는 바로 apply를 다시 시작하면 안 된다.
- 다시 plan을 만들고 approval을 새로 받아야 한다.
- 실패/취소/서버 재시작 복구 시 approval snapshot은 지워야 한다.

### 2.5 Terraform runner output이 무제한으로 쌓일 수 있었다

Terraform CLI의 stdout/stderr를 문자열로 계속 누적하면, 악의적이거나 비정상적인 Terraform 실행이 API 프로세스 메모리를 과도하게 사용할 수 있다.

문제:

- stdout/stderr에 output limit이 없었다.
- timeout 또는 cancel 시 child process만 종료하고, 하위 프로세스가 남을 가능성이 있었다.
- Windows와 Unix 계열에서 process tree 종료 방식이 다르다.

판단:

- Terraform command output은 byte 기준 제한이 필요하다.
- 제한 초과 시 command를 실패 처리하고 프로세스를 종료해야 한다.
- timeout/cancel 후 grace period를 두고 강제 종료해야 한다.

### 2.6 S3 Terraform artifact 크기와 파일명 경계가 약했다

Terraform artifact는 S3에서 다운로드해 임시 workspace에 파일로 쓴다.

문제:

- S3 object가 너무 크면 메모리와 디스크를 불필요하게 사용할 수 있다.
- 업로드 때 기록된 `byteSize`만 믿으면 실제 S3 object 크기를 완전히 보장할 수 없다.
- 파일명이 경로처럼 들어오면 workspace 밖을 가리키려는 시도가 생길 수 있다.

판단:

- live apply용 Terraform artifact는 API 다운로드와 workspace write 시점에서 다시 크기 제한을 걸어야 한다.
- 파일명은 basename만 쓰고, `.tf`가 아니면 `main.tf`로 바꿔야 한다.
- workspace 준비 중 실패하면 임시 디렉터리를 지워야 한다.

### 2.7 Deployment log stream이 무제한 유지될 수 있었다

`GET /api/deployments/:deploymentId/logs/stream`은 SSE로 log를 계속 보내는 endpoint다.

문제:

- 동시에 열 수 있는 stream 수에 제한이 없었다.
- stream 유지 시간에 제한이 없었다.
- 매 polling마다 전체 log를 읽은 뒤 client에서 filter하는 구조였다.

판단:

- active stream 개수를 제한해야 한다.
- stream duration을 제한해야 한다.
- DB query 단계에서 `afterSequence`와 `limit`을 적용해야 한다.

### 2.8 production 500 응답이 내부 에러 메시지를 그대로 줄 수 있었다

기존 global error handler는 production에서도 500 error message를 그대로 response에 담을 수 있었다.

문제:

- 내부 path, stack 단서, DB 오류, SDK 오류, 설정 관련 문자열이 노출될 수 있다.
- 서버 로그에는 남기되 사용자 응답에는 일반화된 메시지를 줘야 한다.

판단:

- 5xx error는 production에서 `"Internal server error"`로 응답한다.
- 4xx와 validation error는 기존처럼 클라이언트가 고칠 수 있는 메시지를 유지한다.

## 3. 어떻게 바꾸기로 판단했나

이번 보강의 기준은 "실행 가능한 것만 허용"이다. Terraform은 표현력이 넓기 때문에, 위험한 것을 하나씩 denylist로 막는 방식만으로는 부족하다.

그래서 다음 원칙을 잡았다.

1. live apply는 MVP allowlist 안의 Terraform만 실행한다.
2. unsafe Terraform은 AWS credential 준비 전에 차단한다.
3. plan과 apply 사이의 모든 중요한 입력은 hash와 snapshot으로 묶는다.
4. 실패/취소/복구된 Deployment는 새 plan과 approval 없이는 apply하지 않는다.
5. Terraform CLI 실행은 output, timeout, process tree, env를 제한한다.
6. 외부 저장소인 S3에서 내려받는 artifact는 API에서 다시 검증한다.
7. 사용자에게 보여주는 error/log는 secret-like 값을 마스킹한다.
8. 운영 endpoint는 stream, batch, duration 같은 자원 제한을 갖는다.

## 4. 실제 변경 내용

### 4.1 Terraform artifact safety scanner 추가

새 파일:

- `apps/api/src/deployments/terraform-artifact-safety.ts`
- `apps/api/src/deployments/terraform-artifact-safety.test.ts`

핵심 함수:

- `assertTerraformArtifactIsSafe(terraformCode)`

이 함수는 Terraform artifact를 실행 전에 검사한다. Terraform full parser는 아니지만, MVP live apply에서 위험도가 높은 HCL 구조를 token 단위로 찾아 차단한다.

허용한 top-level block:

- `terraform`
- `provider`
- `resource`
- `variable`
- `output`
- `locals`

차단한 top-level 예:

- `module`
- `data`
- 그 외 알 수 없는 block

차단한 nested block:

- `backend`
- `cloud`
- `connection`
- `dynamic`
- `provisioner`
- `provider_meta`

provider block 아래 nested block은 전부 차단한다. 예를 들어 `endpoints`, `assume_role` 같은 설정은 AWS provider 동작을 바꿀 수 있기 때문이다.

허용한 provider source:

- `hashicorp/aws`
- `registry.terraform.io/hashicorp/aws`

AWS provider 설정 제한:

- provider는 `aws`만 허용한다.
- `region`은 literal string `"ap-northeast-2"`만 허용한다.
- `alias`는 literal string만 허용한다.
- `access_key`, `secret_key`, `profile`, `shared_credentials_files`, `endpoints` 같은 override는 차단한다.

허용한 live apply resource type은 `deployment-plan-summary.ts`의 `liveApplySupportedResourceTypes`로 공유한다.

현재 allowlist:

- `aws_vpc`
- `aws_subnet`
- `aws_internet_gateway`
- `aws_route_table`
- `aws_route_table_association`
- `aws_security_group`
- `aws_security_group_rule`
- `aws_instance`
- `aws_s3_bucket`

차단한 Terraform function:

- `file`
- `filebase64`
- `filebase64sha256`
- `filebase64sha512`
- `filemd5`
- `fileset`
- `filesha1`
- `filesha256`
- `filesha512`
- `pathexpand`
- `templatefile`

이 함수들은 서버 로컬 파일 경로나 workspace 경로를 읽는 데 쓰일 수 있어서 live apply 전에는 허용하지 않는다.

추가로 heredoc도 차단했다.

```hcl
user_data = <<EOF
...
EOF
```

heredoc 자체가 항상 위험한 것은 아니지만, token scanner가 heredoc 내부 interpolation과 복잡한 multi-line payload를 정확히 해석하지 못하면 우회면이 커진다. 그래서 MVP live apply에서는 우선 차단했다.

### 4.2 scanner를 init/plan/approval/apply에 연결

변경 파일:

- `apps/api/src/deployments/deployment-init-service.ts`
- `apps/api/src/deployments/deployment-plan-service.ts`
- `apps/api/src/deployments/deployment-approval-service.ts`
- `apps/api/src/deployments/deployment-apply-service.ts`

변경 전에는 일부 흐름에서 Terraform artifact hash만 계산하거나, AWS credential 준비 후에 workspace를 준비했다.

변경 후:

1. workspace를 만든다.
2. Terraform artifact content를 읽는다.
3. `assertTerraformArtifactIsSafe`를 먼저 실행한다.
4. 안전하면 hash를 계산한다.
5. 그 뒤 AWS credential을 준비하거나 다음 단계로 진행한다.

특히 `runDeploymentInit`과 `runDeploymentPlan`은 unsafe Terraform이면 AWS credential을 준비하지 않고 실패한다.

`approveDeploymentPlan`에서도 다시 S3에서 Terraform artifact를 다운로드하고 scanner를 돌린다. plan 시점에는 안전했지만 approval 전 artifact가 바뀌는 경우를 막기 위해서다.

`runDeploymentApply`에서도 workspace의 현재 artifact를 다시 읽고 scanner를 돌린 뒤, approval snapshot과 hash를 비교한다.

### 4.3 plan artifact와 approval snapshot 검증 강화

변경 파일:

- `apps/api/src/deployments/deployment-plan-service.ts`
- `apps/api/src/deployments/deployment-approval-service.ts`
- `apps/api/src/deployments/deployment-apply-service.ts`
- `apps/api/src/deployments/deployment-service.ts`

plan 저장 시 저장하는 값:

- plan artifact id
- plan artifact object key
- plan artifact sha256
- Terraform artifact id
- Terraform artifact sha256
- AWS account id
- AWS region

approval 시 저장하는 snapshot:

- `approvedTerraformArtifactId`
- `approvedPlanArtifactId`
- `approvedTerraformArtifactHash`
- `approvedTfplanHash`
- `approvedAwsAccountId`
- `approvedAwsRegion`
- `approvedByUserId`
- `approvedAt`

apply 전 다시 비교하는 값:

- 현재 Deployment의 Terraform artifact id와 승인된 artifact id
- 현재 Terraform artifact hash와 승인된 hash
- 현재 plan artifact id와 승인된 plan artifact id
- S3에서 받은 tfplan hash와 승인된 tfplan hash
- 현재 AWS connection account id와 승인된 account id
- 현재 AWS connection region과 승인된 region

이렇게 해서 "사용자가 승인한 plan"과 "실제로 apply하는 plan"을 묶었다.

### 4.4 실패/취소/중단 시 approval을 지우고 재승인 요구

변경 파일:

- `apps/api/src/deployments/deployment-service.ts`
- `apps/api/src/routes/deployments.ts`

변경 내용:

- `failDeployment` 시 approval snapshot을 clear한다.
- `cancelDeployment` 시 approval snapshot을 clear한다.
- 서버 재시작 등으로 `RUNNING` 상태가 복구될 때도 interrupted deployment를 `FAILED`로 만들면서 approval snapshot을 clear한다.
- apply 시작 조건에서 `FAILED` 또는 `CANCELLED` 상태는 바로 apply할 수 없게 했다.

이유:

- apply 실패 후 AWS 리소스가 일부 변경되었을 수 있다.
- 취소도 Terraform 프로세스가 어느 시점에서 멈췄는지에 따라 부분 변경 가능성이 있다.
- 이런 상태에서는 사용자가 새 plan을 보고 다시 승인해야 한다.

### 4.5 Terraform workspace 경계 강화

변경 파일:

- `apps/api/src/deployments/terraform-workspace.ts`
- `apps/api/src/deployments/terraform-workspace.test.ts`

변경 내용:

- `defaultTerraformArtifactMaxBytes = 1024 * 1024` 추가
- S3 download 시 `ContentLength`가 limit을 넘으면 거부
- stream body를 읽는 중에도 누적 byte가 limit을 넘으면 거부
- workspace write 전에도 buffer 크기 재검사
- 파일명은 basename만 사용하고 `.tf`가 아니면 `main.tf` 사용
- 실패 시 생성된 temp workspace를 즉시 삭제

왜 이렇게 했나:

- presigned upload metadata만 믿으면 실제 S3 object 크기와 다를 수 있다.
- live apply 실행 경계에서는 S3에서 내려받는 실제 content를 기준으로 다시 막아야 한다.
- 파일명을 신뢰하지 않아야 workspace 밖 쓰기 시도를 막을 수 있다.

### 4.6 Terraform runner 제한 강화

변경 파일:

- `apps/api/src/deployments/terraform-runner.ts`
- `apps/api/src/deployments/terraform-runner.test.ts`

변경 내용:

- stdout/stderr 각각 기본 `512 * 1024` byte 제한
- output limit 초과 시 stderr에 제한 초과 메시지 추가
- limit 초과 시 exitCode를 실패로 처리
- timeout/cancel 시 `SIGTERM` 후 2초 grace period
- grace period 후 강제 종료
- Unix 계열에서는 detached process group을 종료
- Windows에서는 `taskkill /T /F`로 child tree 종료 시도
- Terraform process env는 allowlist 기반으로 구성
- `TF_PLUGIN_CACHE_DIR` 기본값 보장

왜 이렇게 했나:

- Terraform output이 무한히 커지면 API 메모리 문제가 생긴다.
- Terraform provider나 child process가 남으면 cancel/timeout이 신뢰되지 않는다.
- process env를 최소화해야 서버 runtime secret이 Terraform process로 넓게 전달되지 않는다.

### 4.7 Deployment log stream 제한

변경 파일:

- `apps/api/src/routes/deployments.ts`
- `apps/api/src/deployments/deployment-service.ts`
- `apps/api/src/routes/deployments.test.ts`

변경 내용:

- active SSE stream 최대 50개
- stream 최대 유지 시간 5분
- polling batch 최대 200개
- `listDeploymentLogs`에 `afterSequence`, `limit` 옵션 추가
- stream close 시 interval, timeout 정리
- 중복 polling 방지 플래그 추가
- `once=true` 요청은 active stream count 제한에서 제외

왜 이렇게 했나:

- log stream은 연결을 오래 유지하므로 API 자원을 계속 점유한다.
- 전체 log를 매번 읽고 filter하면 deployment log가 커질수록 부담이 증가한다.
- close 처리 누락은 connection leak으로 이어질 수 있다.

### 4.8 production error response redaction

변경 파일:

- `apps/api/src/app.ts`
- `apps/api/src/app.test.ts`

변경 내용:

- production에서 500 이상 error response는 `"Internal server error"`로 고정
- 내부 error message는 server log에만 남김
- Zod validation과 4xx는 기존처럼 client가 조치할 수 있는 메시지 유지

왜 이렇게 했나:

- 500 error는 서버 내부 문제이므로 사용자에게 상세 메시지를 줄 필요가 없다.
- 내부 파일 경로, SDK 에러, DB 에러, 설정 정보가 response로 나갈 수 있다.

### 4.9 Terraform upload metadata 검증

변경 파일:

- `apps/api/src/routes/projects.ts`
- `apps/api/src/routes/projects.auth.test.ts`

변경 내용:

- `terraform_file` presigned upload 요청에는 `byteSize`를 필수로 요구
- `byteSize`가 `defaultTerraformArtifactMaxBytes`를 넘으면 presigned URL 발급 거부

왜 이렇게 했나:

- live apply용 Terraform artifact가 너무 큰 파일로 들어오는 것을 API 요청 단계에서 먼저 막는다.
- 단, presigned URL 자체가 실제 업로드 크기를 완전히 강제하는 것은 아니므로, 실행 경계에서는 `terraform-workspace.ts`에서 다시 S3 object content를 제한한다.

## 5. 재검토 중 발견한 추가 문제와 해결

### 5.1 HCL block header 줄바꿈 우회

재검토 중 가장 중요한 발견은 scanner의 newline 처리 문제였다.

처음 scanner는 block header token을 newline에서 비우는 방식이었다. 그러면 다음처럼 block type과 label, `{`를 줄바꿈으로 나눌 때 header가 제대로 구성되지 않을 수 있었다.

```hcl
module
  "network"
{
  source = "git::https://example.com/network.git"
}
```

문제:

- `module "network" { ... }`는 차단해야 한다.
- 그런데 header token을 newline마다 비우면 `module` token이 사라지고, `{`를 만났을 때 block을 정확히 만들지 못할 수 있다.

해결:

- newline이 항상 block header를 끝낸다고 보지 않도록 바꿨다.
- attribute value를 읽고 있는 depth에서만 newline이 attribute를 끝낸다고 처리했다.
- block header token은 `{`를 만날 때까지 유지한다.

추가 테스트:

- `assertTerraformArtifactIsSafe rejects Terraform module blocks split across lines`
- `assertTerraformArtifactIsSafe rejects provisioners split across lines`

### 5.2 AWS provider region drift와 credential override

처음에는 provider source 제한과 block 제한에 집중했지만, provider block 자체에서 다음 설정을 넣을 수 있는 문제가 있었다.

```hcl
provider "aws" {
  region = "us-east-1"
}
```

```hcl
provider "aws" {
  access_key = "..."
}
```

```hcl
provider "aws" {
  endpoints {
    s3 = "http://localhost:4566"
  }
}
```

문제:

- plan/approval/apply snapshot은 `ap-northeast-2`를 기준으로 잡는데 provider block이 다른 region을 가리키면 실행 대상이 달라진다.
- credential override는 서버가 준비한 임시 credential 대신 다른 credential 경로를 쓰게 만들 수 있다.
- custom endpoint는 실제 AWS가 아닌 다른 endpoint로 Terraform provider 요청을 보낼 수 있다.

해결:

- AWS provider attribute는 `alias`, `region`만 허용했다.
- `region`은 literal `"ap-northeast-2"`만 허용했다.
- dynamic region인 `var.aws_region`도 차단했다.
- provider nested block은 전부 차단했다.

추가 테스트:

- `rejects AWS provider region drift`
- `rejects dynamic AWS provider regions`
- `rejects AWS provider credential overrides`
- `rejects AWS provider nested overrides`

### 5.3 Terraform local file access function

재검토 중 `file()`, `templatefile()` 같은 Terraform function이 빠져 있음을 확인했다.

문제:

- Terraform process는 서버의 temp workspace에서 실행된다.
- `file("/etc/passwd")`, `templatefile(...)`, `pathexpand(...)` 같은 함수는 서버 로컬 파일이나 경로를 읽는 데 사용될 수 있다.
- AWS에 직접 쓰지 않더라도 Terraform state, logs, outputs를 통해 파일 내용이 흘러갈 수 있다.

해결:

- local file/path access 성격의 Terraform function을 denylist로 차단했다.
- 직접 호출과 string interpolation 안의 호출을 모두 검사했다.

추가 테스트:

- `rejects local file access functions`
- `rejects local file functions inside interpolation`

### 5.4 heredoc 처리

처음 scanner는 quoted string 중심으로 interpolation을 봤다. heredoc은 multi-line payload라 parser를 제대로 만들지 않으면 내부 표현을 놓칠 수 있다.

해결:

- `<<` heredoc 시작 token을 발견하면 live apply 전에는 차단한다.

추가 테스트:

- `rejects heredoc values`

### 5.5 테스트 문자열 lint 문제

interpolation 차단 테스트를 추가하면서 string escape가 과하게 들어간 부분이 있었다. ESLint가 불필요한 escape를 경고했고, 테스트 문자열을 정리했다.

해결:

- 테스트 의도는 유지하면서 unnecessary escape를 제거했다.
- API lint를 다시 통과시켰다.

### 5.6 sandbox와 local tooling 문제

검증 중 로컬 sandbox 때문에 몇 가지 실행 문제가 있었다.

문제:

- Node test runner가 child process를 spawn할 때 sandbox에서 `EPERM`이 날 수 있었다.
- root `corepack pnpm lint` 형태로 실행하면 Turbo 내부에서 child `pnpm`을 찾지 못하는 문제가 있었다.
- Next build는 `.next` 내부 파일을 unlink/write하면서 sandbox permission 문제를 만들 수 있었다.
- `pnpm build` 후 `apps/web/next-env.d.ts`가 generated route type 참조를 production build 기준으로 바꿨다.

해결:

- 필요한 검증은 권한 상승 실행으로 다시 돌렸다.
- root check는 Corepack shim 경로를 `PATH` 앞에 붙여 `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행했다.
- build 후 생긴 `apps/web/next-env.d.ts`의 generated diff는 보안 작업과 무관한 생성물이라 원래 개발용 참조로 되돌렸다.

## 6. 파일별 변경 요약

| 파일 | 변경 요약 |
| --- | --- |
| `apps/api/src/deployments/terraform-artifact-safety.ts` | Terraform live apply 전용 safety scanner 추가 |
| `apps/api/src/deployments/terraform-artifact-safety.test.ts` | scanner allow/block 테스트 추가 |
| `apps/api/src/deployments/deployment-init-service.ts` | init 전에 artifact safety 검사, 검사 후 credential 준비 |
| `apps/api/src/deployments/deployment-plan-service.ts` | plan 전에 artifact safety 검사, Terraform artifact hash 저장 |
| `apps/api/src/deployments/deployment-approval-service.ts` | approval 시 artifact 재다운로드, safety 검사, hash/snapshot 저장 |
| `apps/api/src/deployments/deployment-apply-service.ts` | apply 전 artifact safety 검사, artifact/tfplan/AWS snapshot 비교 |
| `apps/api/src/deployments/deployment-service.ts` | 실패/취소/복구 시 approval clear, log query pagination 추가, apply 재시도 제한 보조 |
| `apps/api/src/deployments/deployment-plan-summary.ts` | live apply resource allowlist를 scanner에서도 쓰도록 export |
| `apps/api/src/deployments/terraform-workspace.ts` | Terraform artifact 크기 제한, safe filename, 실패 시 cleanup |
| `apps/api/src/deployments/terraform-runner.ts` | output limit, process tree termination, env allowlist 강화 |
| `apps/api/src/routes/deployments.ts` | failed/cancelled apply 차단, SSE stream 제한 |
| `apps/api/src/routes/projects.ts` | Terraform file presigned upload 요청에 byteSize 검증 |
| `apps/api/src/app.ts` | production 500 response message redaction |
| 관련 test 파일들 | 위 보안 경계별 회귀 테스트 추가 |

## 7. 현재 live apply 흐름

현재 의도한 흐름은 다음과 같다.

### 7.1 init

1. Deployment ownership과 Terraform artifact 참조를 확인한다.
2. verified AWS connection을 확인한다.
3. S3에서 Terraform artifact를 내려받아 temp workspace에 쓴다.
4. Terraform artifact 크기와 파일명을 제한한다.
5. `assertTerraformArtifactIsSafe`를 통과해야 한다.
6. 그 다음에 AWS 임시 credential을 준비한다.
7. `terraform init -backend=false -input=false -no-color` 실행
8. stdout/stderr는 마스킹되어 Deployment log로 저장된다.
9. workspace는 finally에서 삭제된다.

### 7.2 plan

1. Deployment, Terraform artifact, AWS connection, Architecture를 확인한다.
2. pre-deployment analysis를 만든다.
3. Terraform artifact를 workspace에 복원한다.
4. safety scanner를 통과해야 한다.
5. artifact sha256을 계산한다.
6. AWS credential을 준비한다.
7. `terraform init`
8. `terraform plan -out=tfplan`
9. `terraform show -json tfplan`
10. unsupported resource type, destructive change, high risk finding을 요약한다.
11. tfplan을 S3에 저장하고 sha256을 저장한다.
12. plan은 기본적으로 `missing_approval` 상태로 막힌다.

### 7.3 approval

1. Deployment가 `missing_approval`로 blocked된 상태인지 확인한다.
2. current plan artifact가 Deployment에 속하는지 확인한다.
3. Terraform artifact id가 plan 시점과 같은지 확인한다.
4. AWS connection account/region이 plan artifact와 같은지 확인한다.
5. S3에서 Terraform artifact를 다시 다운로드한다.
6. safety scanner를 다시 통과해야 한다.
7. Terraform artifact hash가 plan 시점 hash와 같은지 확인한다.
8. approval snapshot을 저장한다.
9. `isBlocked`를 false로 바꾼다.

### 7.4 apply

1. `RUNNING`, `SUCCESS`, `FAILED`, `CANCELLED`, blocked 상태는 각각 조건에 따라 차단한다.
2. 같은 project 안에 다른 running Deployment가 있으면 차단한다.
3. current plan artifact와 Terraform artifact를 확인한다.
4. S3에서 tfplan을 다운로드한다.
5. Terraform artifact를 workspace에 복원한다.
6. safety scanner를 다시 통과해야 한다.
7. Terraform artifact hash, tfplan hash, AWS account/region을 approval snapshot과 비교한다.
8. 통과하면 AWS credential을 준비한다.
9. `terraform init`
10. 승인된 `tfplan` 파일을 workspace에 쓰고 `terraform apply tfplan`
11. 성공하면 outputs, state json, state file upload를 시도한다.
12. post-apply parsing/upload 실패는 success를 유지하고 warning으로 남긴다.
13. apply 실패/취소는 failed 처리하고 재 plan/approval을 요구한다.

## 8. 검증한 내용

### 8.1 추가/수정된 주요 테스트

Terraform scanner:

- MVP AWS resource subset은 허용
- `module` 차단
- 줄바꿈으로 쪼갠 `module` 차단
- `data` source 차단
- `provisioner` 차단
- 줄바꿈으로 쪼갠 `provisioner` 차단
- custom provider source 차단
- AWS provider region drift 차단
- dynamic AWS provider region 차단
- AWS provider credential override 차단
- AWS provider nested override 차단
- local file access function 차단
- interpolation 안의 local file function 차단
- heredoc 차단

Deployment services:

- init/plan/apply가 unsafe Terraform이면 AWS credential 준비 전에 멈춤
- approval이 unsafe artifact를 거부
- approval이 Terraform artifact drift를 거부
- approval이 Terraform artifact hash 없는 plan을 거부
- apply precondition이 artifact, plan, AWS drift를 차단
- failed/cancelled Deployment는 재 plan/approval 없이 apply 불가
- Terraform 실패 output과 summary는 secret-like 값을 마스킹
- workspace 준비 실패 시 Deployment가 failed로 기록됨

Runner/workspace:

- workspace가 안전한 파일명으로 temp dir에 Terraform 파일을 씀
- artifact 크기 초과 시 workspace 준비 거부
- Terraform process env는 필요한 값과 명시 env만 전달
- output limit 초과 시 Terraform command를 중단

Routes/app:

- production 500 response가 내부 error message를 노출하지 않음
- Terraform upload 요청이 oversized file을 거부
- Deployment log stream은 no-store SSE header를 유지하고 제한된 batch로 새 log만 가져옴

### 8.2 실행한 검증 명령

다음 검증을 통과했다.

```powershell
corepack pnpm --filter @sketchcatch/api exec tsx --test src/deployments/terraform-artifact-safety.test.ts
```

결과:

- scanner target test 통과

```powershell
corepack pnpm --filter @sketchcatch/api test
```

결과:

- 309 tests
- 309 pass
- 0 fail

```powershell
pnpm lint
```

결과:

- 통과
- 기존 web unused warning 3개는 남아 있음
  - `apps/web/features/diagram-editor/DiagramEditor.tsx`
  - 이번 API 보안 변경에서 생긴 error는 아님

```powershell
pnpm typecheck
```

결과:

- 통과

```powershell
pnpm build
```

결과:

- 통과

```powershell
git diff --check
```

결과:

- 공백 error 없음
- Windows line ending 관련 LF/CRLF warning만 있음

## 9. 현재 상태

현재 상태를 요약하면 다음과 같다.

- unsafe Terraform artifact는 init/plan/approval/apply 모두에서 차단된다.
- unsafe artifact는 AWS credential 준비 전에 차단된다.
- Terraform artifact는 S3에서 다운로드할 때와 workspace에 쓰기 전에 크기 제한을 받는다.
- Terraform file name은 workspace 안의 safe `.tf` 파일명으로 정규화된다.
- plan approval은 artifact hash, tfplan hash, AWS account, AWS region snapshot을 저장한다.
- apply는 현재 값과 approval snapshot이 모두 일치해야 실행된다.
- failed/cancelled/interrupted Deployment는 approval이 clear되어 새 plan과 approval 없이는 apply할 수 없다.
- Terraform runner는 output size, timeout, cancellation, process tree 종료를 처리한다.
- Deployment logs와 failure summary는 secret-like 값을 마스킹한다.
- production 500 response는 내부 메시지를 숨긴다.
- log stream은 active count, duration, batch size 제한을 갖는다.
- API 전체 테스트, lint, typecheck, build가 통과했다.

## 10. 의도적으로 남긴 범위와 잔여 리스크

### 10.1 AWS role IAM 권한 최소화는 이번 범위에서 제외

사용자가 명시한 대로 AWS role 권한 문제는 제외했다.

현재 API 경계는 Terraform 입력과 실행 흐름을 줄였지만, 실제 AWS에서 가능한 최종 작업 범위는 role policy에도 영향을 받는다. 이후에는 `SketchCatchTerraformExecutionRole`의 IAM policy를 live apply allowlist와 맞춰 줄이는 작업이 별도로 필요하다.

### 10.2 scanner는 full HCL parser가 아니다

`terraform-artifact-safety.ts`는 MVP live apply에 필요한 block/resource/provider/function 제한을 token 기반으로 검사한다.

장점:

- dependency 없이 빠르게 적용 가능
- 현재 MVP allowlist에는 충분히 좁은 검사 가능
- 회귀 테스트로 주요 우회 케이스를 고정

한계:

- Terraform 전체 문법을 완벽히 해석하지 않는다.
- 앞으로 module, data source, heredoc, 복잡한 expression을 허용하려면 parser 또는 Terraform policy engine 계층이 필요하다.

### 10.3 provider version 정책은 source 제한까지만 적용

현재 scanner는 provider source를 `hashicorp/aws`로 제한하지만, provider version을 특정 범위로 강제하지는 않는다.

이유:

- 기존 generator와 warmup 흐름이 provider version pinning을 강제하지 않는다.
- 이번 핵심 목적은 custom provider와 provider credential/region override 차단이었다.

후속으로 할 수 있는 일:

- `required_providers.aws.version` 허용 범위를 정한다.
- provider version이 없으면 기본 pinning을 생성하거나 approval 전 차단한다.

### 10.4 presigned URL 자체는 실제 byte size를 강제하지 않는다

`terraform_file` presigned upload 요청에는 `byteSize` 제한을 추가했다. 하지만 S3 presigned PUT 자체가 클라이언트가 실제로 올린 content length를 이 코드만으로 완전히 강제하는 구조는 아니다.

보완된 부분:

- live apply 실행 경계에서는 S3에서 실제 object를 다운로드할 때 다시 1MB 제한으로 막는다.

남은 개선:

- presigned URL에 content length 조건을 더 강하게 걸 수 있는 방식 검토
- 업로드 완료 후 HEAD object로 실제 size를 검증하는 확정 단계 추가

### 10.5 Terraform state upload 크기 제한은 별도 정책이 필요

현재 state upload는 apply 성공 후 `terraform.tfstate`를 S3에 저장한다. MVP allowlist에서는 state가 크지 않을 것으로 보지만, 장기적으로 resource 범위가 늘면 state size 제한이나 compression, retention 정책이 필요할 수 있다.

## 11. 다음에 손대야 할 후보

우선순위 높은 후속 작업:

1. AWS role IAM policy를 live apply resource allowlist와 맞춰 최소화
2. provider version pinning 정책 결정
3. Terraform safety scanner를 full parser 또는 policy layer로 교체할지 검토
4. S3 upload 완료 검증 단계 추가
5. Terraform destroy/delete workflow도 같은 approval snapshot 구조로 설계
6. apply 후 cleanup 실패와 partial apply 상태를 UI에서 더 명확히 보여주기
7. plan summary에서 security group open SSH 같은 high-risk finding 표시를 apply approval UI와 더 강하게 연결

## 12. 결론

이번 보강 전에는 Terraform live apply가 기능 흐름은 갖췄지만, 사용자가 업로드한 Terraform artifact를 실행 코드로 다루는 데 필요한 방어선이 부족했다.

이번 변경 후에는 AWS role 권한 자체를 제외한 API 실행 경계에서 다음 조건을 만족한다.

- 실행 가능한 Terraform 범위를 MVP allowlist로 제한한다.
- 위험 block, provider override, local file function, heredoc을 차단한다.
- unsafe artifact는 AWS credential 준비 전에 실패한다.
- plan과 apply 사이의 artifact, tfplan, AWS 대상 drift를 막는다.
- 실패/취소 후에는 새 plan과 approval 없이는 재 apply할 수 없다.
- Terraform runner와 log stream에 자원 제한을 둔다.
- 내부 error와 secret-like log 노출을 줄인다.
- 관련 회귀 테스트와 root checks가 통과했다.

따라서 현재 상태는 "AWS role policy 최소화는 별도 과제로 남아 있지만, SketchCatch API 내부의 Terraform live apply 보안 경계는 MVP demo 기준으로 실행 가능한 수준까지 보강된 상태"로 정리할 수 있다.
