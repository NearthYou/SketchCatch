# ys Codex용 플랫폼 선택지

> 상태: gg AI 파트와의 호환성 확인을 위한 검토용 선택지다. 추천안은 확정이 아니라 제안이다.

너는 SketchCatch ys 파트 Codex다. 구현 전에 gg AI 파트의 분석 결과가 로그인, 프로젝트 목록, 최근 작업, 알림, 플랫폼 화면에서 어떻게 소비될지 확인하고 선택지를 골라라.

## 먼저 읽을 문서

- [데이터 모델](../data-models.md)
- [AI MVP 범위](../strategy/ai-mvp-scope.md)
- [제품 방향](../product.md)
- `packages/types/src/index.ts`

## 선택할 것

### 1. 프로젝트 목록에서 AI 요약 표시

**A. MVP에서는 프로젝트 상세/작업 화면에서만 AI 요약을 보여주고 목록은 후순위로 둔다. (추천)**

- 장점: 목록 API와 AI 분석 저장 정책이 얽히지 않는다.
- gg AI 파트 영향: 우선 stateless 분석 응답에 집중한다.

**B. 프로젝트 목록에 최소 AI summary를 표시한다.**

- 예: `highestSeverity`, `findingCount`, `estimatedMonthlyCost`
- 장점: 사용자가 위험한 프로젝트를 빠르게 볼 수 있다.
- 위험: AI 분석 결과 저장 또는 캐싱 정책이 필요하다.

**C. 프로젝트 목록에서 비용/위험 상세까지 보여준다.**

- 장점: 정보량이 많다.
- 위험: 목록 화면이 무거워지고 MVP 범위가 커진다.

### 2. 최근 작업 목록과 AI 이벤트

**A. AI 분석 실행 자체는 최근 작업에 남기지 않는다. (추천)**

- 장점: Activity 모델이 안정되기 전까지 노이즈를 줄인다.
- gg AI 파트 영향: AI endpoint는 activity 생성 책임을 지지 않는다.

**B. Architecture Draft 생성과 Pre-Deployment Check만 최근 작업에 남긴다.**

- 장점: 사용자가 중요한 AI 작업을 추적할 수 있다.
- 위험: activity schema와 event naming 합의가 필요하다.

**C. 모든 AI 요청을 최근 작업에 남긴다.**

- 장점: 감사 추적에는 좋다.
- 위험: 로그/토큰/개인정보 관리 부담이 커진다.

### 3. 알림 연동

**A. MVP에서는 알림을 직접 만들지 않고 화면 내 warning으로 표시한다. (추천)**

- 장점: 알림 시스템과 AI 분석 저장 정책을 분리한다.
- gg AI 파트 영향: `findings`와 `checklist`만 제공한다.

**B. high severity finding만 알림으로 만든다.**

- 장점: 중요한 위험을 놓치지 않는다.
- 위험: 알림 생성 주체와 중복 방지 기준이 필요하다.

**C. 비용 초과, 보안 위험, 배포 실패를 모두 알림으로 만든다.**

- 장점: 플랫폼 완성도가 높다.
- 위험: MVP 범위를 넓힌다.

### 4. 인증/프로젝트 소유자 기준

**A. 로그인 사용자 기준으로만 AI 기능을 연다. (확정)**

- 장점: 프로젝트, AI 결과, 활동 내역의 소유자가 `userId` 하나로 정리된다.
- gg AI 파트 영향: request payload에 user secret이나 AWS credential을 요구하지 않는다.
- 기준: `Authorization: Bearer <accessToken>`이 없는 요청은 프로젝트/AI 기능을 사용할 수 없다.

**B. `AnonymousWorkspace` 기준으로 AI 결과를 연결한다. (제외)**

- 제외 이유: 익명 작업 공간을 도입하지 않기로 결정했으므로 프로젝트 소유권 기준이 분리된다.

**C. 익명/로그인 둘 다 지원한다. (제외)**

- 제외 이유: `workspaceId`와 `userId`를 동시에 지원하면 API 권한 검증과 DB 설계가 불필요하게 복잡해진다.

## 응답 형식

