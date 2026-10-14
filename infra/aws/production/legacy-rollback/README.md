# 임시 복구 환경

장애 복구가 필요할 때 보관한 AMI와 검증된 Docker 파일로 임시 EC2 환경을 만드는 Terraform 설정입니다. 기본값 `enable_cold_rollback = false`에서는 자원을 만들지 않습니다.

복구 담당자가 승인한 뒤 AMI와 VPC, Subnet, SSM용 instance profile, ACM 인증서를 입력합니다. 이 설정으로 EC2와 전용 보안 그룹, ALB, target group, HTTPS listener를 만듭니다. RDS와 Redis의 보안 그룹 ID를 입력하면 복구 인스턴스에서 데이터 포트로 접근하는 규칙을 임시로 추가합니다.

Route 53은 이 state에서 관리하지 않습니다. ALB 직접 접속 검사를 통과한 뒤 별도 승인을 받아 도메인을 전환합니다.

복구 순서는 [배포 운영 문서](../../../../docs/deployment.md), backend와 승인 절차는 [운영 인프라 문서](../README.md)에 있습니다.
