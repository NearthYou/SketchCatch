# 프로젝트 단위 배포 운영 작업 규범
1. 작업 전 root `AGENTS.md`, `docs/sw/spec2.md`, `docs/sw/plan2.md`, `docs/sw/agents2.md`를 읽는다.
2. 계약 충돌 시 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`를 우선한다.
3. SketchCatch는 provider-neutral IaC operations service이며 AWS-only로 설명하지 않는다.
4. RAG 기반 Fargate 추천과 저장소 분석의 Amazon Q RAG 직접 연결은 이 작업에서 변경하지 않는다.
5. 배포 단위는 프로젝트이며 프로젝트당 활성 배포 타깃은 하나다.
6. 다중 환경과 EKS는 이번 범위에 추가하지 않는다.
7. 사용자 배포 단계는 `검증 → 승인 → 배포` 세 단계로 유지한다.
8. Architecture Board 저장 성공 전에는 배포 snapshot을 만들지 않는다.
9. 배포 scope는 `infrastructure`, `application`, `full_stack`만 사용한다.
10. runtime은 `ecs_fargate`, `lambda`, `ec2_asg`, `static_site` provider adapter 뒤에 둔다.
11. rollout 기본값은 `all_at_once`이며 실패 시 이전 검증 release로 복구한다.
12. version, commit SHA, provider-neutral artifact digest를 모든 release에 기록한다.
13. build 설정은 저장소 증거로 감지하고 개발자 확인 전 실행하지 않는다.
14. 임의 shell command와 자동 생성 PR은 build 설정 경로에 추가하지 않는다.
15. AI는 추천과 검증만 하며 저장, 승인, 배포를 대신하지 않는다.
16. Terraform Plan/Apply/Destroy는 승인 snapshot 재검증과 secret masking을 통과해야 한다.
17. Redis는 내부 Runtime Cache이며 사용자 Architecture Board Resource가 아니다.
18. QR 세션은 검증된 HTTPS Output URL, 15분 만료, rate limit, request budget을 지킨다.
19. capability와 secret 원문은 URL, DB, cache, browser storage, 로그, artifact에 남기지 않는다.
20. 알림은 영속 outbox/Inbox가 기준이며 sessionStorage dedupe를 source of truth로 쓰지 않는다.
21. 한 번에 `feature_list.json`의 `in_progress` workstream은 하나만 유지한다.
22. 이슈를 먼저 만들고 `dev` 기준 linked branch를 만든다.
23. 브랜치는 `feature/sw/{issue}-{task}`, `fix/sw/{issue}-{task}`, `test/sw/{issue}-{task}` 형식을 따른다.
24. `main`, `dev` 직접 push를 금지하고 PR 제목은 `Type: Korean title` 형식을 따른다.
25. 실제 AWS/GitHub mutation은 승인된 non-production sandbox와 명시적 cleanup 계획에서만 수행한다.
26. Production apply, deploy, destroy는 이 작업의 acceptance 범위가 아니다.
27. schema → API/Zod → RDS/S3/Redis → web → tests 순서로 수직 슬라이스를 완성한다.
28. 코드/인프라 완료 전 `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행한다.
29. 완료 증거, known risk, cleanup 결과를 `agent-progress.md`와 필요한 handoff에 영어로 기록한다.
