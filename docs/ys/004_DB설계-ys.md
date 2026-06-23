# 플랫폼/품질 데이터베이스 설계

## 문서 목적

이 문서는 `5번: 플랫폼/품질 -> ys` 담당 범위에서 필요한 DB 설계를 정리한다.

포함 범위:

- 로그인
- 회원가입
- JWT 인증
- 내 프로젝트 목록
- 프로젝트 확인 보드
- 템플릿 등록/수정/삭제/공유/찜
- 활동 내역
- 팝업 알림 UI 정책을 위한 최소 데이터

제외 범위:

- 배포 실행
- AWS 계정 연결
- Terraform Apply
- 배포 로그
- 생성 리소스 저장
- 비용 관리
- 저장형 notification 테이블
- AI 분석 전체 저장 테이블

## 공통 규칙

- PostgreSQL 컬럼은 `snake_case`를 사용한다.
- API와 프론트 타입은 `camelCase`를 사용한다.
- 날짜 컬럼은 `timestamp with time zone`을 사용한다.
- 민감값 원문은 저장하지 않는다.
- refresh token, reset token, 이메일 인증번호는 hash로 저장한다.
- 프로젝트 원천 데이터와 아키텍처 JSON은 RDS에 저장한다.
- 이미지, Terraform 파일, export zip, 썸네일은 S3에 저장하고 DB에는 metadata와 `object_key`만 저장한다.

## 전체 테이블 목록

## 기존 활용 테이블

| 테이블 | 용도 | 처리 |
| --- | --- | --- |
| `anonymous_workspaces` | 로그인 전 익명 작업 공간 | 유지 |
| `projects` | 프로젝트 기본 정보 | `user_id` nullable 추가 |
| `architectures` | 아키텍처 snapshot | 유지 |
| `project_assets` | S3 asset metadata | 유지 |

## 신규 테이블

| 테이블 | 용도 |
| --- | --- |
| `users` | 회원 계정 |
| `oauth_accounts` | Kakao/Naver 계정 연결 |
| `email_verifications` | 이메일 인증 |
| `refresh_tokens` | JWT refresh session |
| `password_reset_tokens` | 비밀번호 재설정 |
| `login_attempts` | 로그인 실패/제한 |
| `templates` | 템플릿 기본 정보 |
| `template_versions` | 템플릿 아키텍처 버전 |
| `template_favorites` | 템플릿 찜 |
| `template_share_links` | 링크 공유 token |
| `activities` | 활동 내역 |

## 만들지 않는 테이블

| 테이블 | 제외 이유 |
| --- | --- |
| `notifications` | MVP에서는 저장형 알림을 만들지 않고 Toast/Warning UI로 처리한다. |
| `deployments` | 배포 실행은 후속 단계다. |
| `deployment_logs` | 배포 로그는 후속 단계다. |
| `deployed_resources` | 생성 리소스 저장은 후속 단계다. |
| `aws_credentials` | AWS 계정 연결은 후속 단계다. |
| `ai_analysis_results` | AI 결과 전체 저장은 MVP 범위를 넓힌다. dashboard에서 optional 응답으로 소비한다. |

## 1. users

회원 계정 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | user id |
| `username` | `varchar(30)` | unique, not null | 로그인 아이디 |
| `email` | `varchar(255)` | unique, not null | 이메일 |
| `password_hash` | `text` | nullable | OAuth-only 계정은 null 가능 |
| `nickname` | `varchar(80)` | not null | 서비스 표시 이름 |
| `role` | `varchar(30)` | not null, default `USER` | `USER`, `ADMIN`, 향후 `TEAM_ADMIN` |
| `email_verified_at` | `timestamptz` | nullable | 이메일 인증 완료 시각 |
| `terms_agreed_at` | `timestamptz` | not null | 약관 동의 시각 |
| `privacy_agreed_at` | `timestamptz` | not null | 개인정보 수집 동의 시각 |
| `marketing_agreed_at` | `timestamptz` | nullable | 마케팅 수신 동의 시각 |
| `created_at` | `timestamptz` | not null | 생성 시각 |
| `updated_at` | `timestamptz` | not null | 수정 시각 |
| `deleted_at` | `timestamptz` | nullable | 탈퇴 또는 soft delete |

인덱스:

- unique index: `users.username`
- unique index: `users.email`
- index: `users.deleted_at`

정책:

- shared type의 `User`에는 `password_hash`를 노출하지 않는다.
- OAuth-only 계정은 `password_hash`가 null일 수 있다.
- 마지막 로그인 수단을 제거할 수 없게 API에서 막는다.

