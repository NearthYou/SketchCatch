# Curated Module 접기·펼치기 후속 설계

## 상태

후속 브랜치에서 다룰 작업이다. 현재 작업에서는 구현하지 않는다.

## 배경

Workspace 왼쪽 패널의 `Modules` 카탈로그에서 Curated Module을 Board에 추가하면 여러 Resource가 생성된다. 선행 작업은 Template을 참고해 Resource, 관계, 설정, 포함 구조, Area, 배치가 조립된 상태로 생성되게 만드는 것이다.

조립된 Module을 Board에 놓은 뒤 어떻게 보여주고 편집할지는 별도 문제다. 항상 모든 Resource를 펼치면 구조를 자세히 볼 수 있지만 큰 Board에서는 복잡해진다. 반대로 Module을 하나의 Resource처럼 합치면 내부 설정과 관계를 확인하기 어렵고 실제 Infrastructure Graph를 숨기게 된다.

## 제안

Curated Module의 Infrastructure Graph는 항상 개별 Resource와 관계로 유지하고, Board의 presentation만 접거나 펼칠 수 있게 한다.

- **펼침 상태**: Module의 모든 Resource, Area, 관계를 보여주며 각 Resource를 개별 편집할 수 있다.
- **접힘 상태**: Module을 하나의 요약 카드로 보여주되 내부 Resource와 관계를 삭제하거나 하나의 Resource로 변환하지 않는다.
- **Module 소속**: `parentAreaNodeId`가 아니라 별도의 `moduleInstanceId`로 표현한다. Module은 VPC나 Subnet 같은 containment Area가 아니다.
- **편집 이후**: 내부 Resource를 수정·추가·삭제해도 Module 소속과 원본 Module 정보를 유지하되, 원본에서 달라진 상태임을 표시할 수 있어야 한다.
- **외부 관계**: 접힌 Module과 외부 Resource 사이의 연결은 내부 관계를 잃지 않고 Module 경계의 대표 연결점으로 모아 표시한다.
- **배치 컴파일러 연동**: 펼친 상태에서는 Module 내부 기준 배치를 복원하고, 접힌 상태에서는 Module 요약 카드 단위로 상위 Board를 배치한다.

## 데이터 경계

접기·펼치기는 시각 상태이며 Architecture 의미를 바꾸지 않는다.

```text
Curated Module Definition
        ↓ expand
Module Instance
  ├─ Resource nodes
  ├─ semantic edges
  ├─ containment / presentation
  └─ moduleInstanceId
        ↓ collapse
Collapsed presentation card
```

다음 정보가 필요하다.

- Module definition ID와 version
- Board 안에서 Module 인스턴스를 구분하는 ID
- Module에 속한 Resource와 presentation node
- 접힘·펼침 상태
- 원본 Module에서 변경됐는지 나타내는 상태
- 접힌 카드에 보여줄 이름, 핵심 Resource 수, 주요 입출력 관계

현재 `moduleSource` metadata는 Module definition의 출처를 남기지만 같은 Module을 여러 번 추가했을 때 각 인스턴스를 안정적으로 구분하는 계약으로는 부족하다. 후속 구현에서는 별도의 인스턴스 identity를 정의해야 한다.

## 현재 작업과의 경계

현재 작업에 포함할 것:

- Template과 반복 패턴을 참고한 조립형 Curated Module 정의
- Resource, 관계, 설정, Area, 상대 배치를 함께 생성
- 배치 컴파일러가 Module 정의를 패턴과 배치 근거로 재사용

후속 브랜치로 넘길 것:

- Module 접기·펼치기 UI
- Module 전체 선택·이동·복제·삭제
- 접힌 카드와 외부 edge 표현
- Module 인스턴스 identity와 변경 상태
- 부분적으로 깨진 Module의 복구 또는 분리 UX

## 후속 그릴링 항목

1. Module을 처음 추가했을 때 기본 상태를 펼침과 접힘 중 무엇으로 할지
2. Module 내부 Resource를 삭제하면 `수정된 Module`로 유지할지, Module 소속을 해제할지
3. 중첩 Module을 허용할지
4. 접힌 Module에 어떤 입력·출력 관계와 경고를 표시할지
5. 여러 Module이 같은 VPC, Subnet, Security Group을 공유할 때 소속을 어떻게 표현할지

## 비범위

- Terraform module 생성 또는 변환
- 접힌 Module을 단일 Infrastructure Resource로 취급
- 사용자의 개별 Resource 편집 차단
- 접기·펼치기에 따른 Terraform 의미 변경
