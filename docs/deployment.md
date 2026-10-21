# 배포 절차

SketchCatch 서비스 자체를 배포하는 작업과 사용자가 설계한 AWS 자원을 배포하는 작업을 구분합니다. 두 작업은 권한과 Terraform State를 공유하지 않습니다.

## SketchCatch 서비스 배포

[Deploy Production ECS](../.github/workflows/deploy-ecs.yml)는 수동 실행합니다. `main` 병합만으로 운영 자원을 변경하지 않습니다.

1. 린트와 타입 검사, 빌드를 통과한 커밋을 선택합니다.
2. API와 Web 이미지를 병렬로 빌드하고 ECR에 올립니다.
3. 현재 API와 Web, Worker의 Task Definition을 복구 기준으로 기록합니다.
4. 새 API 이미지로 Worker Task Definition을 등록합니다.
5. API가 새 Worker를 참조하도록 갱신하고 API와 Web을 병렬 배포합니다.
6. ECS 서비스 안정화와 ALB 상태, 공개 응답을 확인합니다.

GitHub Actions는 OIDC 임시 권한을 사용합니다. 실행할 이미지는 내용 해시로 고정하고 애플리케이션 비밀값은 ECS의 Secret 참조로 전달합니다. 비밀값이 평문 환경 변수에 있거나 필수 참조가 없으면 배포를 중단합니다.

`deploy=false`는 이미지와 빌드 캐시만 준비합니다. 실제 서비스 변경은 `deploy=true`에서 실행합니다. 두 서비스의 배포는 원자적이지 않으므로 한쪽만 실패하면 각 이미지와 Task Definition을 비교해 복구합니다.

## 배포 확인과 복구

```bash
curl https://sketchcatch.net/
curl https://sketchcatch.net/health
curl https://sketchcatch.net/health/db
aws ecs describe-services --cluster sketchcatch-production-cluster --services sketchcatch-production-api sketchcatch-production-web
```

응답 코드만 보지 않고 API와 Web의 실행 이미지, 실행 중인 Task 수와 ALB Target Health를 함께 확인합니다. 실패 시 앞에서 기록한 Task Definition과 ECR 해시로 되돌립니다. 기존 EC2와 Nginx는 운영 복구 경로가 아니며 전체 인프라 복원은 [별도 복구 절차](../infra/aws/production/legacy-rollback/README.md)를 따릅니다.

## DB와 운영 인프라 변경

DB 마이그레이션은 서비스 배포 중 자동 실행하지 않습니다. [Run Production Database Migrations](../.github/workflows/migrate.yml)를 수동 실행하며 호환성 검사와 RDS 스냅샷을 먼저 수행합니다. 기존 `practice` 값을 제거하는 마이그레이션은 해당 값을 새로 만들지 않는 API와 Worker를 먼저 배포한 뒤 적용합니다.

운영 Terraform은 [runtime](../infra/aws/terraform), [edge와 data](../infra/aws/production), 복구용 State로 나눕니다. 변경 전 대상 자원과 소유권, 백업 및 Plan을 검토합니다. Import도 실제 State 변경이므로 별도 승인이 필요합니다. CloudFormation이 소유한 자원을 Terraform이 동시에 소유하게 하지 않습니다.

DNS와 IAM, 영구 저장소의 변경은 이미지 교체에 섞지 않습니다. 실행 설정은 [워크플로](../.github/workflows/deploy-ecs.yml)와 [인프라 안내](../infra/aws/production/README.md)에서 확인합니다.

## 사용자 프로젝트 배포

1. 프로젝트 소유권과 검증된 AWS 연결을 확인합니다.
2. Terraform 파일과 대상 계정, 리전 및 State 기준을 확인하고 Plan을 만듭니다.
3. 사용자가 검토한 Plan과 해시를 승인 기록에 연결합니다.
4. 실행 전에 같은 조건인지 다시 확인합니다. 다르거나 확인할 수 없으면 중단합니다.
5. 작업 번호로 별도 Worker를 시작하고 결과와 로그, State를 저장합니다.

운영 Worker는 `DEPLOYMENT_WORKER_MODE=ecs`를 사용합니다. 로컬에서는 `local_process`로 분리 실행할 수 있습니다. API 재시작 후에는 DB 작업 번호로 기존 Task를 찾아 중복 실행을 막습니다. 실행 종료와 취소는 권한을 가진 Worker만 기록합니다.

빌드용 CodeBuild는 제한된 권한으로 파일을 만듭니다. Worker가 검증한 파일만 배포하며 프로젝트별 실행 점유권으로 직접 배포와 CI/CD 실행의 충돌을 막습니다. GitHub Actions의 앱 배포는 승인한 파일을 다시 빌드하지 않습니다. 인프라 자동화는 같은 작업에서 만든 Plan 파일을 승인 범위 안에서 적용합니다.

## 실패와 자원 정리

- AWS 조회 실패를 자원이 없거나 변경이 없다는 뜻으로 처리하지 않습니다.
- 승인 뒤 파일이나 대상이 달라졌으면 기존 승인으로 실행하지 않습니다.
- 로그와 응답에서 자격 증명, 토큰 및 Terraform 비밀값을 제거합니다.
- 취소 시 자식 프로세스 종료와 남은 State 저장을 확인합니다. 실제 종료를 확인하기 전에 새 실행을 시작하지 않습니다.
- 실행 중이거나 성공한 배포, State가 남은 실패, 자원 삭제에 실패한 기록은 개수 제한만으로 지우지 않습니다.
- Destroy는 사용자 배포의 소유권과 최신 State를 확인한 뒤 실행합니다. 삭제 실패 기록은 재시도에 필요하므로 남깁니다.

권한 범위와 실행 코드는 [Worker 요청](../apps/api/src/deployments/deployment-worker-dispatcher.ts), [운영 IAM 설정](../infra/aws/iam), [공유 데이터 모델](data-models.md)에서 확인합니다.
