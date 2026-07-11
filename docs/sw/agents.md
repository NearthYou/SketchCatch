# ECS 전환 작업 규범
1. 작업 전 `docs/sw/spec.md`, `docs/sw/plan.md`, `docs/sw/agents.md`를 모두 읽는다.
2. 계약 충돌 시 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`를 우선한다.
3. SketchCatch는 multi-cloud-ready IaC operations service이며 AWS-only로 설명하지 않는다.
4. ECS 전환은 6개월 저비용 포트폴리오 운영을 기본 목표로 한다.
5. 빠른 구현보다 장기 서비스 구조와 운영 안전성을 우선한다.
6. 일반 작업은 `dev`에서 분기하고 PR base도 `dev`로 둔다.
7. phase마다 GitHub issue를 먼저 만들고 `gh issue develop`으로 linked branch를 만든다.
8. 브랜치는 `feature/sw/{issue}-{task}`, `fix/sw/{issue}-{task}`, `chore/sw/{issue}-{task}`, `refactor/sw/{issue}-{task}` 형식을 따른다.
9. `main`과 `dev` 직접 push는 사용자가 명시 승인한 예외에서만 허용한다.
10. PR 제목과 본문은 한국어로 작성하고 제목은 `Type: Korean title` 형식을 따른다.
11. 기본 Terraform mode는 `portfolio_cost_mode = "six_month"`로 둔다.
12. 기본값은 `private_runtime = false`, `enable_nat_gateway = false`다.
13. NAT Gateway는 명시적 시연/보안 모드에서만 켠다.
14. production API와 web service는 비용 우선으로 각각 autoscaling `min=1`, `max=2`를 사용하고 부하가 있을 때만 확장한다.
15. staging app은 기본 `desiredCount = 0`으로 둔다.
16. Phase 1 app service는 nginx + web + api single task로 시작한다.
17. nginx 제거와 ALB path routing은 안정화 이후 별도 phase에서 한다.
18. Terraform 실행은 ECS production 안정화 이후 API inline 장기 실행에서 ECS `RunTask` one-off worker task로 옮긴다.
19. job 실행권의 source of truth는 DB lease다.
20. cancel의 최종 기준은 DB flag이고 Redis Pub/Sub은 즉시 신호로만 사용한다.
21. SQS FIFO queue, DLQ, plan/mutation queue, always-on worker service는 현재 범위 밖이며 별도 결정 전까지 구현하지 않는다.
22. secret 원문은 DB, 로그, S3 artifact, GitHub Actions output에 남기지 않는다.
23. generated env file과 S3 presigned env download 의존성 제거는 ECS secret/runtime config phase에서 한다.
24. Redis는 내부 Runtime Cache이며 Practice Architecture Resource로 설명하지 않는다.
25. 실제 AWS 생성/삭제 전에는 비용, rollback, cleanup 기준을 PR에 명시한다.
26. 완료 전 `pnpm harness:check`를 실행하고 코드/인프라 변경이면 lint/typecheck/build도 실행한다.
27. SketchCatch production infrastructure state는 사용자 Deployment state와 공유하지 않는다.
28. production infra import/apply/destroy는 product API나 worker에서 실행하지 않는다.
29. Route53/ACM, S3/RDS/Redis, disabled-by-default cold rollback은 별도 state와 approval gate로 격리한다.
30. Retired EC2/ALB/legacy ECS warm rollback을 다시 상시 생성하지 않으며, cold rollback Route53 전환은 direct smoke 뒤 별도 승인한다.
