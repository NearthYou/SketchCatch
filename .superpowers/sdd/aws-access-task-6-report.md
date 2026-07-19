# AWS Access Task 6 Report

## 상태

- **DONE** — Task 6의 안전한 다중 Board 정리 후보, full-tuple 자동 프레임, 쉬운 설명 계약을 구현했습니다.
- 기존 `layoutAutomaticDiagram()`과 `compileArchitectureBoard()`의 단일 결과 인터페이스는 그대로 유지했습니다.
- Preview UI와 실제 저장/CAS는 Task 7 범위이므로 이 작업에서 추가하지 않았습니다.

## 구현 결과

### 공유 안전 계약

- `BoardAutoOrganizeCandidate`와 `BoardAutoOrganizeCandidateSet`을 공유 타입으로 추가했습니다.
- source 직렬화는 viewport와 직접 UI 선택 상태만 제외합니다. Resource 설정 안의 `selected` 같은 실제 값은 유지합니다.
- 의미 직렬화는 허용된 위치·크기·route geometry와 full-tuple 자동 프레임만 제외하고 presentation 전체를 유지합니다.
- Resource, 설정, containment, 사용자 Design, 관계 방향, edge 화면 층은 의미 비교에 남습니다.
- node, edge, variable 순서는 ID 기준으로 고정해 같은 Board가 안정적인 fingerprint를 만듭니다.

### 결정론적 후보 gallery

- 기존 layout 전략을 목록으로 노출하는 `layoutAutomaticDiagramCandidates()`를 additive API로 추가했습니다.
- Compiler의 기존 단일 proposal을 여러 layout 전략으로 펼치는 `compileArchitectureBoardCandidates()`를 추가했습니다.
- 원본 Board를 경쟁 후보로 넣지 않고, 실제 visual diff가 있는 후보만 다룹니다.
- visual fingerprint 중복을 제거하고 최대 세 개만 반환합니다.
- 후보 순서는 finding 악화 종류 수, 악화 총량, 품질 점수, fingerprint 순으로 고정합니다.
- 모든 후보는 의미 동일성, 유한 좌표, Editor resize 범위, route 좌표를 다시 확인합니다.
- route의 `svgPath`에 `NaN`/`Infinity`가 있거나 `arrowAngle`이 유한하지 않으면 후보를 거부합니다.

### full-tuple 자동 프레임

- 자동 프레임 소유권은 다음 네 값을 모두 만족할 때만 인정합니다.
  - `kind=design`
  - `type=design_group`
  - `metadata.presentationCatalogItemId=design-group`
  - ID prefix `board-auto-frame:`
- 잠긴 자동 프레임은 원본 그대로 보존합니다.
- 사용자 Design Group은 자동 merge/delete에서 보존합니다.
- 자동 프레임의 Terraform 모양 `parameters`와 parent metadata는 정규화할 때 제거합니다.
- 기존 Resource와 ID가 같은 새 자동 프레임은 받지 않아 중복 node를 만들지 않습니다.
- source edge가 참조하는 자동 프레임은 candidate에서 빠져도 원본 endpoint를 보존합니다.
- 자동 프레임은 보이지만 containment parent, drop target, 자식 이동/자동 확대, Resource 화면 깊이에는 참여하지 않습니다.
- 과거 저장된 Resource parent가 자동 프레임인 경우에는 정규화가 값을 조용히 삭제하지 않습니다.
- Terraform infrastructure graph에는 자동 프레임과 그 presentation edge가 들어가지 않음을 회귀 테스트로 고정했습니다.

### 쉬운 설명

- 설명은 늘어난 finding을 먼저 알리고 실제 이동·크기·연결선·프레임 변경을 화면 이름으로 설명합니다.
- 내부 candidate/compiler/template ID는 노출하지 않습니다.
- concrete 설명은 최대 세 문장이고 마지막 문장은 항상 다음과 같습니다.
  - `Resource, 설정, 연결 관계는 바뀌지 않았습니다.`
- 모든 ranking finding을 설명할 수 있으며 한글 받침에 맞게 `이/가`를 선택합니다.

## RED 기록

### 최초 계약 RED

- 지정된 Web 명령은 기존 Board 테스트 6개만 통과하고 새 모듈 3개를 찾지 못해 실패했습니다.
  - `board-auto-organize-frames`
  - `board-auto-organize-candidates`
  - `board-auto-organize-explanations`
- 타입 계약 명령은 `board-auto-organize-contract` 모듈 부재로 실패했습니다.
- Editor 회귀 명령은 자동 프레임을 containment Area로 해석해 다음 항목이 실패했습니다.
  - 자식 이동에 따른 프레임 확대
  - 프레임 이동에 따른 저장 자식 이동
  - Resource 화면 깊이 증가
- layout 후보 테스트는 `layoutAutomaticDiagramCandidates` export 부재로 실패했습니다.

### 자체 검토 RED

