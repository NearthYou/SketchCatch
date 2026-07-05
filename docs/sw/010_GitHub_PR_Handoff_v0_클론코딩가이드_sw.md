# GitHub PR Handoff v0 클론 코딩 가이드

이 문서는 #134에서 만든 `GitCicdHandoff` 계약/API 위에 #135 GitHub PR handoff vertical slice를 붙이는 방법을 설명한다. 목표는 실제 GitHub API를 호출하지 않고도 Terraform artifact를 Source Repository PR 생성 요청 payload로 넘기는 service/API 경계를 완성하는 것이다.

## 범위

- `SourceRepositoryProvider`에 `github` provider를 추가한다.
- `POST /api/projects/:projectId/git-cicd-handoffs` 요청에서 Source Repository provider를 선택할 수 있게 한다.
- provider boundary에는 Terraform artifact metadata, source/target branch, commit message, PR title/body draft, plan summary, review checklist draft가 전달된다.
- fake Git provider 테스트로 PR URL, source branch, commit SHA 결과가 handoff record에 반영되는지 확인한다.
- 실제 GitHub token, deploy key, CI secret 원문은 request/response/DB/log에 저장하지 않는다.

## 서비스 흐름

```text
사용자 승인
-> Git/CI/CD handoff API
-> project / architecture / Terraform artifact 검증
-> GitHub provider payload 구성
-> fake Git provider createPullRequest
-> handoff record status = pr_created
```

## PR draft 구조

PR body는 deterministic draft로 만든다. AI가 나중에 문장을 다듬을 수는 있지만, v0에서는 다음 구조를 코드로 고정한다.

1. `IaC Preview`: Terraform artifact file name과 object key
2. `Plan summary`: create/update/delete/replace count와 blocked 여부
3. `Pre-Deployment Check`: 배포 전 확인해야 할 계정, region, 변수, pipeline policy
4. `Review checklist`: reviewer가 merge 전에 확인할 항목

## 테스트 포인트

- internal provider는 기존처럼 `draft` handoff를 만든다.
- GitHub provider는 fake provider를 통해 `pr_created` handoff를 만든다.
- fake provider가 받은 payload에 `terraform/main.tf`, artifact object key, target/source branch, PR draft body가 들어간다.
- 응답에는 secret-looking field가 없다.

## 금지 사항

- 실제 GitHub API 호출 금지
- 실제 AWS apply/destroy 금지
- Runtime Cache 또는 pipeline polling 구현 금지
- GitHub token, deploy key, CI secret 저장 금지

## 검증 명령

```powershell
pnpm --filter @sketchcatch/api exec tsx --test src/routes/git-cicd-handoffs.test.ts src/db/schema-contract.test.ts
pnpm --filter @sketchcatch/api lint
pnpm --filter @sketchcatch/api typecheck
pnpm harness:check
```
