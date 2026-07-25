---
status: accepted
---

# 자동 정리는 소속 없는 표시 프레임을 사용

Board Auto Arrange가 주제별 경계를 추가할 때는 Resource 소속을 저장하는 Group이나 기존 containment를 재사용하지 않고, 제목·위치·크기·스타일만 가진 `design` 표시 프레임을 사용한다. 프레임은 주변 Resource ID와 부모 관계를 저장하지 않으며 Terraform, Provider graph, 검사, 배포에서 Architecture 의미로 해석하지 않는다.

별도의 표시용 소속을 저장하면 Resource 이동마다 숨은 membership을 관리해야 하고, `parentAreaNodeId`를 재사용하면 VPC·AZ·Subnet의 실제 소속을 바꾼 것처럼 보일 수 있다. 따라서 자동 정리는 표시 프레임을 만들고·합치고·제거할 수 있지만 Resource의 기존 containment는 항상 유지한다. 이 결정은 ADR 0015의 `표현용 영역 배치`를 소속 없는 장식 요소로 구체화한다.

직렬화는 기존 `kind: "design"`, `type: "design_group"`, `metadata.presentationCatalogItemId: "design-group"` 형식을 사용한다. 자동 생성 프레임만 ID가 `board-auto-frame:`으로 시작한다. 네 값이 모두 맞는 full tuple만 자동 소유 프레임으로 판단하며 ID prefix 하나만 보고 사용자 요소를 삭제하지 않는다. full tuple이 맞고 잠기지 않은 프레임만 다음 자동 정리에서 자동 병합·삭제할 수 있다. 사용자가 직접 만든 Design Group은 위치·크기 제안 대상이 될 수 있지만 자동 병합·삭제하지 않는다. 제목이나 좌표로 소유권을 추측하지 않고 새 schema 필드도 추가하지 않는다.

표시 프레임은 Resource drop parent, containment 추론, 실제 area auto-size 대상에서 제외한다. 과거 Board에 이미 저장된 parent 값은 이 기능을 추가하면서 자동 삭제하지 않는다. 잠긴 자동 프레임은 다른 잠긴 요소와 같이 위치·크기·병합·삭제 대상에서 제외한다.

표시 프레임은 일반 Board 편집에 실시간으로 따라가지 않는다. 사용자가 Resource를 옮기면 프레임은 그대로 남고 직접 편집할 수 있으며, 다음 Board Auto Arrange 요청에서만 현재 배치를 기준으로 다시 계산하고 새 승인을 받는다. 이 경계는 숨은 소속 추론과 승인 없는 Board 변경을 막는다.
