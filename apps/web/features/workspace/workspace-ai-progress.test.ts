import assert from "node:assert/strict";
import { test } from "node:test";
import { createArchitectureDraftProgressItems } from "./workspace-ai-progress";

test("Architecture Draft progress marks completed, active, and pending stages", () => {
  const items = createArchitectureDraftProgressItems("validating_architecture");

  assert.deepEqual(
    items.map((item) => [item.stage, item.status]),
    [
      ["preparing_requirements", "complete"],
      ["normalizing_requirements", "complete"],
      ["querying_amazon_q", "complete"],
      ["validating_architecture", "active"],
      ["building_diagram", "pending"]
    ]
  );
  assert.equal(items[2]?.label, "Amazon Q 아키텍처 근거를 확인하고 있어요");
});
