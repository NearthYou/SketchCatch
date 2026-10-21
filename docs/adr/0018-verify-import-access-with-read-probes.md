---
status: accepted
---

# 실제 읽기 확인으로 AWS 가져오기 권한 갱신 완료 판정

기존 AWS 연결의 가져오기 권한 갱신은 같은 Role로 제한된 읽기 요청을 실제 실행한 뒤 판정한다. Role Assume 성공이나 CloudFormation Stack의 `UPDATE_COMPLETE`, Policy 연결 확인만으로는 실제 권한 경계·SCP·서비스 준비 상태를 증명할 수 없으므로 사용자 성공 조건으로 사용하지 않는다.

VPC·Subnet·Internet Gateway·Route Table·Security Group·EC2, S3, RDS, Load Balancer, ECS, CloudFront의 주요 reader가 성공하면 가져오기를 시작할 수 있다. Resource Explorer, Tagging API, IAM, KMS, CloudWatch·Logs, API Gateway, Lambda, AMI 확장 reader 실패는 `일부 확장 정보 제한`으로 분류하고 주요 가져오기를 막지 않는다. Resource Explorer 미설정은 권한 부족과 구분한다.

확인 요청은 Resource를 생성·변경·삭제하지 않는다. 빈 목록은 읽기 성공으로 취급한다. 주요 reader 권한 부족, 확장 reader 제한, Resource Explorer 미설정, AWS 일시 오류를 서로 다른 복구 상태로 분류하고 원본 provider 오류는 노출하지 않는다. 읽기 확인 실패는 Reverse Engineering 준비 상태만 바꾸며, 이미 배포에 사용 중인 AWS 연결의 `verified` 상태를 `failed`로 내리지 않는다.
