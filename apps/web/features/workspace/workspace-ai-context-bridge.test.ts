import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const projectManagerSource = read("ProjectWorkspaceDraftManager.tsx");
const localManagerSource = read("WorkspaceDraftManager.tsx");
const rightPanelSource = read("WorkspaceRightPanel.tsx");

test("Workspace manager는 오른쪽 패널 문맥과 선택을 AI 채팅에 공유한다", () => {
  for (const source of [projectManagerSource, localManagerSource]) {
    assert.match(source, /terraformAiContext={terraformAiContext}/);
    assert.match(source, /terraformAiInteraction={terraformAiInteraction}/);
    assert.match(source, /selectedTerraformIssueKey={selectedTerraformIssueKey}/);
    assert.match(source, /onSelectTerraformIssue={setSelectedTerraformIssueKey}/);
    assert.doesNotMatch(source, /terraformIssueAiRequest|terraformPreviewAiRequest/);
  }
});

test("오른쪽 패널의 Resource, Terraform, Issue 상호작용은 각각 맞는 AI 탭 의도를 만든다", () => {
  assert.match(rightPanelSource, /onTerraformAiInteraction\("draft"\)/);
  assert.match(rightPanelSource, /onTerraformAiInteraction\("preview"\)/);
  assert.match(rightPanelSource, /onTerraformAiInteraction\("errors", issue\.diagnosticKey\)/);
  assert.match(
    rightPanelSource,
    /const focusTerraformIssuesPane = useCallback[\s\S]*?onTerraformAiInteraction\("errors"\)/
  );
  assert.match(rightPanelSource, /selectedTerraformIssueKey={selectedTerraformIssueKey}/);
});

test("Resource 패널 view callback은 안정된 참조를 유지해 effect 재실행 루프를 만들지 않는다", () => {
  assert.match(
    rightPanelSource,
    /const handleResourceWorkspaceViewChange = useCallback[\s\S]*?onTerraformAiInteraction\("draft"\)[\s\S]*?\[onTerraformAiInteraction\]/
  );
  assert.match(rightPanelSource, /onViewChange={handleResourceWorkspaceViewChange}/);
  assert.doesNotMatch(rightPanelSource, /onViewChange=\{\(nextView\) =>/);
});

test("Terraform 이탈이 거절되면 AI 탭 의도를 변경하지 않고 승인된 전환만 반영한다", () => {
  assert.match(
    rightPanelSource,
    /if \(!requestTerraformLeave\(\{ kind: "view", view: nextView \}\)\) \{\s*return;\s*\}\s*setActiveView\(nextView\);\s*onTerraformAiInteraction\("draft"\)/
  );
  assert.match(
    rightPanelSource,
    /if \(pendingAction\.kind === "view"\) \{\s*setActiveView\(pendingAction\.view\);\s*onTerraformAiInteraction\(/
  );
});

test("AI 수정 적용 직전에 현재 Terraform fingerprint를 다시 확인하고 batch로 위임한다", () => {
  assert.match(rightPanelSource, /createWorkspaceTerraformFingerprint\(/);
  assert.match(rightPanelSource, /currentFingerprint !== request\.expectedTerraformFingerprint/);
  assert.match(rightPanelSource, /panel\.applyTerraformSafeFixes\(request\.fixes\)/);
  assert.doesNotMatch(rightPanelSource, /request\.diagnostic|request\.codePreview/);
});

test("프로젝트 전환은 Terraform AI 문맥과 진행 중인 적용 상태를 초기화한다", () => {
  assert.match(projectManagerSource, /setTerraformAiContext\(EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT\)/);
  assert.match(projectManagerSource, /setSelectedTerraformIssueKey\(null\)/);
  assert.match(projectManagerSource, /setTerraformSafeFixApplyRequest\(null\)/);
  assert.match(projectManagerSource, /setTerraformSafeFixApplyResult\(null\)/);
});

test("프로젝트별 상태는 projectId가 바뀌는 렌더에서 동기적으로 격리한다", () => {
  const hasProjectKey = /key=\{(?:props\.)?projectId\}/.test(projectManagerSource);
  const hasSynchronousProjectGuard =
    /const \[[^\]]*ProjectId[^\]]*\] = useState[\s\S]*?if \([^)]*ProjectId !== projectId\)/.test(
      projectManagerSource
    );

  assert.ok(
    hasProjectKey || hasSynchronousProjectGuard,
    "project-scoped state must be keyed or synchronously guarded before effects run"
  );
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
