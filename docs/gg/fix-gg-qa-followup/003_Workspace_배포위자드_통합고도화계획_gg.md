# Workspace와 Deployment Wizard 통합 고도화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workspace를 Architecture 편집 레벨과 Deployment 실행 레벨로 분리하고, 기존 Resource·Terraform·AI·배포 기능과 사용자 승인 계약을 보존한 채 레퍼런스 문서의 시각 기준으로 고도화한다.

**Architecture:** Workspace 오른쪽은 `Resource`와 `Terraform`만 소유하는 Architecture Panel로 정리한다. `배포 시작`은 현재 Board와 Terraform을 불변 `DeploymentBaseline`으로 고정한 뒤 전체 화면 Deployment Wizard를 열며, 위자드는 `Preflight → Prepare → Plan → Approve → Route → Result` 순서를 강제한다. AI는 Architecture에서는 기존 chat dock을 시각적으로 정리해 보조하고, Deployment에서는 현재 단계의 설명만 제공하며 어떤 변경이나 실행도 자동 승인하지 않는다.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, React Flow, Node test runner, 기존 SketchCatch Web/API 계약

## Global Constraints

- 기존 버튼의 기능, API 호출 순서, 사용자 승인 조건을 임의로 바꾸지 않는다.
- Board, Terraform, Deployment, Git/CI/CD 변경은 기존 명시적 사용자 승인 뒤에만 실행한다.
- Terraform 편집과 Board 동기화는 Architecture 레벨에서만 수행한다.
- Deployment Wizard는 고정된 `DeploymentBaseline`만 읽고 Diagram이나 Terraform을 수정하지 않는다.
- Direct Deployment와 Git/CI/CD는 승인된 같은 Plan snapshot에서 갈라진다.
- `Cleanup`은 정상 배포 위자드의 마지막 단계가 아니라 Deployment History에서 시작하는 별도 위험 절차다.
- UI에서 Terraform CLI, AWS SDK, 실제 apply/destroy를 직접 실행하지 않는다.
- DB migration과 API 계약 변경은 이 계획 범위에 포함하지 않는다.
- Desktop 주요 텍스트 버튼은 높이 `40px`, compact icon 버튼은 `40px × 40px`, AI launcher는 `44px × 44px`, radius는 `8px`을 기준으로 한다.
- Architecture Panel과 AI chat dock의 Desktop 폭은 `clamp(376px, 30vw, 416px)`을 기준으로 한다.
- `768px` 이하에서는 오른쪽 dock 대신 `100dvh` 전체 화면 sheet를 사용하고 `env(safe-area-inset-bottom)`을 적용한다.
- AI chat은 `header / transcript / composer` 구조를 유지하고 transcript만 스크롤한다.
- 기본 간격은 `8px`, section 간격은 `16px` 또는 `24px` 단위로 맞춘다.
- 회색 panel 안에 흰 card가 반복되는 중첩을 줄이고 heading, divider, whitespace로 계층을 표현한다.

---

## 1. 최종 화면 계약

### 1.1 Architecture Workspace

```text
Workspace
├─ 64px Project Bar
├─ Resource Palette
├─ Architecture Board
├─ Architecture Panel
│  ├─ Resource
│  │  ├─ Metadata
│  │  ├─ Required parameters
│  │  └─ Additional settings
│  └─ Terraform
│     ├─ 생성·현재 상태
│     ├─ Code edit
│     ├─ Validate
│     ├─ Issues
│     ├─ Board sync proposal
│     └─ 배포 시작
└─ AI Chat Dock
   ├─ Header와 현재 Architecture 문맥
   ├─ Transcript와 승인 전 Preview
   └─ 고정 Composer
```

- Architecture Panel은 하나의 surface다.
- Resource와 Terraform은 같은 heading, padding, divider 체계를 사용한다.
- Deploy는 오른쪽 패널의 세 번째 편집 tab이 아니라 Wizard를 여는 행동이다.
- AI panel과 Architecture Panel이 동시에 Board를 덮지 않도록 기존 열림 상태 상호 배제를 유지한다.

### 1.2 Deployment Wizard

```text
Deployment Wizard
├─ Header
│  ├─ Project / Baseline 정보
│  ├─ 현재 상태
│  └─ Architecture로 돌아가기
├─ Step rail
│  ├─ 1. 배포 전 검사
│  ├─ 2. 배포 기준과 대상
│  ├─ 3. Plan
│  ├─ 4. 승인
│  ├─ 5. 실행 방식
│  └─ 6. 결과
└─ Current step body
```

- Desktop은 viewport 가장자리에서 `24px` 떨어진 console surface를 사용한다.
- Wizard shell 최대 폭은 `1440px`, 최대 높이는 `calc(100dvh - 48px)`로 제한한다.
- Step rail은 `240px`, 본문은 `minmax(0, 1fr)`로 구성한다.
- Mobile은 inset과 radius를 제거한 전체 화면 layout으로 전환한다.
- 미래 단계는 실행 control을 보여주지 않고 잠금 이유만 표시한다.
- 이전 단계는 읽기만 가능하며 완료 결과를 바꾸지 않는다.

---

### Task 1: 현재 동작과 시각 계약 고정

