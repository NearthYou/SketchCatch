# Architecture Board 읽기 모드·섹션 집중 Implementation Plan

## 목표

기존 Architecture Board를 열었을 때 구조와 핵심 흐름이 먼저 보이게 하고, 편집·연결·상세 검토는 사용자가 명시적으로 시작할 때만 노출한다. 물리적 포함 관계와 기능 섹션을 분리해 Terraform 의미를 보존하면서 `섹션 보기`, `섹션 집중`, `섹션별 점검`을 제공한다.

이 계획은 UI/UX와 표시용 계약을 다룬다. DB migration은 필요하지 않다. 실제 Diagram/IaC 변경, AI 그룹 추천 반영, 자동 정리 적용은 기존 `User-Accepted Change` 경계를 유지한다.

## 현재 코드 기준선

- 기본 패널 폭은 `346 + 440 = 786px`이고 열림 상태까지 `localStorage`에 저장된다.
- 기존 Diagram은 이미 초기 `Fit view`를 실행하지만, 패널 상태 복원과 compact viewport 처리 뒤 보이는 프레임이 다시 달라질 수 있다.
- 리소스명은 저장값이 정확히 `"true"`일 때만 표시되어 신규 사용자 기본값이 `false`다.
- 줌 LOD는 `< 0.5`, `< 0.75`, `>= 0.75` 세 단계이며 edge label은 `0.75` 미만에서 숨는다.
- 리소스 label의 authored font-size는 `6px`이고 낮은 줌에서 보정하더라도 화면상 12px을 보장하지 않는다.
- 연결 대기 중 유효한 모든 후보 노드가 네 개의 target handle을 동시에 노출한다. 각 노드에는 source/target을 합쳐 여덟 개 handle DOM이 존재한다.
- `parentAreaNodeId`, Area node, edge `presentationRole`, Compiler의 `edgeCrossingCount`와 `supportLaneIntrusionCount`가 이미 있어 새 기능의 기반으로 재사용할 수 있다.

---

## #1: 기존 Board와 빈 Board의 기본 상태

Blocked by: 없음
Type: Prototype

### Question

저장된 패널 선호와 읽기 모드 기본값이 충돌할 때 어떤 상태를 우선할 것인가?

### Answer

Board 진입 시점의 문맥을 우선한다.

- 기존 Board(`nodes.length > 0`): 좌우 패널 닫힘, 리소스명 표시, 패널 레이아웃이 확정된 다음 한 번 Fit view.
- 빈 Board: 왼쪽 Resource 패널 열림, 오른쪽 패널 닫힘.
- `<= 1120px`: Board 유무와 관계없이 양쪽 패널 닫힘.
- 패널 폭은 계속 저장한다. 열림 상태는 현재 Workspace 세션의 명시적 사용자 조작만 반영하고, 다음 Board 진입의 문맥 기본값을 덮어쓰지 않는다.
- 노드 상세 보기, Terraform, Deployment처럼 사용자가 명시적으로 작업을 시작하면 오른쪽 패널을 연다.

## #2: Fit view와 12px 가독성의 양립

Blocked by: #1
Type: Prototype

### Question

큰 Board 전체를 Fit하면서 모든 개별 label을 화면상 12px 이상으로 보이게 할 수 있는가?

### Answer

개별 label을 항상 보이면 불가능하다. P1로 분리돼 있던 최소 LOD를 P0에 포함한다.

- `overview`: 개별 리소스명과 세부 edge를 숨기고 섹션명·리소스 수·이슈 수·핵심 흐름만 표시한다.
- `standard`: 아이콘과 짧은 사용자 label을 표시한다.
- `detail`: Terraform `resourceType.resourceName`과 edge 설명을 표시한다.
- 현재 `0.5/0.75` 숫자를 컴포넌트에 흩뿌리지 않고 단일 `BoardLodPolicy`에서 임계값, 표시 항목, 최소 화면 글자 크기를 계산한다.
- 보이는 텍스트는 inverse scale 또는 screen-space overlay로 12px 이상을 보장한다. 12px을 보장할 수 없는 항목은 작게 렌더링하지 않고 다음 LOD까지 숨긴다.
- 사용자 수동 줌은 유지하되, Fit 결과 때문에 작은 글자가 생기지는 않게 한다.

## #3: 연결 시작과 후보 표시

Blocked by: #2
Type: Prototype

### Question

연결 가능성을 유지하면서 네 방향 handle 노이즈와 키보드 포커스 수를 어떻게 줄일 것인가?

