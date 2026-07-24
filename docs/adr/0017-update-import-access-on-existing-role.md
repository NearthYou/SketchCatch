---
status: superseded by ADR-0023
---

# 기존 AWS Role에 가져오기 읽기 Policy만 추가

기존 AWS 연결의 Reverse Engineering 권한이 부족하면 같은 CloudFormation Stack과 Terraform Execution Role에 별도의 읽기 Policy만 추가하거나 갱신한다. 기존 배포 Policy, connection ID, Role 이름은 유지하고 새 `AwsConnection`이나 두 번째 Role을 만들지 않는다. 신규 연결은 최초 Stack 승인에서 가져오기와 배포에 필요한 Policy를 함께 준비한다.

전체 연결 Template을 최신화하면 가져오기 복구와 무관한 배포 권한까지 바뀔 수 있다. 반대로 읽기 전용 Role을 새로 만들면 권한 경계는 더 분명하지만 Role 두 개를 저장하고 기존 연결을 이전하는 DB·API 변경이 필요하다. 이번 결정은 정상인 배포를 보호하고 기존 연결을 가장 작은 변경으로 복구하는 쪽을 선택한다.

별도 Policy가 읽기 전용이어도 Role 전체에는 기존 배포 권한이 남는다. 따라서 이 Role을 읽기 전용 Role이라고 부르지 않는다. 가져오기와 배포의 완전한 Role 분리는 Workspace·팀 공유 연결 모델을 설계할 때 별도 결정으로 다룬다.
