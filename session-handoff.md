# 세션 핸드오프

이 파일은 최신 세션 하나를 다음 세션이 빠르게 이어받기 위한 압축본이다. 누적 이력은 `agent-progress.md`에 남긴다.

## 현재 검증된 것

- `scripts/init-harness.ps1` 기본 실행이 통과했다.
- `pnpm harness:check`가 통과했다.
- `feature_list.json`은 PowerShell `ConvertFrom-Json`과 Node JSON parse를 통과했다.
- docs H1 scan에서 H1 없는 markdown 파일이 더 이상 나오지 않았다.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`가 모두 통과했다.
- `HARNESS-001`부터 `HARNESS-006`까지 `passing` evidence가 기록되었다.

## 이번 세션의 변경 사항

- `docs/adr`, `docs/ck`, `docs/sw`, `docs/ys`에 README 인덱스를 추가했다.
- `docs/README.md`의 담당자별 참고 문서 표를 폴더별 인덱스로 연결했다.
- `docs/AGENTS.md`에 담당자별 참고 문서 추가/변경 시 인덱스 갱신 규칙을 추가했다.
- H1이 없던 `docs/gg/004_역할분배.md`, `docs/ys/006-로그인&익명로그인_삭제관련.md`에 제목을 추가했다.
- root `AGENTS.md`에 Harness Operating Loop를 추가했다.
- 루트에 `agent-progress.md`, `feature_list.json`, `session-handoff.md`, `clean-state-checklist.md`, `evaluator-rubric.md`, `quality-document.md`를 추가했다.
- `scripts/check-harness.mjs`와 `scripts/init-harness.ps1`를 추가해 시작 기준선과 하네스 규칙을 검사한다.
- `docs/README.md`에 하네스 파일을 문서 map과 SSOT 우선순위에 추가했다.

## 아직 깨졌거나 미검증된 것

- `HARNESS-007`: Representative Use Journey의 browser/API smoke는 아직 없다.
- Turbo는 체크를 통과하지만 sandbox git user 때문에 dubious ownership warning을 출력한다.
- 기존 unrelated 변경 `apps/web/next-env.d.ts`는 이 세션에서 건드리지 않았다.
- 이번 docs 정리는 삭제/이동 없이 인덱스 추가와 제목 보강으로 제한했다.

## 다음으로 최선의 행동

- `HARNESS-007`로 넘어가 Representative Use Journey의 최소 smoke를 정의한다. 실제 AWS apply/destroy는 사용자 승인과 cleanup plan 없이는 실행하지 않는다.

## 건드리지 말아야 할 것

- `.env`, private key, AWS credential, DB password, real access token
- 사용자 승인 없는 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff
- 사용자 확인 없는 Voice Requirement Input 또는 AI 제안의 Practice Architecture 반영

## 참고 명령

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1 -Verify
pnpm lint
pnpm typecheck
pnpm build
```
