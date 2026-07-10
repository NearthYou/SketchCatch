# data 관리 group

S3 artifact bucket, RDS, Redis/ElastiCache를 위한 persistent data state입니다. Phase 9에서는 resource/import block을 의도적으로 두지 않습니다. 백업, deletion protection, snapshot, 암호화, retention과 zero-change plan이 승인되기 전에는 어떤 persistent resource도 import하지 않습니다.

공통 backend와 승인 절차는 [상위 README](../README.md)를 따릅니다.