**Files:**
- Modify: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`
- Modify: `apps/web/features/parameter-input/parameter-panel-source.test.ts`
- Modify: `apps/web/features/diagram-editor/diagram-editor-layout.test.ts`
- Reference: `docs/gg/fix-gg-qa-followup/000_Workspace_레벨분리_배포위자드_구현마일스톤_gg.md`
- Reference: `docs/gg/fix-gg-qa-followup/001_Workspace_오른쪽패널_현재디자인_롤백기준_gg.md`
- Reference: `docs/gg/fix-gg-qa-followup/002_Workspace_시각개편_단계별접근_gg.md`

**Interfaces:**
- Consumes: 현재 `WorkspaceRightPanel`, `DeploymentPanel`, `WorkspaceAiChatDock` source contract
- Produces: 이후 task가 보존해야 하는 버튼·handler·승인·시각 기준 test

- [x] **Step 1: 버튼과 승인 경계 source contract를 추가한다**

```ts
test("workspace modernization preserves action ownership", () => {
  assert.match(rightPanelSource, /onClick=\{\(\) => requestView\("resource"\)\}/);
  assert.match(rightPanelSource, /onClick=\{\(\) => requestView\("terraform"\)\}/);
  assert.match(rightPanelSource, /openDeploymentConsole/);
  assert.match(deploymentPanelSource, /approveCurrentPlan/);
  assert.match(deploymentPanelSource, /runDeploymentApply/);
  assert.match(aiChatSource, /applyDraftToBoard/);
  assert.match(aiChatSource, /applyPatchPreviewToBoard/);
});
```

- [x] **Step 2: 목표 시각 selector가 아직 없어 실패하는 test를 추가한다**

```ts
test("workspace modernization exposes one architecture surface and full-screen wizard", () => {
  assert.match(stylesSource, /Workspace architecture visual contract/);
  assert.match(stylesSource, /--workspace-panel-width:\s*clamp\(376px,\s*30vw,\s*416px\)/);
  assert.match(stylesSource, /--workspace-control-height:\s*40px/);
  assert.match(stylesSource, /--workspace-ai-launcher-size:\s*44px/);
  assert.match(stylesSource, /Deployment wizard visual contract/);
});
```

- [x] **Step 3: 집중 test를 실행해 시각 계약만 실패하는지 확인한다**

Run:

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/workspace-right-panel-layout.test.ts \
  features/parameter-input/parameter-panel-source.test.ts \
  features/diagram-editor/diagram-editor-layout.test.ts
```

Expected: 기존 기능 계약은 PASS, 새 시각 selector 계약은 FAIL

- [x] **Step 4: 기준선 결과를 commit한다**

```bash
git add apps/web/features/workspace/workspace-right-panel-layout.test.ts \
  apps/web/features/parameter-input/parameter-panel-source.test.ts \
  apps/web/features/diagram-editor/diagram-editor-layout.test.ts
git commit -m "Test: Workspace 고도화 동작 계약 고정" -m "오른쪽 패널, 배포 승인과 AI 적용 기능의 현재 책임을 먼저 고정합니다. 이후 시각 구조를 바꿔도 기존 행동이 사라지지 않게 합니다."
```

---

### Task 2: Workspace 공통 시각 token과 Desktop shell 정리

**Files:**
- Modify: `apps/web/features/diagram-editor/diagram-editor.module.css`
- Modify: `apps/web/features/workspace/workspace.module.css`

**Interfaces:**
- Consumes: Task 1의 시각 selector contract
- Produces: `--workspace-panel-width`, `--workspace-control-height`, `--workspace-ai-launcher-size` CSS custom properties

- [x] **Step 1: Workspace shell token을 추가한다**

```css
/* Workspace architecture visual contract */
.workspaceVisualScope {
  --workspace-panel-width: clamp(376px, 30vw, 416px);
  --workspace-control-height: 40px;
  --workspace-icon-control-size: 40px;
  --workspace-ai-launcher-size: 44px;
  --workspace-control-radius: 8px;
  --workspace-space-1: 8px;
  --workspace-space-2: 16px;
  --workspace-space-3: 24px;
}
```

`DiagramEditor` 최상위 shell이 이미 Workspace token을 소유하므로 실제 구현에서는 별도 DOM을 추가하지 않고 `.editorShell` 또는 `.rightPanelShell`에 같은 custom property를 선언한다.

- [x] **Step 2: Desktop rail과 panel 폭을 token에 맞춘다**

```css
.rightRail {
  background: var(--workspace-surface);
  border-left: 1px solid var(--workspace-line);
  min-width: 0;
  width: var(--workspace-panel-width);
}

.rightPanelShell {
  background: var(--workspace-surface);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}
```

- [x] **Step 3: button 크기와 focus를 통일한다**

```css
.panelModeButton,
.panelModeButtonActive,
.panelCollapseButton,
.deploymentPrimaryButton,
.deploymentSecondaryButton,
.aiPrimaryButton,
.aiSecondaryButton {
  border-radius: var(--workspace-control-radius);
  min-height: var(--workspace-control-height);
}

.panelModeButton:focus-visible,
.panelCollapseButton:focus-visible,
.deploymentPrimaryButton:focus-visible,
.aiPrimaryButton:focus-visible {
  outline: 2px solid var(--workspace-accent);
  outline-offset: 2px;
}
```

- [x] **Step 4: Task 1 test를 실행한다**

Expected: Workspace visual selector contract PASS, 기능 contract PASS

- [x] **Step 5: commit한다**

