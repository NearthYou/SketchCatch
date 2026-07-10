# legacy-rollback 관리 group

EC2/SSM/nginx rollback 자산을 위한 격리 state입니다. Phase 9에서는 resource/import block을 의도적으로 두지 않습니다. CloudFormation이 소유한 resource는 stack이 살아 있는 동안 Terraform으로 중복 소유하지 않으며, rollback 종료 승인이 있기 전에는 import/삭제하지 않습니다.

공통 backend와 승인 절차는 [상위 README](../README.md)를 따릅니다.
