# Codex 협업 로그

이 문서는 SketchCatch 개발 환경을 준비하면서 Codex와 함께 결정하고 진행한 흐름을 요약합니다. 세부 대화 전체를 보존하기보다, 나중에 팀원이 "왜 이렇게 되어 있는지" 이해할 수 있게 핵심 맥락만 남깁니다.

## 1단계: 초기 개발 환경 구성

- pnpm workspace 구성
- Turborepo 설정
- TypeScript base config 설정
- ESLint, Prettier, EditorConfig 설정
- Next.js web app 생성
- API app 생성
- shared UI/types/config package 생성
- GitHub Actions CI 생성
- README, AGENTS, docs 기본 문서 생성

중요한 제한:

- 제품 기능은 구현하지 않음
- Terraform 배포 기능은 구현하지 않음
- AWS SDK, Bedrock, Cost Explorer, Budgets 연동은 구현하지 않음
- 인증은 구현하지 않음
- `.env`는 만들지 않고 `.env.example`만 유지

## 2단계: Git convention과 에이전트 규칙 정리

- 팀 Git convention을 AGENTS.md에 반영
- commit prefix는 `Init`, `Feat`, `Fix`, `Refactor`, `Style`, `Docs`, `Chore`, `Remove` 형태로 정리
- branch flow는 `main -> dev -> feature/*` 기준으로 정리
- Gemini Code Assist용 `.gemini/config.yaml`, `.gemini/styleguide.md` 구성
- 한국어 작성 규칙과 코드 컨벤션 준수 규칙 문서화

## 3단계: EC2 배포와 CI/CD

- GitHub Actions에서 Docker image build
- release artifact를 S3에 업로드
- SSM Run Command로 EC2 배포
- Amazon Linux EC2에서 Docker container 실행
- Nginx container로 web/api reverse proxy 구성
- `main` push 기준 deploy workflow 구성

배운 점:

- SSH 배포보다 SSM 배포가 운영적으로 안전합니다.
- EC2 role에는 `AmazonSSMManagedInstanceCore`가 필요합니다.
- GitHub Actions role에는 `ssm:SendCommand`, `ssm:GetCommandInvocation`, S3 artifact 권한이 필요합니다.

## 4단계: RDS와 S3 저장 기반

- API를 Fastify 기반으로 전환
- Drizzle ORM과 PostgreSQL 연결 추가
- `GET /health/db` 추가
- 프로젝트 생성/조회 API 추가
- 아키텍처 JSON 저장 API 추가
- S3 presigned upload API 추가
- RDS dedicated DB/user 구성
- 수동 migration workflow 구성
- S3 CORS 설정 파일 추가

저장 기준:

- RDS: 프로젝트, 아키텍처 JSON, 배포 이력, 비용 정보
- S3: PNG/SVG, Terraform 파일, export zip, 썸네일

## 5단계: HTTPS와 모니터링 준비

- Route 53 도메인 `sketchcatch.net` 기준 HTTPS 계획 수립
- ALB + ACM + Route 53 CloudFormation 템플릿 추가
- Provision HTTPS workflow 추가
- CloudWatch/SNS alarm workflow 추가
- EC2 runtime CloudWatch Logs 권한 템플릿 추가
- GitHub Actions deploy role policy 템플릿 정리

보안그룹 정리 방향:

- ALB security group: public `80`, `443` 허용
- EC2 security group: `80`은 ALB security group에서만 허용
- EC2 SSH `22`는 개인 IP에서만 허용하거나 이후 제거

## 현재 남은 운영 체크

- `https://sketchcatch.net` 실제 접속 확인
- ALB target group health 확인
- EC2 public `0.0.0.0/0:80` 제거 확인
- SNS 이메일 구독 확인
- CloudWatch Logs 활성화 후 로그 그룹 확인
- IAM 권한을 실제 ARN 기준으로 더 줄이기
- branch protection으로 main 직접 push 방지

## 협업 원칙

Codex는 빠르게 파일과 워크플로를 만들 수 있지만, AWS 비용/권한/배포 관련 판단은 사람이 최종 확인해야 합니다. 특히 DB 비밀번호, AWS key, SSH private key는 대화나 문서에 남기지 않습니다.