```bash
git add apps/web/features/diagram-editor/diagram-editor.module.css \
  apps/web/features/workspace/workspace.module.css
git commit -m "UI: Workspace 공통 시각 기준 정리" -m "오른쪽 패널과 주요 버튼이 같은 폭, 높이, radius와 focus 기준을 사용하게 합니다. 기능과 상태 로직은 바꾸지 않습니다."
```

---

### Task 3: Resource Inspector의 카드 중첩 제거

**Files:**
- Modify: `apps/web/features/parameter-input/ParameterInputPanel.module.css`
- Test: `apps/web/features/parameter-input/parameter-panel-source.test.ts`

**Interfaces:**
- Consumes: 기존 `ParameterInputPanel.tsx` markup과 required/additional parameter 기능
- Produces: 단일 Inspector surface, divider 기반 section hierarchy

- [x] **Step 1: 새 divider hierarchy test를 먼저 작성한다**

```ts
test("ParameterInputPanel uses one inspector surface without nested section cards", () => {
  const sectionRule = getLastCssRule(stylesSource, "section");
  assert.match(sectionRule, /background:\s*transparent/);
  assert.match(sectionRule, /border-top:\s*1px solid var\(--workspace-line/);
  assert.doesNotMatch(sectionRule, /box-shadow/);
});
```

- [x] **Step 2: test가 기존 흰 card와 shadow 때문에 FAIL하는지 확인한다**

- [x] **Step 3: Inspector surface를 정리한다**

```css
.panel {
  background: var(--workspace-surface);
  gap: 0;
  padding: var(--workspace-space-2);
}

.section {
  background: transparent;
  border: 0;
  border-radius: 0;
  border-top: 1px solid var(--workspace-line);
  box-shadow: none;
  padding: var(--workspace-space-2) 0;
}

.sectionHeader {
  border-bottom: 0;
  padding-bottom: var(--workspace-space-1);
}
```

- [x] **Step 4: Metadata와 parameter row는 정보 밀도를 유지한다**

```css
.metadataGrid {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr);
}

.parameterField {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr);
  padding: 14px 0;
}
```

- [x] **Step 5: parameter source test를 실행하고 commit한다**

```bash
git add apps/web/features/parameter-input/ParameterInputPanel.module.css \
  apps/web/features/parameter-input/parameter-panel-source.test.ts
git commit -m "UI: Resource Inspector 정보 계층 정리" -m "중첩 card를 줄이고 제목, divider와 여백으로 필수 입력과 추가 설정을 읽기 쉽게 정리합니다. 기존 parameter 기능은 그대로 유지합니다."
```

---

### Task 4: 오른쪽 패널을 Architecture Panel로 고정

**Files:**
- Modify: `apps/web/app/workspace/workspace-start-mode.ts`
- Modify: `apps/web/app/workspace/workspace-start-mode.test.ts`
- Modify: `apps/web/features/workspace/workspace-right-panel.types.ts`
- Modify: `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Test: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`

**Interfaces:**
- Consumes: `ResourceWorkspacePanel`, `TerraformCodePanel`, `TerraformIssuesPanel`, `openDeploymentConsole`
- Produces: `WorkspaceArchitecturePanelView = "resource" | "terraform"`, 별도 Deployment Wizard 진입 행동

- [x] **Step 1: panel view에서 Deployment를 제외하는 실패 test를 작성한다**

```ts
test("architecture panel owns only Resource and Terraform", () => {
  assert.match(typesSource, /"resource" \| "terraform"/);
  assert.doesNotMatch(typesSource, /"deployment"/);
  assert.match(rightPanelSource, /openDeploymentConsole/);
});
```

- [x] **Step 2: type을 Architecture 책임에 맞춘다**

```ts
export type WorkspaceArchitecturePanelView = "resource" | "terraform";
export type WorkspaceRightPanelView = WorkspaceArchitecturePanelView;
```

- [x] **Step 3: Resource와 Terraform navigation만 panel view로 유지한다**

Deployment button은 삭제하지 않고 `openDeploymentConsole`을 호출하는 독립 행동으로 유지한다. `requestView("deployment")`와 `initialView === "deployment"` 분기만 제거한다.

`resolveInitialWorkspaceRightPanelView`는 새 프로젝트 시작 mode로 Deployment를 열지 않는 현재 계약을 유지하되 반환 type을 `WorkspaceArchitecturePanelView | undefined`로 좁힌다.

- [x] **Step 4: Terraform 이탈 guard가 Deploy 진입에도 유지되는지 확인한다**

```ts
assert.match(rightPanelSource, /requestTerraformLeave\(\{ kind: "deployment-console" \}\)/);
assert.match(rightPanelSource, /setIsDeploymentConsoleOpen\(true\)/);
```

- [x] **Step 5: 집중 test를 실행하고 commit한다**

```bash
git add apps/web/features/workspace/workspace-right-panel.types.ts \
  apps/web/app/workspace/workspace-start-mode.ts \
  apps/web/app/workspace/workspace-start-mode.test.ts \
  apps/web/features/workspace/WorkspaceRightPanel.tsx \
  apps/web/features/workspace/workspace.module.css \
  apps/web/features/workspace/workspace-right-panel-layout.test.ts
git commit -m "Refactor: Workspace 오른쪽 패널 책임 분리" -m "Resource와 Terraform은 Architecture Panel에 남기고 Deploy는 별도 Wizard를 여는 행동으로 분리합니다. Terraform 미저장 이탈 확인은 그대로 유지합니다."
```