### Answer

연결을 독립적인 짧은 모드로 만든다.

1. 평상시에는 handle을 시각적으로 노출하지 않는다.
2. 선택 노드의 단일 `연결 시작` 액션 또는 키보드 단축키로 연결 모드에 진입한다.
3. 유효 후보 노드는 네 handle 대신 하나의 초록 외곽선으로 표시한다.
4. 포인터가 올라간 후보에서만 네 실제 연결점을 표시한다. 포인터 위치에 가장 가까운 점을 강조한다.
5. 키보드는 handle 네 개가 아니라 후보 노드 하나를 포커스 대상으로 삼고 `Enter`로 자동 선택된 최단 방향 handle에 연결한다.
6. `Escape`, 연결 완료, source 삭제 시 즉시 모드를 종료한다. 불가능한 후보는 포커스 순서에서 제외하고 이유는 필요할 때만 안내한다.

persisted `sourceHandleId`/`targetHandleId`는 유지한다. 변경 대상은 연결 중 view state와 interaction DOM뿐이다.

## #4: 물리적 포함 관계와 기능 섹션

Blocked by: #2
Type: Grilling

### Question

Region/VPC/Subnet과 Application/Data 같은 기능 그룹을 같은 parent 체계로 저장할 것인가?

### Answer

분리한다.

- `parentAreaNodeId`: Region → VPC → AZ → Subnet 같은 물리·네트워크 포함 관계만 담당한다.
- Security Group은 기존 계약대로 parent가 아니라 보안 범위/관계다.
- 기능 섹션은 provider-neutral `DiagramPresentation.sections` 계약으로 둔다.
- 섹션 role은 `entry`, `application`, `data`, `security`, `observability`, `delivery`, `shared`로 시작한다.
- 각 섹션은 stable id, 사용자 label, role, member node ids를 가진다. UI의 접힘/펼침과 현재 focus는 저장하지 않는 view state다.
- 규칙 기반 제안은 resource type, Terraform reference/edge, `parentAreaNodeId`를 사용한다. AI는 제안만 만들고 사용자가 승인한 section membership만 Diagram에 저장한다.
- 하나의 Resource는 물리적 Area와 기능 섹션에 동시에 속할 수 있지만 기능 섹션은 기본적으로 하나만 갖는다. IAM, CloudWatch, ECR 같은 횡단 Resource는 `shared`로 보낸다.

## #5: 섹션 접기·집중·점검

Blocked by: #4
Type: Prototype

### Question

섹션 요약과 섹션별 로직 검사를 실제 graph/IaC를 훼손하지 않고 어떻게 제공할 것인가?

### Answer

실제 `DiagramJson.nodes/edges`를 바꾸지 않는 projection layer를 둔다.

- 접힌 섹션은 `Application · 리소스 6 · 이슈 2` 형식의 view-only summary node로 렌더링한다.
- 섹션 외부 연결은 endpoint pair와 의미별로 집계한 view-only summary edge 한 개로 만들고 `외부 연결 4개`처럼 count를 표시한다.
- 섹션 선택 시 member와 직접 연결된 경로를 남기고 나머지는 흐리게 한다. `섹션 집중`은 member bounds로 Fit한다.
- breadcrumb는 기능 섹션과 물리적 포함 관계를 함께 표현한다. 예: `전체 구조 / Application / VPC / Private Subnet A`.
- 선택 Resource의 upstream/downstream 강조는 containment edge를 제외한 실제 관계 graph의 BFS로 계산하며, 기본 깊이는 1 hop, 사용자가 `전체 경로`를 선택하면 확장한다.
- 섹션별 점검은 프론트에서 보안 규칙을 새로 판정하지 않는다. 기존 `CheckFinding.resourceId`/Terraform address를 node에 매핑하고 category를 섹션별로 필터링한다.
- 초기 점검 관점은 Network(공개/비공개, NAT/Route), Application(LB, scaling, health), Data(암호화, 백업, Multi-AZ), Security(공개 범위, IAM), Observability(log/metric/alarm)다. 없는 검사 규칙은 별도 API 안전성 작업으로 추가한다.

## #6: 좌→우 자동 레이아웃과 품질 기준

Blocked by: #4, #5
Type: Prototype

### Question

새 레이아웃 엔진을 만들 것인가, 기존 Architecture Board Compiler를 확장할 것인가?

### Answer

기존 Compiler를 확장한다.

