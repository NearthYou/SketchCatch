# 플랫폼/품질 백엔드 API 명세

## 문서 목적

이 문서는 `5번: 플랫폼/품질 -> ys` 파트에서 필요한 백엔드 API 계약을 정리한다.

대상 독자:

- ys: 플랫폼/품질 구현 담당
- gg: gg AI 분석 파트 담당
- jh: 설계 보드 담당
- sw: Terraform 변환 담당

이번 명세에서 제외하는 API:

- 배포 실행 API
- AWS 계정 연결 API
- Terraform Apply API
- 배포 로그 API
- 생성 리소스 저장 API
- 비용 관리 API
- 저장형 notification API

## 공통 규칙

## Base URL

```text
/api
```

## 인증 방식

```http
Authorization: Bearer <accessToken>
```

판별 기준:

- 프로젝트, 아키텍처, asset, 템플릿 수정, 활동 내역 API는 로그인 사용자를 기준으로 동작한다.
- `Authorization`이 없거나 token이 만료되면 `401 unauthorized`를 반환한다.
- 프로젝트 권한은 항상 `project.user_id = currentUser.id` 조건으로 확인한다.
- `X-Workspace-Id`, `clientGeneratedWorkspaceId`, 익명 프로젝트 가져오기 API는 사용하지 않는다.

## 공통 에러 응답

```json
{
  "error": "bad_request",
  "message": "요청 값이 올바르지 않습니다."
}
```

대표 error code:

| HTTP status | error | 의미 |
| --- | --- | --- |
| 400 | `bad_request` | 요청 형식 또는 validation 실패 |
| 401 | `unauthorized` | 로그인 필요 또는 token 만료 |
| 403 | `forbidden` | 권한 없음 |
| 404 | `not_found` | 대상 없음 |
| 409 | `conflict` | 중복 또는 상태 충돌 |
| 429 | `too_many_requests` | 너무 많은 요청 |
| 500 | `internal_server_error` | 서버 오류 |

## 1. 인증 API

## 1.1 아이디 중복 확인

```http
GET /api/auth/check-username?username=user
```

응답:

```json
{
  "available": true
}
```

검증:

- `username`은 4자 이상 30자 이하
- 영문, 숫자, `_`, `-`만 허용
- 이미 존재하면 `available: false`

## 1.2 이메일 인증번호 발송

```http
POST /api/auth/email-verifications
```

요청:

```json
{
  "email": "user@example.com",
  "purpose": "signup"
}
```

응답:

```json
{
  "verificationId": "email_verification_id",
  "expiresInSeconds": 600
}
```

검증:

- `purpose`는 `signup`, `password_reset` 중 하나
- 재전송은 일정 시간 제한
- 인증번호 원문은 DB에 저장하지 않고 hash만 저장

## 1.3 이메일 인증번호 확인

```http
POST /api/auth/email-verifications/confirm
```

요청:

```json
{
  "verificationId": "email_verification_id",
  "code": "123456"
}
```

응답:

```json
{
  "verified": true,
  "emailVerificationToken": "short_lived_token"
}
```

## 1.4 회원가입

```http
POST /api/auth/signup
```

요청:

```json
{
  "username": "user",
  "password": "Password!123",
  "email": "user@example.com",
  "emailVerificationToken": "short_lived_token",
  "nickname": "ys",
  "termsAgreed": true,
  "privacyAgreed": true,
  "marketingAgreed": false
}
```

응답:

```json
{
  "user": {
    "id": "user_id",
    "username": "user",
    "email": "user@example.com",
    "nickname": "ys",
    "role": "USER",
    "createdAt": "2026-06-23T00:00:00.000Z"
  },
  "tokens": {
    "accessToken": "access_token",
    "refreshToken": "refresh_token",
    "expiresInSeconds": 900
  }
}
```

검증:

- `username` 중복 불가
- `email` 중복 불가
- `password`는 서버에서 최종 검증
- `termsAgreed`, `privacyAgreed`는 반드시 `true`
- `marketingAgreed`는 선택

## 1.5 로그인

```http
POST /api/auth/login
```

요청:

```json
{
  "username": "user",
  "password": "Password!123"
}
```

응답:

```json
{
  "user": {
    "id": "user_id",
    "username": "user",
    "email": "user@example.com",
    "nickname": "ys",
    "role": "USER"
  },
  "tokens": {
    "accessToken": "access_token",
    "refreshToken": "refresh_token",
    "expiresInSeconds": 900
  }
}
```

에러:

