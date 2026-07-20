---
status: accepted
---

# 연결별 Manager Stack과 Policy Stack을 분리

AWS 연결마다 Import Access Manager Stack과 Import Access Policy Stack을 따로 둔다. Manager Stack은 `cloudformation.amazonaws.com`만 Assume할 수 있는 최소 권한 service Role, 기존 연결 Role이 정확한 Policy Stack만 조작하고 정확한 service Role만 CloudFormation에 전달하도록 제한한 제어 Policy, 소유 artifact 정리를 확인하는 읽기 전용 확인 Policy를 소유한다. Policy Stack은 Reverse Engineering 읽기 Managed Policy만 소유해 기존 연결 Role에 붙인다.

사용자가 Manager Stack을 AWS Console에서 먼저 승인하고 SketchCatch가 Template hash, ownership, output, service Role trust·권한, 제어·확인 Policy 문서와 target Role attachment를 검증한다. 그 뒤 사용자가 읽기 범위를 한 번 승인하면 Settings API가 service Role ARN을 지정해 Policy Stack을 생성·갱신한다. account-shared manager를 사용하지 않고 connection ID prefix로 Stack·Role·Policy 이름을 고정해 한 연결의 권한과 실패를 격리한다.

삭제는 Policy Stack 다음 Manager Stack 순서다. 읽기 전용 확인 Policy는 다른 Manager Resource가 의존하게 해 마지막에 제거한다. Policy Stack 삭제 뒤 정확한 Stack과 Managed Policy의 부재를 확인하고, Manager Stack 삭제 뒤 STS identity가 유효한 상태에서 service Role·제어 Policy·확인 Policy 제거를 확인한다. 다른 Policy가 같은 읽기 권한을 주는지는 SketchCatch 소유 artifact 제거 판정을 막지 않는다. 결과가 불확실하면 비활성 cleanup retry를 유지한다. 원래 연결 Stack, 기존 Role Resource, 배포 Policy와 배포용 `verified` 상태는 이 수명주기에서 변경하지 않는다.

CloudFormation service Role은 대상 Stack보다 먼저 존재해야 하고 연결된 뒤 제거할 수 없으므로 Policy Stack 자체에 service Role을 넣지 않는다. AWS 근거는 https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html 이다.
