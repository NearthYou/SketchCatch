# legacy-rollback 관리 group

warm EC2/ALB rollback을 종료한 뒤 sanitized AMI와 마지막 검증 Docker artifact로 임시 복구 환경을 만드는 격리 state입니다. 기본값 `enable_cold_rollback = false`에서는 resource count가 0이며 비용이 발생하지 않습니다.

incident commander가 복구를 승인한 경우에만 retained AMI, VPC/subnet, SSM-capable instance profile, retained ACM certificate를 입력해 EC2, 전용 security group, ALB, target group, HTTPS listener를 생성합니다. RDS/Redis security group ID를 입력하면 복구 인스턴스 security group에서만 data port를 임시 허용합니다. Route53은 이 state에서 관리하지 않으며 direct ALB smoke가 모두 통과한 뒤 별도 승인으로 전환합니다.

복구 절차와 고정 artifact 정보는 [배포 운영 문서](../../../../docs/deployment.md)의 cold rollback runbook을 따릅니다.

공통 backend와 승인 절차는 [상위 README](../README.md)를 따릅니다.
