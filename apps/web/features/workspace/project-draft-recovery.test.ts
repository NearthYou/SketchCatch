import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECT_DRAFT_RECOVERY_COPY } from "./project-draft-recovery";

const dialogSource = readFileSync(
  new URL("./ProjectDraftRecoveryDialog.tsx", import.meta.url),
  "utf8"
);
const managerSource = readFileSync(
  new URL("./ProjectWorkspaceDraftManager.tsx", import.meta.url),
  "utf8"
);
const terraformPanelSource = readFileSync(
  new URL("./TerraformCodePanel.tsx", import.meta.url),
  "utf8"
);

test("project draft recovery warns before replacing a newer local recovery draft", () => {
  assert.equal(PROJECT_DRAFT_RECOVERY_COPY.title, "서버에 반영되지 않은 로컬 변경사항이 있습니다");
  assert.match(PROJECT_DRAFT_RECOVERY_COPY.description, /서버와 다른 로컬 복구본/);
  assert.match(PROJECT_DRAFT_RECOVERY_COPY.serverWarning, /로컬 복구본.*교체됩니다/);
  assert.equal(PROJECT_DRAFT_RECOVERY_COPY.restoreLocalAction, "로컬 복구본 복원");
  assert.equal(PROJECT_DRAFT_RECOVERY_COPY.useServerAction, "서버 최신 상태 사용");
});

test("project draft recovery traps focus until the user chooses a source", () => {
  assert.match(dialogSource, /previousFocusRef/);
  assert.match(dialogSource, /restoreButtonRef\.current\?\.focus/);
  assert.match(dialogSource, /window\.addEventListener\("keydown"/);
  assert.match(dialogSource, /event\.key !== "Tab"/);
  assert.match(dialogSource, /previousFocusRef\.current\?\.focus/);
});

test("server recovery replaces the mounted Terraform editor files", () => {
  const reloadStart = managerSource.indexOf("const reloadLatestProjectDraft");
  const reloadEnd = managerSource.indexOf("const keepCurrentDraftEditing", reloadStart);
  const reloadSource = managerSource.slice(reloadStart, reloadEnd);

  assert.ok(reloadStart > -1);
  assert.ok(reloadEnd > reloadStart);
  assert.match(reloadSource, /recoveryPreference: "server"/);
  assert.match(reloadSource, /setTerraformFilesReplacement/);
  assert.match(reloadSource, /diagramFingerprint: toTerraformRefreshFingerprint\(nextDiagram\)/);
  assert.match(reloadSource, /files: nextTerraformFiles/);
  assert.match(reloadSource, /notifyFilesChange: false/);
  assert.match(
    terraformPanelSource,
    /replacement\.notifyFilesChange !== false[\s\S]*?onTerraformFilesChange/
  );
});
