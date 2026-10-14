# 도메인과 인증서 관리 그룹

Route 53 hosted zone과 record, ACM 인증서의 state를 관리하는 경로입니다. 현재 resource와 import block은 비어 있습니다.

기존 runtime state의 `aws_route53_record.ecs_alias`를 중복으로 가져오지 않습니다. 관리 위치를 바꾸려면 state 이동이나 관리 권한 이전 계획부터 검토합니다.

전체 구성은 [운영 아키텍처](../../../../docs/architecture.md#운영-아키텍처), backend와 승인 절차는 [운영 인프라 문서](../README.md)에 있습니다.