- 아이디/비밀번호 오류는 과한 계정 존재 여부를 노출하지 않는다.
- 5회 실패 시 아이디/비밀번호 찾기 안내를 표시할 수 있는 code를 내려준다.
- 과도한 시도는 `429 too_many_requests`로 제한한다.

## 1.6 OAuth 로그인 시작

```http
GET /api/auth/oauth/kakao/start
GET /api/auth/oauth/naver/start
```

응답:

```json
{
  "authorizationUrl": "https://provider.example/oauth..."
}
```

## 1.7 OAuth callback

```http
GET /api/auth/oauth/kakao/callback?code=...
GET /api/auth/oauth/naver/callback?code=...
```

응답:

```json
{
  "user": {
    "id": "user_id",
    "username": "user",
    "email": "user@example.com",
    "nickname": "ys",
    "role": "USER"
  },
  "tokens": {
    "accessToken": "access_token",
    "refreshToken": "refresh_token",
    "expiresInSeconds": 900
  },
  "accountLinkRequired": false
}
```

처리 기준:

- OAuth 이메일이 기존 계정과 같으면 계정 연결을 제안한다.
- OAuth 이메일이 없거나 검증되지 않았으면 추가 이메일 입력을 요구한다.
- 같은 사용자가 일반 가입 후 Kakao/Naver를 붙일 수 있어야 한다.

## 1.8 Token 재발급

```http
POST /api/auth/refresh
```

요청:

```json
{
  "refreshToken": "refresh_token"
}
```

응답:

```json
{
  "accessToken": "new_access_token",
  "refreshToken": "new_refresh_token",
  "expiresInSeconds": 900
}
```

기준:

- refresh token rotation을 적용한다.
- 기존 refresh token은 재발급 후 폐기한다.
- DB에는 refresh token hash만 저장한다.

## 1.9 로그아웃

```http
POST /api/auth/logout
```

요청:

```json
{
  "refreshToken": "refresh_token"
}
```

응답:

```json
{
  "ok": true
}
```

## 1.10 모든 기기에서 로그아웃

```http
POST /api/auth/logout-all
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "revokedSessionCount": 3
}
```

## 1.11 내 정보 조회

```http
GET /api/auth/me
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "user": {
    "id": "user_id",
    "username": "user",
    "email": "user@example.com",
    "nickname": "ys",
    "role": "USER",
    "createdAt": "2026-06-23T00:00:00.000Z"
  }
}
```

## 1.12 비밀번호 찾기

```http
POST /api/auth/password-reset/request
```

요청:

```json
{
  "username": "user",
  "email": "user@example.com"
}
```

응답:

```json
{
  "ok": true
}
```

보안 기준:

- 계정 존재 여부를 응답으로 과하게 노출하지 않는다.
- 이메일로 비밀번호 변경 화면 링크를 보낸다.
- reset token 원문은 DB에 저장하지 않는다.

## 1.13 비밀번호 변경

```http
POST /api/auth/password-reset/confirm
```

요청:

```json
{
  "resetToken": "reset_token",
  "newPassword": "NewPassword!123"
}
```

응답:

```json
{
  "ok": true
}
```

## 1.14 아이디 찾기

```http
POST /api/auth/username-recovery
```

요청:

```json
{
  "email": "user@example.com"
}
```

응답:

```json
{
  "ok": true
}
```

기준:

- 회원가입 시 사용한 이메일로 아이디를 보낸다.
- 화면 응답에서 아이디를 직접 노출하지 않는다.

## 2. 프로젝트 API

## 2.1 내 프로젝트 목록

```http
GET /api/projects
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "projects": [
    {
      "id": "project_id",
      "name": "AWS VPC 실습",
      "description": "VPC, EC2, RDS를 연결한 기본 구조",
      "thumbnailAsset": {
        "id": "asset_id",
        "objectKey": "projects/project_id/assets/thumbnail/file.png",
        "contentType": "image/png"
      },
      "resourceCount": 4,
      "latestArchitectureVersion": 3,
      "hasTerraformExport": true,
      "createdAt": "2026-06-23T00:00:00.000Z",
      "updatedAt": "2026-06-23T00:00:00.000Z"
    }
  ]
}
```

목록 API에 넣지 않는 것:

- AI 상세 요약
- AI finding 목록
- AI checklist
- 저장형 알림
- 배포 실행 정보

## 2.2 프로젝트 생성

```http
POST /api/projects
Authorization: Bearer <accessToken>
```

요청:

