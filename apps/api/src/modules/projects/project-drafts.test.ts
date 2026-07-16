import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import { getNextDraftRevision, toProjectDraft } from "./project-drafts.js";

const diagramJson: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

test("getNextDraftRevision starts at one for a missing draft", () => {
  assert.equal(getNextDraftRevision(undefined), 1);
  assert.equal(getNextDraftRevision(null), 1);
});

test("getNextDraftRevision increments an existing draft revision", () => {
  assert.equal(getNextDraftRevision(7), 8);
});

test("toProjectDraft serializes date fields as ISO strings", () => {
  const createdAt = new Date("2026-06-24T01:02:03.000Z");
  const updatedAt = new Date("2026-06-24T02:03:04.000Z");
  const serverSavedAt = new Date("2026-06-24T03:04:05.000Z");

  const draft = toProjectDraft({
    id: "draft-1",
    projectId: "project-1",
    diagramJson,
    terraformFiles: [
      { fileName: "main.tf", terraformCode: "resource \"aws_vpc\" \"main\" {}" }
    ],
    revision: 3,
    serverSavedAt,
    createdAt,
    updatedAt
  });

  assert.deepEqual(draft, {
    id: "draft-1",
    projectId: "project-1",
    diagramJson,
    terraformFiles: [
      { fileName: "main.tf", terraformCode: "resource \"aws_vpc\" \"main\" {}" }
    ],
    revision: 3,
    serverSavedAt: "2026-06-24T03:04:05.000Z",
    createdAt: "2026-06-24T01:02:03.000Z",
    updatedAt: "2026-06-24T02:03:04.000Z"
  });
});
