import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deliveryStyles = readFileSync(
  new URL("./delivery-center.module.css", import.meta.url),
  "utf8"
);
const handoffStyles = readFileSync(new URL("./cicd-handoff.module.css", import.meta.url), "utf8");
const workspaceStyles = readFileSync(new URL("./workspace.module.css", import.meta.url), "utf8");
const targetStyles = readFileSync(
  new URL("./delivery/project-deployment-target-editor.module.css", import.meta.url),
  "utf8"
);
const shellSource = readFileSync(new URL("./DeploymentConsoleShell.tsx", import.meta.url), "utf8");

test("390px에서 다음 작업과 체크리스트 행을 한 열로 재배치한다", () => {
  assert.match(
    deliveryStyles,
    /@media \(max-width: 640px\)[\s\S]*\.nextTask[\s\S]*grid-template-columns: minmax\(0, 1fr\)/
  );
  assert.match(
    deliveryStyles,
    /@media \(max-width: 640px\)[\s\S]*\.taskRow[\s\S]*grid-template-columns: minmax\(0, 1fr\)/
  );
  assert.match(
    deliveryStyles,
    /@media \(max-width: 640px\)[\s\S]*?\.phaseProgress ol\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/
  );
});

test("CI/CD 상호작용 요소를 44px 이상으로 유지하고 select를 패널 안에 제한한다", () => {
  assert.match(deliveryStyles, /\.nextTaskAction[\s\S]*min-height: 44px/);
  assert.match(deliveryStyles, /\.accordionToggle[\s\S]*min-height: 64px/);
  assert.match(deliveryStyles, /\.settingsDrawerClose[\s\S]*height: 44px[\s\S]*width: 44px/);
  assert.match(workspaceStyles, /\.cicdRunSelect select[\s\S]*min-height: 44px/);
  assert.match(workspaceStyles, /\.cicdRunSelect select[\s\S]*min-width: 0[\s\S]*width: 100%/);
  assert.match(workspaceStyles, /\.cicdConsole \.deploymentPrimaryButton[\s\S]*min-height: 46px/);
  assert.match(workspaceStyles, /\.deploymentConsoleRefreshButton,[\s\S]*height: 44px/);
  assert.match(shellSource, /aria-label=\{isActiveRefreshBusy/);
  assert.match(targetStyles, /\.field input,[\s\S]*\.field select[\s\S]*height: 44px/);
  assert.match(handoffStyles, /\.content button:focus-visible/);
});

test("프로젝트의 CI/CD 파랑과 접근 가능한 오류색을 사용한다", () => {
  const combined = [deliveryStyles, handoffStyles, workspaceStyles, targetStyles].join("\n");
  assert.doesNotMatch(combined, /#eb8e90/i);
  assert.match(deliveryStyles, /--workspace-error: var\(--color-error, #b42318\)/);
  assert.match(deliveryStyles, /--cicd-primary: #1267f4/);
  assert.match(deliveryStyles, /--cicd-primary-strong: #0755d6/);
  assert.match(deliveryStyles, /--workspace-accent-active: var\(--cicd-primary-strong\)/);
  const shadows = [...deliveryStyles.matchAll(/box-shadow:\s*([^;]+);/g)].map((match) =>
    match[1]?.trim()
  );
  assert.deepEqual(shadows, ["none"]);
  assert.doesNotMatch(handoffStyles, /#fff8c5|#633c01/i);
});
