---
status: accepted
---

# 가져오기 권한 제거를 확인한 뒤 연결 정보를 삭제

사용자가 AWS Console에서 Policy Stack 삭제를 승인하고 SketchCatch로 돌아오면 API는 Manager Stack이 남겨 둔 읽기 전용 확인 권한으로 정확한 Policy Stack 부재와 읽기 Managed Policy의 분리·삭제를 확인한다. 같은 Role의 제한된 가져오기 읽기 확인도 안전 신호로 기록하지만, 다른 Policy가 같은 읽기 권한을 주는 경우에는 이 결과만으로 정리를 막지 않는다. SketchCatch가 소유한 artifact 제거가 확인된 뒤 Manager Stack 삭제로 이동한다.

Manager Stack의 service Role과 제어 Policy가 읽기 전용 확인 Policy에 의존하게 해 확인 Policy를 마지막에 제거한다. Manager 삭제 전에 전체 contract와 attachment를 검증하고, 삭제 뒤 기존 Role의 STS identity가 유효한 상태에서 정확한 소유 artifact의 부재를 확인한다. 확인 Policy가 계획대로 마지막에 제거돼 해당 제한 조회가 AccessDenied가 되는 경우도 완료 신호로 사용할 수 있다. 일부 artifact가 남거나 결과가 불확실하면 비활성 `AWS 권한 정리 필요` 기록을 유지한다.

사용자의 완료 입력만 믿으면 AWS에 SketchCatch 소유 Policy나 제어 권한이 남은 채 연결 기록만 사라질 수 있다. 반대로 Stack 삭제 callback을 위해 고객 계정에 Lambda 같은 실행 Resource를 추가하면 읽기 Policy 관리보다 훨씬 큰 운영 경계가 생긴다. 따라서 정확한 소유 artifact와 마지막 확인 Policy를 사용하며, 기존 Role·원래 Stack·배포 Policy와 배포용 `verified` 상태는 변경하지 않는다. 정리가 끝날 때까지 원 연결 row도 물리적으로 삭제하지 않는다.
