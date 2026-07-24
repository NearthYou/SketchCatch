import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareWorkspaceReverseEngineeringEntry } from "./workspace-reverse-engineering-entry";

const managerSource = readFileSync(
  fileURLToPath(new URL("./ProjectWorkspaceDraftManager.tsx", import.meta.url)),
  "utf8"
);
const rightPanelSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceRightPanel.tsx", import.meta.url)),
  "utf8"
);
const reverseEngineeringPanelSource = readFileSync(
  fileURLToPath(new URL("./ReverseEngineeringPanel.tsx", import.meta.url)),
  "utf8"
);
const reverseEngineeringCss = readFileSync(
  fileURLToPath(new URL("./reverse-engineering.module.css", import.meta.url)),
  "utf8"
);

test("현재 Project Draft가 준비되지 않았으면 Reverse Engineering 진입을 막는다", async () => {
  let saveCallCount = 0;
  const result = await prepareWorkspaceReverseEngineeringEntry({
    draftReady: false,
    hasPendingLocalChanges: false,
    projectDraftRevision: null,
    projectId: "project-1",
    serverConflict: false,
    serverDirty: false,
    serverSaving: false,
    saveDraft: async () => {
      saveCallCount += 1;
      return { ok: true, revision: 1 };
    }
  });

  assert.deepEqual(result, {
    ok: false,
    message: "프로젝트를 불러온 뒤 AWS 구조 가져오기를 다시 시작해주세요."
  });
  assert.equal(saveCallCount, 0);
});

test("저장 충돌이 있으면 사용자가 충돌을 먼저 해결하도록 진입을 막는다", async () => {
  let saveCallCount = 0;
  const result = await prepareWorkspaceReverseEngineeringEntry({
    draftReady: true,
    hasPendingLocalChanges: true,
    projectDraftRevision: 3,
    projectId: "project-1",
    serverConflict: true,
    serverDirty: true,
    serverSaving: false,
    saveDraft: async () => {
      saveCallCount += 1;
      return { ok: true, revision: 4 };
    }
  });

  assert.deepEqual(result, {
    ok: false,
    message: "프로젝트 저장 충돌을 먼저 해결해주세요. 현재 보드는 그대로 유지됩니다."
  });
  assert.equal(saveCallCount, 0);
});

test("미저장 변경이나 진행 중인 저장이 있으면 서버 저장 완료 뒤 진입한다", async () => {
  let saveCallCount = 0;
  const result = await prepareWorkspaceReverseEngineeringEntry({
    draftReady: true,
    hasPendingLocalChanges: true,
    projectDraftRevision: 3,
    projectId: "project-1",
    serverConflict: false,
    serverDirty: true,
    serverSaving: true,
    saveDraft: async () => {
      saveCallCount += 1;
      return { ok: true, revision: 4 };
    }
  });

  assert.deepEqual(result, { ok: true, revision: 4 });
  assert.equal(saveCallCount, 1);
});

test("서버 Draft가 아직 없으면 먼저 저장해 revision을 만든 뒤 진입한다", async () => {
  let saveCallCount = 0;
  const result = await prepareWorkspaceReverseEngineeringEntry({
    draftReady: true,
    hasPendingLocalChanges: false,
    projectDraftRevision: null,
    projectId: "project-1",
    serverConflict: false,
    serverDirty: false,
    serverSaving: false,
    saveDraft: async () => {
      saveCallCount += 1;
      return { ok: true, revision: 1 };
    }
  });

  assert.deepEqual(result, { ok: true, revision: 1 });
  assert.equal(saveCallCount, 1);
});

test("저장 실패 시 Reverse Engineering을 열지 않고 쉬운 안내를 돌려준다", async () => {
  const result = await prepareWorkspaceReverseEngineeringEntry({
    draftReady: true,
    hasPendingLocalChanges: true,
    projectDraftRevision: 3,
    projectId: "project-1",
    serverConflict: false,
    serverDirty: true,
    serverSaving: false,
    saveDraft: async () => ({ ok: false, revision: null })
  });

  assert.deepEqual(result, {
    ok: false,
    message: "현재 보드를 서버에 저장하지 못했습니다. 저장 문제를 해결한 뒤 다시 시도해주세요."
  });
});

test("저장된 현재 Project는 추가 저장 없이 바로 진입한다", async () => {
  let saveCallCount = 0;
  const result = await prepareWorkspaceReverseEngineeringEntry({
    draftReady: true,
    hasPendingLocalChanges: false,
    projectDraftRevision: 7,
    projectId: "project-1",
    serverConflict: false,
    serverDirty: false,
    serverSaving: false,
    saveDraft: async () => {
      saveCallCount += 1;
      return { ok: true, revision: 8 };
    }
  });

  assert.deepEqual(result, { ok: true, revision: 7 });
  assert.equal(saveCallCount, 0);
});

test("Workspace 오른쪽 패널에서는 AWS 가져오기와 재스캔 진입점을 제공하지 않는다", () => {
  assert.doesNotMatch(rightPanelSource, /title="AWS 구조 가져오기"/);
  assert.doesNotMatch(rightPanelSource, /<span>AWS 가져오기<\/span>/);
  assert.doesNotMatch(rightPanelSource, /<ReverseEngineeringPanel/);
  assert.doesNotMatch(rightPanelSource, /requestReverseEngineeringOpen/);
  assert.doesNotMatch(rightPanelSource, /performReverseEngineeringOpen/);
  assert.doesNotMatch(rightPanelSource, /isReverseEngineeringOpen/);
  assert.match(reverseEngineeringCss, /\.panel\s*\{\s*composes:\s*shell;/);
  assert.match(
    reverseEngineeringPanelSource,
    /context\.setPreviewDiagram\(createProjectOnApply \? null : basePreview\.sourceDiagram\)/
  );
  assert.match(managerSource, /prepareWorkspaceReverseEngineeringEntry\(/);
  assert.match(managerSource, /saveDraft: async \(\) =>/);
  assert.match(managerSource, /flushDraftToServer\("manual"\)/);
  assert.match(
    managerSource,
    /onReverseEngineeringOpenRequest=\{handleReverseEngineeringOpenRequest\}/
  );
});
