# 아키텍처

브라우저는 다이어그램과 코드 편집을 맡습니다. API는 프로젝트를 저장하고 배포 작업을 요청합니다. 별도 Worker가 사용자의 AWS 권한으로 Terraform을 실행합니다.

## 운영 아키텍처

![SketchCatch의 네트워크, 서비스, 저장소와 사용자 AWS 계정 구성](../assets/sketchcatch-production-architecture.png)

ALB가 일반 요청을 Next.js Web으로 보내고 `/api`와 health 요청을 Fastify API로 보냅니다. Web과 API는 Public Subnet의 ECS Fargate에서 ALB 요청만 받습니다. RDS와 Redis는 Private Subnet에 둡니다. NAT Gateway는 사용하지 않습니다.

AI 연동은 기능별 설정에 따라 사용합니다. 브라우저가 AWS SDK나 Terraform을 직접 실행하지는 않습니다.

## 설계와 코드 동기화

다이어그램과 Terraform 코드를 공통 그래프인 `InfrastructureGraph`로 변환합니다. 자원과 연결 관계를 한 기준으로 맞추고 해석하지 못한 코드 블록은 보존합니다. 변환 결과는 먼저 제안으로 보여 주며 사용자 승인 없이 현재 설계를 덮어쓰지 않습니다.

[공통 그래프](../apps/api/src/services/terraform/infrastructure-graph.ts) | [왕복 변환 검사](../apps/web/features/architecture-board-compiler/authored-terraform-round-trip.test.ts)

## 배포 작업 처리

1. API가 DB에 배포 작업을 기록합니다.
2. 작업마다 ECS RunTask로 Worker를 시작합니다.
3. Worker가 승인한 계획을 확인하고 사용자 역할을 AssumeRole로 받아 실행합니다.
4. 결과와 상태를 저장하고 CloudWatch에 로그를 남깁니다.

AWS 실행 요청에는 DB 작업 번호를 함께 보냅니다. 요청 직후 API가 재시작해도 이 번호로 기존 Task를 찾습니다. 완료 여부를 확인할 수 없는 상태에서는 새 작업을 바로 시작하지 않습니다.

[Worker 실행과 조회](../apps/api/src/deployments/deployment-worker-dispatcher.ts) | [재시작 검증](../.eval/README.md#배포-작업-추적)

## 데이터 저장

| 저장소 | 저장 내용 |
| --- | --- |
| PostgreSQL | 프로젝트와 설계, 편집 초안, 승인 및 배포 이력 |
| S3 | 배포할 Terraform 파일, Plan, State와 내보내기 파일 |
| Redis | 작업 진행 상태와 짧은 관측 세션 |

편집 중인 Terraform 초안은 복구를 위해 DB에도 저장합니다. 배포 대상으로 확정한 파일은 S3에 보관합니다. Redis만으로 배포 완료나 자원 존재 여부를 판단하지 않습니다.

## 빌드와 배포 권한

사용자 저장소의 코드는 제한된 CodeBuild 역할에서 빌드합니다. 빌드 역할에는 서비스 배포용 ECR, ECS, S3와 CloudFront 권한을 주지 않습니다. Worker가 승인된 빌드 파일의 대상과 내용을 다시 확인한 뒤 배포합니다. 앱 자동화는 검증한 파일을 다시 빌드하지 않고 사용합니다.

같은 프로젝트의 실행은 DB 점유권과 실행 세대로 조정합니다. 이전 Worker가 늦게 돌아와도 이미 새 실행이 시작됐다면 자원 변경이나 완료 기록을 진행할 수 없습니다.

같은 배포를 생략할 때도 Terraform 상태, 대상 계정과 리전, 파일 내용 및 현재 실행 상태를 각각 확인합니다. 조회 실패나 오래된 기록만으로 변경 없음이라고 판단하지 않습니다.

## 코드 위치

| 경로 | 역할 |
| --- | --- |
| [apps/web](../apps/web) | 설계 편집과 승인, 실행 상태 화면 |
| [apps/api](../apps/api) | 인증과 데이터 저장, Terraform 및 AWS 연동 |
| [packages/types](../packages/types/src/index.ts) | 공유 데이터 타입 |
| [infra/aws/terraform](../infra/aws/terraform) | SketchCatch 운영 인프라 |
| [GitHub Actions](../.github/workflows/deploy-ecs.yml) | SketchCatch 이미지 빌드와 ECS 배포 |

SketchCatch 자체의 운영 인프라와 사용자가 배포하는 인프라는 권한 및 Terraform State를 공유하지 않습니다. 운영 변경과 복구는 [배포 절차](deployment.md)에 있습니다.
