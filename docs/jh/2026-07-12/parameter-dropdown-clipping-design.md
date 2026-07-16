# 파라미터 드롭다운 클리핑 수정 설계

## 배경

Resource 파라미터 패널의 공통 `SelectMenu`는 트리거 아래에 메뉴를 `position: absolute`로 렌더링한다. 필수 파라미터와 추가 설정 필드를 감싸는 `.parameterFieldList`가 `overflow: hidden`을 사용하므로, Route Table의 VPC reference처럼 메뉴가 필드 카드 경계를 벗어나는 순간 선택지가 잘린다.

## 전수조사 범위

- 필수 파라미터의 enum `SelectControl`
- 필수 파라미터의 단일 Resource `ReferencePicker`
- 추가 설정의 enum과 단일 Resource reference
- `NestedEditor`가 재귀적으로 렌더링하는 select와 reference
- Region 검색형 combobox
- Availability Zone `SelectMenu`
- 필수/추가 설정의 빈 옵션과 disabled 상태

Region과 Availability Zone은 `.parameterFieldList` 밖의 별도 패널 경로를 사용하므로 직접적인 클리핑 대상은 아니다. 하지만 파라미터 화면의 모든 드롭다운 검증 범위에는 포함한다.

## 선택한 설계

`.parameterFieldList`의 overflow를 `visible`로 바꾼다. 이 컨테이너의 책임은 필드 그룹의 테두리와 구분선이며, 하위 팝업을 자르는 것이 아니다. 공통 `SelectMenu`의 포커스, 키보드 탐색, ARIA, 선택 상태, 위치 계산은 변경하지 않는다.

공유 `SelectMenu` 전체를 `document.body` Portal로 이동하는 방식은 다른 화면의 위치·스크롤·포커스 계약까지 바꾸므로 이번 범위에서 제외한다. 개별 Resource나 필드별 예외 CSS도 누락 위험이 있어 사용하지 않는다.

## 검증 기준

- 필수와 추가 설정의 공통 필드 목록은 열린 메뉴를 자르지 않는다.
- enum, 단일 reference, nested select/reference가 같은 공통 수정으로 동작한다.
- Region과 Availability Zone 메뉴도 기존 동작을 유지한다.
- 메뉴는 다음 필드 위에 표시되며 목록 테두리 밖에서도 선택 가능하다.
- 패널 자체의 세로 스크롤은 유지한다.
- 공유 `SelectMenu`의 다른 Workspace/Dashboard 사용처 스타일은 변경하지 않는다.
