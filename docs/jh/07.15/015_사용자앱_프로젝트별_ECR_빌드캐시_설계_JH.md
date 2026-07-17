# 사용자 앱 프로젝트별 ECR 빌드 캐시 설계

## 1. 결정 상태

- 결정일: 2026-07-17
- 상태: 사용자 승인
- 적용 대상: Repository가 연결된 ECS/Fargate 사용자 앱의 Direct Deployment와 Git/CI/CD Application Release
- 선택안: 사용자 AWS 계정에 프로젝트별 전용 ECR build cache Repository를 자동 생성한다.

## 2. 목적

이 기능은 첫 번째 사용자 앱 빌드에서 생성한 Docker layer를 프로젝트 전용 ECR Repository에 저장하고, 다음 commit 빌드에서 변경되지 않은 layer를 재사용한다. 사용자가 GitHub에 새 commit을 push해도 전체 Docker image를 처음부터 다시 만들지 않게 하여 CodeBuild의 API image build 시간을 줄인다.

캐시는 배포 결과가 아니다. 캐시 tag를 ECS Task Definition에 넣지 않으며, 실제 배포는 현재와 동일하게 SketchCatch 내부 Artifact S3에서 검증한 immutable candidate를 trusted worker가 사용자 배포용 ECR에 게시한 뒤 수행한다.

## 3. 범위

### 포함

- 프로젝트별 ECR build cache Repository 생성·검증·삭제
- CodeBuild build-only role의 캐시 전용 최소 권한
- CloudFormation이 생성하는 shared permissions boundary의 캐시 상한 권한
- server-generated preflight buildspec의 BuildKit registry cache import/export
- 캐시가 없거나 손상되었을 때 전체 빌드로 자동 전환
- Direct Deployment와 Git/CI/CD가 공유하는 preflight candidate build 경로
- 프로젝트 삭제와 AWS 연결 삭제 시 캐시 Repository cleanup
- 기존 AWS 연결에 필요한 1회 재연결 안내

### 제외

- Lambda, EC2/ASG, Static Site build cache
- 프론트엔드 package manager store cache
- ECS 안정화, CloudFront invalidation 등 Docker build 이후 단계의 시간 단축
- 기존 AWS 연결의 permissions boundary 자동 승격
- 캐시 hit만을 근거로 candidate 검증이나 사용자 승인을 생략하는 동작

## 4. AWS Resource 계약

### 4.1 Repository identity

프로젝트 ID의 하이픈을 제거한 앞 8자를 소문자로 사용한다.

```text
Repository name: sketchcatch-<projectSuffix>-build-cache
Cache tag: buildcache-v1-linux-amd64
Repository URI: <accountId>.dkr.ecr.<region>.amazonaws.com/<repositoryName>
```

Repository는 사용자에게 선택된 AWS connection의 account와 region에 생성한다. DB에 별도 좌표를 추가하지 않고 `projectId`, `accountId`, `region`에서 결정적으로 계산한다. 따라서 이번 변경에는 DB migration이 없다.

### 4.2 Repository configuration

- `imageTagMutability`: `MUTABLE`
- encryption: `AES256`
- scan on push: 비활성화. 이 Repository에는 배포 image가 아니라 BuildKit cache manifest만 저장한다.
- lifecycle policy: 최근 cache image 3개만 유지하고 초과 image를 정리한다.
- tags:
  - `ManagedBy=SketchCatch`
  - `SketchCatchProject=<projectId>`
  - `SketchCatchPurpose=BuildCache`

SketchCatch는 이름만 같다는 이유로 기존 Repository를 수정하거나 삭제하지 않는다. ARN, account, region과 위 ownership tag가 모두 일치해야 관리 Resource로 인정한다.

## 5. 권한 경계

### 5.1 SketchCatch Terraform Execution Role

AWS 연결 CloudFormation이 만드는 `SketchCatchTerraformExecutionRole-*`은 기존 `ecr:*` 범위 안에서 cache Repository를 생성·조회·태그·lifecycle 설정·삭제한다.

### 5.2 CodeBuild build-only role

프로젝트별 `SketchCatchCodeBuild-<projectSuffix>` role에는 다음 권한만 추가한다.

`Resource: "*"`:

- `ecr:GetAuthorizationToken`

