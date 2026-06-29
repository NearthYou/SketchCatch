# Workspace Snapshot 및 Terraform Artifact 저장 스펙

## 개요

Workspace에서 현재 보드 상태를 배포 기준이 되는 Architecture snapshot으로 저장하고, 현재 Terraform 코드를 Deployment가 사용할 수 있는 Terraform artifact로 저장한다. 저장된 snapshot과 artifact는 즉시 DeploymentPanel의 선택지에 반영되어야 하며, 배포 생성 전에는 현재 상태를 자동으로 저장해 배포 기준점을 명확히 만든다.

## 목표

- `/workspace`에서 사용자가 현재 설계를 명시적으로 버전 저장할 수 있다.
- 현재 `DiagramJson`을 `ArchitectureJson`으로 변환해 `/projects/:id/architectures`에 저장한다.
- 저장된 Architecture snapshot은 DeploymentPanel의 snapshot 선택지에 즉시 표시된다.
- 현재 Terraform 코드를 `terraform_file` asset으로 저장하고 S3에 업로드한다.
- 저장된 Terraform artifact는 DeploymentPanel의 Terraform artifact 선택지에 즉시 표시된다.
- Terraform artifact는 생성 시점의 Architecture snapshot과 연결된다.
- 배포 생성 전 현재 보드와 Terraform 코드를 자동 저장해 배포 기준 snapshot/artifact를 만든다.

## 저장 Source 정책

Architecture snapshot의 `source`는 생성 경로를 구분하기 위한 값이다.

- `manual`: 사용자가 Workspace UI에서 직접 저장하거나 배포 전 자동 저장으로 생성한 snapshot
- `prompt`: 프롬프트 기반 생성 흐름에서 만들어진 snapshot
- `ai_draft`: AI 초안 또는 AI 추천 결과를 저장한 snapshot
- `imported`: 외부 파일이나 가져오기 흐름에서 생성한 snapshot

이번 구현에서 UI 직접 저장과 배포 전 자동 저장의 기본값은 `manual`이다. `prompt`, `ai_draft`, `imported`는 이후 흐름에서 같은 저장 API/helper를 재사용할 수 있도록 타입과 함수 인자로 열어둔다.

## Architecture Snapshot 저장 흐름

1. 사용자가 `/workspace`에서 “설계 버전 저장”을 실행한다.
2. 현재 보드의 `DiagramJson`을 가져온다.
3. 기존 변환 로직으로 `ArchitectureJson`을 생성한다.
4. `POST /projects/:id/architectures`를 호출한다.
5. 요청 body에는 `architectureJson`과 `source`를 포함한다.
6. 저장 성공 후 project details를 다시 불러온다.
7. DeploymentPanel의 Architecture snapshot 목록에 새 snapshot을 표시한다.
8. 새 snapshot을 기본 선택값으로 설정한다.

## Terraform Artifact 저장 흐름

1. 사용자가 Terraform 패널에서 현재 코드를 artifact로 저장하거나, 배포 생성 전 자동 저장이 실행된다.
2. 현재 Terraform 코드가 dirty 상태라면 기존 저장 흐름으로 Terraform 변경사항을 그래프에 먼저 반영한다.
3. Terraform 코드 검증을 실행한다.
4. 검증 실패 시 artifact 저장과 배포 생성을 중단하고 사용자에게 오류를 표시한다.
5. 현재 보드 상태로 Architecture snapshot을 생성한다.
6. `/projects/:id/assets/presigned-upload`를 호출해 `terraform_file` asset과 presigned upload URL을 생성한다.
7. Terraform 코드를 presigned URL로 `PUT` 업로드한다.
8. 업로드 성공 후 project details를 다시 불러온다.
9. DeploymentPanel의 Terraform artifact 목록에 새 artifact를 표시한다.
10. 새 artifact를 기본 선택값으로 설정한다.

## 배포 전 자동 저장 흐름

Deployment 생성 버튼을 누르면 기존 선택값을 그대로 사용하는 대신 현재 Workspace 상태를 먼저 저장한다.

1. 현재 Terraform 코드 검증
2. 현재 Terraform 코드와 그래프 동기화
3. Architecture snapshot 생성
4. Terraform artifact 생성 및 S3 업로드
5. 새 `architectureId`, `terraformArtifactId`로 Deployment 생성

중간 단계에서 실패하면 Deployment는 생성하지 않는다. 특히 Terraform 검증 실패, snapshot 저장 실패, S3 업로드 실패는 모두 배포 중단 조건이다.

## 데이터 저장 경계

- Architecture snapshot metadata와 `architectureJson`은 RDS에 저장한다.
- Terraform 원문 파일은 S3에 저장한다.
- RDS에는 Terraform artifact의 asset metadata, S3 object key, architecture 연결 정보만 저장한다.
- 프론트엔드는 presigned URL을 통해서만 S3에 업로드한다.
- Terraform 실행, AWS SDK 호출, 실제 배포 작업은 프론트엔드 컴포넌트에 넣지 않는다.

## API 및 타입 변경

- `ArchitectureSource`에 `ai_draft`를 추가한다.
- Web API client에 다음 함수를 추가한다.
  - `createArchitectureSnapshot`
  - `createProjectAssetUpload`
  - `uploadProjectAsset`
- Terraform artifact 업로드 요청에는 다음 값이 필요하다.
  - `architectureId`
  - `assetType: "terraform_file"`
  - `fileName`
  - `contentType`
  - `byteSize`

## UI 요구사항

- Workspace에서 “설계 버전 저장”을 실행할 수 있어야 한다.
- Terraform 패널에서 현재 코드를 artifact로 저장할 수 있어야 한다.
- 저장 성공 후 DeploymentPanel의 선택지가 즉시 갱신되어야 한다.
- 배포 생성 전 자동 저장 중에는 중복 클릭을 막고 진행 상태를 표시한다.
- 실패 시 어떤 단계에서 실패했는지 사용자가 이해할 수 있는 메시지를 표시한다.

## 완료 조건

- `/workspace`에서 현재 보드를 Architecture snapshot으로 저장할 수 있다.
- 저장된 snapshot이 DeploymentPanel에 즉시 표시된다.
- Terraform 패널에서 현재 코드를 `terraform_file` artifact로 저장할 수 있다.
- 저장된 artifact가 Architecture snapshot과 연결된다.
- 저장된 artifact가 DeploymentPanel에 즉시 표시된다.
- Deployment 생성 전 현재 상태가 자동으로 snapshot/artifact로 저장된다.
- 자동 저장 실패 시 Deployment 생성이 중단된다.
- 관련 타입체크, 린트, 빌드가 통과한다.