```text
ys Codex 선택 결과

1. 프로젝트 목록에서 AI 요약 표시: A
   이유:
   프로젝트 목록은 빠르게 보여주는 화면이다.
   여기에 AI 비용/위험 요약까지 넣으면 목록 API가 복잡해지고, AI 분석 결과를 DB에 저장할지 캐싱할지도 정해야 한다.
   그래서 목록에서는 프로젝트 이름, 설명, 수정 시간 정도만 보여준다.
   AI 요약은 프로젝트 상세 화면이나 프로젝트 확인 보드에서 보여주는 게 낫다.

2. 최근 작업 목록과 AI 이벤트: B
   이유:
   AI 요청을 전부 최근 작업에 남기면 기록이 너무 많아진다.
   예를 들어 리소스 설명 한 번 본 것까지 다 남기면 활동 내역이 지저분해진다.
   대신 중요한 AI 작업만 남긴다.
   예를 들면 아키텍처 초안 생성, 배포 전 체크 완료, 배포 전 체크 실패 정도만 최근 작업에 기록한다.

3. 알림 연동: A
   이유:
   MVP에서는 AI 결과를 바로 저장형 알림으로 만들지 않는다.
   저장형 알림으로 만들면 중복 알림 처리, 읽음 처리, 알림 생성 기준까지 정해야 해서 일이 커진다.
   우선 AI 분석 결과는 화면 안에서 warning으로 보여주고, 위험도가 높으면 Toast 팝업 정도로만 보여준다.
   시간이 남으면 high severity 결과만 저장형 알림으로 확장한다.

4. 인증/프로젝트 소유자 기준: A
   이유:
   익명 작업 공간은 도입하지 않기로 결정했다.
   그래서 모든 프로젝트와 AI 결과는 로그인 사용자 기준으로만 연결한다.
   프로젝트 조회, 대시보드 조회, 활동 내역 저장은 모두 userId 기준으로 권한을 확인한다.
   projects.user_id는 nullable이 아니라 not null이어야 한다.
   Authorization이 없는 프로젝트/AI 요청은 401 unauthorized로 처리한다.

필요한 최소 AI 요약 필드:
- status: AI 분석 상태
  예: not_analyzed, completed, warning, failed
- highestSeverity: 가장 높은 위험도
  예: low, medium, high, null
- findingCount: 발견된 문제 개수
- estimatedMonthlyCost: 예상 월 비용
- summary: 짧은 요약 문장
- updatedAt: 마지막 분석 시각

gg AI 파트가 맞춰야 할 것:
- 프로젝트 목록에 AI 요약을 꼭 넣으라고 요구하지 않는다.
- AI 분석은 projectId와 architectureJson을 기준으로 동작하게 한다.
- AI 요청에 AWS Access Key, Secret Key 같은 민감 정보를 요구하지 않는다.
- findings에는 id, severity, title, message, resourceId를 포함한다.
- checklist에는 id, label, status를 포함한다.
- 최근 작업에 남길 AI 이벤트는 중요한 것만 보낸다.
- 이벤트 이름은 아래처럼 맞춘다.
  - ai.architecture_draft_created
  - ai.pre_deployment_check_completed
  - ai.pre_deployment_check_failed

ys 파트가 맞출 것:
- GET /api/projects에는 AI 상세 요약을 넣지 않는다.
- 프로젝트 목록은 가볍게 유지한다.
- GET /api/projects/:id/dashboard에서 AI 요약을 보여줄 자리를 만든다.
- 활동 내역에는 모든 AI 요청이 아니라 중요한 AI 이벤트만 저장한다.
- high severity 결과는 우선 Toast나 화면 warning으로 보여준다.
- 저장형 알림은 1차 구현에서는 AI와 직접 연결하지 않는다.
- 로그인 사용자는 userId 기준으로 프로젝트를 찾는다.

수정이 필요한 파일/타입:
- packages/types/src/index.ts
  - AiAnalysisSummary 타입 추가
  - AiFinding 타입 추가
  - AiChecklistItem 타입 추가
  - ProjectDashboardSummary 타입 추가
  - Activity 이벤트 이름 추가

- apps/api/src/db/schema.ts
  - anonymous_workspaces 제거
  - projects.workspace_id 제거
  - projects.user_id not null 추가
  - activities 테이블 추가
  - notifications는 후순위

- apps/api/src/routes/projects.ts
  - 프로젝트 목록 API는 AI 요약 없이 가볍게 유지
  - userId 기준 권한 확인 추가

- apps/api/src/routes/dashboard.ts
  - 프로젝트 확인 보드 API 추가
  - AI 요약을 optional로 포함

- apps/api/src/routes/activities.ts
  - 중요한 AI 이벤트만 활동 내역에 저장/조회

- apps/web/app/projects/page.tsx
  - 프로젝트 목록에는 AI 상세 요약 표시하지 않음

- apps/web/app/projects/[id]/page.tsx
  - 프로젝트 확인 보드에서 AI 요약 표시

- apps/web/components/notifications/ToastProvider.tsx
  - 위험도가 높은 AI 결과를 Toast로 표시
```