```json
{
  "name": "AWS VPC 실습",
  "description": "VPC, EC2, RDS를 연결한 기본 구조"
}
```

응답:

```json
{
  "project": {
    "id": "project_id",
    "userId": "user_id",
    "name": "AWS VPC 실습",
    "description": "VPC, EC2, RDS를 연결한 기본 구조",
    "createdAt": "2026-06-23T00:00:00.000Z",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  }
}
```

## 2.3 프로젝트 상세 토글 데이터

```http
GET /api/projects/:projectId/summary
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "project": {
    "id": "project_id",
    "name": "AWS VPC 실습",
    "description": "VPC, EC2, RDS를 연결한 기본 구조",
    "createdAt": "2026-06-23T00:00:00.000Z",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  },
  "mainResources": [
    {
      "type": "VPC",
      "count": 1
    },
    {
      "type": "EC2",
      "count": 2
    }
  ],
  "recentActivities": [
    {
      "id": "activity_id",
      "eventName": "project.architecture_saved",
      "message": "아키텍처가 저장되었습니다.",
      "createdAt": "2026-06-23T00:00:00.000Z"
    }
  ],
  "latestArchitectureVersion": 3,
  "hasTerraformExport": true,
  "linkedTemplateId": null
}
```

## 2.4 프로젝트 확인 보드

```http
GET /api/projects/:projectId/dashboard
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "project": {
    "id": "project_id",
    "name": "AWS VPC 실습",
    "description": "VPC, EC2, RDS를 연결한 기본 구조",
    "createdAt": "2026-06-23T00:00:00.000Z",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  },
  "latestArchitecture": {
    "id": "architecture_id",
    "projectId": "project_id",
    "version": 3,
    "source": "manual",
    "architectureJson": {
      "nodes": [],
      "edges": []
    },
    "createdAt": "2026-06-23T00:00:00.000Z"
  },
  "assets": [],
  "aiAnalysis": {
    "status": "completed",
    "highestSeverity": "medium",
    "findingCount": 2,
    "summary": "보안 그룹 설정 검토가 필요합니다.",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  },
  "findings": [
    {
      "id": "finding_id",
      "severity": "medium",
      "title": "public 접근 확인 필요",
      "message": "EC2 보안 그룹의 인바운드 규칙을 확인해야 합니다.",
      "resourceId": "node_id"
    }
  ],
  "checklist": [
    {
      "id": "checklist_id",
      "label": "필수 리소스 설정 확인",
      "status": "warning"
    }
  ]
}
```

기준:

- `aiAnalysis`, `findings`, `checklist`는 optional이다.
- gg AI 파트가 아직 결과를 제공하지 않으면 `aiAnalysis: null`, `findings: []`, `checklist: []`로 내려준다.
- AI 결과는 dashboard에서만 보여준다.

## 2.5 익명 프로젝트 가져오기 API 제외

익명 작업 공간을 도입하지 않기로 결정했으므로 `POST /api/projects/import-anonymous` API는 만들지 않는다.

기준:

- 로그인 전 프로젝트 저장 흐름은 제공하지 않는다.
- 프로젝트 생성은 로그인 후에만 가능하다.
- 기존 프로젝트는 `user_id` not null 기준으로만 소유자를 가진다.

## 3. 아키텍처 저장 API

## 3.1 아키텍처 저장

```http
POST /api/projects/:projectId/architectures
Authorization: Bearer <accessToken>
```

요청:

```json
{
  "source": "manual",
  "architectureJson": {
    "nodes": [
      {
        "id": "node_vpc_1",
        "type": "VPC",
        "label": "Main VPC",
        "positionX": 120,
        "positionY": 80,
        "config": {}
      }
    ],
    "edges": []
  }
}
```

응답:

```json
{
  "architecture": {
    "id": "architecture_id",
    "projectId": "project_id",
    "version": 4,
    "source": "manual",
    "architectureJson": {
      "nodes": [],
      "edges": []
    },
    "createdAt": "2026-06-23T00:00:00.000Z"
  }
}
```

## 4. Asset API

## 4.1 S3 업로드 URL 발급

```http
POST /api/projects/:projectId/assets/presigned-upload
Authorization: Bearer <accessToken>
```

요청:

```json
{
  "architectureId": "architecture_id",
  "assetType": "thumbnail",
  "fileName": "thumbnail.png",
  "contentType": "image/png",
  "byteSize": 12345
}
```

응답:

```json
{
  "asset": {
    "id": "asset_id",
    "projectId": "project_id",
    "architectureId": "architecture_id",
    "assetType": "thumbnail",
    "objectKey": "projects/project_id/assets/thumbnail/asset_id-thumbnail.png",
    "fileName": "thumbnail.png",
    "contentType": "image/png",
    "byteSize": 12345,
    "createdAt": "2026-06-23T00:00:00.000Z"
  },
  "upload": {
    "method": "PUT",
    "url": "https://s3-presigned-url",
    "headers": {
      "Content-Type": "image/png"
    },
    "expiresInSeconds": 900
  }
}
```

허용 asset type:

- `diagram_png`
- `diagram_svg`
- `terraform_file`
- `project_export_zip`
- `thumbnail`

## 5. 템플릿 API

## 5.1 템플릿 목록

```http
GET /api/templates?visibility=public&category=network&difficulty=beginner
```

응답:

```json
{
  "templates": [
    {
      "id": "template_id",
      "title": "기본 VPC 템플릿",
      "description": "VPC와 EC2 기본 연결 구조",
      "category": "network",
      "difficulty": "beginner",
      "visibility": "public",
      "ownerUserId": "user_id",
      "thumbnailAssetId": "asset_id",
      "resourceTypes": ["VPC", "EC2"],
      "favoriteCount": 10,
      "useCount": 3,
      "createdAt": "2026-06-23T00:00:00.000Z",
      "updatedAt": "2026-06-23T00:00:00.000Z"
    }
  ]
}
```

## 5.2 템플릿 상세

```http
GET /api/templates/:templateId
```

응답:

```json
{
  "template": {
    "id": "template_id",
    "title": "기본 VPC 템플릿",
    "description": "VPC와 EC2 기본 연결 구조",
    "category": "network",
    "difficulty": "beginner",
    "visibility": "public",
    "architectureJson": {
      "nodes": [],
      "edges": []
    },
    "favoriteCount": 10,
    "useCount": 3,
    "createdAt": "2026-06-23T00:00:00.000Z",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  },
  "isFavorited": false
}
```

## 5.3 프로젝트를 템플릿으로 등록

```http
POST /api/templates
Authorization: Bearer <accessToken>
```

요청:

```json
{
  "sourceProjectId": "project_id",
  "sourceArchitectureId": "architecture_id",
  "title": "기본 VPC 템플릿",
  "description": "VPC와 EC2 기본 연결 구조",
  "category": "network",
  "difficulty": "beginner",
  "visibility": "private",
  "thumbnailAssetId": "asset_id"
}
```

응답:

```json
{
  "template": {
    "id": "template_id",
    "title": "기본 VPC 템플릿",
    "visibility": "private",
    "createdAt": "2026-06-23T00:00:00.000Z"
  }
}
```

기준:

- 로그인 사용자만 등록할 수 있다.
- 본인 프로젝트만 템플릿으로 등록할 수 있다.
- `architectureJson`은 등록 시점의 snapshot을 복사한다.

## 5.4 템플릿 수정

```http
PATCH /api/templates/:templateId
Authorization: Bearer <accessToken>
```

요청:

```json
{
  "title": "수정된 VPC 템플릿",
  "description": "설명이 수정되었습니다.",
  "category": "network",
  "difficulty": "intermediate",
  "visibility": "private"
}
```

응답:

```json
{
  "template": {
    "id": "template_id",
    "title": "수정된 VPC 템플릿",
    "visibility": "private",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  }
}
```

기준:

- 작성자만 수정 가능하다.
- 아키텍처 내용 수정은 새 `template_versions`로 저장한다.
- 이미 복제된 프로젝트에는 영향을 주지 않는다.

## 5.5 템플릿 삭제

```http
DELETE /api/templates/:templateId
Authorization: Bearer <accessToken>
```

요청:

```json
{
  "confirmText": "DELETE"
}
```

응답:

```json
{
  "deleted": true
}
```

기준:

- 작성자만 삭제 가능하다.
- 삭제 전 프론트에서 Blocking modal을 띄운다.
- API는 `confirmText`를 확인한다.

## 5.6 템플릿 공유 상태 변경

```http
POST /api/templates/:templateId/share
Authorization: Bearer <accessToken>
```

요청:

```json
{
  "visibility": "link"
}
```

응답:

```json
{
  "template": {
    "id": "template_id",
    "visibility": "link"
  },
  "shareLink": {
    "token": "share_token",
    "url": "https://sketchcatch.example/templates/share/share_token"
  }
}
```

visibility:

- `private`
- `link`
- `public`