프로젝트의 정확한 cache Repository ARN:

- `ecr:BatchCheckLayerAvailability`
- `ecr:GetDownloadUrlForLayer`
- `ecr:BatchGetImage`
- `ecr:InitiateLayerUpload`
- `ecr:UploadLayerPart`
- `ecr:CompleteLayerUpload`
- `ecr:PutImage`

이 role에는 사용자 배포용 ECR Repository, ECS, S3, CloudFront 또는 `iam:PassRole` 권한을 주지 않는다. ECR authorization token은 registry login에 사용되지만 실제 API 작업은 위 Repository ARN 정책으로 다시 제한된다.

### 5.3 Shared permissions boundary

AWS 연결 CloudFormation의 `SketchCatchCodeBuildBoundary-*`에는 다음 상한만 추가한다.

- `ecr:GetAuthorizationToken` on `*`
- 위 layer read/write action on `arn:aws:ecr:<region>:<accountId>:repository/sketchcatch-*-build-cache`

실제 inline policy는 이 wildcard보다 좁은 프로젝트별 정확한 ARN을 사용한다. 새 AWS 연결은 이 boundary를 자동 생성한다. 기존 연결은 기존 boundary가 ECR을 허용하지 않으므로 연결을 한 번 삭제하고 다시 연결한 뒤 빌드 환경을 다시 준비해야 한다.

## 6. 빌드 흐름

1. 사용자가 `빌드 환경 준비`를 실행한다.
2. API가 프로젝트별 cache Repository를 생성하거나 ownership과 설정을 검증한다.
3. API가 cache Repository만 사용할 수 있는 build-only role과 permissions boundary를 검증한다.
4. API가 CodeBuild project를 생성·갱신한다. CodeBuild 자체 `cache.type`은 `NO_CACHE`를 유지한다. 실제 캐시는 server-generated buildspec의 BuildKit registry cache가 담당한다.
5. Application Release가 exact commit으로 CodeBuild를 시작하면서 cache Repository 이름과 URI를 server-generated environment override로 전달한다.
6. buildspec은 ECR login과 `docker buildx` 준비를 시도한다.
7. 캐시 사용이 가능하면 다음 인자를 사용한다.

```text
--cache-from type=registry,ref=<cacheUri>:buildcache-v1-linux-amd64
--cache-to type=registry,ref=<cacheUri>:buildcache-v1-linux-amd64,mode=max,oci-mediatypes=true,image-manifest=true,ignore-error=true
--load
```

8. 첫 빌드는 전체 layer를 만들고 cache manifest를 저장한다.
9. 다음 빌드는 Dockerfile instruction과 입력이 동일한 layer를 재사용한다.
10. build 결과는 기존과 동일하게 local image로 load한 뒤 health check, OCI archive 생성, frontend build, signed upload, digest 검증을 수행한다.

Docker cache는 변경된 파일만 임의로 골라 실행하는 기능이 아니다. Dockerfile의 layer 경계를 기준으로 앞 단계가 같을 때만 재사용한다. 따라서 Dockerfile이 dependency manifest copy/install을 application source copy보다 앞에 두어야 효과가 크다.

## 7. 장애 처리

- cache Repository가 아직 비어 있음: 정상적인 cold build로 계속한다.
- `cache-from` manifest 없음 또는 손상: 경고를 남기고 cache 인자 없이 전체 build로 한 번 재시도한다.
- `cache-to` export 실패: `ignore-error=true`로 현재 release는 계속하고 다음 실행이 cold build가 될 수 있음을 log에 남긴다.
- ECR login 실패: 캐시 없이 전체 build로 계속한다. candidate 생성·검증 실패로 오인하지 않는다.
- Repository 설정 또는 ownership 불일치: 빌드 환경 준비를 실패시키고 관리되지 않는 Resource를 수정하지 않는다.
- 기존 permissions boundary: `AWS 연결을 다시 생성한 뒤 빌드 환경을 준비해 주세요`라는 사용자용 오류로 분리한다.
- cleanup 실패: 프로젝트 또는 AWS 연결 삭제를 완료 처리하지 않고 재시도 가능한 cleanup 실패로 남긴다.

