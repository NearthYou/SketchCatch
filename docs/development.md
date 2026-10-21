# 개발 방법

Node.js와 Docker, 저장소에 지정된 `pnpm@11.8.0`이 필요합니다. Web은 `3000`, API는 `4000` 포트를 사용합니다.

## 로컬 실행

저장소 루트에서 실행합니다.

```bash
pnpm install
cp .env.example .env
docker compose -f infra/local/docker-compose.yml up -d
pnpm --filter @sketchcatch/api db:migrate
pnpm dev
```

`.env`의 `DATABASE_URL`을 로컬 PostgreSQL에 맞춥니다. 환경 변수는 [예시 파일](../.env.example)을 기준으로 설정합니다. API 상태는 `http://localhost:4000/health`에서 확인합니다.

프로젝트 이미지와 Terraform 파일은 개발 및 테스트에서 기본적으로 로컬 파일 시스템에 저장합니다. S3 동작을 확인할 때만 `PROJECT_ASSET_STORAGE_BACKEND=s3`와 `S3_BUCKET_NAME`을 설정합니다. 운영 환경은 S3를 요구합니다.

## 코드 위치

| 경로 | 작업 |
| --- | --- |
| `apps/web` | 화면과 브라우저 상태 |
| `apps/api` | 요청 검증과 기능 처리, DB 및 AWS 연동 |
| `packages/types` | 앱과 API가 공유하는 타입 |
| `packages/ui` | 공통 화면 컴포넌트 |
| `infra`, `deploy`, `.github` | 인프라와 배포 설정 |

화면에서 Terraform이나 AWS SDK를 직접 실행하지 않습니다. 코드 식별자와 API 경로, 상태 이름은 기존 [데이터 모델](data-models.md)과 공유 타입에 맞춥니다.

## 작업과 검증

작업 시작과 종료에 하네스를 확인합니다. 기능 변경은 필요한 타입과 API 검증을 먼저 맞춘 뒤 화면에 연결합니다.

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

`pnpm test`에는 앱 테스트와 배포 sandbox 검사, Terraform 검사가 포함됩니다. 테스트 실행 자체를 실제 AWS 배포 승인으로 취급하지 않습니다. 문서만 수정한 경우에는 하네스와 링크 검사를 확인합니다.

## 팀 작업

1. 담당 기능의 입력과 출력, 사용할 ID 및 상태 이름을 확인합니다.
2. 공유 타입과 API 검증에 없는 필드나 상태를 임의로 만들지 않습니다.
3. AI가 만든 코드도 같은 기준으로 검토합니다. 다른 담당자의 파일과 작업 범위를 지킵니다.
4. 기능 연결 전에 실제 요청과 응답이 맞는지 확인합니다. 임시 응답을 실제 구현 결과처럼 기록하지 않습니다.

## Git과 PR

일반 기능 작업은 `dev`에서 분기하고 PR로 `dev`에 합칩니다. 운영 반영은 검증한 범위만 `main`으로 병합합니다. `main`과 `dev`에 직접 푸시하지 않습니다.

PR에는 변경 이유와 동작, 검증 결과를 적습니다. 다른 담당자에게 영향을 주는 타입이나 DB 변경도 함께 설명합니다. `.env`와 AWS 자격 증명, 비밀번호는 커밋하지 않습니다.

DB 마이그레이션은 번호 충돌을 피하도록 작업 전에 최신 번호와 변경 범위를 공유합니다. 운영 적용은 별도 [배포 절차](deployment.md)를 따릅니다.
