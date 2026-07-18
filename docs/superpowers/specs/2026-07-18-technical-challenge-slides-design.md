# 대표 기술 챌린지 슬라이드 설계

## 목적

현재 발표자료의 `04 프로젝트 수행 경과(도출과정)`가 기능 설명에 머물지 않도록, 실제 개발 중
마주친 문제와 해결 판단, 구현 경계, 검증 결과를 세 장으로 추가한다. 멘토와 운영진은 각 기능의
존재보다 왜 해당 구조가 필요했고 어떤 실패를 막았는지 이해할 수 있어야 한다.

커뮤니케이션 목표는 다음과 같다.

> 발표가 끝날 때 멘토와 운영진은 SketchCatch가 AI·Terraform·클라우드 실행을 단순 연결한 것이
> 아니라, 상태 불일치와 중복 실행, 편집 충돌을 코드 수준의 안전 경계로 해결했음을 이해한다.

## 배치와 페이지 구성

현재 11쪽 뒤, 기존 자기평가 앞에 세 장을 삽입한다.

- 신규 12쪽: 승인 상태와 실행 상태 불일치 차단
- 신규 13쪽: 실제 provider 검증을 통한 빌드·배포 재사용
- 신규 14쪽: 여러 탭의 ProjectDraft 편집 충돌 방지
- 기존 12쪽 자기평가와 13쪽 주차별 멘토링 보고서는 15쪽과 16쪽으로 이동한다.

최종 자료는 16쪽이다. 세 장 모두 기존 `04 프로젝트 수행 경과(도출과정)` 제목 영역, 흑백·회색
팔레트, 하단 페이지 번호, 여백과 글꼴 톤을 유지한다.

## 공통 정보 구조

각 장은 한 가지 주장만 전달하며 같은 읽기 순서를 사용한다.

1. 한 문장 문제 정의
2. 문제를 방치했을 때의 실패 위험
3. 번호가 있는 해결 흐름
4. 현재 구현 결과
5. 코드·테스트 기반 검증 근거

설명되지 않는 UI 캡처는 사용하지 않는다. 중앙에는 단순 흐름도를 두고 하단에는 `구현 결과`와
`검증 근거`를 나란히 배치한다. 검증 기준은 현재 `dev`의 `1b1efeb1`과
`feature_list.json`의 마지막 검증 기록이다.

## 12쪽 — 승인한 상태와 실행 상태의 불일치 차단

### 핵심 주장

Plan을 확인한 뒤 설계, Terraform, AWS 계정 또는 region이 바뀌면 기존 승인을 사용할 수 없다.

### 문제와 위험

Architecture Board와 Terraform을 계속 편집할 수 있는 제품에서는 Plan을 확인한 시점과 실제 Apply
시점의 입력이 달라질 수 있다. 오래된 draft나 다른 AWS 계정·region에 기존 승인을 적용하면 사용자가
검토하지 않은 인프라 변경이 실행될 수 있다.

### 해결 흐름

1. `Ctrl+S` 또는 `저장하고 배포`로 Board와 Terraform을 하나의 ProjectDraft revision으로 저장한다.
2. 저장된 revision만으로 `terraform plan -out=tfplan`을 실행하고 Terraform artifact와 Plan을 고정한다.
3. 승인 시 Terraform artifact hash, tfplan hash, AWS account, region, 준비 snapshot을 기록한다.
4. Apply 직전에 같은 값을 다시 검증한다. 하나라도 다르면 `409 Conflict`로 중단한다.
5. Destroy도 별도 destroy Plan과 승인 snapshot을 거쳐 같은 검증 경계를 사용한다.

### 구현 결과와 근거

- 사용자 화면은 `검증 → 승인 → 배포` 세 단계로 단순화되지만 서버는 revision과 snapshot을 끝까지 유지한다.
- Direct Deployment 집중 계약 17/17, Deployment 최적화 계약 83/83, 승인·Destroy 회귀 22/22가 통과했다.
- 근거: `deployment-approval-service.ts`, `deployment-plan-service.ts`,
  `deployment-apply-service.ts`, `docs/deployment.md`.

## 13쪽 — 캐시를 믿지 않고 중복 빌드·배포만 제거

### 핵심 주장

DB의 성공 기록이나 cache hit가 아니라 provider의 실제 artifact와 healthy runtime이 일치할 때만
빌드와 rollout을 재사용한다.

### 문제와 위험

같은 commit이 Direct Deployment와 Git/CI/CD에서 반복 실행되면 불필요한 빌드와 rollout이 발생한다.
반대로 DB 기록만 믿고 생략하면 삭제·변조된 artifact나 다른 account·region의 artifact, unhealthy
runtime을 정상으로 오판할 수 있다.

### 해결 흐름

