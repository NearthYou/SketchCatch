# Blueprint 리디자인 작업 규범

1. 작업 브랜치는 `design/sw/146-blueprint-redesign`를 사용한다.
2. 구현 전 `pnpm harness:check`를 통과시킨다.
3. 변경 범위는 `apps/web` 중심으로 유지한다.
4. API, DB schema, shared type은 필요 없으면 바꾸지 않는다.
5. `getDeploymentActionState`의 안전 조건을 변경하지 않는다.
6. 실제 AWS apply, destroy, Git/CI/CD handoff를 실행하지 않는다.
7. AWS-first 예시는 허용하되 AWS-only 제품 문구는 쓰지 않는다.
8. 상위 문구는 `Terraform-first, multi-cloud-ready IaC operations` 톤으로 쓴다.
9. 폰트는 self-host 정적 자산으로 커밋한다.
10. 런타임 Google Fonts fetch와 새 폰트 npm 의존성은 추가하지 않는다.
11. 노드에는 파라미터 값을 직접 노출하지 않는다.
12. 일반 새 리소스 노드는 `124x96` 기준으로 만든다.
13. 기존 저장 다이어그램은 마이그레이션하지 않는다.
14. VPC/Subnet/Security Group 영역 노드는 큰 컨테이너로 유지한다.
15. Board의 현재 패널 정보 구조를 탭 하나로 통합하지 않는다.
16. Dashboard는 새 API 없이 가진 데이터만 사용한다.
17. Auth 라우트와 검증/OAuth/약관 흐름은 유지한다.
18. 버튼, 카드, 패널 안 텍스트가 겹치지 않게 확인한다.
19. 한국어 줄바꿈은 `keep-all` 기준으로 자연스럽게 유지한다.
20. 긴 URL, hash, resource type은 필요한 곳에서만 끊기게 한다.
21. UI 카드를 불필요하게 중첩하지 않는다.
22. decorative orb나 dark floating object 스타일은 제거한다.
23. 검증은 lint, typecheck, build, 브라우저 스모크까지 수행한다.
24. 브라우저 스모크 대상은 `/`, `/login`, `/signup`, `/mypage`, `/workspace/new`다.
25. 완료 시 `agent-progress.md`를 갱신한다.
26. 다음 세션 리스크가 있으면 `session-handoff.md`를 갱신한다.
27. `feature_list.json`의 `HARNESS-007`은 임의로 변경하지 않는다.
28. PR 제목과 본문은 한국어 규칙을 따른다.
