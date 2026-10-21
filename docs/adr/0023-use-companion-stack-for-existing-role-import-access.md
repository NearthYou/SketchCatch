---
status: accepted
---

# 모든 기존 Role의 가져오기 권한은 별도 Stack pair로 관리

기존 verified AWS 연결의 가져오기 권한이 부족하면 원래 CloudFormation Stack을 업데이트하지 않고 connection별 Import Access Stack Pair를 사용한다. ADR 0028에 따라 Manager Stack은 CloudFormation service Role과 최소 제어 Policy를, Policy Stack은 같은 기존 Role에 연결하는 Reverse Engineering 읽기 Policy를 소유한다. connection ID, 원래 Stack, 기존 Role, 배포 Policy는 그대로 유지한다. service Role은 연결·조회·배포에 사용하는 두 번째 연결 Role이 아니다.

이번 범위에서 기존 Role은 현재 연결 검증이 허용하는 `SketchCatchTerraformExecutionRole` 또는 `SketchCatchTerraformExecutionRole-...` 이름을 뜻한다. 이 규칙을 만족하면 CloudFormation 생성 Role과 수동 생성 Role을 같은 방식으로 지원하지만, 임의 이름 Role까지 AssumeRole 신뢰 범위를 넓히지는 않는다.

CloudFormation Stack update는 일부 Resource만 덧붙이는 작업이 아니라 전체 Template을 기준으로 차이를 계산한다. SketchCatch는 기존 계정에 실제 배포된 전체 Template을 보관하지 않으므로 최신 Template로 기존 Stack을 갱신하면 배포 Policy나 다른 Stack Resource까지 바뀔 수 있다. 별도 Stack pair는 이 위험 없이 관리 권한과 읽기 Policy 수명주기를 원래 Stack에서 독립시킨다.

Manager Stack은 사용자가 AWS Console에서 승인한다. Policy Stack의 생성·갱신은 ADR 0026에 따라 SketchCatch Settings API가 명시적 사용자 승인 뒤 service Role로 수행한다. 삭제는 Policy Stack 다음 Manager Stack 순서이며 기존 Role·원래 Stack·배포 Policy를 보존한다. 이 결정은 ADR 0017과 ADR 0019의 기존 Stack update 방식을 대체하고, ADR 0020의 수동 Role 예외를 모든 기존 verified Role에 적용하는 공통 규칙으로 확장한다.
