# edge 관리 group

Route53 hosted zone/record와 ACM certificate를 위한 고위험 edge state입니다. Phase 9에서는 resource/import block을 의도적으로 두지 않습니다. 기존 runtime state의 `aws_route53_record.ecs_alias`는 동일 remote object를 중복 import하지 않고, 승인된 후속 작업에서 state move 또는 ownership handoff 계획을 먼저 검토합니다.

공통 backend와 승인 절차는 [상위 README](../README.md)를 따릅니다.
