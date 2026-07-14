# Presentation Area 표시와 상호작용 역할 분리 설계

## 목적

`presentationArea: true`가 붙은 ECS Cluster, API Gateway, Kubernetes Namespace 같은 템플릿 리소스는 큰 배경 프레임으로 계속 표시한다. 다만 이 프레임의 빈 공간을 클릭했을 때 실제 Area처럼 선택되거나 신규 리소스의 drop 부모가 되지는 않게 한다.

이 변경은 AWS 또는 Terraform 포함 관계를 바꾸지 않는다. 기존 템플릿이 저장한 `parentAreaNodeId`와 자식 동반 이동 같은 레이아웃 동작은 유지한다.

## 현재 문제

현재 `isAreaNode()`는 다음 책임을 함께 담당한다.

- 큰 프레임 렌더링
- 빈 공간 클릭 hit-test
- 빈 공간 드래그
- drop 부모 판정
- 레이아웃 자식 이동과 크기 조정

`presentationArea`가 `isAreaNode()`를 참으로 만들면서, 화면 표시만을 위한 프레임도 빈 공간 클릭 대상이 된다. 선택된 presentation 프레임 이외의 모든 노드가 기존 공통 선택 강조 규칙에 따라 흐려진다.

## 검토한 접근

### 1. 흐림 효과만 제거

presentation 프레임을 선택하되 자식 또는 전체 노드의 흐림만 막는다.

- 장점: 변경 범위가 작다.
- 단점: 일반 리소스인 ECS Cluster의 빈 공간이 계속 실제 Area 선택과 드래그를 시작한다. drop 부모 판정도 그대로 남는다.

### 2. `presentationArea`를 Area 판정에서 완전히 제거

`isAreaNode()`가 `presentationArea`를 무시하게 한다.

- 장점: 일반 리소스 동작으로 즉시 돌아간다.
- 단점: 템플릿의 큰 배경 프레임 렌더링과 기존 자식 배치가 깨진다.

### 3. 표시, 레이아웃, 빈 공간 상호작용, drop 부모 판정을 분리

`presentationArea`는 큰 프레임 렌더링과 기존 템플릿 레이아웃에만 남긴다. 빈 공간 상호작용과 신규 drop 부모 판정에서는 제외한다.

- 장점: 템플릿 표현과 기존 Board 상호작용을 모두 보존한다.
- 단점: Area 역할별 판정 함수와 회귀 테스트가 추가된다.

이 설계는 3번을 선택한다.

## 역할 경계

### 시각 Area

기존 `isAreaNode()` 의미를 유지한다. Region, VPC, Subnet, Security Group 시각 범위와 `presentationArea` 리소스를 큰 프레임으로 렌더링한다.

### 레이아웃 컨테이너

기존 템플릿이 이미 가진 `parentAreaNodeId`를 보존하고, 컨테이너 이동 시 자식 배치가 함께 유지되게 한다. 이번 변경에서는 기존 레이아웃 geometry 계약을 바꾸지 않는다.

### 빈 공간 상호작용 Area

Region, Availability Zone, VPC, Subnet, 일반 디자인 Area만 빈 공간 클릭과 드래그를 시작할 수 있다. `presentationArea` 전용 프레임과 Security Group 시각 범위는 제외한다.

hit-test는 가장 안쪽 시각 Area를 먼저 찾는다. 가장 안쪽 프레임이 상호작용 불가한 presentation 전용 프레임이면 바깥 VPC로 클릭을 관통시키지 않고 `null`을 반환한다. 따라서 빈 presentation 프레임 클릭은 선택 해제로 이어진다.

presentation 리소스 자체의 설정을 열어야 할 때는 기존 헤더 또는 아이콘 클릭을 사용한다. 명시적으로 리소스를 클릭한 경우에는 일반 리소스 선택 강조 규칙을 그대로 적용한다.

### 신규 drop 부모

`presentationArea` 전용 프레임과 Security Group 시각 범위는 새로 드래그한 리소스의 부모 후보에서 제외한다. VPC, Subnet 등 실제 Board containment Area만 후보가 된다.

## 데이터 흐름

```text
빈 캔버스 클릭
→ 클릭 좌표에서 가장 안쪽 시각 Area 탐색
→ presentation 전용 또는 Security Group 시각 범위이면 null
→ 아니면 실제 상호작용 Area 반환
→ null이면 선택 해제, Area이면 기존 선택·드래그 동작 실행
```

렌더링은 계속 `isAreaNode()`를 사용하므로 presentation 프레임의 모양과 크기는 바뀌지 않는다.

## 테스트

다음 회귀를 자동화한다.

1. `presentationArea` ECS Cluster는 계속 시각 Area로 판정된다.
2. VPC 안의 presentation ECS 프레임 빈 공간을 클릭하면 ECS도 VPC도 선택하지 않는다.
3. 같은 VPC에서 presentation 프레임 바깥의 빈 공간을 클릭하면 VPC가 선택된다.
4. 일반 Region/VPC/Subnet 빈 공간 선택 동작은 유지된다.
5. 신규 리소스 drop 부모 탐색은 presentation 프레임을 건너뛰고 실제 VPC를 선택한다.
6. 기존 템플릿 레이아웃 및 자식 이동 테스트가 계속 통과한다.

## 범위 밖

- `presentationArea` shared type 제거 또는 이름 변경
- Terraform 생성 및 AWS 배포 계약 변경
- 선택 강조 색상이나 opacity 재설계
- 템플릿 좌표와 크기 변경