캐시 fallback은 속도 기능의 장애가 앱 배포 장애가 되는 것을 막는다. 다만 build-only role이나 CodeBuild project 자체가 승인 계약과 다르면 기존처럼 fail-closed한다.

## 8. Cleanup 순서

프로젝트 삭제와 AWS 연결 삭제는 다음 순서를 사용한다.

1. active deployment/lease가 없는지 확인
2. CodeBuild project 삭제
3. CloudWatch Logs log group 삭제
4. build-only inline policy와 permissions boundary 연결 제거 후 role 삭제
5. cache Repository의 ARN과 ownership tag 검증
6. `DeleteRepository(force=true)`로 cache manifest와 Repository 삭제
7. DB의 build environment record 정리

보상 정리에서도 이번 호출이 새로 생성했고 ownership이 확인된 Resource만 삭제한다.

## 9. 변경 대상

- `apps/api/src/aws-connections/aws-connection-service.ts`
  - CloudFormation permissions boundary에 cache 전용 ECR 상한 추가
- `apps/api/src/build-environments/project-build-environment-service.ts`
  - cache Repository 이름·ARN·URI를 desired environment와 runtime fingerprint에 포함
- `apps/api/src/build-environments/aws-project-build-environment-gateway.ts`
  - ECR Repository create/update/verify/remove와 build-only policy 갱신
- `apps/api/src/releases/preflight-buildspec.ts`
  - BuildKit registry cache import/export 및 cold-build fallback
- `apps/api/src/deployments/aws-codebuild-direct-application-release-gateway.ts`
  - server-generated cache environment override 전달
- `apps/api/src/aws-connections/aws-connection-managed-cleanup.ts`
  - AWS 연결 및 프로젝트 삭제 시 cache Repository ownership 검증·삭제
- `docs/deployment.md`
  - 사용자 앱이 cache 전용 ECR만 사용한다는 운영 계약으로 기존 설명 수정
- `feature_list.json`
  - 실제 구현과 검증 증거가 일치하도록 사용자 앱 cache 항목 수정

공개 API 응답과 DB schema는 변경하지 않는다.

## 10. 검증 기준

### 자동 검증

- cache Repository 이름·ARN·runtime fingerprint 결정성
- 새 CloudFormation boundary가 cache action만 허용하고 ECS/S3/CloudFront를 허용하지 않음
- build-only inline policy가 정확한 프로젝트 cache ARN만 허용함
- ECR Repository create/update/verify, ownership 거부, 부분 생성 보상 정리
- project cleanup과 AWS connection cleanup의 cache Repository 삭제
- buildspec에 `cache-from`, `cache-to`, `--load`, cold-build fallback이 존재함
- cache tag가 release artifact reference나 ECS Task Definition에 사용되지 않음
- 기존 candidate digest, health check, signed upload 검증이 유지됨

### 실제 확인

- 첫 commit 실행에서 cache manifest 생성
- 동일 프로젝트의 다음 commit 실행에서 BuildKit log에 cached layer가 표시됨
- 두 실행 모두 최종 release image digest와 cache tag가 분리됨
- 두 번째 실행의 Docker build 단계가 첫 실행보다 짧음
- 프로젝트 삭제 후 cache Repository가 남지 않음

전체 배포 시간에는 ECS service 안정화와 CloudFront 검증 시간이 포함된다. 따라서 이 변경의 성공 기준은 전체 시간을 특정 숫자로 보장하는 것이 아니라, 두 번째 실행에서 Docker build 단계가 실제로 단축되고 cache 장애가 release 실패로 전파되지 않는 것이다.

## 11. 완료 조건

- 새 AWS 연결에서 별도 수동 IAM 입력 없이 cache 권한이 자동 준비된다.
- Repository가 연결된 ECS/Fargate 프로젝트마다 cache Repository가 하나만 존재한다.
- 두 번째 commit부터 변경되지 않은 Docker layer가 재사용된다.
- Repository code가 배포용 AWS Resource를 변경할 권한은 계속 없다.
- Direct Deployment와 Git/CI/CD가 동일한 candidate build cache를 사용한다.
- 프로젝트/AWS 연결 삭제가 cache Repository까지 안전하게 정리한다.
- 014 Direct Deployment 최초 앱 자동 배포 구현을 시작하기 전에 본 캐시 계약이 코드와 검증 결과에 반영된다.
