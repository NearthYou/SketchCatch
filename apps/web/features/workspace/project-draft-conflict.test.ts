import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BoardAutoOrganizeCandidateSet, DiagramJson } from "@sketchcatch/types";
import {
  applyBoardAutoOrganizeCandidate,
  createBoardAutoOrganizePreviewSession
} from "../architecture-board-compiler/board-auto-organize-preview";
import {
  PROJECT_DRAFT_CONFLICT_COPY,
  reconcileBoardAutoOrganizeTerraformFiles
} from "./project-draft-conflict";

const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("../diagram-editor/DiagramEditor.tsx", import.meta.url)),
  "utf8"
);
const projectManagerSource = readFileSync(
  fileURLToPath(new URL("./ProjectWorkspaceDraftManager.tsx", import.meta.url)),
  "utf8"
);
const workspaceApiSource = readFileSync(
  fileURLToPath(new URL("./api.ts", import.meta.url)),
  "utf8"
);

test("project draft conflict explains the stale tab and offers reload or local editing", () => {
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.title, "다른 탭에서 이 프로젝트가 변경되었습니다");
  assert.match(PROJECT_DRAFT_CONFLICT_COPY.description, /아직 서버에 저장되지 않았습니다/);
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.keepEditingAction, "현재 편집 유지");
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.reloadAction, "최신 상태 불러오기");
});

test("stale auto-organize apply causes zero local Board, History, and save writes", async () => {
  const source = createDiagram();
  const session = createBoardAutoOrganizePreviewSession(
    source,
    createCandidateSet(source),
    7
  );
  const boardWrites: DiagramJson[] = [];
  const historyWrites: DiagramJson[] = [];
  const localSaveWrites: DiagramJson[] = [];
  let serverSaveCalls = 0;

  const result = await applyBoardAutoOrganizeCandidate({
    currentDiagram: source,
    currentDraftRevision: 8,
    save: async () => {
      serverSaveCalls += 1;
      return { revision: 9 };
    },
    session,
    terraformFiles: []
  });

  if (result.status === "saved") {
    boardWrites.push(result.diagramToApply);
    historyWrites.push(source);
    localSaveWrites.push(result.diagramToApply);
  }

  assert.equal(result.status, "stale");
  assert.equal(serverSaveCalls, 0);
  assert.equal(boardWrites.length, 0);
  assert.equal(historyWrites.length, 0);
  assert.equal(localSaveWrites.length, 0);
});

test("Board apply keeps Terraform edits made while the server request is in flight", () => {
  const savedFiles = [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "saved" {}' }
  ];
  const currentFiles = [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "editing" {}' }
  ];

  const reconciliation = reconcileBoardAutoOrganizeTerraformFiles({
    currentFiles,
    savedFiles
  });

  assert.equal(reconciliation.hasUnsavedChanges, true);
  assert.deepEqual(reconciliation.terraformFiles, currentFiles);
  assert.notEqual(reconciliation.terraformFiles, currentFiles);
  assert.deepEqual(savedFiles, [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "saved" {}' }
  ]);
});

test("Project Workspace commits Board history only after the dedicated apply API succeeds", () => {
  const applyHandlerStart = diagramEditorSource.indexOf(
    "const applyAutomaticOrganization = useCallback"
  );
  const applyHandlerEnd = diagramEditorSource.indexOf(
    "const cancelAutomaticOrganization = useCallback",
    applyHandlerStart
  );
  const applyHandlerSource = diagramEditorSource.slice(applyHandlerStart, applyHandlerEnd);

  assert.notEqual(applyHandlerStart, -1);
  assert.notEqual(applyHandlerEnd, -1);
  assert.match(diagramEditorSource, /createBoardAutoOrganizeCandidates\(currentDiagram\)/);
  assert.match(applyHandlerSource, /await applyBoardAutoOrganizeCandidate\(/);
  assert.match(applyHandlerSource, /if \(!onBoardAutoOrganizeApplyRequest\)/);
  assert.doesNotMatch(
    applyHandlerSource,
    /draft:\s*null/,
    "a missing server apply callback must never be treated as a successful save"
  );
  assert.ok(
    applyHandlerSource.indexOf("await applyBoardAutoOrganizeCandidate(") <
      applyHandlerSource.indexOf("commitDiagramUpdate("),
    "server apply must finish before the Board/History commit"
  );
  assert.match(
    projectManagerSource,
    /onBoardAutoOrganizeApplyRequest=\{handleBoardAutoOrganizeApplyRequest\}/
  );
  assert.match(
    projectManagerSource,
    /onBoardAutoOrganizeApplied=\{handleBoardAutoOrganizeApplied\}/
  );
  assert.match(workspaceApiSource, /export async function applyProjectDraftBoardAutoOrganize/);
  assert.match(workspaceApiSource, /draft\/auto-organize\/apply/);
});

/** stale apply 회귀에 필요한 작은 Diagram을 만듭니다. */
function createDiagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "node-a",
        type: "aws_instance",
        kind: "resource",
        position: { x: 40, y: 40 },
        size: { width: 168, height: 96 },
        label: "Web server",
        locked: false,
        zIndex: 1
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

/** stale apply 회귀에 필요한 단일 시각 후보를 만듭니다. */
function createCandidateSet(source: DiagramJson): BoardAutoOrganizeCandidateSet {
  const candidate = structuredClone(source);
  candidate.nodes[0]!.position = { x: 240, y: 120 };

  return {
    sessionId: "board-auto-session:1234abcd",
    sourceFingerprint: "1234abcd",
    candidates: [
      {
        id: "candidate-secret-alpha",
        diagram: candidate,
        visualDiff: {
          movedNodeIds: ["node-a"],
          resizedNodeIds: [],
          reroutedEdgeIds: [],
          addedFrameIds: [],
          changedFrameIds: [],
          removedFrameIds: []
        },
        explanations: ["Resource, 설정, 연결 관계는 바뀌지 않았습니다."],
        visualFingerprint: "visual-secret-alpha"
      }
    ]
  };
}
