# Template 패턴 기반 조립형 Curated Module 설계

## 한 줄 결론

Workspace 왼쪽 `Modules` 카탈로그를 전면 재설계한다. 사용 가능한 Template의 실제 Resource 관계·포함관계·상대 geometry·edge routing을 기계적으로 추출한 `Module Pattern Knowledge`로 Module을 조립하고, 같은 지식을 Architecture Board Compiler에서도 사용한다.

## 핵심 문제

현재 Curated Module은 Resource 목록, 일부 기본값, 상대 offset과 variable binding만 정의한다. Module을 추가해도 관계선, containment, presentation Area와 완성된 routing이 생성되지 않아 Resource가 따로 놓인 것처럼 보인다.

이 문제를 사람이 새 좌표를 눈으로 정해 해결하지 않는다. 이미 사람이 읽기 좋게 정리한 Template Board를 근거 데이터로 사용한다.

현재 `architecture-board-knowledge/v1`은 Template별 node 수, 평균 간격, 밀도, aspect ratio 같은 집계값을 제공한다. 이 값은 Compiler 후보 점수화에는 도움이 되지만 특정 Module의 Resource 관계와 배치를 복원할 수 없다. Module 구현에서는 실제 관계와 정규화된 부분 geometry를 포함하도록 knowledge artifact를 확장해야 한다.

## Template과 Module의 경계

- **Template**은 새 프로젝트를 시작하는 완성형 Practice Architecture다.
- **Curated Module**은 기존 Architecture Board에 추가하는 이름과 목적이 정해진 재사용 구성이다.
- Template 전체를 이름만 바꿔 Module로 중복 제공하지 않는다.
- Module의 Resource 구성, 관계, containment와 시각 배치는 Template에서 추출한 패턴으로 결정한다.
- Module은 Terraform module이 아니다. 확장 후에는 일반 Resource와 관계로 동작한다.

## 사용자에게 보이는 분류

개발 용어인 `사용 사례별`은 UI에서 사용하지 않는다. Modules 화면은 두 관점을 제공한다.

- **기능별**: Network, Traffic, Compute, Storage, Database, Security, Operations, Delivery처럼 기술 기능을 기준으로 찾는다.
- **용도별**: 정적 웹 배포, 백엔드 API, 컨테이너 운영, 고가용성 데이터 계층처럼 사용자가 하려는 일을 기준으로 찾는다.

두 관점은 서로 다른 Resource 생성 엔진이 아니다. 같은 Module Pattern Knowledge를 다른 방식으로 탐색한다. 한 Module이 두 관점에 함께 노출될 수 있다.

현재의 `VPC Network`, `EC2 App Host`, `S3 Storage`, `DynamoDB Table`, `Security Boundary` 5개 정의는 호환 대상으로 유지하지 않는다. 이름, 목적, Resource 범위와 조립 결과를 Template corpus 기준으로 전면 재설계한다.

## Module Pattern Knowledge

사용 가능한 전체 Template corpus에서 다음 정보를 결정론적으로 추출한다.

- Resource type과 semantic role
- 함께 등장하는 Resource 구성
- Resource 사이 edge의 source, target, 방향, label과 의미
- parent Area chain과 containment depth
- presentation Area와 Group
- Module 원점 기준 상대 x/y, width/height, 정렬과 간격
- z-index와 layering
- edge handle, waypoint와 routing 형태
- 주 흐름과 support Resource의 상대 위치
- 출처 Template ID와 knowledge version

절대 캔버스 좌표를 그대로 외우지 않는다. Module 원점을 `(0, 0)`으로 정규화하고 Resource·Area 사이의 상대 관계를 보존한다.

같은 구조가 여러 Template에 있으면 Resource와 edge 구조를 canonical fingerprint로 묶는다. 시각 값은 무작정 평균 내지 않고, 다른 사례와의 정규화된 차이가 가장 작은 실제 사례인 medoid를 대표 geometry로 선택한다. 출처 Template ID는 모두 보존한다.

별도 AI model을 학습하거나 LLM에게 좌표를 생성하게 하지 않는다. 동일한 Template corpus와 extractor version은 동일한 knowledge artifact와 Module 결과를 만들어야 한다.

## Module 후보와 이름

Module은 임의의 모든 부분 graph 조합이 아니다. 사용자가 목적을 이해할 수 있는 이름 있는 인프라 구성이다.

- 기능 anchor와 용도별 architecture signal을 기준으로 Template 안의 연결된 구조를 찾는다.
- 반복되는 구조는 canonical fingerprint로 합치되 provenance는 모두 남긴다.
- 기능별·용도별 이름은 고정된 provider-neutral role label과 한국어 용도 label mapping으로 생성한다.
- 별도의 사람 검토·승인 workflow는 만들지 않는다.
- 추출 결과가 잘못되면 개별 좌표를 손으로 고치는 대신 source Template 또는 extractor 규칙을 수정한다.

## 관계 우선 계약

Module에서 가장 중요한 것은 Resource 사이의 관계다. 시각 품질은 관계를 보존한 뒤 개선한다.

우선순위는 다음과 같다.

