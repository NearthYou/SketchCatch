# AWS Template Design 레이어 구현 계획

## 목표

`015_AWS템플릿Design시각레이어설계_gg.md`의 계약을 테스트 우선으로 구현하고, 여섯 Template를 실제 Board에서 반복 확인한다. 계획 문서 작성에서 멈추지 않고 구현·QA·커밋까지 끝낸다.

## 마일스톤 1. Design Catalog와 presentation 계약

### 작업

- `Source Repository`를 정식 Design Catalog 항목으로 추가한다.
- `TemplatePresentationNodeDefinition`과 `TemplatePresentationEdgeDefinition`을 추가한다.
- 기존 semantic Resource/relationship snapshot을 presentation 필드와 분리한다.
- presentation edge가 적어도 한 Design endpoint를 갖도록 builder에서 검증한다.

### 테스트 우선

- Source Repository와 모든 Design icon 존재 테스트
- Catalog 검색 대상과 drag payload 기본값 테스트
- presentation node/edge 계약 실패 테스트
- 기존 103개 Resource 수와 semantic hash 불변 테스트

### 커밋 기준

- Catalog와 presentation 타입·builder가 함께 통과할 때 커밋한다.

## 마일스톤 2. 실제 Catalog materialization과 계층

### 작업

- presentation node를 `catalogItemId`로 materialize한다.
- Catalog icon, label, size를 재사용한다.
- Region/AZ를 Template에서만 `kind: design`, parameters 없음으로 만든다.
- presentation node와 기존 Resource의 parent hierarchy를 최종 DiagramJson에 합성한다.
- 저장된 기존 Board hydration과 수동 drag 동작을 유지한다.

### 테스트 우선

- Design node의 Catalog ID/type/icon/kind 일치
- Design node parameters 없음
- Region/AZ/Group area 판정과 parent chain 정확성
- presentation edge와 semantic relationship 분리

### 커밋 기준

- 여섯 Template가 실제 Catalog node를 만들고 계층 계약이 통과할 때 커밋한다.

## 마일스톤 3. Template별 Design 구조와 compact 배치

### 작업

- Static과 Minimal에 User/Region flow를 추가한다.
- Full에 Source/User와 기능 lane, Region, Global IAM을 구성한다.
- 3-Tier에 Internet/Region/AZ A/B 계층을 구성한다.
- ECS에 User/Region/AZ와 Definition/Ops, Global IAM을 구성한다.
- EKS에 Region/AZ와 Global IAM을 구성하되 거짓 공개 entry를 만들지 않는다.
- 기존 103개 Resource를 40px grid 위에서 더 조밀하게 재배치한다.
- caption footprint, containment, edge crossing을 기준으로 routing을 보정한다.

### 테스트 우선

- Template별 Design node/parent/edge snapshot
- 모든 좌표와 area size 40px grid 정렬
- main/support 간격과 같은 행·열 중심선 계약
- sibling node/caption 충돌 0건
- child footprint parent 포함
- visible edge의 node/caption crossing 0건
- compact viewport와 바깥 여백 계약

### 커밋 기준

- Design 구조 커밋과 compact/routing 보정 커밋을 의미 있는 단위로 나눈다.

## 마일스톤 4. 실제 Board QA와 상태 기록

### 작업

- 로그인된 실제 Board에서 6개 Template를 모두 연다.
- 각 화면을 기준 PNG와 비교한다.
- Template마다 12개 항목을 확인한다.
- 실패 항목이 있으면 좌표·size·routing을 수정한 뒤 같은 QA를 반복한다.
- 다음 번호 QA 문서와 `006_문서구조_gg.md`를 갱신한다.
- `agent-progress.md`, `feature_list.json`, `session-handoff.md`에 검증 근거와 남은 위험을 기록한다.

### 화면 확인 항목

1. Design icon/label
2. Region 범위
3. AZ A/B
4. Group lane
5. main flow
6. support rail
7. sibling overlap
8. caption overlap
9. child cropping
10. edge crossing
11. 과도한 빈 공간
12. 초기 viewport

### 최종 검증

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

focused Template test와 catalog test도 별도로 실행한다. `apps/web/.codegraph`의 기존 깨진 symlink 때문에 build가 시작 전에 실패하면 관련 없는 파일을 삭제하지 않고 코드 실패와 구분해 기록한다.

### 완료 기준

- 작업 트리가 깨끗하다.
- 변경이 단계별 커밋으로 남아 있다.
- 기존 배포 Resource 103개와 semantic hash가 그대로다.
- 여섯 실제 Board 화면의 12개 QA가 모두 통과했다.
- 통과하지 못한 검증은 숨기지 않고 이유와 영향 범위를 기록한다.