---

### Task 5: AI Chat Dock 시각 구조 정리

**Files:**
- Modify: `apps/web/features/workspace/workspace.module.css`
- Test: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`
- Test: `apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts`

**Interfaces:**
- Consumes: 기존 `WorkspaceAiChatDock.tsx`의 tab, transcript, suggestion, preview, apply/cancel, voice, submit handler
- Produces: Desktop dock와 Mobile full-screen assistant

- [x] **Step 1: layout contract test를 작성한다**

```ts
test("AI chat keeps a fixed composer and scroll-only transcript", () => {
  const dockRule = getLastCssRule(stylesSource, "aiChatDock");
  const transcriptRule = getLastCssRule(stylesSource, "aiChatTranscript");
  assert.match(dockRule, /grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto/);
  assert.match(transcriptRule, /overflow-y:\s*auto/);
});
```

- [x] **Step 2: Desktop chat을 레퍼런스 수치로 정리한다**

```css
.aiChatLauncher {
  border-radius: 8px;
  height: var(--workspace-ai-launcher-size);
  width: var(--workspace-ai-launcher-size);
}

.aiChatDock {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: var(--workspace-panel-width);
}

.aiChatTranscript {
  min-height: 0;
  overflow-y: auto;
}

.aiChatComposer {
  background: var(--workspace-surface);
  border-top: 1px solid var(--workspace-line);
  padding: 12px 16px 16px;
}
```

- [x] **Step 3: textarea 최대 높이와 action 크기를 고정한다**

```css
.aiChatInput textarea {
  max-height: calc(1.5em * 6 + 24px);
  min-height: 44px;
  resize: none;
}

.aiChatVoiceButton,
.aiChatSendButton {
  min-height: 40px;
}
```

- [x] **Step 4: Mobile assistant를 전체 화면으로 전환한다**

```css
@media (max-width: 768px) {
  .aiChatDock {
    border: 0;
    border-radius: 0;
    height: 100dvh;
    inset: 0;
    padding-bottom: env(safe-area-inset-bottom);
    position: fixed;
    width: 100vw;
  }
}
```

- [x] **Step 5: AI guardrail test와 layout test를 실행하고 commit한다**

```bash
git add apps/web/features/workspace/workspace.module.css \
  apps/web/features/workspace/workspace-right-panel-layout.test.ts \
  apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts
git commit -m "UI: Workspace AI Chat Dock 레이아웃 정리" -m "Desktop에서는 읽기 좋은 dock으로, Mobile에서는 전체 화면 assistant로 표시합니다. 대화 저장, 음성 입력과 적용 승인 동작은 바꾸지 않습니다."
```

---

### Task 6: 불변 Deployment Baseline 경계 추가

**Files:**
- Create: `apps/web/features/workspace/deployment-baseline.ts`
- Create: `apps/web/features/workspace/deployment-baseline.test.ts`
- Modify: `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- Modify: `apps/web/features/workspace/DeploymentPanel.tsx`

**Interfaces:**
- Consumes: `DiagramJson`, 현재 Terraform virtual files, Terraform current/dirty 상태
- Produces: `DeploymentBaseline`, `createDeploymentBaseline(input)`

- [x] **Step 1: baseline 생성 조건의 실패 test를 작성한다**

```ts
test("deployment baseline rejects unsaved Terraform", () => {
  assert.throws(
    () => createDeploymentBaseline({
      diagram,
      terraformFiles: files,
      hasUnsavedTerraformChanges: true
    }),
    /TERRAFORM_NOT_CURRENT/
  );
});

test("deployment baseline clones Diagram and Terraform files", () => {
  const baseline = createDeploymentBaseline({
    diagram,
    terraformFiles: files,
    hasUnsavedTerraformChanges: false
  });
  diagram.nodes.length = 0;
  assert.notEqual(baseline.diagram.nodes.length, 0);
});
```

- [x] **Step 2: immutable input type을 구현한다**

```ts
export type DeploymentBaseline = {
  readonly diagram: DiagramJson;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
  readonly fingerprint: string;
  readonly createdAt: string;
};

export function createDeploymentBaseline(input: {
  readonly diagram: DiagramJson;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
  readonly hasUnsavedTerraformChanges: boolean;
}): DeploymentBaseline {
  if (input.hasUnsavedTerraformChanges) throw new Error("TERRAFORM_NOT_CURRENT");
  const diagram = structuredClone(input.diagram);
  const terraformFiles = structuredClone(input.terraformFiles);
  return {
    diagram,
    terraformFiles,
    fingerprint: toDeploymentBaselineFingerprint(diagram),
    createdAt: new Date().toISOString()
  };
}
```

- [x] **Step 3: Deploy 진입 시 baseline을 만들고 modal에 전달한다**

`DeploymentPanel`이 `context.diagram`과 Terraform ref를 다시 읽지 않도록 `baseline` prop을 추가한다. 기존 API 호출은 baseline의 Diagram과 files를 사용하되 호출 순서는 유지한다.

- [x] **Step 4: baseline test와 기존 deployment artifact test를 실행한다**

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/deployment-baseline.test.ts \
  features/workspace/workspace-deployment-artifacts.test.ts
```

- [x] **Step 5: commit한다**

```bash
git add apps/web/features/workspace/deployment-baseline.ts \
  apps/web/features/workspace/deployment-baseline.test.ts \
  apps/web/features/workspace/WorkspaceRightPanel.tsx \
  apps/web/features/workspace/DeploymentPanel.tsx
