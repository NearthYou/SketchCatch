# AWS Access Task 7 Report

## 상태

- **DONE** — 여러 Board 정리안을 원본과 비교하고, 선택한 정리안을 서버가 다시 확인한 뒤에만 적용하도록 연결했습니다.
- 후보 선택과 원본·정리안 전환은 로컬 preview session만 바꿉니다.
- Board, History, 로컬 복구 Draft는 전용 API가 성공하기 전에는 바뀌지 않습니다.
- 서버 적용을 기다리는 동안 Resource, History, 저장, Terraform 편집 경로를 잠가 같은 source snapshot을 유지합니다.

## 구현 결과

### 여러 정리안 Preview

- preview session에 원본, 안전 후보 전체, 선택 후보 ID, 원본 fingerprint, 생성 당시 ProjectDraft revision, 이전 viewport를 보관합니다.
- 후보 선택은 새 session만 반환하며 적용할 Diagram이나 저장 상태를 만들지 않습니다.
- 데스크톱은 후보 thumbnail 위에 원본·선택 정리안을 나란히 보여줍니다.
- 모바일은 원본·정리안 toggle로 한 화면씩 보여줍니다.
- 가로 스크롤은 후보 thumbnail strip에만 허용했습니다.
- 화면에는 `정리안 1`, `정리안 2`처럼 쉬운 이름과 설명만 보여주며 candidate ID, 점수, Compiler 정보는 노출하지 않습니다.

### stale 적용 차단

- 적용 직전에 현재 Board 전체 표시 상태와 preview 원본을 다시 비교합니다.
- 현재 ProjectDraft revision이 session 생성 당시 revision과 다르면 서버 요청도 보내지 않습니다.
- 서버 적용 callback이 없는 Editor에서는 성공으로 간주하지 않고 적용을 중단합니다.
- 적용 요청 중 후보 변경, 원본 전환, 취소를 다시 실행하지 않아 요청 중 선택이 바뀌지 않게 했습니다.

### 서버 검증과 저장 순서

- `POST /api/projects/:id/draft/auto-organize/apply` 전용 경계를 추가했습니다.
- 요청은 session ID, candidate ID, 원본·후보 Diagram, source fingerprint, 예상 revision, Terraform files만 받습니다.
- strict schema가 추가 Compiler metadata나 알 수 없는 필드를 거부합니다.
- 서버는 fingerprint를 다시 계산하고 Resource, 설정, containment, 관계 의미가 같으며 시각 배치만 달라졌는지 확인합니다.
- 서버가 실제 저장된 ProjectDraft를 읽어 요청 원본이 같은 revision의 저장 원본과 정확히 같은지 확인합니다.
- 요청 Terraform files가 저장된 Draft와 한 글자라도 다르면 적용을 거부합니다.
- visual-only CAS에는 client files가 아니라 저장된 Terraform files만 다시 전달합니다.
- 그 뒤 기존 ProjectDraft conditional revision save를 사용해 마지막 CAS를 수행합니다.
- API 성공 뒤에만 Editor가 Board와 History를 한 번 갱신하고, Workspace가 같은 서버 revision으로 로컬 복구 Draft를 맞춥니다.
- 서버 요청 중 사용자가 Terraform을 더 편집했다면 서버 응답으로 덮지 않고 dirty 로컬 Draft로 보존합니다.
- 서버 요청이 시작된 뒤에는 Resource·Diagram·History·저장·Terraform 변경을 막고, 이미 시작된 비동기 Terraform 결과도 버립니다.
- 서버 성공 직후에만 잠금을 동기적으로 열어 선택한 Board와 History를 한 번 커밋하고, 요청 종료 전까지 나머지 UI 편집은 계속 잠급니다.
- 저장된 ProjectDraft revision이나 전용 서버 callback이 없는 작업공간에서는 자동 정리 진입을 비활성화합니다.
- 적용 API의 409는 기존 ProjectDraft 충돌 대화상자로 연결해 서버 버전 다시 불러오기 또는 로컬 편집 유지를 선택하게 합니다.

## RED 기록

### 최초 계약 RED

- API focused 명령은 적용 service와 strict body schema가 없어 실패했습니다.
- Web focused 명령은 단일 후보 session, 적용 helper 부재, 후보 strip·반응형 비교 CSS 부재로 실패했습니다.
- stale revision 테스트는 저장을 부르지 않고 Board, History, 로컬 저장이 모두 0회여야 한다는 경계를 먼저 고정했습니다.
- Workspace source 테스트는 기존 단일 proposal과 서버 전 로컬 commit 경로를 찾아 실패했습니다.