- 재귀적으로 모든 `selected` key를 빼던 구현이 Resource 설정의 `parameters.values.selected` 변경을 놓쳤습니다. 회귀 테스트가 의미 동일성 `true`를 보여 RED였고, Diagram/node/edge의 직접 UI 선택 key만 제외하도록 고쳤습니다.
- 의미 serializer가 edge `zIndex` 변경을 허용했습니다. 타입 계약은 4/5로 RED였고 edge 화면 층을 의미에 남겨 5/5로 전환했습니다.
- 기존 Resource와 같은 ID의 자동 프레임이 중복 node로 추가됐습니다. 프레임 테스트는 2/3으로 RED였고 source의 non-auto node ID를 예약해 3/3으로 전환했습니다.
- `siblingAreaOverlapCount` 악화가 설명에서 빠졌습니다. 설명 테스트는 실제 이동 문장을 먼저 반환해 RED였고, finding 추가와 한국어 조사 처리를 거쳐 3/3으로 전환했습니다.

### 독립 리뷰 보강 RED

- `constrainBoardAutoOrganizeProposal`이 `source-exact` presentation을 `catalog-normalized`로 바꾸고 `sourceViewBox`와 `initialViewportPending`을 버렸습니다. Board 테스트는 6/7로 RED였고, `currentDiagram.presentation`을 deep 보존하도록 변환 경로를 제거해 7/7로 전환했습니다.
- 의미 serializer가 `terraformSourceFingerprint`만 남겨 presentation policy와 view box 변경을 놓쳤습니다. 타입 계약은 5/6으로 RED였고 presentation 전체를 직렬화해 6/6으로 전환했습니다.
- candidate에서 빠진 잠기지 않은 자동 프레임을 source presentation edge가 계속 참조할 수 있었습니다. 프레임 테스트는 3/4로 RED였고, 별도 edge lifecycle이 생기기 전까지 source edge endpoint 프레임을 보존해 4/4로 전환했습니다.
- route validator는 `svgPath` 문자열 안의 `NaN`/`Infinity`와 `arrowAngle`을 검사할 공개 검증 seam이 없어 focused 테스트가 missing export로 RED였습니다. 문자열의 비유한 표식과 angle 유한성을 모두 검사해 후보 테스트 5/5로 전환했습니다.

## 최종 검증

- `pnpm --filter @sketchcatch/types exec tsx --test src/board-auto-organize-contract.test.ts` — **6/6 통과**
- 지정된 Board/Editor focused Web 7-file 명령 — **69/69 통과**
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/infrastructure-graph.test.ts` — **17/17 통과**
- `pnpm --filter @sketchcatch/web exec tsc --noEmit` — **통과**
- 추가 `architecture-board-compiler.test.ts` + `automatic-diagram-layout.test.ts` — **49/49 통과**
- 공유 AWS 연결 회귀 `aws-connection-service.test.ts` — **19/19 통과**
- `pnpm harness:check` — **통과**
- `git diff --check` 및 Task 6 commit diff check — **통과**

## 호환성 및 자체 검토

- `layoutAutomaticDiagram()`은 새 후보 목록의 첫 결과를 반환하므로 기존 단일 소비자 모양과 선택 규칙을 유지합니다.
- `compileArchitectureBoard()`는 변경하지 않고 다중 후보 Compiler API만 추가했습니다.
- 원본 Diagram을 후보로 반환하지 않으며 후보 생성 과정에서 입력 Diagram을 mutation하지 않습니다.
- 잠긴 node와 잠긴 자동 프레임은 모든 후보에서 그대로 유지됩니다.
- full-tuple이 아닌 prefix-only Design Group은 기존 사용자 containment 동작을 유지합니다.
- 관계 endpoint가 바뀐 후보 route는 적용하지 않고, route를 바꿔도 원본 arrow direction을 복원합니다.
- 기존 `flow-mappers` 테스트의 숫자 font weight 기대값은 이미 적용돼 있던 CSS 감소 변수 문자열과 맞지 않아 focused 실행을 막고 있었습니다. production 코드는 건드리지 않고 현재 렌더 계약 문자열로 기대값만 맞췄습니다.
- schema, migration, dependency, AWS mutation, 외부 push는 없습니다.
- 동시에 진행된 Task 4/5 파일과 workspace 자료 파일은 stage하거나 수정하지 않았습니다.

## Commits

- `5dbfb695` — shared Board 자동 정리 안전 계약
- `1915a02e` — 자동 프레임 Editor/merge 경계
- `702d253a` — 최대 세 개의 안전한 결정론적 후보와 설명
- `3c73a3ec` — Terraform graph 및 표시 프레임 회귀 근거
- `dc7d8357` — Resource의 `selected` 설정 의미 보존
- `0f8f1034` — edge 화면 층 의미 보존
- `ef44e0f7` — 자동 프레임 ID 충돌 차단과 누락 finding 설명
- `44c97e05` — presentation, source edge endpoint, route 유한성 리뷰 보강

## Task 7 연계

- `sourceFingerprint`는 canonical source serializer 결과에서 결정론적으로 계산합니다.
- Task 7 서버는 fingerprint만 단독 신뢰하지 않고, 같은 serializer 재계산과 visual-only 의미 검증, ProjectDraft revision CAS를 함께 사용해야 합니다.
- Task 6 범위 안의 추가 우려 사항은 없습니다.