git commit -m "Refactor: Workspace Deployment Baseline 고정" -m "사용자가 확인한 Board와 Terraform 파일을 배포 시작 순간에 복제해 고정합니다. Wizard는 이 값만 읽고 Architecture 편집 상태를 바꾸지 않습니다."
```

---

### Task 7: Deployment Wizard 상태 계산기 구현

**Files:**
- Create: `apps/web/features/workspace/deployment-wizard-state.ts`
- Create: `apps/web/features/workspace/deployment-wizard-state.test.ts`
- Modify: `apps/web/features/workspace/deployment-console-state.ts`

**Interfaces:**
- Consumes: 기존 `getDirectDeploymentFlow`, Preflight 상태, Deployment, 승인 상태, 실행 route
- Produces: `DeploymentWizardStepId`, `DeploymentExecutionRoute`, `getDeploymentWizardState(input)`

- [x] **Step 1: 고정 단계와 잠금 규칙 test를 작성한다**

```ts
test("wizard stops at Preflight when findings block deployment", () => {
  const state = getDeploymentWizardState(createInput({ preflight: "blocked" }));
  assert.equal(state.activeStepId, "preflight");
  assert.equal(state.steps.find((step) => step.id === "plan")?.state, "locked");
});

test("wizard branches only after approved Plan", () => {
  const state = getDeploymentWizardState(createInput({ plan: "approved" }));
  assert.equal(state.activeStepId, "route");
  assert.equal(state.canChooseRoute, true);
});
```

- [x] **Step 2: 상태 계약을 구현한다**

```ts
export type DeploymentWizardStepId =
  | "preflight"
  | "prepare"
  | "plan"
  | "approve"
  | "route"
  | "result";

export type DeploymentExecutionRoute = "direct" | "git-cicd";
export type DeploymentWizardStepState = "active" | "complete" | "locked" | "error";
```

`getDeploymentWizardState`는 기존 Direct flow를 호환 입력으로 사용하되 미래 단계의 실행 가능 여부를 한곳에서 계산한다.

- [x] **Step 3: 기존 Direct step test를 새 상태 계산기와 함께 통과시킨다**

Run:

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/deployment-console-state.test.ts \
  features/workspace/deployment-wizard-state.test.ts
```

- [x] **Step 4: commit한다**

```bash
git add apps/web/features/workspace/deployment-console-state.ts \
  apps/web/features/workspace/deployment-wizard-state.ts \
  apps/web/features/workspace/deployment-wizard-state.test.ts
git commit -m "Feat: Deployment Wizard 단계 상태 추가" -m "검사, Plan, 승인과 실행 방식 선택 순서를 한 상태 계산기로 고정합니다. 미래 단계는 조건을 만족하기 전까지 잠깁니다."
```

---

### Task 8: Deployment Wizard shell과 반응형 layout 구현

**Files:**
- Create: `apps/web/features/workspace/DeploymentWizard.tsx`
- Create: `apps/web/features/workspace/deployment-wizard.module.css`
- Modify: `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- Modify: `apps/web/features/workspace/DeploymentPanel.tsx`
- Test: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`

**Interfaces:**
- Consumes: `DeploymentBaseline`, `DeploymentWizardState`, 기존 `DeploymentPanel` render section
- Produces: `DeploymentWizard` dialog shell, step rail, current step body

- [x] **Step 1: modal ownership test를 작성한다**

```ts
test("Deploy opens one modal wizard outside the Architecture Panel", () => {
  assert.match(rightPanelSource, /createPortal/);
  assert.match(rightPanelSource, /<DeploymentWizard/);
  assert.doesNotMatch(rightPanelBodySource, /<DeploymentPanel/);
});
```

- [x] **Step 2: Wizard shell을 구현한다**

```tsx
export function DeploymentWizard({
  baseline,
  onClose,
  state,
  children
}: DeploymentWizardProps) {
  return (
    <div aria-label="Deployment Wizard" aria-modal="true" className={styles.overlay} role="dialog">
      <section className={styles.shell}>
        <DeploymentWizardHeader baseline={baseline} onClose={onClose} />
        <DeploymentWizardStepRail state={state} />
        <main className={styles.body}>{children}</main>
      </section>
    </div>
  );
}
```

- [x] **Step 3: Desktop visual contract를 구현한다**

```css
/* Deployment wizard visual contract */
.overlay {
  align-items: center;
  background: rgba(17, 17, 17, 0.56);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 130;
}

.shell {
  background: var(--workspace-surface);
  border: 1px solid var(--workspace-line);
  border-radius: 8px;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  height: min(960px, calc(100dvh - 48px));
  max-width: 1440px;
  overflow: hidden;
  width: 100%;
}
```

- [x] **Step 4: Mobile full-screen contract를 구현한다**

```css
@media (max-width: 768px) {
  .overlay { padding: 0; }
  .shell {
    border: 0;
    border-radius: 0;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    height: 100dvh;
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

- [x] **Step 5: modal test와 typecheck를 실행하고 commit한다**

```bash
git add apps/web/features/workspace/DeploymentWizard.tsx \
  apps/web/features/workspace/deployment-wizard.module.css \
  apps/web/features/workspace/WorkspaceRightPanel.tsx \
  apps/web/features/workspace/DeploymentPanel.tsx \
  apps/web/features/workspace/workspace-right-panel-layout.test.ts