### 자체 검토 RED

- 처음 서버 구현은 요청의 source와 candidate끼리만 비교해, 공격자가 현재 revision에 맞춘 다른 source와 candidate를 함께 보낼 수 있었습니다.
- 저장된 ProjectDraft와 다른 forged source 회귀 테스트가 저장 호출을 허용해 RED였습니다.
- 서버가 실제 저장된 revision과 source를 먼저 읽고 결합하도록 고쳐 forged 요청을 저장 전에 거부했습니다.
- Editor에 서버 callback이 없을 때 빈 성공 응답을 만들어 로컬 Board를 적용할 수 있었습니다.
- source 통합 테스트가 이 fallback을 찾아 RED였고, 서버 적용 경계가 없으면 실패 처리하도록 바꿨습니다.
- visual-only 요청이 client가 보낸 Terraform files까지 저장했습니다. service 테스트는 rejection 없이 끝났고 route 테스트는 기대한 409 대신 200을 받아 RED였습니다.
- 저장된 Terraform과 요청 Terraform이 다르면 저장 전에 거부하고, 같은 경우에도 저장된 files만 CAS로 전달하도록 고쳤습니다.
- 서버 요청 중 생긴 Terraform 편집을 성공 응답의 이전 files로 덮을 수 있었습니다. reconciliation export 부재 RED 뒤 현재 local files를 복사해 dirty 상태로 남기도록 고쳤습니다.
- 서버 적용을 기다리는 동안 다른 Resource·History·Terraform 변경이 끼어들 수 있었습니다. pending lock, Terraform read-only, 비동기 결과 stale 차단을 요구한 source 회귀 테스트가 RED였습니다.
- 저장 경계가 없는 로컬·신규 작업공간에서도 정리 버튼이 활성화됐습니다. callback과 persisted revision을 모두 요구하는 회귀 테스트가 RED였습니다.
- 자동 정리 API의 409가 일반 실패 문구로만 처리됐습니다. 기존 ProjectDraft conflict state 재사용을 요구한 회귀 테스트가 RED였습니다.
- 위 세 계약은 처음 **4/7 통과, 3/7 실패**였고 구현 뒤 전체 Web focused suite **17/17 통과**로 전환됐습니다.

## 최종 검증

- API Task 7 focused 명령 — **43/43 통과**
- Web Task 7 focused 명령 — **17/17 통과**
- `pnpm --filter @sketchcatch/api exec tsc --noEmit -p tsconfig.json` — **통과**
- `pnpm --filter @sketchcatch/web exec tsc --noEmit` — **통과**
- `pnpm --filter @sketchcatch/web lint` — **통과**
- `pnpm harness:check` — **통과**
- Task 7 Web staged diff check 및 commit whitespace check — **통과**

## 호환성 및 자체 검토

- Task 6의 기존 단일 결과 API와 다중 후보 public contract는 바꾸지 않았습니다.
- 적용 요청에는 Compiler metadata, 품질 점수, template 정보가 들어가지 않습니다.
- source fingerprint만 신뢰하지 않고 저장된 ProjectDraft 원본, 의미 동일성, revision CAS를 모두 확인합니다.
- 화면 정리 endpoint는 Terraform을 저장하지 않습니다. 저장본과 다른 files가 오면 전체 요청을 거부합니다.
- 요청 도중 생긴 Terraform 편집은 로컬에 남고 서버 저장 필요 상태로 표시됩니다.
- 신뢰할 저장 원본이 없는 첫 Draft는 먼저 일반 저장으로 서버 revision을 만든 뒤 정리안을 적용해야 합니다.
- schema, migration, dependency, AWS 상태는 바꾸지 않았고 외부 push도 하지 않았습니다.
- 동시에 진행된 migration 복구, Reverse Engineering, workspace 자료 파일은 stage하거나 수정하지 않았습니다.

## Commits

- `4e1e03a5` — Board 정리안 전용 서버 적용과 revision CAS 경계
- `f8d45c83` — 요청 원본을 실제 저장된 Board와 결합하는 보안 보강
- `b50b293f` — 다중 후보 비교 UI와 서버 성공 뒤 로컬 적용 연결
- `2abd7703` — visual-only 적용의 Terraform 저장 부작용 차단
- `1f578ae8` — 요청 중 생긴 Terraform 편집의 로컬 보존
- `f30388ab` — 적용 중 전체 편집 잠금, 저장 경계 비활성화, 409 충돌 UX 연결