## 2. oauth_accounts

Kakao/Naver OAuth 계정 연결 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | OAuth account id |
| `user_id` | `varchar(36)` | FK users.id, not null | 연결된 사용자 |
| `provider` | `varchar(30)` | not null | `kakao`, `naver` |
| `provider_user_id` | `varchar(255)` | not null | provider의 사용자 id |
| `provider_email` | `varchar(255)` | nullable | provider에서 받은 이메일 |
| `provider_email_verified` | `boolean` | not null, default false | provider 이메일 검증 여부 |
| `created_at` | `timestamptz` | not null | 연결 시각 |
| `updated_at` | `timestamptz` | not null | 수정 시각 |

인덱스:

- unique index: `(provider, provider_user_id)`
- index: `oauth_accounts.user_id`
- index: `oauth_accounts.provider_email`

정책:

- 같은 provider 계정은 하나의 user에만 연결된다.
- 기존 이메일과 OAuth 이메일이 같으면 계정 연결을 제안한다.

## 3. email_verifications

이메일 인증번호 발송/확인 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | 인증 요청 id |
| `email` | `varchar(255)` | not null | 인증 대상 이메일 |
| `purpose` | `varchar(40)` | not null | `signup`, `password_reset` |
| `code_hash` | `text` | not null | 인증번호 hash |
| `attempt_count` | `integer` | not null, default 0 | 확인 실패 횟수 |
| `expires_at` | `timestamptz` | not null | 만료 시각 |
| `verified_at` | `timestamptz` | nullable | 인증 완료 시각 |
| `created_at` | `timestamptz` | not null | 생성 시각 |

인덱스:

- index: `(email, purpose)`
- index: `expires_at`

정책:

- 인증번호 원문은 저장하지 않는다.
- 재전송 제한은 API에서 처리한다.
- 만료된 인증번호는 사용할 수 없다.

## 4. refresh_tokens

JWT refresh session 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | refresh session id |
| `user_id` | `varchar(36)` | FK users.id, not null | 사용자 |
| `token_hash` | `text` | not null | refresh token hash |
| `family_id` | `varchar(36)` | not null | rotation 계열 id |
| `user_agent` | `text` | nullable | 접속 기기 정보 |
| `ip_address` | `varchar(64)` | nullable | 접속 IP |
| `expires_at` | `timestamptz` | not null | 만료 시각 |
| `revoked_at` | `timestamptz` | nullable | 폐기 시각 |
| `created_at` | `timestamptz` | not null | 생성 시각 |
| `last_used_at` | `timestamptz` | nullable | 마지막 사용 시각 |

인덱스:

- index: `refresh_tokens.user_id`
- index: `refresh_tokens.family_id`
- index: `refresh_tokens.expires_at`
- unique index: `refresh_tokens.token_hash`

정책:

- refresh token 원문은 저장하지 않는다.
- token 재발급 시 rotation을 적용한다.
- 로그아웃 시 해당 token을 폐기한다.
- 모든 기기 로그아웃 시 사용자의 모든 active token을 폐기한다.

## 5. password_reset_tokens

비밀번호 재설정 token 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | reset token id |
| `user_id` | `varchar(36)` | FK users.id, not null | 사용자 |
| `token_hash` | `text` | not null | reset token hash |
| `expires_at` | `timestamptz` | not null | 만료 시각 |
| `used_at` | `timestamptz` | nullable | 사용 시각 |
| `created_at` | `timestamptz` | not null | 생성 시각 |

인덱스:

- unique index: `password_reset_tokens.token_hash`
- index: `password_reset_tokens.user_id`
- index: `password_reset_tokens.expires_at`

정책:

- reset token 원문은 저장하지 않는다.
- 한 번 사용한 token은 재사용할 수 없다.

## 6. login_attempts

로그인 실패 제한 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | 시도 id |
| `username` | `varchar(30)` | nullable | 입력한 아이디 |
| `ip_address` | `varchar(64)` | nullable | 요청 IP |
| `failed_count` | `integer` | not null, default 0 | 실패 횟수 |
| `locked_until` | `timestamptz` | nullable | 제한 해제 시각 |
| `last_failed_at` | `timestamptz` | nullable | 마지막 실패 시각 |
| `created_at` | `timestamptz` | not null | 생성 시각 |
| `updated_at` | `timestamptz` | not null | 수정 시각 |

인덱스:

- index: `login_attempts.username`
- index: `login_attempts.ip_address`
- index: `login_attempts.locked_until`

정책:

