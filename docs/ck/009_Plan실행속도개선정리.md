# Terraform Provider 캐시와 Plan 첫 실행 속도 개선 정리

## 1. 문서 목적

이 문서는 `Terraform Plan 실행` 속도 개선 작업을 정리한다.

이번 속도 개선은 한 번에 끝난 작업이 아니라 두 번에 나뉘어 진행됐다.

1. 1차 수정: Plan 반복 실행을 빠르게 하기 위해 Terraform provider plugin cache를 추가했다.
2. 2차 수정: 첫 Plan도 덜 느리게 만들기 위해 API 서버 시작 시 provider cache warm-up을 추가했다.

`008_배포Plan실행흐름정리.md`는 Deployment Plan의 기능 흐름을 설명한다. 이 문서는 Plan 실행 속도 개선만 따로 다룬다.

## 2. 공통 문제

사용자가 Workspace에서 `Terraform Plan 실행`을 누르면 Deployment가 `RUNNING`으로 바뀐 뒤 결과가 나오기까지 시간이 오래 걸릴 수 있었다.

S3 버킷 하나처럼 단순한 Terraform artifact여도 첫 Plan에서 시간이 길어지면, UI에서는 실패하지 않았는데 멈춘 것처럼 보인다.

근본 원인은 `terraform init`이다.

Plan 실행은 매번 S3의 Terraform artifact를 새 임시 workdir로 복원한다. 이 구조는 이전 Plan의 `.terraform` 디렉터리, provider 상태, module 상태가 다음 Plan에 섞이지 않게 해준다.

하지만 실행이 끝나면 임시 workdir을 cleanup하므로, 다음 Plan의 `terraform init`은 provider plugin을 다시 준비해야 한다.

## 3. 1차 수정: Terraform provider plugin cache

### 3.1 목표

같은 서버에서 Plan을 여러 번 실행할 때 `terraform init`의 provider 준비 시간을 줄인다.

### 3.2 해결 방식

Terraform process env에 `TF_PLUGIN_CACHE_DIR`을 설정했다.

우선순위는 아래와 같다.

```text
options.env.TF_PLUGIN_CACHE_DIR
-> process.env.TF_PLUGIN_CACHE_DIR
-> OS temp/sketchcatch-terraform-plugin-cache
```

`apps/api/src/deployments/terraform-runner.ts`의 `runTerraformCommand`는 Terraform process를 띄우기 전에 cache 디렉터리를 생성한다.

```text
mkdir(TF_PLUGIN_CACHE_DIR, { recursive: true })
```

Plan마다 임시 workdir은 계속 새로 만든다. 대신 provider plugin binary는 같은 cache 디렉터리에서 재사용한다.

### 3.3 1차 수정의 효과

두 번째 이후 같은 provider를 쓰는 Plan은 `terraform init`의 provider 준비 시간이 줄어든다.

작업공간 격리는 유지된다. `.terraform` 디렉터리와 작업 파일은 여전히 Plan별 임시 workdir에만 존재하고 실행 후 cleanup된다.

### 3.4 1차 수정의 한계

완전히 빈 cache에서는 첫 실행이 여전히 느릴 수 있다.

1차 수정은 provider cache 위치를 잡고 재사용하게 만든 것이지, 사용자가 Plan을 누르기 전에 cache를 미리 채우지는 않는다.

## 4. 2차 수정: API 서버 시작 시 provider cache warm-up

### 4.1 목표

사용자가 첫 `Terraform Plan 실행`을 누르기 전에 AWS provider plugin을 미리 cache에 받아둔다.

### 4.2 해결 방식

`apps/api/src/deployments/terraform-plugin-cache-warmup.ts`를 추가했다.

이 모듈은 warm-up 전용 임시 Terraform 파일을 만든다.

```hcl
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}
```

이 파일에는 실제 AWS resource가 없다. AWS credential도 필요하지 않다.

목적은 `terraform init -backend=false -input=false -no-color`를 한 번 실행해 `hashicorp/aws` provider plugin을 cache에 미리 준비하는 것이다.

### 4.3 서버 시작 흐름

