# Workspace 레벨 분리와 배포 위자드 구현 마일스톤

> 대상 브랜치: `fix/gg/qa-followup`
>
> 이 문서는 다음 구현을 맡은 Codex가 먼저 읽는 기준 문서다.
> 코드 변경 순서와 화면의 책임을 함께 적는다.

## 1. 이번 작업의 한 문장 목표

Workspace를 아래 두 레벨로 분리한다.

```text
Architecture Board 레벨
→ Resource 정보와 Terraform을 한곳에서 편집한다.

Deployment 레벨
→ 사용자가 정해진 순서대로 검사, Plan, 승인, 실행까지 진행한다.
```

Deployment 레벨은 도구 탭 모음이 아니다.
사용자가 임의의 탭을 오가며 실행하는 화면이 아니라, 현재 단계와 다음 행동이 분명한 위자드다.

## 2. 확정된 화면 책임

| 레벨 | 화면에 남길 것 | 화면에 넣지 않을 것 |
| --- | --- | --- |
| Architecture Board | Board, Resource 선택, Resource 정보, 필수/추가 파라미터, Terraform 생성·편집·검증·Board 동기화 | 비용 검사, Plan 승인, Apply, Git/CI/CD handoff, 관찰, 이력, Cleanup |
| Deployment | 배포 전 검사, 배포 기준 저장, Plan, 승인, Direct Apply 또는 Git/CI/CD handoff, 실행 결과 | Resource 파라미터 편집, Terraform 코드 편집, Board 구조 변경 |

다이어그램과 Terraform은 같은 설계 데이터를 본다.
따라서 Terraform은 `WorkspaceOperationsDock`의 배포 탭이 아니라 Architecture Board 오른쪽 패널의 두 번째 보기여야 한다.

## 3. 배포 위자드의 고정 흐름

Architecture Board에서 Terraform이 현재 Board와 동기화된 상태일 때만 `배포 시작`을 누를 수 있다.
그 순간의 Board와 Terraform 파일을 **Deployment Baseline**으로 고정한다.

```text
Architecture Board
  └─ Terraform 현재 상태 확인
      └─ 배포 시작

Deployment Wizard
  1. 배포 전 검사
  2. 배포 기준 저장 및 대상 확인
  3. Plan 생성
  4. Plan 확인 및 사용자 승인
  5. 실행 방식 선택
     ├─ Direct Deployment: Apply 실행
     └─ Git/CI/CD Deployment: 승인한 Plan으로 handoff/PR 생성
  6. 결과
     ├─ Direct Deployment log와 Outputs
     ├─ Git/CI/CD pipeline 상태
     ├─ Live Observation 시작 링크(성공한 대상만)
     └─ Deployment History 이동
```

중요한 규칙:

- 미래 단계는 현재 단계의 조건이 충족되기 전까지 열지 않는다.
- 이전 단계는 결과를 읽기 위해 다시 볼 수 있지만, 순서를 건너뛰어 실행할 수 없다.
- Terraform을 고쳐야 하면 배포 위자드를 끝내고 Architecture Board로 돌아간다. 기존 Baseline은 폐기하고 새 Terraform으로 다시 시작한다.
- `Cleanup`은 정상 배포 위자드의 마지막 단계가 아니다. 선택한 Deployment History에서 별도의 위험한 정리 위자드로 시작한다.
- Git/CI/CD handoff는 Direct Apply를 먼저 실행해야 하는 경로가 아니다. 두 경로는 같은 승인된 Plan snapshot에서 갈라지는 실행 방식이다.

## 4. 현재 구조에서 반드시 고칠 점

현재 `WorkspaceOperationsDock`은 `terraform`, `safety`, `deployment`, `git-cicd`, `history`, `live`를 동등한 탭으로 보여준다.
이 구조는 아래 두 문제를 만든다.

1. Terraform이 Resource 정보와 떨어져 있다.
2. 사용자가 검사·Plan·승인 순서를 따르지 않고 임의 탭으로 이동할 수 있다.

또한 기본 오른쪽 Inspector와 floating 작업 패널이 동시에 열릴 수 있어, Architecture와 Deployment가 같은 우선순위의 팝업처럼 보인다.

완료 뒤에는 다음이 성립해야 한다.

```text
오른쪽 패널이 열려 있다
→ Architecture Board 레벨이다.

Deployment Wizard가 열려 있다
→ Board는 Baseline을 보여주는 배경이며 Resource/Terraform 편집은 하지 않는다.
```

## 5. 구현 전 지켜야 할 경계

### 5.1 Deployment Baseline

새 `DeploymentBaseline`은 배포 위자드가 사용하는 불변 입력이다.

