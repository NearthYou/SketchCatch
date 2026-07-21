# Module Catalog 단순 모듈 우선 정렬 설계

## 목표

Module Catalog에서 이해하기 쉬운 작은 모듈이 많은 섹션을 위로 올리고, 큰 모듈 위주의 섹션은 아래로 보낸다.

## 현재 상태

`createModuleCatalogGroups()`는 Module을 lens별 섹션으로 묶은 뒤 섹션 이름순으로만 정렬한다. 각 Module의 Resource 수는 presentation Area를 제외하고 이미 `countModuleResources()`로 계산한다.

## 결정

섹션의 우선순위는 현재 선택한 lens와 검색 결과에 포함된 Module만 사용해 다음 순서로 결정한다.

1. Resource가 3개 이하인 Module 수가 많은 섹션을 먼저 표시한다.
2. 동점이면 섹션의 평균 Resource 수가 적은 쪽을 먼저 표시한다.
3. 다시 동점이면 가장 큰 Module의 Resource 수가 적은 쪽을 먼저 표시한다.
4. 완전히 같으면 기존의 label, key 이름순으로 고정한다.

`3개 이하`는 현재 Catalog에서 단일 기능을 바로 이해할 수 있는 Module 크기다. Resource 수에는 보드의 presentation Area를 포함하지 않는다.

## 범위

- `moduleCatalogSection`의 섹션 순서만 바꾼다.
- 각 섹션 안 Module 카드의 제목순 정렬, Module 선택·추가, 검색 및 lens 전환은 유지한다.
- 검색한 상태에서는 검색 결과로 남은 Module만으로 섹션 우선순위를 다시 계산한다.

## 제외 범위

- Module의 Resource·연결·Terraform 생성 변경
- Module 카드 디자인 및 텍스트 변경
- Resource Catalog와 Template 정렬 변경

## 검증

- 기능별과 용도별 목록에서 단순 Module 중심 섹션이 복잡한 섹션보다 앞선다.
- 입력 Module 배열 순서를 뒤집어도 같은 결과를 만든다.
- 검색 결과에서도 같은 우선순위 규칙을 사용한다.
- 관련 Web 테스트와 lint/typecheck를 실행한다.
