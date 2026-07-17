import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import {
  getNextDraftRevision,
  hasSameProjectDraftContent,
  toProjectDraft
} from "./project-drafts.js";

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

test("hasSameProjectDraftContent ignores object key order but detects deployment content changes", () => {
  assert.equal(
    hasSameProjectDraftContent(
      {
        diagramJson,
        terraformFiles: [{ fileName: "main.tf", terraformCode: "resource \"aws_vpc\" \"main\" {}" }]
      },
      {
        diagramJson: { viewport: { zoom: 1, y: 0, x: 0 }, edges: [], nodes: [] },
        terraformFiles: [{ terraformCode: "resource \"aws_vpc\" \"main\" {}", fileName: "main.tf" }]
      }
    ),
    true
  );
  assert.equal(
    hasSameProjectDraftContent(
      { diagramJson, terraformFiles: null },
      { diagramJson, terraformFiles: [{ fileName: "main.tf", terraformCode: "resource \"aws_vpc\" \"main\" {}" }] }
    ),
    false
  );
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