- 5회 실패 시 아이디/비밀번호 찾기 안내를 띄울 수 있게 한다.
- 과도한 로그인 시도는 일정 시간 제한한다.

## 7. projects 변경

기존 `projects` 테이블에 `user_id`를 추가한다.

추가 컬럼:

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `user_id` | `varchar(36)` | FK users.id, nullable | 로그인 사용자 소유자 |

기존 `workspace_id` 정책:

- 익명 프로젝트는 `workspace_id`로 소유자를 확인한다.
- 로그인 후 가져온 프로젝트는 `user_id`를 채운다.
- 초기에는 `workspace_id`를 유지해 익명 프로젝트와 호환한다.

인덱스:

- index: `projects.user_id`
- index: `projects.workspace_id`
- index: `projects.updated_at`

조회 기준:

- 로그인 사용자는 `user_id = currentUser.id`
- 익명 사용자는 `workspace_id = X-Workspace-Id`

## 8. templates

템플릿 기본 정보 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | template id |
| `owner_user_id` | `varchar(36)` | FK users.id, not null | 작성자 |
| `source_project_id` | `varchar(36)` | FK projects.id, nullable | 원본 프로젝트 |
| `source_architecture_id` | `varchar(36)` | FK architectures.id, nullable | 원본 아키텍처 |
| `title` | `varchar(120)` | not null | 제목 |
| `description` | `text` | not null | 설명 |
| `category` | `varchar(60)` | not null | 카테고리 |
| `difficulty` | `varchar(30)` | not null | `beginner`, `intermediate`, `advanced` |
| `visibility` | `varchar(30)` | not null | `private`, `link`, `public` |
| `thumbnail_asset_id` | `varchar(36)` | FK project_assets.id, nullable | 썸네일 asset |
| `resource_types` | `jsonb` | not null | 포함 리소스 타입 목록 |
| `favorite_count` | `integer` | not null, default 0 | 찜 수 |
| `use_count` | `integer` | not null, default 0 | 프로젝트 생성에 사용된 횟수 |
| `current_version_id` | `varchar(36)` | nullable | 현재 버전 |
| `created_at` | `timestamptz` | not null | 생성 시각 |
| `updated_at` | `timestamptz` | not null | 수정 시각 |
| `deleted_at` | `timestamptz` | nullable | soft delete |

인덱스:

- index: `templates.owner_user_id`
- index: `templates.visibility`
- index: `templates.category`
- index: `templates.difficulty`
- index: `templates.deleted_at`
- index: `templates.updated_at`

정책:

- 템플릿 등록은 로그인 사용자만 가능하다.
- 작성자만 수정/삭제할 수 있다.
- 공개 템플릿 삭제는 soft delete를 기본으로 한다.
- 공개 상태 변경은 API에서 권한을 다시 검증한다.

## 9. template_versions

템플릿 아키텍처 버전 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | version id |
| `template_id` | `varchar(36)` | FK templates.id, not null | 템플릿 |
| `version` | `integer` | not null | 버전 번호 |
| `architecture_json` | `jsonb` | not null | snapshot된 ArchitectureJson |
| `change_note` | `text` | nullable | 수정 메모 |
| `created_by_user_id` | `varchar(36)` | FK users.id, not null | 수정자 |
| `created_at` | `timestamptz` | not null | 생성 시각 |

인덱스:

- unique index: `(template_id, version)`
- index: `template_versions.template_id`
- index: `template_versions.created_at`

정책:

- 템플릿 수정 시 기존 복제 프로젝트에 영향을 주지 않는다.
- 아키텍처가 바뀌면 새 version을 만든다.

## 10. template_favorites

템플릿 찜 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | favorite id |
| `template_id` | `varchar(36)` | FK templates.id, not null | 템플릿 |
| `user_id` | `varchar(36)` | FK users.id, not null | 사용자 |
| `created_at` | `timestamptz` | not null | 찜한 시각 |

인덱스:

- unique index: `(template_id, user_id)`
- index: `template_favorites.user_id`
- index: `template_favorites.template_id`

정책:

- 같은 사용자가 같은 템플릿을 중복 찜할 수 없다.
- 찜 생성/삭제 시 `templates.favorite_count`를 갱신한다.

## 11. template_share_links

템플릿 링크 공유 token 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | share link id |
| `template_id` | `varchar(36)` | FK templates.id, not null | 템플릿 |
| `token_hash` | `text` | not null | 공유 token hash |
| `created_by_user_id` | `varchar(36)` | FK users.id, not null | 생성자 |
| `expires_at` | `timestamptz` | nullable | 만료 시각 |
| `revoked_at` | `timestamptz` | nullable | 폐기 시각 |
| `created_at` | `timestamptz` | not null | 생성 시각 |

