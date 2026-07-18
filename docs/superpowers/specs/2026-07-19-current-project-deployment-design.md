# 현재 프로젝트 배포 자동 연결 설계

## 목적

Workspace에서 `배포`를 누르면 현재 선택된 프로젝트와 Board를 직접 배포 대상으로 사용한다. CI/CD가 필요한 경우에도 Board 분석 기록에 연결된 `SourceRepository`를 자동 사용하며, 사용자가 같은 Repository를 다시 선택하게 하지 않는다.

## 확인된 현재 계약

- `WorkspaceRightPanel`은 현재 `projectId`, `context.diagram`, 저장된 Terraform 산출물을 `DeploymentPanel`에 전달한다.
- DB는 프로젝트와 provider 조합당 활성 `SourceRepository`를 하나만 허용한다.
- `RepositoryAnalysisRecord.sourceRepositoryId`는 Board를 만든 Repository를 고정한다.
- `ProjectDeliveryProfile`은 해당 `sourceRepositoryId`와 일치하는 활성 Repository만 반환하고, Board provenance가 없는 다른 Repository를 대신 사용하지 않는다.
- Git/CI/CD handoff API는 요청된 Repository가 현재 프로젝트 소속이고 활성 상태인지 다시 검증한다.

## 문제

일반 배포 버튼으로 모달을 열어도 이전에 사용한 CI/CD 탭이 `localStorage`에서 복원될 수 있다. 또한 CI/CD 화면은 `ProjectDeliveryProfile`과 별도로 Repository 목록을 조회해 첫 활성 Repository를 다시 선택한다. 현재 DB 제약상 대부분 같은 결과가 나오지만, Board provenance라는 단일 기준을 UI 전체에서 일관되게 사용하지 못하고 중복 `Source Repository` 카드와 재분석 링크를 노출한다.

## 설계

1. 일반 Workspace 배포 진입은 항상 `deployment` 화면으로 시작한다. CI/CD 복귀 URL과 명시적인 CI/CD 이동만 `cicd` 화면을 연다.
2. `CicdConsoleScreen`은 Repository 목록을 별도로 선택하지 않고 `ProjectDeliveryProfile.sourceRepository`와 `monitoringConfig`를 함께 사용한다.
3. 초기 로드와 수동 새로고침 모두 같은 Delivery Profile에서 Repository, monitoring config, readiness를 갱신한다.
4. `DeliveryCenterPanel`의 `Source Repository` 카드를 제거한다. GitHub App 권한 카드와 실제 CI/CD 준비 상태는 유지한다.
5. Board provenance에 연결된 Repository가 없거나 비활성 상태라면 자동 대체하지 않는다. CI/CD 실행 영역의 기존 차단 안내와 readiness 항목으로만 복구 경로를 제공한다.
6. Repository 카드에서만 사용되던 freshness helper와 테스트는 삭제한다.

## 오류 처리

- Delivery Profile 조회 실패 시 CI/CD 화면은 기존 오류 상태를 표시하고 실행을 허용하지 않는다.
- Repository가 없으면 PR 생성 조건은 계속 false이며, 기존 Repository 연결 안내가 실행 영역에 표시된다.
- Direct Deployment는 Repository 없이도 현재 Board와 저장된 Terraform을 기준으로 기존 안전 게이트를 그대로 수행한다.

## 검증

- 일반 배포 진입이 `deployment`를 명시하는 회귀 테스트
- Source Repository 카드가 제거되는 회귀 테스트
- CI/CD가 `listSourceRepositories` 대신 `ProjectDeliveryProfile.sourceRepository`를 사용하는 회귀 테스트
- 기존 backend Delivery Profile 테스트로 Board provenance가 없는 Repository를 재사용하지 않는 계약 확인
- Web 관련 테스트, lint, typecheck, build, harness 실행