- main flow role을 `actor → entry → application → data` 순서로 고정한다.
- `security`, `observability`, `delivery`, `shared`는 상단/하단 support lane에 배치한다.
- 기존 `edgeCrossingCount`, `supportLaneIntrusionCount`를 유지하고 `longDetourCount`, `primaryFlowBacktrackCount`, `sectionOverlapCount`를 추가한다.
- 자동 정리는 현재처럼 최대 세 후보를 제안하고, before/after 지표와 미리보기를 보여준 뒤 사용자 승인으로만 적용한다.
- geometry 개선이 resource identity, parameters, containment, semantic endpoints를 바꾸지 않는 기존 안전 계약을 유지한다.

---

## 구현 마일스톤

### M0. 기준선과 측정

- [ ] 1280×720, 1440×900, 1920×1080, 200% browser zoom에서 기존/빈 Board fixture를 캡처한다.
- [ ] panel 가용 폭, Fit zoom, 화면상 label px, visible handle 수, keyboard tab stop 수를 테스트 가능한 지표로 만든다.
- [ ] 현재 Compiler 지표와 대표 Template 6개에서 교차선/우회선 기준값을 기록한다.

주요 파일:

- `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`
- `apps/web/features/diagram-editor/diagram-editor-viewer-policy.test.ts`
- `apps/web/features/diagram-editor/board-viewport.test.ts`
- `apps/web/features/architecture-board-compiler/architecture-board-quality.test.ts`

### M1. P0 읽기 모드와 최소 LOD

- [ ] `deriveInitialWorkspaceViewState` 순수 helper를 추가해 existing/empty/compact 상태를 한 곳에서 결정한다.
- [ ] panel open persistence를 문맥 기본값과 분리하고 width persistence는 유지한다.
- [ ] 리소스명 저장값이 없을 때 기본 `true`, 명시적 `false`는 존중한다.
- [ ] panel state가 확정된 뒤 existing Board에서 Fit을 정확히 한 번 실행한다.
- [ ] `BoardLodPolicy`와 12px screen-space 보장을 추가하고 overview에서 작은 개별 label을 숨긴다.

주요 파일:

- `apps/web/features/diagram-editor/DiagramEditor.tsx`
- `apps/web/features/diagram-editor/workspace-panel-preferences.ts`
- `apps/web/features/diagram-editor/resource-name-visibility-preference.ts`
- `apps/web/features/diagram-editor/board-viewport.ts`
- `apps/web/features/diagram-editor/board-visual-state.ts`
- `apps/web/features/diagram-editor/DiagramNodeView.tsx`
- `apps/web/features/diagram-editor/diagram-editor.module.css`

완료 기준:

- 기존 Board 첫 화면에서 양쪽 패널 0px 점유, 빈 Board에서 왼쪽만 346px 점유.
- 기존 Board는 첫 안정 frame에서 전체 구조가 보이고 불필요한 두 번째 viewport jump가 없다.
- 보이는 모든 Board 텍스트의 computed screen size가 12px 이상이다.

### M2. P0 연결 모드 정리

- [ ] idle/armed/target-hover 상태 머신을 순수 helper로 만든다.
- [ ] 후보 판정은 기존 `isAwsDiagramConnectionAllowed`를 재사용한다.
- [ ] candidate outline과 hovered target handle을 분리한다.
- [ ] 키보드 연결 흐름과 live region 안내를 추가한다.
- [ ] 기존 authored handle/edge route 저장 계약 회귀 테스트를 유지한다.

주요 파일:

- `apps/web/features/diagram-editor/DiagramEditor.tsx`
- `apps/web/features/diagram-editor/DiagramNodeView.tsx`
- `apps/web/features/diagram-editor/flow-mappers.ts`
- `apps/web/features/diagram-editor/types.ts`
- `apps/web/features/diagram-editor/diagram-editor.module.css`
- 신규 `apps/web/features/diagram-editor/connection-interaction-state.ts`

완료 기준:

- idle visible handle 0개.
- active 후보당 outline 1개, hovered/focused 후보에서만 실제 handle 최대 4개.
- 후보 수가 늘어도 키보드 tab stop은 후보 노드 수를 넘지 않는다.

### M3. P1 섹션 계약과 projection

- [ ] `DiagramPresentation.sections` shared type과 API Zod schema를 먼저 추가한다.
- [ ] 물리 containment와 functional section을 섞지 않는 validation을 추가한다.
- [ ] deterministic section suggestion과 accepted section materialization을 분리한다.
- [ ] 접힌 summary node/edge를 `DiagramJson` 밖의 render projection으로 만든다.
- [ ] 섹션 접기, 집중, breadcrumb, 1-hop/전체 관련 경로 강조를 구현한다.

