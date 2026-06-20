# 기술 선택 의사결정 기록

이 문서는 왜 현재 방식과 스택을 선택했는지 남기는 기록입니다. 나중에 방향이 바뀌더라도, 당시의 판단 기준을 보존하는 것이 목적입니다.

## ADR-001: pnpm workspace와 Turborepo를 사용한다

결정: 모노레포는 pnpm workspace로 구성하고, 빌드/검사는 Turborepo로 관리합니다.

이유:

- `apps/web`, `apps/api`, `packages/types`, `packages/ui`가 같은 도메인 타입을 공유합니다.
- 초기 5주 프로젝트에서는 저장소를 나누는 것보다 한 곳에서 변경 흐름을 보는 것이 빠릅니다.
- Turborepo가 패키지 간 build, lint, typecheck 순서를 관리해줍니다.

## ADR-002: API 서버는 Fastify로 시작한다

결정: `apps/api`는 Fastify + TypeScript로 구현합니다.

이유:

- Express보다 스키마/플러그인 구조가 명확합니다.
- Node.js 생태계를 유지하면서도 API 성능과 구조를 확보할 수 있습니다.
- MVP API, health check, DB check, presigned URL 발급에 충분합니다.

대안:

- NestJS: 구조는 좋지만 초기 학습과 보일러플레이트가 큽니다.
- Express: 단순하지만 장기 모듈 경계가 흐려지기 쉽습니다.
- Next.js API routes: 프론트와 백엔드 경계가 약해지고 AWS SDK 호출이 UI에 가까워질 위험이 있습니다.

## ADR-003: RDS에는 원천 데이터를 저장하고 S3에는 파일 아티팩트를 저장한다

결정: 프로젝트, 아키텍처 JSON, 배포 이력, 비용 정보는 RDS에 저장합니다. 다이어그램 이미지, Terraform 파일, export zip은 S3에 저장합니다.

| 데이터              | 저장 위치 |
| ------------------- | --------- |
| 회원 정보           | RDS       |
| 프로젝트 정보       | RDS       |
| 아키텍처 JSON       | RDS       |
| 배포 이력           | RDS       |
| 비용 분석 결과      | RDS       |
| PNG/SVG 다이어그램  | S3        |
| Terraform 파일      | S3        |
| 프로젝트 export zip | S3        |
| 썸네일 이미지       | S3        |

## ADR-004: 배포는 Docker + EC2 + SSM으로 한다

결정: 운영 배포는 Docker Compose 없이 Docker image를 만들고, SSM Run Command로 EC2에서 컨테이너를 교체합니다.

이유:

- Docker image 단위 배포라 로컬/CI/운영 실행 단위가 명확합니다.
- SSM을 쓰면 GitHub Actions에서 EC2 SSH 접속을 직접 열지 않아도 됩니다.
- EC2 기반이라 Nginx, Docker, systemd, CloudWatch 등 운영 요소를 직접 이해할 수 있습니다.

## ADR-005: 마이그레이션은 자동 배포에서 분리한다

결정: DB migration은 deploy workflow에서 자동 실행하지 않고, 수동 GitHub Actions workflow로 실행합니다.

이유:

- 스키마 변경은 배포보다 위험도가 높습니다.
- 운영 DB에 자동 마이그레이션을 묶으면 장애 원인 파악이 어려워집니다.
- 수동 승인 단계를 두면 팀이 변경 내용을 확인할 수 있습니다.

## ADR-006: HTTPS는 ALB + ACM + Route 53으로 간다

결정: `sketchcatch.net` HTTPS는 Application Load Balancer, ACM 인증서, Route 53 alias record로 구성합니다.

이유:

- AWS에서 가장 표준적인 HTTPS 진입 구조입니다.
- 인증서 자동 갱신을 ACM이 처리합니다.
- EC2 security group을 ALB에서 들어오는 트래픽으로 제한할 수 있습니다.
- 나중에 EC2를 여러 대로 늘리거나 ECS로 옮길 때 전환이 쉽습니다.

## ADR-007: MVP는 CloudFormation 우선 검토, Terraform은 확장 단계로 둔다

결정: 실제 제품 기능 단계에서는 Terraform만 고집하지 않고 CloudFormation 우선 MVP도 검토합니다.

이유:

- AWS 초보자는 CloudFormation이 AWS 리소스 모델과 더 직접 연결됩니다.
- AWS 공식 문서와 콘솔 경험으로 설명하기 쉽습니다.
- Terraform은 실무 확장성과 멀티 클라우드 관점에서 이후 추가 가치가 큽니다.

현재 저장소는 아직 CloudFormation/Terraform 생성 기능을 구현하지 않았습니다. 이 결정은 제품 방향을 위한 기록입니다.