`apps/api/src/server-startup.ts`를 추가했다.

API 서버는 listen하기 전에 provider cache warm-up을 먼저 시도한다.

```text
API process start
-> Terraform provider cache warm-up
-> app.listen
```

warm-up이 실패해도 API 서버 시작은 계속한다. 이 기능은 성능 최적화이지 API 가동 필수 조건은 아니다.

### 4.4 운영 배포 설정

운영에서는 cache가 컨테이너 교체와 함께 사라지면 효과가 약해진다.

그래서 GitHub Actions 배포에서 API 환경 변수에 아래 값을 넣는다.

```text
TF_PLUGIN_CACHE_DIR=/var/cache/sketchcatch/terraform-plugin-cache
```

`deploy/ec2/deploy-docker-release.sh`는 EC2 host에 같은 디렉터리를 만들고 API 컨테이너에 volume mount한다.

```bash
-v /var/cache/sketchcatch/terraform-plugin-cache:/var/cache/sketchcatch/terraform-plugin-cache
```

이렇게 하면 API 컨테이너가 새 image로 교체되어도 host의 Terraform provider cache는 남는다.

## 5. 두 수정의 관계

1차 수정은 cache를 사용할 수 있게 만든 기반 작업이다.

2차 수정은 그 cache를 사용자가 Plan을 누르기 전에 미리 채우는 작업이다.

즉, 2차 수정은 1차 수정 없이는 효과가 약하다. warm-up이 provider를 받아도 cache 위치가 안정적이지 않으면 실제 Plan에서 재사용하기 어렵기 때문이다.

## 6. 최종 효과와 한계

효과:

- 반복 Plan에서 `terraform init`의 provider 준비 시간이 줄어든다.
- 첫 사용자 Plan 전에 AWS provider cache를 미리 채울 수 있다.
- API 컨테이너가 교체되어도 운영 host cache를 재사용할 수 있다.

한계:

- 완전히 새 EC2 host 또는 빈 cache에서는 서버 시작 시 warm-up이 provider 다운로드 비용을 부담한다.
- 즉 비용이 사라지는 것이 아니라 사용자가 기다리는 Plan 시간에서 서버 시작 시간으로 앞당겨진다.
- `terraform validate`, `terraform plan`, `terraform show -json`, `tfplan` S3 업로드, RDS 저장 시간은 그대로 남는다.
- AWS provider가 실제 AWS API를 조회하는 시간은 provider cache로 줄어들지 않는다.
- 이 cache는 provider binary만 다루며 AWS credential, Terraform state, `tfplan`을 저장하지 않는다.

## 7. 변경 파일

1차 수정:

- `apps/api/src/deployments/terraform-runner.ts`
- `apps/api/src/deployments/terraform-runner.test.ts`

2차 수정:

- `apps/api/src/deployments/terraform-plugin-cache-warmup.ts`
- `apps/api/src/deployments/terraform-plugin-cache-warmup.test.ts`
- `apps/api/src/server-startup.ts`
- `apps/api/src/server-startup.test.ts`
- `apps/api/src/server.ts`
- `.env.example`
- `.github/workflows/deploy.yml`
- `deploy/ec2/deploy-docker-release.sh`
- `docs/deployment.md`

## 8. 테스트 기준

1차 수정 테스트:

- `createTerraformProcessEnv`가 기본 `TF_PLUGIN_CACHE_DIR`을 설정한다.
- 외부에서 지정한 `TF_PLUGIN_CACHE_DIR`을 유지한다.

2차 수정 테스트:

- warm-up이 AWS provider 선언 파일을 만든 뒤 `terraform init`을 호출한다.
- warm-up 성공 후 임시 workspace를 삭제한다.
- warm-up 실패 후에도 임시 workspace를 삭제한다.
- API startup은 warm-up 완료 후 listen한다.
- warm-up 실패 또는 예외가 있어도 API startup은 계속 진행한다.

검증 명령:

```bash
pnpm --filter @sketchcatch/api lint
pnpm --filter @sketchcatch/api typecheck
pnpm --filter @sketchcatch/api test
pnpm lint
pnpm typecheck
pnpm build
```