인덱스:

- unique index: `template_share_links.token_hash`
- index: `template_share_links.template_id`
- index: `template_share_links.expires_at`

정책:

- 공유 token 원문은 저장하지 않는다.
- `visibility = link`인 템플릿만 링크 접근을 허용한다.
- 작성자만 공유 링크를 만들거나 폐기할 수 있다.

## 12. activities

활동 내역 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `varchar(36)` | PK | activity id |
| `user_id` | `varchar(36)` | FK users.id, nullable | 로그인 사용자 |
| `workspace_id` | `varchar(128)` | FK anonymous_workspaces.id, nullable | 익명 사용자 |
| `project_id` | `varchar(36)` | FK projects.id, nullable | 관련 프로젝트 |
| `template_id` | `varchar(36)` | FK templates.id, nullable | 관련 템플릿 |
| `event_name` | `varchar(80)` | not null | 이벤트 이름 |
| `message` | `text` | not null | 사용자에게 보여줄 문장 |
| `metadata` | `jsonb` | nullable | 민감값 없는 부가 정보 |
| `created_at` | `timestamptz` | not null | 생성 시각 |

인덱스:

- index: `(user_id, created_at)`
- index: `(workspace_id, created_at)`
- index: `activities.project_id`
- index: `activities.template_id`
- index: `activities.event_name`

기록할 event:

| eventName | 설명 |
| --- | --- |
| `project.created` | 프로젝트 생성 |
| `project.updated` | 프로젝트 수정 |
| `project.deleted` | 프로젝트 삭제 |
| `project.architecture_saved` | 아키텍처 저장 |
| `project.terraform_exported` | Terraform export |
| `template.created` | 템플릿 등록 |
| `template.updated` | 템플릿 수정 |
| `template.shared` | 템플릿 공유 상태 변경 |
| `template.deleted` | 템플릿 삭제 |
| `ai.architecture_draft_created` | AI 아키텍처 초안 생성 |
| `ai.architecture_review_completed` | AI 아키텍처 검토 완료 |
| `ai.architecture_review_failed` | AI 아키텍처 검토 실패 |

기록하지 않는 것:

- 모든 AI 요청
- 리소스 설명 조회
- UI 클릭
- Toast 표시
- token 원문
- 비밀번호
- 민감한 설정값

## 13. 관계 요약

```text
users 1 - N oauth_accounts
users 1 - N refresh_tokens
users 1 - N password_reset_tokens
users 1 - N projects
users 1 - N templates
users 1 - N template_favorites

anonymous_workspaces 1 - N projects
projects 1 - N architectures
projects 1 - N project_assets
projects 1 - N activities

templates 1 - N template_versions
templates 1 - N template_favorites
templates 1 - N template_share_links
templates 1 - N activities
```

## 14. API 응답 타입과 DB 컬럼 매핑

| DB 컬럼 | API 필드 |
| --- | --- |
| `user_id` | `userId` |
| `workspace_id` | `workspaceId` |
| `project_id` | `projectId` |
| `template_id` | `templateId` |
| `architecture_json` | `architectureJson` |
| `object_key` | `objectKey` |
| `event_name` | `eventName` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |

## 15. 구현 순서

1. `users`, `oauth_accounts`, `email_verifications` 추가
2. `refresh_tokens`, `password_reset_tokens`, `login_attempts` 추가
3. `projects.user_id` nullable 추가
4. `templates`, `template_versions` 추가
5. `template_favorites`, `template_share_links` 추가
6. `activities` 추가
7. API DTO/Zod schema와 shared type 정렬
8. 화면 연동 후 권한 검증 테스트

## 16. 검증 기준

- `projects.user_id`가 nullable이라 익명 프로젝트가 깨지지 않는다.
- 로그인 사용자는 `user_id` 기준으로만 프로젝트를 조회한다.
- 익명 사용자는 `workspace_id` 기준으로만 프로젝트를 조회한다.
- refresh token 원문이 DB에 저장되지 않는다.
- 이메일 인증번호 원문이 DB에 저장되지 않는다.
- reset token 원문이 DB에 저장되지 않는다.
- 템플릿 찜은 중복 저장되지 않는다.
- 템플릿 수정 시 version이 분리된다.
- 활동 내역에는 중요한 이벤트만 저장된다.
- 저장형 notification 테이블이 없다.
