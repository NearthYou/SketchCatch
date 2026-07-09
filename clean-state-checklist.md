# 클린 상태 체크리스트

세션 종료 전 이 체크리스트를 통과하지 못하면 "완료"가 아니라 "미검증" 또는 "차단"으로 보고한다.

## 범위

- [ ] 이번 세션의 목표가 하나의 feature/workstream으로 설명된다.
- [ ] `feature_list.json`에서 동시에 `in_progress`인 항목이 1개 이하이다.
- [ ] `passing`으로 표시한 항목마다 `evidence.lastVerified`와 실행 명령이 있다.
- [ ] 제품 범위 변경은 `docs/product.md`에, 계약 변경은 `docs/data-models.md`에 반영되었다.

## 안전

- [ ] `.env`, private key, AWS credential, DB password, real token을 읽거나 출력하거나 커밋하지 않았다.
- [ ] 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff를 사용자 승인 없이 실행하지 않았다.
- [ ] UI 코드에 Terraform 실행, AWS SDK 호출, deployment mutation logic을 섞지 않았다.
- [ ] Redis를 사용자 Practice Architecture Resource처럼 설명하지 않았다.
- [ ] SketchCatch를 AWS-only 제품으로 설명하지 않았다.

## 검증

- [ ] 문서/하네스만 바꿨다면 `pnpm harness:check` 또는 `scripts/init-harness.ps1`를 실행했다.
- [ ] 코드나 인프라를 바꿨다면 `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행했다.
- [ ] 실행하지 못한 검증은 실패/스킵 이유와 남은 리스크를 기록했다.
- [ ] 장기 실행 서버나 background helper를 켜 두었다면 종료하거나 사용자에게 명확히 알렸다.

## 핸드오프

- [ ] `agent-progress.md`에 이번 세션의 완료/검증/리스크/다음 행동을 기록했다.
- [ ] `agent-progress.md`와 `session-handoff.md`가 짧게 유지된다. 오래된 기록은 `docs/agent-history/`로 옮겼다.
- [ ] 다음 세션이 이어받아야 할 미완성 상태가 있으면 `session-handoff.md`를 갱신했다.
- [ ] 변경 파일, 실행한 체크, 실패한 체크를 최종 응답에 요약했다.

## 거절해야 하는 완료 선언

- 코드 편집만 했고 실행 가능한 증거가 없다.
- 테스트 실패를 "아마 괜찮다"로 덮었다.
- `passing`이라고 표시했지만 어떤 명령이 언제 통과했는지 없다.
- 실제 cloud 리소스가 남았는지 확인하지 않은 채 배포 작업을 끝냈다.
- 다음 세션이 무엇을 해야 하는지 repo 안에서 찾을 수 없다.