```text
Resource 관계 정확성
→ containment 정확성
→ Template에서 학습한 상대 geometry
→ overlap·edge 교차·빈 공간을 줄인 시각 품질
```

Module pattern은 다음 조건을 만족해야 한다.

- source Template의 선택된 Resource 사이 semantic edge를 빠뜨리지 않는다.
- edge source와 target을 새 node ID로 정확히 remap한다.
- dangling edge를 만들지 않는다.
- Area parent chain을 새 Area ID로 remap한다.
- 관계를 만들기 위해 필요한 Resource를 조용히 생략하지 않는다.
- 더 예쁜 배치를 이유로 edge 의미나 방향을 바꾸지 않는다.

## Module 추가 계약

사용자가 Module을 선택하면 Module 정의에 포함된 내용을 전부 현재 Board 오른쪽의 새 공간에 생성한다.

- Resource, semantic edge, 설정과 Terraform reference
- presentation Area와 실제 containment
- Template pattern에서 얻은 상대 위치, 크기와 z-index
- edge handle, label과 routing
- variable과 binding
- Module ID, version과 reference Template provenance

추가 동작은 현재 Board 상태를 보고 Architecture 판단을 하지 않는다.

- 기존 VPC, Subnet, Security Group 또는 같은 Module이 있어도 재사용하지 않는다.
- 기존 Resource와 병합하거나 일부 Resource를 생략하지 않는다.
- 이름과 ID 충돌을 피하기 위한 기술적 고유화만 수행한다.
- 중복 정리나 구조 변경은 사용자가 편집하거나 Compiler 제안으로 수행한다.

## Architecture Board Compiler 재사용

Curated Module과 Compiler는 별도 복사본이 아니라 같은 Module Pattern Knowledge를 사용한다.

- Compiler는 node/edge/containment fingerprint로 알려진 Module 구조를 찾는다.
- 알려진 구조의 내부 배치 후보는 해당 Module의 학습된 상대 geometry에서 만든다.
- Module 사이의 상위 흐름과 간격은 Compiler의 기존 후보 생성·점수화가 결정한다.
- 빠진 관계, 잘못된 containment와 흐트러진 내부 배치는 Compiler 변경 제안에 포함할 수 있다.
- Module 추가는 정의를 그대로 확장하지만 Compiler는 기존 계약대로 제안만 생성하고 사용자 승인 전에는 Board를 바꾸지 않는다.

## 구현 Seam

Template source를 읽는 생성 단계와 브라우저 실행 단계를 분리한다.

```text
Template corpus
  → deterministic Module pattern extractor
  → versioned generated knowledge artifact
  → Curated Module catalog / materializer
  → Architecture Board Compiler
```

- generator만 원본 Template fixture를 순회한다.
- 브라우저는 생성된 artifact만 읽는다.
- Module materializer는 `moduleId + current DiagramJson`을 받아 새 DiagramJson을 반환하는 순수 계산 Module로 유지한다.
- UI는 카탈로그 탐색과 추가 요청만 담당하고 관계·좌표 조립 규칙을 알지 않는다.
- Compiler는 동일 artifact를 소비하며 별도 패턴 목록을 유지하지 않는다.

## 품질 기준

최소 검증 기준은 다음과 같다.

- 생성된 모든 Resource와 Area ID가 고유하다.
- 모든 edge endpoint와 parent Area가 존재한다.
- source pattern의 required Resource와 semantic edge가 모두 보존된다.
- Terraform reference와 variable binding이 새 이름·ID에 맞게 remap된다.
- Resource가 의도한 parent Area 안에 있다.
- 일반 Resource끼리 겹치지 않는다.
- 형제 Area끼리 겹치지 않는다.
- edge가 Resource title 또는 node 내부를 불필요하게 통과하지 않는다.
- 주 흐름 방향, 간격과 layering이 reference Template pattern과 일치한다.
- 동일 입력은 동일 provenance를 제외하고 동일한 결과를 만든다.
- 기능별·용도별 탐색에서 같은 Module을 추가하면 같은 조립 결과가 나온다.
- 생성된 Module을 Compiler에 넣어도 관계가 사라지지 않는다.

## 현재 범위에서 제외

다음은 이번 구현에 포함하지 않는다.

- Module 접기·펼치기
- Module 전체 선택·이동·복제·삭제
- 접힌 Module summary card
- Module instance identity와 수정 상태
- Terraform module 생성

접기·펼치기는 다음 문서와 후속 브랜치에서 구현한다.

- `docs/gg/feat-gg-curated-module-presentation/000_Curated_Module_접기펼치기_후속설계_gg.md`

## 완료 조건

- 기존 5개 임시 catalog가 기능별·용도별 Module catalog로 교체된다.
- Module을 추가하면 분리된 Resource가 아니라 관계·Area·배치가 완성된 구조가 생성된다.
- Module의 조립 결과가 생성된 Template pattern knowledge에 의해 결정됨을 테스트로 증명한다.
- 같은 knowledge를 Compiler가 실제 후보 생성 또는 Module 내부 배치에 사용한다.
- 접기·펼치기 코드는 이번 변경에 포함되지 않는다.
