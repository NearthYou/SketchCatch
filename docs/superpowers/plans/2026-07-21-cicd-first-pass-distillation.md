# CI/CD 1차 단순화 구현 계획

> **에이전트 작업자 필수 사항:** 이 계획을 작업 단위로 구현할 때 `superpowers:subagent-driven-development` 사용을 권장하며, 대신 `superpowers:executing-plans`를 사용할 수 있다. 진행 상황은 체크박스(`- [ ]`)로 추적한다.

**목표:** 배포 안전 동작을 바꾸지 않으면서 반복되는 CI/CD 준비 상태 장식을 제거하고, 자동 감지된 타깃 정보를 합치며, 실제 전체 새로고침 버튼 하나를 제공한다.

**구조:** `DeliveryCenterPanel`이 단일 새로고침 버튼을 소유하고 타입이 지정된 React 핸들을 통해 기존 콘솔 갱신 조정 함수를 호출한다. 상태보드와 아코디언 그룹에서는 중복된 준비 상태 요약을 제거하고, `CicdAutomaticSetupSummary`를 배포 타깃 아코디언 내부로 옮긴다.

**기술 스택:** Next.js 16, React 19, TypeScript, CSS Modules, `tsx`를 사용하는 Node 테스트 실행기

## 전체 제약

- PR 검토, 승인된 Plan, Repository/AWS Role 승인, Activity, Logs, 오류 복구 동작을 유지한다.
- API, 공용 타입, DB, 마이그레이션, AWS, Terraform, GitHub 변경 계약을 바꾸지 않는다.
- 검정색 주요 행동 버튼 하나와 기존 프로젝트 색상 토큰을 유지한다.
- 관련 없는 변경이 있는 작업 트리의 파일을 스테이징하거나 수정하지 않는다.
- 운영 코드를 바꾸기 전에 실패하는 테스트를 작성하고 확인한다.

---

### 작업 1: 단순화한 정보 계약 고정

**파일:**

- 수정: `apps/web/features/workspace/cicd-ledger-layout.test.ts`

**계약:**

- `전체 새로고침`은 하나만 있어야 한다.
- `.statusProgress`와 독립된 `자동 설정 결과` 아코디언이 없어야 한다.
- `CicdAutomaticSetupSummary`가 배포 타깃 아코디언 안에 있어야 한다.

- [ ] **1단계: 실패하는 소스 계약 검증 추가**

`DeliveryCenterPanel`이 `ref={consoleRef}`를 포함하고 `refreshAll()`을 호출하며 `전체 새로고침`을 렌더링하는지 검증한다. `CicdPipelineRunsPanel`이 더 이상 `onManualRefresh`를 받지 않는지 검증한다. 독립된 자동 설정 아코디언과 중복 개수 표현이 없는지 검증한다.

- [ ] **2단계: 집중 테스트를 실행해 실패 확인**

```bash
pnpm --dir apps/web exec tsx --test features/workspace/cicd-ledger-layout.test.ts
```

예상 결과: 기존 헤더 배지, 상태 진행 막대, 독립 자동 설정 아코디언, Pipeline 새로고침 버튼 때문에 실패한다.

### 작업 2: 단일 새로고침과 단순화한 배치 구현

**파일:**

- 수정: `apps/web/features/workspace/DeliveryCenterPanel.tsx`
- 수정: `apps/web/features/workspace/CicdConsoleScreen.tsx`
- 수정: `apps/web/features/workspace/CicdStatusBoard.tsx`
- 수정: `apps/web/features/workspace/CicdPipelineRunsPanel.tsx`
- 수정: `apps/web/features/workspace/delivery-center.module.css`

**계약:**

- 제공: `CicdConsoleScreenHandle = { refreshAll(): Promise<void> | null }`
- 사용: 기존 전체 갱신 조정 로직

- [ ] **1단계: 기존 갱신 조정 함수 공개**

`CicdConsoleScreen`을 `forwardRef`로 변환하고 `useImperativeHandle`을 추가해 기존 전체 갱신 함수를 `refreshAll`로 공개한다. 프로필 갱신도 이 함수에 계속 포함한다.

- [ ] **2단계: 단일 헤더 행동 연결**

`DeliveryCenterPanel`에 `consoleRef`를 만든다. 헤더 버튼은 `consoleRef.current?.refreshAll()`이 반환한 실제 전체 갱신을 기다리고, 콘솔이 아직 마운트되지 않았으면 프로필 갱신으로 대체한다. 사용자가 시작한 전체 갱신이 실행되는 동안에만 `새로고침 중`을 표시한다.

- [ ] **3단계: 반복 상태 장식 제거**

헤더 준비 상태 배지, 상태 진행 표시와 CSS, 아코디언 그룹 개수, PR 준비 상태 비율을 제거한다. 상태 값과 다음 행동 행은 유지한다. PR 인계가 없을 때 값은 `대기`로 표시한다. 헤더에는 `CI/CD`, 마지막 확인 시각, 전체 새로고침만 남긴다.

- [ ] **4단계: 자동 감지 정보를 배포 타깃에 병합**

배포 타깃 아코디언의 `ProjectDeploymentTargetEditor` 아래에 `CicdAutomaticSetupSummary`를 `감지된 배포 정보` 제목으로 렌더링한다. 독립된 자동 설정 아코디언을 제거하고, 출력 관련 현재 행동이 `deployment-target-title`을 열게 한다.

- [ ] **5단계: Pipeline의 새로고침 소유권 제거**

`CicdPipelineRunsPanel`에서 `onManualRefresh`, `isRefreshing`, `isReadinessRefreshing`을 삭제한다. Pipeline 상태, 실행 선택, Activity, Logs, 출력, 재시도 행동은 그대로 둔다.

- [ ] **6단계: 전체 새로고침 경쟁 조건 보완**

`CicdConsoleScreen`이 초기 조회, 자동 조회, 프로필 조회, 명시적 전체 새로고침 동안 전체 새로고침을 사용할 수 없다는 상태를 `DeliveryCenterPanel`에 전달하게 한다. `DeliveryCenterPanel`은 이 상태와 프로필 조회 상태를 사용해 단일 버튼을 비활성화한다.

`consoleRequestKey`에서는 `readiness.checkedAt`을 제외하고 `projectId`, `loadRequestId`, `readinessRefreshRequestId`만 사용한다. 전체 갱신은 `try/finally`로 정리하며 현재 `reloadGeneration`을 소유한 경우에만 조정자 잠금과 갱신 상태를 해제한다.

- [ ] **7단계: 집중 테스트와 관련 회귀 테스트 통과 확인**

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/cicd-ledger-layout.test.ts \
  features/workspace/cicd-console-heading.test.ts \
  features/workspace/cicd-responsive-contract.test.ts \
  features/workspace/delivery-center-integration.test.ts \
  features/workspace/cicd-pipeline-presentation.test.ts \
  features/workspace/cicd-github-account-cta.test.ts
```

예상 결과: 모든 집중 테스트가 통과한다.

- [ ] **8단계: 저장소 필수 검사 실행**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

예상 결과: 모든 명령이 종료 코드 0으로 끝난다. `pnpm build`가 하위 빌드 완료 뒤 종료되지 않으면 정확한 상태를 기록하고 성공으로 간주하지 않는다.

- [ ] **9단계: 검토 후 범위 파일만 커밋**

저장소 검토 절차에 따라 관련 없는 변경을 보존하고, 이번 수정 소유 파일만 다음 메시지로 커밋한다.

```bash
git commit -m "Fix: CI/CD 전체 새로고침 경쟁 조건 보완"
```