```ts
type DeploymentBaseline = {
  readonly diagram: DiagramJson;
  readonly terraformCode: string;
  readonly terraformFiles: readonly {
    readonly fileName: string;
    readonly code: string;
  }[];
};
```

Baseline은 Terraform이 `current` 상태일 때만 만들 수 있다.
위자드는 이 값을 바꾸지 않는다. Terraform 수정은 Architecture Board 레벨의 책임이다.

### 5.2 상태를 중복하지 않는다

Terraform 생성 상태를 Architecture 패널과 Deployment 위자드가 각각 따로 만들면 안 된다.
Architecture 패널이 Baseline을 만들고, Deployment 위자드는 그 Baseline만 받는다.

이 경계 덕분에 다음 문장이 항상 맞는다.

```text
배포한 것은 사용자가 마지막으로 확인한 Terraform이다.
```

### 5.3 기존 서버 계약 유지

이번 UI 재구성에서 DB migration을 새로 만들지 않는다.
기존 `Deployment`, Terraform artifact, Plan 승인, Direct Apply, Git/CI/CD handoff API 계약을 재사용한다.
서버 계약에 빈틈이 발견되면 UI에서 임시 상태를 만들지 말고 별도 API 작업으로 분리한다.

## 6. 마일스톤 1: 두 레벨의 상태와 진입점 고정

목표: 화면 전환 전에 Architecture 입력과 Deployment 입력을 분명히 나눈다.

예상 변경 파일:

- 수정: `apps/web/app/workspace/workspace-project-client.tsx`
- 수정: `apps/web/features/diagram-editor/types.ts`
- 생성: `apps/web/app/workspace/deployment-wizard/deployment-baseline.ts`
- 생성: `apps/web/app/workspace/deployment-wizard/deployment-baseline.test.ts`
- 수정 또는 생성: `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`

작업:

1. `DeploymentBaseline` 타입과 생성 함수를 만든다.
2. Terraform preview가 `current`가 아닐 때 Baseline 생성을 거절하는 테스트를 먼저 만든다.
3. `WorkspaceProjectClient`에 `deploymentBaseline`과 위자드 열림 상태를 둔다.
4. `DiagramEditor`가 Architecture 패널과 Deployment 위자드의 열림 상태를 명확히 전달할 수 있도록 필요한 최소 slot/context만 추가한다.
5. 위자드가 열리면 Inspector를 닫고 Board 편집 행동을 막는 화면 상태를 만든다.

완료 기준:

- `current` Terraform만 배포 시작점이 될 수 있다.
- Baseline 안의 Diagram과 Terraform 파일은 이후 편집에 의해 바뀌지 않는다.
- 오른쪽 Architecture 패널과 Deployment 위자드가 동시에 편집 가능한 상태가 되지 않는다.

커밋 기준:

```text
Refactor: Workspace 배포 Baseline 경계 추가
```

## 7. 마일스톤 2: 오른쪽 패널을 Architecture 패널로 완성

목표: Resource 정보와 Terraform을 같은 오른쪽 패널 안에서 제공한다.

예상 변경 파일:

- 생성: `apps/web/app/workspace/architecture/WorkspaceArchitecturePanel.tsx`
- 생성: `apps/web/app/workspace/architecture/workspace-architecture-panel.module.css`
- 생성: `apps/web/app/workspace/architecture/WorkspaceArchitecturePanel.test.ts`
- 수정: `apps/web/features/parameter-input/ParameterInputPanel.tsx`
- 수정: `apps/web/features/parameter-input/ParameterInputPanel.module.css`
- 이동 또는 분리: `apps/web/app/workspace/operations/TerraformOperationsPanel.tsx`
- 수정: `apps/web/app/workspace/workspace-project-client.tsx`

작업:

1. 오른쪽 패널의 상위 보기를 `Resource`와 `Terraform`으로 고정한다.
2. 노드를 선택하면 기본으로 `Resource` 보기를 연다.
3. `Terraform` 보기에는 현재 `TerraformOperationsPanel`의 생성, Validate, Board 변경 확인, 코드 편집 기능을 옮긴다.
4. Resource 정보는 지금처럼 Resource별 필수/추가 파라미터를 보여주되, Terraform과 같은 Architecture 패널의 하위 보기로만 둔다.
5. Terraform이 현재 상태일 때 `배포 시작` 행동을 제공하고, 이 행동은 Milestone 1의 Baseline 생성만 호출한다.
6. 기존 `ParameterInputPanel`의 겹친 legacy 스타일과 DESIGN pass를 하나의 스타일 책임으로 정리한다.