1. Repository identity, exact commit, 정규화한 build config, build contract와 target platform으로
   canonical artifact fingerprint를 만든다.
2. project 범위의 claim/lease와 heartbeat로 동일 fingerprint의 동시 build를 하나로 제한한다.
3. 재사용 직전에 provider를 read-only로 조회해 존재 여부, SHA-256 digest, account, region,
   namespace와 project ownership을 확인한다.
4. Runtime Convergence Adapter가 deployment target fingerprint, artifact marker·digest와 health를 다시 확인한다.
5. 모두 일치하면 `already_active`로 rollout만 생략하고, 불일치·조회 실패·unhealthy면 정상 rollout으로 fallback한다.

### 구현 결과와 근거

- container image, Lambda zip, CodeDeploy bundle 등 7가지 artifact kind가 하나의 provider-neutral Registry를 사용한다.
- ECS, EC2, EKS, Kubernetes, Lambda, Static 대상의 10개 runtime adapter 계약을 유지한다.
- ApplicationArtifact 집중 계약 59/59, Runtime Convergence 집중 계약 79/79가 통과했다.
- 근거: `application-artifact-registry.ts`, `aws-application-artifact-verifier.ts`,
  `runtime-convergence-service.ts`, `docs/architecture.md`.

## 14쪽 — 여러 탭에서도 설계 이력을 덮어쓰지 않기

### 핵심 주장

오래된 탭의 마지막 저장이 최신 설계를 덮어쓰지 못하도록 서버에서 충돌을 거부하고 사용자가
복구할 상태를 선택하게 한다.

### 문제와 위험

ProjectDraft는 DiagramJson과 여러 Terraform 파일을 같은 revision으로 저장한다. 같은 프로젝트를 여러
탭에서 열거나 새로고침하면 오래된 탭의 자동 저장이 최신 Board와 Terraform을 덮어쓸 수 있다.

### 해결 흐름

1. 클라이언트는 마지막으로 읽은 서버 revision을 `expectedRevision`으로 보낸다.
2. 서버는 `projectId + expectedRevision`이 일치하는 경우에만 조건부 UPDATE를 수행한다.
3. revision이 다르면 DiagramJson을 변경하지 않고 `409 Conflict`와 현재 revision을 반환한다.
4. 브라우저는 탭마다 별도 IndexedDB `workspaceId`와 Web Lock을 사용해 로컬 복구본을 분리한다.
5. 사용자가 `서버 최신 상태` 또는 `로컬 복구본`을 선택하기 전에는 자동 checkpoint와 서버 저장을 중단한다.

### 구현 결과와 근거

- 실시간 공동 편집을 구현하지 않고도 stale write와 복구본 유실을 막는 안전한 편집 경계를 확보했다.
- ProjectDraft API 32/32, Workspace 37/37, AI·Repository 진입 계약 2/2가 통과했다.
- 실제 Chromium 3개 탭에서 최초 저장, stale 저장 409, 서버 상태 재조회와 탭별 복구 key를 확인했다.
- 근거: `project-draft-save-service.ts`, `project-draft-persistence.ts`,
  `docs/data-models.md`.

## 시각 설계

- 상단: 기존 회색 section header와 `04 프로젝트 수행 경과 (도출과정)`을 유지한다.
- 제목: `기술적 챌린지 ①/②/③`과 핵심 문제를 한 줄로 표시한다.
- 중앙: 검은 번호 표식과 회색 연결 영역을 사용한 4~5단계 흐름을 배치한다.
- 하단 왼쪽: `구현 결과`를 두 줄 이내로 요약한다.
- 하단 오른쪽: 검증 숫자와 검증 기준 commit을 표시한다.
- 무의미한 제품 화면, 예전 버전 캡처, 코드 전체 스크린샷은 사용하지 않는다.
- 내부 구현 파일명은 작은 근거 줄에만 제한하고 발표 본문 용어로 사용하지 않는다.

## 검증

- 세 장이 11쪽과 자기평가 사이에 순서대로 삽입되었는지 확인한다.
- 전체 16쪽과 변경된 페이지 번호를 확인한다.
- 제목이 한 줄을 유지하고 본문이 잘리거나 겹치지 않는지 각 장을 전체 크기로 확인한다.
- 테스트 수치와 artifact/runtime adapter 수가 `feature_list.json`, `docs/product.md`,
  `docs/architecture.md`, `docs/data-models.md`, `docs/deployment.md`와 일치하는지 확인한다.
- Google Drive에 저장되었는지 확인한다.

## 제외 범위

- 제품 코드나 데이터 모델 변경
- 새로운 기능·수치·성과 추정
- 실제 AWS Apply, Destroy, build 또는 GitHub PR 실행
- 기존 6~11쪽의 내용 재작성
- 자기평가와 주차별 멘토링 표의 내용 변경
