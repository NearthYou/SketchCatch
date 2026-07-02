# Workspace Snapshot 및 Terraform Artifact 구현 계획

## 마일스톤 1. 현재 구조 확인 및 작업 브랜치 준비

우선순위: P0

- `dev` 브랜치를 최신 상태로 맞춘다.
- 이슈 `#84` 기준으로 기능 브랜치를 생성한다.
- 기존 backend API가 제공하는 다음 흐름을 다시 확인한다.
  - `POST /projects/:id/architectures`
  - `POST /projects/:id/assets/presigned-upload`
  - DeploymentPanel의 snapshot/artifact 목록 조회 방식
- 구현 전 `apps/web/features/workspace`의 현재 Terraform 패널, DeploymentPanel, WorkspaceRightPanel 상태 흐름을 다시 확인한다.

완료 기준:

- 기능 브랜치가 준비되어 있다.
- 기존 API를 추가 backend 작업 없이 재사용할 수 있는지 확인되어 있다.
- 변경 범위가 frontend 중심인지, shared type 변경이 필요한지 확정되어 있다.

## 마일스톤 2. Shared Type 및 API Client 연결

우선순위: P0

- `ArchitectureSource`에 `ai_draft`를 추가한다.
- `apps/web/features/workspace/api.ts`에 Architecture snapshot 생성 client를 추가한다.
- `apps/web/features/workspace/api.ts`에 project asset presigned upload 생성 client를 추가한다.
- presigned URL로 Terraform 파일을 업로드하는 helper를 추가한다.
- byte size 계산은 `TextEncoder` 기준으로 처리한다.
- Terraform artifact의 `contentType`은 backend presigned header와 일치하도록 한 값으로 고정한다.

완료 기준:

- Web 코드에서 snapshot 생성, asset row 생성, S3 업로드를 호출할 수 있다.
- API client 단위 테스트로 요청 URL, method, body, 실패 처리가 검증된다.

## 마일스톤 3. Workspace 저장 Orchestrator 추가

우선순위: P0

- Workspace 저장 흐름을 담당하는 helper를 추가한다.
- snapshot-only 저장 함수와 snapshot+artifact 저장 함수를 분리한다.
- snapshot-only 저장은 Terraform 검증 없이 현재 `DiagramJson`만 저장한다.
- snapshot+artifact 저장은 Terraform 검증을 먼저 통과해야 한다.
- Terraform 검증 실패 시 snapshot과 artifact를 만들지 않는다.
- artifact 저장은 새 Architecture snapshot을 만든 뒤 그 snapshot id에 연결한다.

완료 기준:

- 현재 `DiagramJson`을 `ArchitectureJson`으로 변환해 저장할 수 있다.
- 현재 Terraform 코드를 검증 후 S3에 업로드할 수 있다.
- 실패 단계별 에러가 호출자에게 전달된다.

## 마일스톤 4. TerraformCodePanel 상태 노출

우선순위: P0

- TerraformCodePanel 내부의 현재 Terraform code와 dirty 상태를 WorkspaceRightPanel에서 사용할 수 있게 만든다.
- dirty 상태면 기존 `saveCodeToDiagram()` 흐름을 먼저 실행한다.
- 저장 결과로 최신 `diagramJson`과 Terraform code를 함께 반환한다.
- Terraform 패널이 보이지 않는 상태에서도 DeploymentPanel의 자동 저장 흐름이 최신 코드를 사용할 수 있어야 한다.

완료 기준:

- DeploymentPanel에서 배포 전 자동 저장을 실행할 때 최신 Terraform code를 가져올 수 있다.
- Terraform code와 graph가 어긋난 상태로 artifact가 만들어지지 않는다.

## 마일스톤 5. UI 저장 액션 연결

우선순위: P1

- Workspace 또는 DeploymentPanel 영역에 “설계 버전 저장” 액션을 연결한다.
- Terraform 패널에 현재 Terraform code를 artifact로 저장하는 액션을 연결한다.
- 저장 중에는 버튼 중복 클릭을 막는다.
- 저장 성공 후 project details를 refresh한다.
- 새 Architecture snapshot과 Terraform artifact를 DeploymentPanel의 선택값으로 반영한다.
- 실패 시 사용자에게 단계별 메시지를 표시한다.

완료 기준:

- 사용자가 명시적으로 설계 버전을 저장할 수 있다.
- 사용자가 명시적으로 Terraform artifact를 저장할 수 있다.
- 저장 직후 새 항목이 DeploymentPanel 선택지에 표시된다.

## 마일스톤 6. Deployment 생성 전 자동 저장 연결

우선순위: P1

- Deployment 생성 버튼 클릭 시 현재 보드와 Terraform code를 먼저 저장한다.
- 자동 저장으로 생성된 `architectureId`, `terraformArtifactId`를 Deployment 생성 요청에 사용한다.
- AWS connection이 없으면 자동 저장 전에 기존처럼 배포 생성을 막는다.
- Terraform 검증 실패, snapshot 저장 실패, S3 업로드 실패 시 Deployment 생성을 중단한다.
- 성공 후 DeploymentPanel 목록과 선택 상태를 refresh한다.

완료 기준:

- 배포 생성 시 항상 현재 Workspace 상태 기준의 snapshot/artifact가 생성된다.
- Deployment record가 방금 만든 snapshot/artifact를 참조한다.
- 실패 시 배포 record가 생성되지 않는다.

## 마일스톤 7. 테스트 및 회귀 확인

우선순위: P1

- API client 테스트를 추가한다.
- 저장 orchestrator 테스트를 추가한다.
- Deployment 생성 전 자동 저장 흐름 테스트를 추가한다.
- Terraform 검증 실패 케이스를 테스트한다.
- project details refresh 후 선택값 반영을 테스트한다.
- 전체 체크를 실행한다.
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`

완료 기준:

- 핵심 저장 흐름이 테스트로 보호된다.
- 기존 Terraform 편집, 그래프 동기화, DeploymentPanel 선택 기능이 깨지지 않는다.
- 필수 체크 결과가 PR에 기록된다.

## 마일스톤 8. PR 정리

우선순위: P2

- 변경 파일을 검토한다.
- 불필요한 generated/no-op 변경이 있으면 제외한다.
- 커밋 메시지는 기능 범위가 드러나게 작성한다.
- PR 제목은 `Feat: Workspace 배포 기준 저장 흐름 연결`로 작성한다.
- PR 본문에는 다음 내용을 포함한다.
  - 이슈 번호
  - 구현 요약
  - 테스트 결과
  - 남은 제한 사항

완료 기준:

- 브랜치가 push되어 있다.
- PR이 생성되어 있다.
- PR 본문만 보고 reviewer가 snapshot/artifact 저장 흐름을 이해할 수 있다.
