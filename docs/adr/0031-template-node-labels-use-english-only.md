---
status: accepted
supersedes: 0025-template-resource-display-names-prioritize-user-understanding
---

# Template Node Label은 영어만 사용

Template에서 최초 생성되는 Resource Display Name과 Architecture Area Title은 영어만 사용한다. 이 결정은 ADR 0025의 한국어 application-role 허용 부분을 대체한다.

Template의 Resource 수, 관계, 설정, IaC Identity와 Terraform identity, provider-side name, Board 구조는 바꾸지 않는다. 이 결정은 Template이 만드는 최초 label에만 적용하며, 생성 후 사용자가 편집한 label은 자동 보정하거나 제한하지 않는다.

일반 UI의 언어와 Template 밖에서의 label 언어 규칙도 바꾸지 않는다. Resource Display Name과 Architecture Area Title은 계속 한 줄의 사용자 중심 이름으로 사용하며, 영어만 사용한다는 범위는 Template의 최초 node label로 한정한다.

초기 Template label은 node를 구분하거나 구조를 설명하지 않는 Template 전체·도메인·환경·구현 상세·provider 맥락 수식어를 생략한다. 예를 들어 `Items API Route`는 `API Route`로, 단일 API Stage의 `Production API Stage`는 `API Stage`로 사용한다. 이 결정은 label에만 적용하므로 Terraform 또는 provider-side name의 소문자 `items`/`prod` 값은 바꾸지 않는다.

다만 공식 Resource/Service type과 의미 또는 구분에 필요한 수식어는 유지한다. multi-tier 다이어그램의 `Public`/`Private`, `Web`/`Application`/`Database`, `Master`/`Worker`, 계정·환경별 VPC, `A`/`B`, 역할과 방향을 나타내는 표현은 초기 label에서 제거하지 않는다.
