import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dockSource = readFileSync(
  fileURLToPath(new URL("WorkspaceOperationsDock.tsx", import.meta.url)),
  "utf8"
);
const stylesSource = readFileSync(
  fileURLToPath(new URL("workspace-operations.module.css", import.meta.url)),
  "utf8"
);

test("deployment opens the restored modal instead of another dock tab", () => {
  assert.match(dockSource, /const \[isDeploymentModalOpen, setDeploymentModalOpen\] = useState\(false\);/);
  assert.match(
    dockSource,
    /if \(tab === "deployment"\) \{[\s\S]*?setOpen\(false\)[\s\S]*?context\.setRightPanelOpen\(false\)[\s\S]*?setDeploymentModalOpen\(true\);[\s\S]*?return;/
  );
  assert.match(dockSource, /<DeploymentOperationsModal[\s\S]*?isOpen=\{isDeploymentModalOpen\}/);
  assert.doesNotMatch(dockSource, /activeTab === "deployment" \?\s*\(\s*<DeploymentOperationsPanel/s);
});

test("restored deployment modal owns its dialog surface and close action", () => {
  assert.match(dockSource, /function DeploymentOperationsModal\(/);
  assert.match(dockSource, /aria-label="Deployment console"/);
  assert.match(dockSource, /aria-modal="true"/);
  assert.match(dockSource, /aria-label="배포 모달 닫기"/);
  assert.match(stylesSource, /\.deploymentModalOverlay\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*120;/s);
  assert.match(stylesSource, /\.deploymentModal\s*\{[^}]*max-height:[^}]*overflow:\s*hidden;/s);
});
