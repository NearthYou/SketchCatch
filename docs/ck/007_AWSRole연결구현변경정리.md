# AWS Role 연결 구현 변경 정리

## 0. 이 문서의 책임

이 문서는 AWS Role 연결 준비 기능을 구현하면서 **테스트 파일을 제외하고** 어떤 파일이 바뀌었는지, 어디에서 확인하면 되는지 정리한다.

현재 구현 범위는 실제 AWS 연결 검증이나 Terraform 실행이 아니다. 사용자가 IAM Role trust policy를 만들 수 있도록 SketchCatch가 `callerPrincipalArn`, 서버 생성 `externalId`, `trustPolicyTemplate`을 발급하고, 이를 `aws_connections`에 `pending` 상태로 저장하는 단계다.

## 1. 한 줄 요약

Access Key를 받거나 저장하는 방식이 아니라, Role Assume + SketchCatch 생성 External ID 방식으로 AWS 연결 준비값을 발급하는 API와 DB 모델이 추가됐다.

```text
POST /api/projects/:projectId/aws-connections
-> project 소유자 확인
-> externalId 서버 생성
-> aws_connections에 pending 저장
-> callerPrincipalArn, externalId, recommendedRoleName, trustPolicyTemplate 응답
```

## 2. 새로 생긴 API 동작

| 항목 | 내용 |
| --- | --- |
| API | `POST /api/projects/:projectId/aws-connections` |
| 요청 body | `{ "region": "ap-northeast-2" }` |
| 인증 | Bearer access token 필요 |
| 저장 상태 | `status = "pending"` |
| 실제 AWS 호출 | 없음 |
| Terraform 실행 | 없음 |
| 응답 핵심값 | `awsConnection.externalId`, `callerPrincipalArn`, `recommendedRoleName`, `trustPolicyTemplate` |

확인 위치:

| 확인할 것 | 파일 |
| --- | --- |
| route 등록 | `apps/api/src/app.ts` |
| request params/body 검증, 인증, 응답 처리 | `apps/api/src/routes/aws-connections.ts` |
| externalId 생성, DB 저장, trust policy template 생성 | `apps/api/src/aws-connections/aws-connection-service.ts` |
| frontend API helper | `apps/web/features/workspace/api.ts` |

## 3. DB 변경

새 테이블 `aws_connections`와 enum `aws_connection_status`가 추가됐다.

| 항목 | 내용 |
| --- | --- |
| enum | `aws_connection_status`: `pending`, `verified`, `failed` |
| table | `aws_connections` |
| 핵심 저장값 | `project_id`, `user_id`, `external_id`, `region`, `status` |
| 검증 후 저장 예정값 | `account_id`, `role_arn`, `last_verified_at` |
| 저장하지 않는 값 | Access Key ID, Secret Access Key, session token |

확인 위치:

| 확인할 것 | 파일 |
| --- | --- |
| Drizzle schema | `apps/api/src/db/schema.ts` |
| migration SQL | `apps/api/drizzle/0008_cloudy_warhawk.sql` |
| Drizzle snapshot | `apps/api/drizzle/meta/0008_snapshot.json` |
| migration journal | `apps/api/drizzle/meta/_journal.json` |

## 4. 환경 변수 변경

SketchCatch가 사용자 AWS 계정의 IAM Role을 assume할 때 신뢰 대상이 되는 caller principal ARN을 환경 변수로 받는다.

```env
SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN=arn:aws:iam::<SKETCHCATCH_ACCOUNT_ID>:role/SketchCatchRuntimeRole
```

확인 위치:

| 확인할 것 | 파일 |
| --- | --- |
| 예시 env | `.env.example` |
| runtime env 타입과 require helper | `apps/api/src/config/env.ts` |
| 개발 문서 env 목록 | `docs/development.md` |

## 5. Shared Type 변경

프론트와 API가 같은 계약을 쓰도록 AWS 연결 타입이 추가됐다.

| 타입 | 용도 |
| --- | --- |
| `AwsConnectionStatus` | `pending`, `verified`, `failed` 상태 표현 |
| `AwsConnection` | DB/API에서 쓰는 AWS 연결 metadata |
| `CreateAwsConnectionRequest` | pending 연결 생성 요청 |
| `CreateAwsConnectionResponse` | Role 설정값 발급 응답 |

확인 위치:

| 확인할 것 | 파일 |
| --- | --- |
| shared type export | `packages/types/src/index.ts` |
| 데이터 모델 설명 | `docs/data-models.md` |

## 6. 프론트엔드 변경

아직 화면 패널은 붙이지 않았다. 대신 UI가 나중에 버튼이나 설정 패널에서 바로 호출할 수 있도록 API helper만 추가했다.

| 함수 | 용도 |
| --- | --- |
| `createAwsConnectionSetup` | `/projects/:projectId/aws-connections`에 `region`을 보내고 Role 설정값 응답을 받는다 |

확인 위치:

| 확인할 것 | 파일 |
| --- | --- |
| API helper | `apps/web/features/workspace/api.ts` |

## 7. 문서 변경

기존 배포 문서에서 Access Key 또는 일회성 credential 방식처럼 읽히던 부분을 Role Assume + 서버 생성 External ID 흐름으로 맞췄다.

| 문서 | 변경 내용 |
| --- | --- |
| `docs/architecture.md` | 현재 구현된 API 목록에 AWS 연결 생성 API 추가 |
| `docs/data-models.md` | `AwsConnection` 모델과 pending/verified 흐름 정리 |
| `docs/development.md` | `SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN` env 추가 |
| `docs/ck/001_배포실행파트구현계획.md` | 체크리스트를 pending 연결 생성과 STS 검증으로 분리 |
| `docs/ck/002_배포실행파트개념과구현흐름정리.md` | Access Key 저장이 아닌 Role Assume + External ID 흐름으로 설명 |
| `docs/ck/003_배포파트의존성정리.md` | YS/UI 입력을 AWS key가 아니라 Role 설정값 표시와 `roleArn` 입력으로 정리 |
| `docs/ck/004_배포파트결정사항초안.md` | AWS 연결 방식 결정을 Role Assume + External ID로 확정 |
| `docs/ck/005_배포파트구현순서.md` | 구현 순서를 `apps/api/src/aws-connections/*` 중심으로 수정 |
| `docs/ck/006_실제배포실행구현순서.md` | 실제 apply 전 AWS Role setup/verify 단계를 분리 |

## 8. 아직 구현하지 않은 것

아래는 다음 단계로 남아 있다.

| 남은 일 | 설명 |
| --- | --- |
| Role 검증 API | 사용자가 만든 `roleArn`을 받아 `sts:AssumeRole`과 `GetCallerIdentity`를 실행 |
| verified 상태 저장 | 검증 성공 시 `accountId`, `roleArn`, `lastVerifiedAt`, `status = "verified"` 저장 |
| AWS SDK STS 연결 | 현재는 S3 SDK만 있고 STS 호출 구현은 아직 없음 |
| Terraform plan/apply 연결 | verified AWS 연결을 plan/apply 안전 게이트에 연결 |
| UI 패널 | Role 설정값 표시, 복사, `roleArn` 입력, 검증 결과 표시 |

## 9. 안전 경계

- 사용자의 Access Key ID, Secret Access Key, session token은 받거나 저장하지 않는다.
- 현재 API는 AWS 리소스를 생성, 수정, 삭제하지 않는다.
- 현재 API는 Terraform CLI를 실행하지 않는다.
- 프론트엔드는 AWS SDK를 호출하지 않는다.
- `externalId`는 사용자가 만드는 값이 아니라 SketchCatch가 connection 단위로 생성한다.
