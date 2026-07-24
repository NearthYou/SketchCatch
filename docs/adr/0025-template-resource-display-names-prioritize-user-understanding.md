---
status: accepted
---

# Template Resource Display Name은 사용자 이해를 우선

모든 Template은 Resource 수, 관계, 설정, IaC Identity, provider-side name을 유지하면서 기존 Resource `label`을 사용자 중심의 Resource Display Name으로 정리하고, Region·AZ·network zone 같은 비 Resource 영역에는 간결한 Architecture Area Title을 사용한다. Architecture Area Title의 계층과 중복 처리 방식은 기존 Template 동작을 유지하고 새 고유성 규칙을 강제하지 않는다. Resource를 숨기거나 합치지 않으며, 같은 이름을 Architecture Board, Resource 패널, Template 미리보기와 사용자 설명에 일관되게 사용하고 IaC Identity는 상세·복사·진단에서만 보조 정보로 제공한다. 이 규칙은 Template의 최초 생성 이름에만 적용하며, 적용 후 사용자가 편집한 이름은 자동 보정하거나 제한하지 않는다.

외부 Template의 원본 이름을 그대로 보여주는 방식은 수집 증거에는 충실하지만 `default`, `snet1`, `iam-cluster`처럼 사용자가 역할을 알기 어려운 이름을 만든다. 따라서 원본 수집 기록은 보존하되 실제 Template의 기존 `label`을 직접 정리한다. 주요 Resource type, 널리 쓰이는 AWS 약어와 AWS에서 정착된 역할어는 영어를 유지하고, application-specific role은 짧은 한국어로 표현한다. 기술적인 보조 Resource는 `ECR 읽기 권한 연결`처럼 목적 중심 이름을 허용하고 정확한 provider type은 상세 정보에서 제공한다. 이름은 Template 전체에서 고유해야 하며 역할, 위치, 번호 순으로 구분한다. Resource Display Name은 보드에서 무조건 한 줄로 표시한다.

이 결정은 현재 적용 가능한 29개 Template(직접 제작 6개와 원본 수집에 성공한 Brainboard 23개)의 기존 이름을 사람이 직접 검토하고 정리하는 일회성 작업이다. 원본 수집에 실패한 Brainboard 기록 1개에는 적용할 Resource가 없으므로 범위에서 제외한다. 새로운 전역 이름 생성기나 이름 규칙 전용 자동 검사는 추가하지 않으며, 기존 Template 기능 검증과 29개 전체 수동 화면 검토로 결과를 확인한다. 이름이 반영된 실제 Board를 29개 모두 다시 캡처하고 각 versioned WebP와 현재 Diagram의 `diagramHash`를 함께 갱신한다.

Resource `label`은 승인된 대소문자로 저장하지만 Architecture Board의 기존 강제 대문자 표시는 유지한다. 다른 사용자 화면은 저장된 `label`의 대소문자를 사용하며, Template 전용 대소문자 분기나 새 표시 계약은 추가하지 않는다.

먼저 `AWS onboarding` Template의 Resource와 Architecture Area 이름을 파일럿으로 정리해 실제 Board에서 한 줄 표시와 용어를 확인한다. 이 파일럿을 사용자가 승인한 뒤 같은 기준으로 나머지 28개 Template을 정리한다.
