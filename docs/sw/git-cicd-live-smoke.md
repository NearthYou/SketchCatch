# Git/CI/CD 자동 배포 live smoke 절차

이 문서는 `docs/sw/spec6.md`와 `docs/sw/plan6.md`의 Git/CI/CD 자동 배포 대표 smoke를 실제로 실행할 때 사용한다.

## 사전 조건

- `https://sketchcatch.net/health`와 `https://sketchcatch.net/health/db`가 200을 반환해야 한다.
- 사용자는 SketchCatch에 로그인되어 있어야 하며, live smoke용 `AccessToken`을 로컬에서만 사용해야 한다.
- Deployment Panel에서 GitHub source repository, verified AWS Connection, Terraform Preview, Pre-Deployment Check, `Git/CI/CD handoff 생성`까지 완료되어야 한다.
- handoff detail에 PR URL, repository settings preview, AWS role diff, Environment 이름이 표시되어야 한다.
- GitHub App 권한 부족이 표시되면 `GitHub App 권한 보강`을 먼저 완료한 뒤 handoff를 다시 생성하거나 repo settings apply를 재시도한다.
- AWS role diff와 GitHub repository settings 변경은 사용자가 명시 승인한 경우에만 실행한다.
- PR merge 이후 GitHub Environment approval을 수동 승인할 사람이 대기해야 한다.
- destroy workflow 또는 동등한 cleanup 계획이 준비되어 있어야 한다.

## Preflight

아래 명령은 cloud mutation을 수행하지 않고 준비 상태만 JSON으로 남긴다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\smoke\git-cicd-auto-deploy.ps1 `
  -ApiBaseUrl "https://sketchcatch.net" `
  -AccessToken $env:SKETCHCATCH_ACCESS_TOKEN `
  -HandoffId $env:SKETCHCATCH_HANDOFF_ID `
  -PreflightOnly `
  -SkipRepositorySettingsApply `
  -SkipAwsRoleDiffApply `
  -ReportPath "docs\sw\git-cicd-live-smoke-preflight.json"
```

`status`가 `ready`면 live run을 진행할 수 있다. `blocked`면 `steps`의 `evidence`를 먼저 해결한다.

## Live Run

아래 명령은 repository settings apply와 AWS role diff apply를 실제로 실행할 수 있다. 비용과 권한 변경을 승인한 경우에만 `-ConfirmLiveMutations`를 붙인다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\smoke\git-cicd-auto-deploy.ps1 `
  -ApiBaseUrl "https://sketchcatch.net" `
  -AccessToken $env:SKETCHCATCH_ACCESS_TOKEN `
  -HandoffId $env:SKETCHCATCH_HANDOFF_ID `
  -ConfirmLiveMutations `
  -RequirePipelineSuccess `
  -RequireDestroySuccess `
  -TimeoutMinutes 60 `
  -PollSeconds 30 `
  -ReportPath "docs\sw\git-cicd-live-smoke-report.json"
```

PR이 merge된 뒤 GitHub Environment approval에서 멈추면 GitHub Actions 화면에서 승인하고 script polling이 끝날 때까지 기다린다.

## 증거 기준

- report의 `pipelineStatus.summary`가 `pipeline_success`여야 한다.
- `infra`, `app`, `destroy` 상태가 성공 상태여야 한다.
- `static_site_url`과 `api_base_url` 단계가 URL marker 확인을 통과해야 한다.
- destroy workflow 성공 또는 cleanup 증거를 issue #210과 `agent-progress.md`에 기록한다.
- 생성된 report 파일에는 secret, token, private key 값을 절대 넣지 않는다.