완료 기준:

- Resource 정보와 Terraform을 찾기 위해 서로 다른 floating panel을 열 필요가 없다.
- Terraform 코드 수정과 Board 동기화 제안은 Architecture 레벨 안에서 끝난다.
- `TerraformOperationsPanel`은 배포 도구 탭에서 렌더링되지 않는다.

커밋 기준:

```text
Refactor: Workspace Architecture 패널에 Terraform 통합
```

## 8. 마일스톤 3: Deployment Wizard 껍데기와 단계 잠금

목표: 배포 레벨을 탭 UI에서 순서형 위자드로 바꾼다.

예상 변경 파일:

- 생성: `apps/web/app/workspace/deployment-wizard/DeploymentWizard.tsx`
- 생성: `apps/web/app/workspace/deployment-wizard/deployment-wizard.module.css`
- 생성: `apps/web/app/workspace/deployment-wizard/deployment-wizard-state.ts`
- 생성: `apps/web/app/workspace/deployment-wizard/deployment-wizard-state.test.ts`
- 수정: `apps/web/app/workspace/workspace-project-client.tsx`
- 수정: `apps/web/features/workspace/deployment-console-state.ts`

작업:

1. 위자드 단계 ID를 `preflight`, `prepare`, `plan`, `approve`, `route`, `result`로 정의한다.
2. 현재 단계, 완료 단계, 차단 사유, 다음 행동을 한 상태 계산기로 만든다.
3. 위자드 화면은 왼쪽에 단계 순서, 오른쪽에 현재 단계 본문 하나만 보여준다.
4. 미래 단계는 읽기 전용 요약도 노출하지 않고 잠금 사유만 보여준다.
5. 닫기 또는 `Architecture로 돌아가기`는 Baseline을 명시적으로 폐기한 뒤 Board 편집으로 복귀한다.

완료 기준:

- 사용자가 `배포`, `Git/CI`, `관찰`, `이력` 탭을 자유롭게 바꾸는 UI가 없다.
- 화면은 언제나 현재 단계와 다음에 눌러야 할 행동 하나를 보여준다.
- 이전 단계 결과는 읽을 수 있지만 완료되지 않은 단계의 실행 버튼은 없다.

커밋 기준:

```text
Feat: 순서형 Deployment Wizard 추가
```

## 9. 마일스톤 4: Direct Deployment 경로 연결

목표: 기존 Direct Deployment 안전 계약을 위자드 단계에 정확히 연결한다.

예상 변경 파일:

- 수정: `apps/web/app/workspace/operations/use-workspace-safety.ts`
- 수정: `apps/web/app/workspace/operations/use-workspace-deployment.ts`
- 이동 또는 분리: `apps/web/app/workspace/operations/SafetyOperationsPanel.tsx`
- 이동 또는 분리: `apps/web/app/workspace/operations/DeploymentOperationsPanel.tsx`
- 수정: `apps/web/features/workspace/deployment-console-state.ts`
- 생성: `apps/web/app/workspace/deployment-wizard/direct-deployment-wizard.test.ts`

작업:

1. `preflight` 단계에서 Baseline 기준 비용·보안·Terraform 검사를 실행한다.
2. 차단 finding이 있으면 `prepare`와 이후 단계를 잠근다.
3. `prepare` 단계에서 저장된 Baseline, 검증된 AWS 연결, Deployment 초기화를 만든다.
4. `plan` 단계에서 실제 변경 요약과 위험 경고를 보여준다.
5. `approve` 단계에서 현재 Plan snapshot과 acknowledgement를 사용자에게 확인받는다.
6. `route` 단계에서 Direct Apply 또는 Git/CI/CD handoff를 고르게 한다.
7. Direct 선택 시에만 Apply 실행과 실행 중 log를 보여준다.

완료 기준:

- 기존 Plan 승인 전 Apply 금지 규칙이 유지된다.
- High risk가 막은 경우 Apply와 handoff 모두 시작되지 않는다.
- 실행 중에는 중복 Apply나 다른 경로 선택을 할 수 없다.
- 오류, 취소, 성공은 각각 `result` 단계에서 다음 행동을 분명히 보여준다.

커밋 기준:

```text
Refactor: Direct Deployment를 위자드 단계에 연결
```

## 10. 마일스톤 5: Git/CI/CD 분기와 결과 화면

목표: 승인한 Plan에서 Direct Apply와 Git/CI/CD handoff가 명확히 갈라지게 한다.

예상 변경 파일:

- 수정: `apps/web/app/workspace/operations/use-workspace-git-cicd.ts`
- 이동 또는 분리: `apps/web/app/workspace/operations/GitCicdOperationsPanel.tsx`
- 이동 또는 분리: `apps/web/app/workspace/operations/LiveObservationOperationsPanel.tsx`
- 이동 또는 분리: `apps/web/app/workspace/operations/DeploymentHistoryPanel.tsx`
- 생성: `apps/web/app/workspace/deployment-wizard/GitCicdHandoffStep.tsx`
- 생성: `apps/web/app/workspace/deployment-wizard/DeploymentResultStep.tsx`
- 생성: `apps/web/app/workspace/deployment-wizard/deployment-route.test.ts`

작업:

1. Git/CI/CD 경로는 승인된 Plan artifact를 사용하며 Direct Apply 성공을 선행 조건으로 요구하지 않게 한다.
2. Repository 선택과 handoff 확인은 `route` 단계 안에만 둔다.
3. handoff/PR/pipeline 상태는 `result` 단계에서 추적한다.
4. Direct Apply 성공 결과에서는 log, Outputs, Live Observation 시작 조건을 보여준다.
5. Deployment History는 결과 화면의 링크로 열고, 정상 배포 위자드의 단계로 넣지 않는다.
6. Cleanup은 선택한 성공 또는 부분 실패 Deployment에서만 별도 확인 절차로 시작한다.

완료 기준:

- 사용자는 승인 후 한 번의 선택으로 Direct 또는 Git/CI/CD 경로를 명확히 이해한다.
- 성공하지 않은 Deployment에는 Live Observation 시작 행동이 없다.
- Cleanup은 별도 위험 확인 없이 시작되지 않는다.

커밋 기준:

```text
Feat: Deployment Wizard 실행 경로와 결과 연결
```

## 11. 마일스톤 6: 기존 Dock 제거와 QA

목표: 예전 탭형 Dock을 제거하고 새 레벨 분리가 깨지지 않게 검증한다.

예상 변경 파일:

- 제거 또는 대체: `apps/web/app/workspace/operations/WorkspaceOperationsDock.tsx`
- 제거 또는 대체: `apps/web/app/workspace/operations/workspace-operations.module.css`
- 수정: `apps/web/features/workspace/workspace-ai-dock-contract.test.ts`
- 수정: `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`
- 생성: `apps/web/app/workspace/deployment-wizard/deployment-wizard-flow.test.ts`
- 수정: `docs/gg/fix-gg-qa-followup/000_Workspace_레벨분리_배포위자드_구현마일스톤_gg.md`

QA 시나리오:

1. Resource 선택 → Resource 정보 수정 → Terraform 생성 → Validate → Board 변경 확인
2. Terraform이 stale인 상태에서 배포 시작 시도 → 시작 차단
3. Terraform current → 배포 시작 → 검사 실패 → Plan 단계 잠김
4. 검사 통과 → Plan → 경고 확인 → 승인 → Direct Apply
5. 검사 통과 → Plan → 승인 → Git/CI/CD handoff
6. 성공한 Direct Deployment → 결과 → Live Observation 조건 확인 → History 이동
7. 실행 중 취소, 실패, stale Baseline, 작은 화면에서 위자드 열기

마지막 검증:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter @sketchcatch/web test
```

완료 기준:

- 코드에서 Terraform이 배포 Dock 탭으로 렌더링되지 않는다.
- 기존 `WorkspaceOperationsDock` 탭 UI가 남아 있지 않다.
- Architecture와 Deployment가 동시에 편집 가능한 floating panel로 겹치지 않는다.
- QA 시나리오에서 미래 단계 실행이 모두 차단된다.

커밋 기준:

```text
Refactor: Workspace 탭형 배포 도구 제거
```

## 12. 이번 문서에서 의도적으로 하지 않는 것

- AI Dock의 전체 재설계
- Reverse Engineering 화면 재구성
- 새 DB migration
- 실제 AWS Resource 생성·수정·삭제를 QA 중 임의로 실행

AI Dock은 Architecture 또는 Deployment의 현재 맥락과 겹치지 않도록 열림 상태만 확인한다.
AI Dock의 최종 소속과 대화 UX 재설계는 이 두 레벨이 안정된 뒤 별도 작업으로 다룬다.

## 13. 구현 순서 요약

```text
Baseline 경계
→ Architecture 오른쪽 패널에 Resource + Terraform 통합
→ Deployment Wizard 뼈대
→ Direct Deployment 단계 연결
→ Git/CI/CD 분기와 결과
→ 기존 Dock 제거 및 QA
```

이 순서를 지키면 화면을 먼저 꾸미다가 실행 안전 계약을 잃지 않는다.