git commit -m "Feat: Deployment Wizard 화면 구조 추가" -m "Desktop inset console과 Mobile 전체 화면에서 같은 고정 단계 흐름을 보여줍니다. 기존 배포 section과 API 행동은 새 shell 안에서 재사용합니다."
```

---

### Task 9: Direct Deployment 단계를 Wizard에 연결

**Files:**
- Modify: `apps/web/features/workspace/DeploymentPanel.tsx`
- Modify: `apps/web/features/workspace/DeploymentWizard.tsx`
- Modify: `apps/web/features/workspace/deployment-wizard-state.ts`
- Test: `apps/web/features/workspace/deployment-console-state.test.ts`
- Test: `apps/web/features/workspace/deployment-panel-apply-confirmation.test.ts`

**Interfaces:**
- Consumes: 기존 Preflight, artifact 저장, create Deployment, Plan, approve, Apply API handler
- Produces: 현재 단계 하나에만 기존 행동을 노출하는 Direct wizard flow

- [x] **Step 1: 순서를 건너뛰지 못하는 test를 추가한다**

```ts
test("Apply remains unavailable before the exact Plan is approved", () => {
  const state = getDeploymentWizardState(createInput({ plan: "ready", approved: false }));
  assert.equal(state.activeStepId, "approve");
  assert.equal(state.canRunDirectApply, false);
});
```

- [x] **Step 2: 기존 section을 단계별 view로 연결한다**

```text
preflight → renderPreDeploymentCheckSection()
prepare   → Deployment Baseline과 AWS connection 확인
plan      → 기존 Plan 생성·요약 UI
approve   → 기존 Plan 승인 UI
route     → Direct / Git/CI/CD 선택 UI
result    → logs, outputs, resources, 실패 설명
```

- [x] **Step 3: Apply confirmation dialog와 acknowledgement를 그대로 유지한다**

기존 `showApplyConfirmation`, `approveCurrentPlan`, `runDeploymentApply` handler를 이동만 하고 이름, disabled 조건, API 인자를 바꾸지 않는다.

- [x] **Step 4: Direct deployment 집중 test를 실행한다**

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/deployment-console-state.test.ts \
  features/workspace/deployment-panel-apply-confirmation.test.ts \
  features/workspace/deployment-wizard-state.test.ts
```

- [x] **Step 5: commit한다**

```bash
git add apps/web/features/workspace/DeploymentPanel.tsx \
  apps/web/features/workspace/DeploymentWizard.tsx \
  apps/web/features/workspace/deployment-wizard-state.ts \
  apps/web/features/workspace/deployment-console-state.test.ts \
  apps/web/features/workspace/deployment-panel-apply-confirmation.test.ts
git commit -m "Refactor: Direct Deployment를 Wizard 단계에 연결" -m "기존 검사, Plan, 승인과 Apply handler를 고정 단계에 배치합니다. 승인되지 않은 Plan으로 실행할 수 없는 계약을 유지합니다."
```

---

### Task 10: Git/CI/CD 분기와 Result 화면 연결

**Files:**
- Modify: `apps/web/features/workspace/DeploymentPanel.tsx`
- Modify: `apps/web/features/workspace/DeploymentWizard.tsx`
- Modify: `apps/web/features/workspace/deployment-wizard-state.ts`
- Test: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`
- Test: `apps/web/features/workspace/deployment-actions.test.ts`

**Interfaces:**
- Consumes: 승인된 Plan artifact, 기존 `createGitCicdHandoff`, pipeline 상태, Deployment log/output/resource
- Produces: `route` 선택과 공통 `result` 화면

- [x] **Step 1: Git/CI/CD가 Direct Apply 성공을 요구하지 않는 test를 작성한다**

```ts
test("approved Plan can choose Git CI/CD without a Direct Apply result", () => {
  const state = getDeploymentWizardState(createInput({
    approved: true,
    directApplyStatus: "not-started",
    route: "git-cicd"
  }));
  assert.equal(state.canCreateGitCicdHandoff, true);
});
```

- [x] **Step 2: Route 단계에 기존 두 경로를 배치한다**

Direct와 Git/CI/CD button은 승인 완료 뒤에만 활성화한다. Repository 연결은 Project Settings 책임으로 유지하고 Wizard 안에서 GitHub App 연결 로직을 새로 만들지 않는다.

- [x] **Step 3: Result가 경로별 결과를 구분한다**

```text
Direct result
├─ Apply status
├─ Logs
├─ Resources
├─ Outputs
└─ 성공 시 Live Observation

Git/CI/CD result
├─ Handoff status
├─ Pull Request URL
├─ Pipeline status
└─ 실패 설명 또는 다시 조회
```

- [x] **Step 4: History와 Cleanup 경계를 유지한다**

History는 Result의 이동 링크로 제공한다. Cleanup/Destroy는 선택한 Deployment record에서 기존 별도 확인 dialog를 거쳐 시작하며 Wizard 정상 단계에 추가하지 않는다.

- [x] **Step 5: 관련 test를 실행하고 commit한다**

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/deployment-actions.test.ts \
  features/workspace/workspace-right-panel-layout.test.ts \
  features/workspace/deployment-wizard-state.test.ts

git add apps/web/features/workspace/DeploymentPanel.tsx \
  apps/web/features/workspace/DeploymentWizard.tsx \
  apps/web/features/workspace/deployment-wizard-state.ts \
  apps/web/features/workspace/deployment-actions.test.ts \
  apps/web/features/workspace/workspace-right-panel-layout.test.ts
git commit -m "Feat: Deployment Wizard 실행 분기와 결과 연결" -m "승인된 Plan에서 Direct와 Git/CI/CD를 선택하고 각 결과를 한 흐름에서 확인하게 합니다. History, Live Observation과 Cleanup의 기존 안전 경계를 유지합니다."
```

