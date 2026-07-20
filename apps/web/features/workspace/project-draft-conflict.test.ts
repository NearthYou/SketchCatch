import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECT_DRAFT_CONFLICT_COPY } from "./project-draft-conflict";

const managerSource = readFileSync(
  new URL("./ProjectWorkspaceDraftManager.tsx", import.meta.url),
  "utf8"
);
const terraformPanelSource = readFileSync(
  new URL("./TerraformCodePanel.tsx", import.meta.url),
  "utf8"
);

test("project draft conflict explains the stale tab and offers reload or local editing", () => {
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.title, "다른 탭에서 이 프로젝트가 변경되었습니다");
  assert.match(PROJECT_DRAFT_CONFLICT_COPY.description, /아직 서버에 저장되지 않았습니다/);
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.keepEditingAction, "현재 편집 유지");
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.reloadAction, "최신 상태 불러오기");
});

test("Workspace does not render a local draft recovery dialog", () => {
  assert.doesNotMatch(managerSource, /ProjectDraftRecoveryDialog/);
  assert.doesNotMatch(managerSource, /draftRecoveryRequired/);
});

test("server conflict recovery replaces the mounted Terraform editor files", () => {
  const reloadStart = managerSource.indexOf("const reloadLatestProjectDraft");
  const reloadEnd = managerSource.indexOf("const keepCurrentDraftEditing", reloadStart);
  const reloadSource = managerSource.slice(reloadStart, reloadEnd);

  assert.ok(reloadStart > -1);
  assert.ok(reloadEnd > reloadStart);
  assert.match(reloadSource, /setTerraformFilesReplacement/);
  assert.match(reloadSource, /diagramFingerprint: toTerraformRefreshFingerprint\(nextDiagram\)/);
  assert.match(reloadSource, /files: nextTerraformFiles/);
  assert.match(reloadSource, /notifyFilesChange: false/);
  assert.match(
    terraformPanelSource,
    /replacement\.notifyFilesChange !== false[\s\S]*?onTerraformFilesChange/
  );
});
