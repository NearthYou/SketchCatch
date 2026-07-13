# Brainboard AWS Template 24개 원본 캡처 QA

## 범위

- 원본: Brainboard `Templates`의 Chafik Belhaoues 작성 AWS Template
- 순서: 2026-07-14 화면의 다운로드 수 내림차순
- 대상: 24개 (`빈 보드로 시작` 제외)
- 안전 조건: `Plan`, `Apply`, `Deploy`는 실행하지 않음
- 저장 위치: `brainboard-captures/*.json`
- 순서·해시 인덱스: `brainboard-capture-index.json`

## 결과

- 전체 레코드: 24
- 완전 캡처: 23
- 원본 복제 실패: 1
- ID/sourceTemplateId 중복: 0
- node/edge/order 중복: 0
- dangling parent/edge: 0
- Terraform file SHA-256 불일치: 0
- 위치 누락, 0 크기 node, 빈 SVG edge path: 0
- raw parent 2-node cycle: 43쌍(86 node, 16개 capture)
- 더 작은 rectangle을 parent로 가리키는 raw link: 59
- endpoint/path/arrow까지 완전히 같은 parallel edge 경고: 9쌍
- `rotate(-90 …)`를 가진 node: 10

위 cycle과 parallel edge는 raw source 증거의 오류를 숨기지 않기 위해 캡처 JSON에서 삭제하거나 고치지 않았다. 따라서 이 디렉터리의 JSON은 원본 증거이며 곧바로 runtime fixture로 사용하면 안 된다. 별도 normalize 단계가 parent inversion을 결정적으로 고치고, semantic duplicate edge는 원본 화면 대조 결과가 없으면 보존한다.

## 캡처 내용

성공한 각 원본에는 다음 증거를 순서 그대로 보존한다.

1. Brainboard source URL과 새로 만든 clone board URL
2. SVG `viewBox`
3. DOM 순서의 node ID, 좌표, 크기, Resource type, 제목, semantic parent
4. DOM 순서의 edge ID, authored SVG path, waypoint, 화살표, 양 끝 node/port
5. Brainboard Code pane의 파일 순서
6. 각 Terraform 파일의 전체 코드, SHA-256, workspace 포함 여부
7. Terraform `resource`/`data` address 순서

raw `sourcePoint`/`targetPoint`는 222개 edge 모두 보존되었으며 각각 첫/마지막 waypoint와 일치한다. 10개 node의 비영(非零) 회전도 `transform` 문자열에 보존되어 있다. source fixture 계약과 renderer가 이 값을 명시적으로 받을 때까지 source-exact 완료로 집계하지 않는다.

Terraform은 화면에 보이는 34줄만 저장하지 않도록 line number를 첫 줄부터 마지막 줄까지 순회해 수집했다. 이 재검증에서 다음 초기 누락을 찾아 복구했다.

- `AWS network landing zone`: `private.tf` 34→40줄, `public.tf` 34→68줄, Resource address 14→21
- `AWS multi-account management`: `prod-account.tf` 34→130줄, `providers.tf` 34→39줄, Resource address 8→18
- `AWS ECS with Fargate`: `fargate.tf` 34→72줄, `variables.tf` 34→42줄
- `AWS 3-tier web app with a database`: `variables.tf` 34→168줄
- `AWS Jenkins architecture on EC2`: `variables.tf` 34→55줄
- `AWS costs monitoring`: `variables.tf` 34→40줄

## Normalization 전 확인된 gap

- raw parent는 referential dangling이 없지만 43개의 2-node cycle을 포함한다. Region↔VPC, AZ↔Subnet처럼 큰 container와 그 안의 child가 서로를 parent로 가리키는 경우다.
- normalize 단계에서는 기존의 유효한 parent는 보존하고, parent rectangle이 child보다 작은 59개 link만 대상으로 child를 완전히 감싸는 가장 작은 strictly-larger candidate를 선택한다. 후보 동률은 임의 선택하지 않고 override를 요구한다.
- AWS처럼 보이는 node는 341개, Terraform address는 331개다. block 없는 8개 visual node는 presentation으로 분류해야 하고, FSx/RDS 두 사례는 하나의 address를 두 visual이 나타내므로 visual-alias 또는 대표 resource 선택이 필요하다.
- title/name exact match 170개와 type별 단일 후보 63개만 직접 대응된다. 나머지 38개 type group은 HCL 값·reference·containment·edge topology와 review된 override로 해결하며 배열 순서끼리 맞추지 않는다.
- `text` 11개는 visible text가 빈 문자열로 캡처됐고 `brainboard_shape` 2개는 fill/stroke 정보가 없다. 이 값은 추측하지 않고 unresolved evidence로 남긴다.
- Terraform expression을 평범한 문자열로 낮추면 `"var.foo"`와 `var.foo`가 구분되지 않는다. variable/local/index/function/interpolation/heredoc을 위한 tagged expression 계약이 준비되기 전에는 의미 보존 완료로 표시하지 않는다.
- Terraform block 331개 중 83개는 `main.tf`가 아닌 파일에 있으므로 file name을 `main.tf`로 기본화하지 않는다.
- `undefined.tf`가 비어 있는 상태로 포함된 capture가 5개 있다. 원본 그대로 유지하고 임의 rename하지 않는다.

## 원본 장애 1건

`AWS instance and DB with multiple networks` (`09fd3420-d8f0-409c-a1cc-694dba97443f`)는 Brainboard의 `Create architecture`가 아래 세 조건에서 모두 HTTP 400 `ERR_BAD_REQUEST`를 반환했다.

1. `ai-workout-board-production` / `Production` / 원본 기반 이름
2. `ai-workout-board-production` / `Production` / 짧은 고유 이름
3. `Project 1` / `Development` / 짧은 고유 이름

별도로 빈 복구 보드(`#381 recovery 09fd3420`)를 만든 뒤 템플릿 상세의 `Clone into current architecture`도 재시도했다. 보이는 단일 버튼임을 확인하고 두 번째 클릭 후 12초를 기다렸지만 모달은 열린 채였고 canvas는 비어 있었으며 undo는 비활성, `main.tf`는 빈 1줄 그대로였다. 즉 새 아키텍처 생성과 현재 아키텍처 복제 두 경로가 모두 실패했다.

원본 페이지와 3840×2160 공개 preview URL은 실패 레코드에 보존했다. 공개 검색에서도 동일 UUID/제목의 Terraform 원본은 발견되지 않았다. 따라서 source Terraform을 추측해 성공으로 위장하지 않고 `failed`로 남긴다. 구현 단계에서는 preview 기반 diagram fallback을 별도 표시할 수 있지만, Terraform parity는 검증 완료로 표시하면 안 된다.

## 재현 검증

원본 JSON 전체에 대해 다음 capture-level 검사를 다시 계산한다.

- manifest의 24개 ID/sourceTemplateId와 집합 일치
- node/edge ID와 order 유일성
- parent와 edge endpoint의 dangling 참조
- endpoint와 선택 node boundary 거리
- 모든 Terraform file의 SHA-256

최종 결과는 24개 레코드, 성공 23개, 실패 1개였고 위 capture-level 검사 오류는 0개였다. 별도로 발견한 parent cycle, mapping ambiguity, semantic duplicate edge, 누락된 text/style은 normalization 경고로 명시하며 성공으로 숨기지 않는다.
