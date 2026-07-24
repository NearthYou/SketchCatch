---
status: superseded by ADR-0023
---

# 수동 AWS Role의 가져오기 Policy는 별도 Stack으로 관리

검증된 사용자 관리 Role에 Reverse Engineering 읽기 권한이 부족하고 기존 SketchCatch Stack이 없으면, Role을 소유하지 않는 별도 CloudFormation Stack이 읽기 Policy만 생성해 그 Role에 연결한다. 사용자는 AWS Console에서 Stack 생성을 직접 승인하고, 같은 connection ID와 Role ARN을 계속 사용한다.

Policy 전용 Stack은 Role Resource를 만들거나 가져오거나 삭제하지 않는다. 연결 삭제 때 사용자는 AWS Console의 정확한 Stack 삭제 화면에서 Policy 제거를 직접 승인한다. Stack을 삭제하면 읽기 Policy만 분리·삭제되고 사용자가 만든 Role과 기존 배포 권한은 남는다. 삭제가 끝나지 않으면 연결은 활성 상태가 아닌 cleanup retry 기록으로 남기고 metadata만 조용히 버리지 않는다. Policy를 사용자가 직접 복사하면 버전과 정리 책임이 흩어지고, Role을 새 관리형 Role로 바꾸면 기존 배포와 외부 사용처에 영향을 줄 수 있어 선택하지 않았다.

이 결정은 ADR 0017의 `기존 Stack 갱신`을 SketchCatch 관리 Role에 유지하면서 수동 Role에 대한 예외를 추가하고, ADR 0019의 AWS Console 사용자 승인 경계를 새 Policy Stack 생성에도 동일하게 적용한다.
