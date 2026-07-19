import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, TerraformSyncFileInput } from "@sketchcatch/types";
import type { Database } from "../../db/client.js";
import type { ProjectDraftRow } from "./project-drafts.js";
import {
  applyBoardAutoOrganizeDraft,
  BoardAutoOrganizeSemanticMismatchError,
  BoardAutoOrganizeSourceMismatchError,
  createBoardAutoOrganizeSourceFingerprint
} from "./board-auto-organize-apply-service.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "11111111-1111-4111-8111-111111111111";

test("server applies a visual-only candidate through the existing draft revision CAS", async () => {
  const sourceDiagram = createDiagram();
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.nodes[0]!.position = { x: 320, y: 180 };
  const terraformFiles: TerraformSyncFileInput[] = [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "main" {}' }
  ];
  const saveInputs: unknown[] = [];

  const result = await applyBoardAutoOrganizeDraft(
    {
      candidateDiagram,
      db: {} as Database,
      expectedRevision: 7,
      projectId: PROJECT_ID,
      sourceDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
      terraformFiles,
      userId: USER_ID
    },
    {
      saveDraftRevision: async (input) => {
        saveInputs.push(input);
        return { status: "saved", draft: createDraftRow(candidateDiagram, terraformFiles) };
      }
    }
  );

  assert.equal(result.status, "saved");
  assert.equal(saveInputs.length, 1);
  assert.deepEqual(
    (saveInputs[0] as { input: { diagramJson: DiagramJson } }).input.diagramJson,
    candidateDiagram
  );
});

test("server rejects a candidate that changes Resource meaning without calling the draft save", async () => {
  const sourceDiagram = createDiagram();
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.nodes[0]!.parameters!.values.cidrBlock = "10.9.0.0/16";
  let saveCalls = 0;

  await assert.rejects(
    () =>
      applyBoardAutoOrganizeDraft(
        {
          candidateDiagram,
          db: {} as Database,
          expectedRevision: 7,
          projectId: PROJECT_ID,
          sourceDiagram,
          sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
          terraformFiles: [],
          userId: USER_ID
        },
        {
          saveDraftRevision: async () => {
            saveCalls += 1;
            return { status: "saved", draft: createDraftRow(candidateDiagram, []) };
          }
        }
      ),
    BoardAutoOrganizeSemanticMismatchError
  );

  assert.equal(saveCalls, 0);
});

test("server rejects a source fingerprint that was not created from the request source", async () => {
  const sourceDiagram = createDiagram();
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.nodes[0]!.position = { x: 320, y: 180 };
  let saveCalls = 0;

  await assert.rejects(
    () =>
      applyBoardAutoOrganizeDraft(
        {
          candidateDiagram,
          db: {} as Database,
          expectedRevision: 7,
          projectId: PROJECT_ID,
          sourceDiagram,
          sourceFingerprint: "00000000",
          terraformFiles: [],
          userId: USER_ID
        },
        {
          saveDraftRevision: async () => {
            saveCalls += 1;
            return { status: "saved", draft: createDraftRow(candidateDiagram, []) };
          }
        }
      ),
    BoardAutoOrganizeSourceMismatchError
  );

  assert.equal(saveCalls, 0);
});

/** 테스트마다 같은 Resource 의미를 가진 source Diagram을 만듭니다. */
function createDiagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "node-vpc",
        type: "aws_vpc",
        kind: "resource",
        position: { x: 40, y: 60 },
        size: { width: 320, height: 240 },
        label: "VPC",
        locked: false,
        zIndex: 1,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main",
          values: { cidrBlock: "10.0.0.0/16" }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

/** CAS 성공 결과에 필요한 최소 ProjectDraft row를 만듭니다. */
function createDraftRow(
  diagramJson: DiagramJson,
  terraformFiles: TerraformSyncFileInput[]
): ProjectDraftRow {
  const savedAt = new Date("2026-07-20T00:00:00.000Z");

  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: PROJECT_ID,
    diagramJson,
    terraformFiles,
    revision: 8,
    serverSavedAt: savedAt,
    createdAt: savedAt,
    updatedAt: savedAt
  };
}