---

### Task 11: Wizard 종료·오류·AI 설명 경계 정리

**Files:**
- Modify: `apps/web/features/workspace/DeploymentWizard.tsx`
- Modify: `apps/web/features/workspace/DeploymentPanel.tsx`
- Modify: `apps/web/features/workspace/WorkspaceAiChatDock.tsx`
- Test: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`
- Test: `apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts`

**Interfaces:**
- Consumes: 기존 error message, cancellation, failure explanation, AI explanation result
- Produces: 명확한 종료·복구 행동과 단계 문맥 AI 설명

- [x] **Step 1: 실행 중 닫기와 Baseline 폐기 규칙 test를 작성한다**

```ts
test("wizard does not silently discard a running deployment", () => {
  assert.match(wizardSource, /requestWizardClose/);
  assert.match(wizardSource, /deployment.*RUNNING|requestState === "loading"/s);
  assert.match(wizardSource, /Architecture로 돌아가기/);
});
```

- [x] **Step 2: 닫기 결과를 세 가지로 구분한다**

```text
실행 전  → Baseline 폐기 후 Architecture로 복귀
실행 중  → 실행 상태 안내, 중복 실행 차단, 명시적 취소 handler 사용
실행 후  → record를 유지하고 Architecture 또는 History로 이동
```

- [x] **Step 3: AI의 역할을 설명으로 제한한다**

Architecture AI는 Board/Terraform preview와 기존 승인 버튼을 유지한다. Deployment Wizard에서는 Preflight finding, Plan 위험, 실패 원인을 설명할 수 있지만 `approveCurrentPlan`, `runDeploymentApply`, `createGitCicdHandoff`를 직접 호출하지 않는다.

- [x] **Step 4: error와 blocked 상태를 색 외 정보로 표시한다**

각 상태는 icon, 제목, 설명, 가능한 다음 행동을 포함한다. `aria-live="polite"`는 loading과 완료 알림에, `role="alert"`는 사용자가 조치해야 하는 실패에만 사용한다.

- [x] **Step 5: AI guardrail test를 실행하고 commit한다**

```bash
git add apps/web/features/workspace/DeploymentWizard.tsx \
  apps/web/features/workspace/DeploymentPanel.tsx \
  apps/web/features/workspace/WorkspaceAiChatDock.tsx \
  apps/web/features/workspace/workspace-right-panel-layout.test.ts \
  apps/web/features/workspace/workspace-ai-guardrail-warning.test.ts
git commit -m "Fix: Deployment Wizard 종료와 AI 승인 경계 정리" -m "실행 전후의 닫기 결과를 분리하고 AI가 설명만 제공하도록 고정합니다. 배포 승인과 실행은 계속 사용자 행동으로만 시작됩니다."
```

---

### Task 12: Desktop·Tablet·Mobile 최종 QA와 legacy style 정리

**Files:**
- Modify: `apps/web/features/workspace/workspace.module.css`
- Modify: `apps/web/features/diagram-editor/diagram-editor.module.css`
- Modify: `apps/web/features/parameter-input/ParameterInputPanel.module.css`
- Modify: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`
- Modify: `apps/web/features/parameter-input/parameter-panel-source.test.ts`
- Modify: `docs/gg/fix-gg-qa-followup/003_Workspace_배포위자드_통합고도화계획_gg.md`

**Interfaces:**
- Consumes: Tasks 1~11의 화면과 동작 contract
- Produces: 중복 selector가 정리된 최종 responsive UI와 검증 기록

- [x] **Step 1: viewport별 source contract를 확인한다**

```ts
test("workspace panels switch to full-screen sheets at 768px", () => {
  assert.match(stylesSource, /@media \(max-width:\s*768px\)/);
  assert.match(stylesSource, /height:\s*100dvh/);
  assert.match(stylesSource, /env\(safe-area-inset-bottom\)/);
});
```

- [x] **Step 2: legacy Blueprint/중복 override를 제거한다**

같은 selector의 마지막 선언만 남기되 Task 1의 기능 selector는 제거하지 않는다. `--bp-*` token과 현재 `--workspace-*` token이 같은 component에 중복 적용되는 부분을 `--workspace-*` 기준으로 통합한다.

- [x] **Step 3: 수동 시각 QA를 수행한다**

```text
375 × 812
- Architecture Panel과 AI Chat이 전체 화면으로 열림
- header, 닫기, composer 또는 현재 Wizard action이 함께 보임
- safe area와 모바일 키보드가 composer를 가리지 않음

768 × 1024
- panel이 얇은 dock으로 남지 않음
- 긴 transcript와 Wizard body만 스크롤됨

1280 × 720 이상
- Architecture Panel 폭이 376~416px
- AI launcher가 React Flow controls와 겹치지 않음
- Deployment Wizard가 24px inset console로 표시됨
- Step rail과 current body가 동시에 읽힘
```

- [x] **Step 4: 기능 회귀 QA를 수행한다**

