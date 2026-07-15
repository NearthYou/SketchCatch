# 제약 없는 Architecture Board Compiler 제안 허용

Architecture Board Compiler는 Resource, 관계, 설정, 소속, 시각 표현을 추가·삭제·변경할 수 있으며, 명시된 사용자 요구사항이나 기존 배포 상태, Provider·Terraform 유효성과 충돌하는 결과도 제안할 수 있다. 입력 의미를 불변으로 취급하기보다 가능한 정리 범위를 최대화하기 위한 결정이며, 잘못된 결과가 나올 수 있음을 받아들인다. 빈 Board가 항상 최적해가 되는 문제는 위치·크기·소속·관계·설정·추가·삭제 순으로 커지는 Compilation Distance를 품질 점수에 포함해 막는다. 단, AI 변경은 사용자 승인을 받아야 한다는 제품 계약에 따라 결과는 검토 가능한 제안으로 제공하고, 승인된 Practice Architecture를 조용히 덮어쓰거나 Deployment Safety Gate를 우회하지 않는다.
