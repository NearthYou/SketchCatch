# Direct Deployment 신뢰도 UX 클론 코딩 가이드

이 문서는 Direct Deployment Apply 직전에 승인된 Terraform artifact, binary tfplan, AWS account, AWS region snapshot과 실제 실행 입력이 달라졌을 때 사용자가 무엇이 달라졌는지 이해할 수 있도록 API, 로그, UI 상태를 맞추는 방법을 설명한다.

## 목표

- 사용자가 승인한 plan과 다른 artifact 또는 tfplan은 apply하지 않는다.
- AWS account 또는 region이 승인 시점과 달라지면 Terraform apply 전에 차단한다.
- 차단 사유는 API `errorSummary`, `failureStage`, deployment log, UI 안내 문구에서 같은 의미로 보인다.
- 실제 AWS apply/destroy는 이 검증이 통과한 뒤에만 실행된다.

## 핵심 모델

승인 snapshot은 `deployments` 레코드에 저장된다.

| 필드 | 의미 |
| --- | --- |
| `approvedTerraformArtifactId` | 사용자가 승인한 Terraform artifact id |
| `approvedPlanArtifactId` | 사용자가 승인한 tfplan artifact id |
| `approvedTerraformArtifactHash` | 승인된 Terraform artifact content SHA-256 |
| `approvedTfplanHash` | 승인된 binary tfplan SHA-256 |
| `approvedAwsAccountId` | 승인된 실행 대상 AWS account |
| `approvedAwsRegion` | 승인된 실행 대상 AWS region |

Apply 직전에는 현재 deployment, 현재 plan artifact, 현재 Terraform artifact content hash, 다운로드한 tfplan hash, 현재 verified AWS connection을 다시 읽는다. 하나라도 다르면 `DeploymentApplyPreconditionError`로 차단한다.

## 실패 상태 규칙

재검증 실패는 Terraform apply 실패가 아니라 승인 snapshot 불일치다.

| 위치 | 값 또는 메시지 |
| --- | --- |
| `failureStage` | `approval` |
| `errorSummary` | `Terraform artifact content changed after approval: approved artifact hash ..., current artifact hash ...` 같은 mismatch 세부 메시지 |
| deployment log | `Apply blocked before Terraform apply: ...` |
| UI Apply button | 승인 snapshot 필드가 누락되면 disabled |
| UI 안내 문구 | Terraform Plan을 다시 실행하고 승인하라는 메시지 |

이 규칙 덕분에 사용자는 실제 AWS 리소스 변경 실패와 승인 이후 입력 drift를 구분할 수 있다.

## 클론 코딩 순서

1. `deployment-approval-service.ts`에서 apply precondition 전용 오류 타입을 만든다.
2. artifact id, plan id, artifact hash, tfplan hash, AWS account, AWS region mismatch를 각각 다른 메시지로 던진다.
3. `deployment-apply-service.ts` catch 블록에서 이 오류를 감지해 `failureStage: "approval"`로 저장한다.
4. 같은 catch 블록에서 deployment log에 `Apply blocked before Terraform apply`를 남긴다.
5. `deployment-actions.ts`에 승인 snapshot 완성 여부 helper를 두고 `canApply`와 `canDestroy`에 연결한다.
6. Apply 확인 UI에 account/region뿐 아니라 승인된 `tfplan hash`, `Artifact hash` short value를 같이 보여준다.
7. API 테스트는 Terraform/AWS drift가 credential 준비, plan file write, Terraform init 전에 멈추는지 확인한다.
8. UI 테스트는 승인 기록이 있어도 snapshot 필드가 빠지면 실행 버튼이 비활성화되는지 확인한다.

## 검증 명령

```powershell
pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-approval-service.test.ts src/deployments/deployment-apply-service.test.ts
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/deployment-actions.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

전체 API 테스트가 로컬 환경 변수, 예를 들어 `S3_BUCKET_NAME`, 때문에 실패할 수 있다면 PR 본문에 환경 원인과 targeted test 결과를 분리해 적는다.