```text
Resource 선택 → 필수/추가 parameter 수정
Terraform 생성 → Validate → Issues → 저장
미저장 Terraform에서 Deploy → 이탈 확인
Preflight blocked → 미래 단계 잠금
Preflight pass → Plan → 승인 → Direct Apply
Preflight pass → Plan → 승인 → Git/CI/CD handoff
AI Draft/patch Preview → 취소 또는 명시적 적용
성공 결과 → Live Observation / History
Cleanup → 별도 확인 dialog
```

- [x] **Step 5: 최소 자동 검증을 실행한다**

```bash
pnpm --dir apps/web exec tsx --test \
  features/workspace/workspace-right-panel-layout.test.ts \
  features/workspace/deployment-console-state.test.ts \
  features/workspace/deployment-wizard-state.test.ts \
  features/workspace/deployment-panel-apply-confirmation.test.ts \
  features/workspace/workspace-ai-guardrail-warning.test.ts \
  features/parameter-input/parameter-panel-source.test.ts \
  features/diagram-editor/diagram-editor-layout.test.ts
pnpm --filter @sketchcatch/web typecheck
pnpm --filter @sketchcatch/web lint
pnpm harness:check
```

Expected: 모든 집중 test, Web typecheck, Web lint, harness check PASS

- [x] **Step 6: 계획 문서에 실제 검증 결과를 기록하고 commit한다**

```bash
git add apps/web/features/workspace/workspace.module.css \
  apps/web/features/diagram-editor/diagram-editor.module.css \
  apps/web/features/parameter-input/ParameterInputPanel.module.css \
  apps/web/features/workspace/workspace-right-panel-layout.test.ts \
  apps/web/features/parameter-input/parameter-panel-source.test.ts \
  docs/gg/fix-gg-qa-followup/003_Workspace_배포위자드_통합고도화계획_gg.md
git commit -m "Refactor: Workspace와 Deployment Wizard 고도화 마감" -m "Desktop과 Mobile 시각 구조, 단계 흐름과 사용자 승인 경계를 최종 확인합니다. 중복 style을 정리하고 실제 검증 결과를 계획 문서에 남깁니다."
```

#### 실제 검증 기록 — 2026-07-13

- viewport source contract: `375 × 812`, `768 × 1024`에서 Architecture Panel·AI Chat·Wizard가 `100dvh` sheet와 safe area를 사용하고, Desktop에서는 `376~416px` panel과 `24px` Wizard inset을 사용하도록 CSS와 source test로 확인했다.
- 수동 브라우저 진입: `http://127.0.0.1:3000/workspace/new` 접근 시 로그인 화면으로 전환되어 인증을 우회하지 않았다. 로그인된 Workspace의 픽셀 단위 walkthrough 대신 반응형 source contract와 자동 layout 검증으로 범위를 제한했다.
- 기능 회귀: Resource parameter, Terraform leave guard·Validate·Issues·저장, Preflight 잠금, Plan 승인, Direct Apply, Git/CI/CD handoff, AI preview 승인, History·Live Observation·Cleanup 소유권을 source contract와 상태 계산기 test로 확인했다.
- 집중 test: 계획서의 7개 test file, `170 passed / 0 failed`.
- Web typecheck: `pnpm --filter @sketchcatch/web typecheck` PASS.
- Web lint: `pnpm --filter @sketchcatch/web lint` PASS.
- harness: `pnpm harness:check` PASS.

---

## 2. Milestone과 PR 분리

| Milestone | Task | 독립 결과 | 권장 PR |
| --- | --- | --- | --- |
| M1 | 1~3 | 동작 계약, 공통 시각 token, Resource Inspector | `UI: Workspace Architecture 시각 기반 정리` |
| M2 | 4~5 | Architecture Panel 책임과 AI Chat 반응형 | `Refactor: Workspace Architecture Panel 완성` |
| M3 | 6~8 | 불변 Baseline, Wizard 상태와 shell | `Feat: Deployment Wizard 기반 추가` |
| M4 | 9~11 | Direct·Git/CI/CD 실행과 결과·AI 경계 | `Feat: Deployment Wizard 실행 흐름 연결` |
| M5 | 12 | 반응형 QA와 legacy style 정리 | `Refactor: Workspace Deployment UI 마감` |

한 PR에서 M1~M5를 모두 합치지 않는다. 각 PR은 앞 Milestone의 test를 기준선으로 받아야 하며, API·DB·실제 인프라 변경이 필요하면 별도 담당 작업으로 분리한다.

## 3. 완료 정의

- Workspace에서 Resource와 Terraform이 같은 Architecture Panel 안에 있다.
- Deploy는 Architecture Panel의 편집 tab이 아니라 Deployment Wizard 진입 행동이다.
- Wizard는 `Preflight → Prepare → Plan → Approve → Route → Result` 순서를 건너뛸 수 없다.
- Direct와 Git/CI/CD는 같은 승인된 Plan에서 갈라진다.
- AI는 Preview와 설명을 제공하지만 Board, Terraform, Deployment를 자동 적용하지 않는다.
- Desktop, Tablet, Mobile에서 panel, modal, chat composer가 겹치거나 잘리지 않는다.
- Resource parameter, Terraform 편집, 승인, Apply, Git handoff, History, Live Observation, Cleanup의 기존 기능이 유지된다.
- 집중 test, Web typecheck, Web lint, harness check가 통과한다.