기준:

- `public` 전환은 Warning popup 또는 Blocking modal을 사용한다.
- 공유 링크 복사는 프론트에서 Toast로 처리한다.

## 5.7 템플릿 찜

```http
POST /api/templates/:templateId/favorite
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "favorited": true
}
```

## 5.8 템플릿 찜 취소

```http
DELETE /api/templates/:templateId/favorite
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "favorited": false
}
```

## 5.9 찜한 템플릿 목록

```http
GET /api/me/template-favorites
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "templates": []
}
```

## 5.10 템플릿에서 프로젝트 만들기

```http
POST /api/templates/:templateId/create-project
Authorization: Bearer <accessToken>
```

요청:

```json
{
  "name": "템플릿으로 만든 프로젝트",
  "description": "기본 VPC 템플릿에서 시작"
}
```

응답:

```json
{
  "project": {
    "id": "project_id",
    "name": "템플릿으로 만든 프로젝트"
  },
  "architecture": {
    "id": "architecture_id",
    "version": 1
  }
}
```

## 6. 활동 내역 API

## 6.1 활동 내역 조회

```http
GET /api/activities?limit=30&cursor=activity_id
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "activities": [
    {
      "id": "activity_id",
      "eventName": "template.created",
      "projectId": "project_id",
      "templateId": "template_id",
      "message": "템플릿을 등록했습니다.",
      "createdAt": "2026-06-23T00:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

## 6.2 활동 내역 생성

이 API는 일반 프론트 화면에서 직접 호출하지 않는다.

프로젝트, 템플릿, AI 연동 API 내부에서 서버가 생성한다.

기록할 event:

| eventName | 생성 주체 |
| --- | --- |
| `project.created` | ys |
| `project.updated` | ys |
| `project.deleted` | ys |
| `project.architecture_saved` | ys 또는 jh |
| `project.terraform_exported` | ys 또는 sw |
| `template.created` | ys |
| `template.updated` | ys |
| `template.shared` | ys |
| `template.deleted` | ys |
| `ai.architecture_draft_created` | gg |
| `ai.architecture_review_completed` | gg |
| `ai.architecture_review_failed` | gg |

기록하지 않는 것:

- 모든 AI 요청
- 리소스 설명 조회
- 화면 클릭
- Toast 표시
- 민감값이 포함될 수 있는 payload

## 7. gg AI 파트 연동 계약

gg는 ys 파트에 아래 형태의 결과를 제공한다.

```json
{
  "aiAnalysis": {
    "status": "warning",
    "highestSeverity": "high",
    "findingCount": 2,
    "summary": "public 접근 위험이 있어 검토가 필요합니다.",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  },
  "findings": [
    {
      "id": "finding_id",
      "severity": "high",
      "title": "public 접근 위험",
      "message": "S3 또는 보안 그룹 설정을 확인해야 합니다.",
      "resourceId": "node_id"
    }
  ],
  "checklist": [
    {
      "id": "checklist_id",
      "label": "public 접근 설정 확인",
      "status": "warning"
    }
  ]
}
```

ys 파트 기준:

- 프로젝트 목록에는 이 결과를 넣지 않는다.
- 프로젝트 확인 보드에서만 이 결과를 보여준다.
- high severity는 Toast 또는 화면 내 Warning으로 보여준다.
- 저장형 알림으로 만들지 않는다.
- AI 요청에 민감 정보를 요구하지 않는다.

## 8. 팝업 알림 정책

팝업 알림은 백엔드 저장 API로 만들지 않는다.

프론트 정책:

| UI | 용도 | 예시 |
| --- | --- | --- |
| Toast | 가벼운 완료 | 저장 완료, 찜 완료, 복사 완료, AI 분석 완료 |
| 화면 내 Warning | 계속 보여야 하는 주의 | 보안 위험, 설정 누락, AI 분석 실패 |
| Warning popup | 사용자가 지나치면 문제가 되는 상황 | public 접근 위험, 삭제 예정 리소스 있음, 템플릿 공개 전 주의 |
| Blocking modal | 되돌리기 어려운 작업 | 프로젝트 영구 삭제, 템플릿 삭제, 템플릿 전체 공개, 위험한 Terraform export |

백엔드가 확인해야 하는 것:

- Blocking modal이 떠도 권한 검증은 API가 다시 한다.
- 템플릿 삭제, 프로젝트 삭제 같은 작업은 작성자/소유자만 가능하다.
- confirm 값이 없으면 위험 작업을 처리하지 않는다.