주요 파일:

- `packages/types/src/index.ts`
- `apps/api/src/routes/project-draft-schemas.ts`
- `apps/api/src/routes/terraform.ts`
- `docs/data-models.md`
- 신규 `apps/web/features/diagram-editor/diagram-sections.ts`
- 신규 `apps/web/features/diagram-editor/section-view-projection.ts`
- `apps/web/features/diagram-editor/flow-mappers.ts`
- `apps/web/features/diagram-editor/DiagramEditor.tsx`

완료 기준:

- 접기/펼치기만으로 persisted nodes, edges, Terraform fingerprint가 바뀌지 않는다.
- 저장된 membership은 user-accepted 값만 포함한다.
- 외부 edge 집계 후에도 원본 관계 count와 endpoint 추적이 가능하다.

### M4. P1 섹션별 점검

- [ ] Terraform address ↔ Diagram node 매핑 helper를 추가한다.
- [ ] 기존 Pre-Deployment findings를 section/category/severity로 집계한다.
- [ ] 섹션 summary와 focus header에 이슈 수를 노출하고 선택 시 기존 상세 패널로 이동한다.
- [ ] 현재 엔진에 없는 Network/Application/Data/Observability 규칙은 API ticket으로 분리해 deterministic test부터 추가한다.

완료 기준:

- UI는 기존 finding을 재분류만 하며 자체적으로 pass/fail을 만들어내지 않는다.
- 같은 finding이 shared Resource 때문에 중복 집계되지 않는다.
- 섹션 이슈를 선택하면 정확한 Resource 또는 Terraform source로 이동한다.

### M5. P2 Compiler 레이아웃 개선

- [ ] provider-neutral semantic role resolver를 추가한다.
- [ ] main flow와 support lane constraints를 후보 생성에 적용한다.
- [ ] 긴 우회, 역방향 main flow, section overlap 지표를 품질 점수에 추가한다.
- [ ] 대표 Template과 AI/Reverse Engineering fixture에서 before/after evidence를 만든다.

주요 파일:

- `apps/web/features/architecture-board-compiler/architecture-board-compiler.ts`
- `apps/web/features/architecture-board-compiler/architecture-board-quality.test.ts`
- `apps/web/features/architecture-board-compiler/board-auto-organize-candidates.ts`
- `apps/web/features/architecture-board-compiler/architecture-board-compilation-preview.ts`
- 관련 knowledge/evidence 생성 artifact

완료 기준:

- main flow backtrack 0.
- support lane intrusion은 baseline 이하.
- edge crossing/long detour가 baseline보다 악화된 후보는 자동 추천하지 않는다.
- 사용자 승인 전 Board, IaC, DB 상태는 바뀌지 않는다.

## 권장 PR 분리

1. `Fix: Architecture Board 읽기 모드와 가독성 개선` — M0~M1
2. `Fix: Architecture Board 연결 후보 노이즈 제거` — M2
3. `Feat: Architecture Board 섹션 보기와 집중 모드 추가` — M3
4. `Feat: Architecture Board 섹션별 점검 연결` — M4
5. `Feat: Architecture Board 의미 기반 자동 정리 개선` — M5

각 PR은 독립적으로 revert 가능해야 한다. M1과 M2를 동시에 섞지 않고, M3 계약이 승인되기 전 M4/M5를 시작하지 않는다.

## 검증 게이트

각 코드 PR에서 다음을 실행한다.

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

수동 접근성 검증:

- 200% browser zoom에서 panel/toolbar/section summary가 잘리지 않는지 확인한다.
- 키보드만으로 Board 선택 → 연결 시작 → 후보 이동 → 연결 → 취소를 수행한다.
- screen reader에서 section summary, 접힘 상태, 후보 가능/불가, aggregated edge count를 확인한다.
- reduced motion에서 Fit/focus transition이 즉시 적용되는지 확인한다.

## 보류하지 말아야 할 순서

`읽기 모드 + 최소 LOD` → `연결 모드` → `섹션 보기/집중` → `섹션별 점검` → `Compiler 레이아웃` 순서로 진행한다. 섹션 기능을 레이아웃 개선 뒤로 미루지 않는다. 섹션 projection이 먼저 있어야 overview LOD와 edge 집계의 실제 요구를 기준으로 레이아웃 품질을 측정할 수 있다.
