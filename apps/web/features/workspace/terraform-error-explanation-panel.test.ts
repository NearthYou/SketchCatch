import assert from "node:assert/strict";
import { test } from "node:test";
import { createTerraformErrorExplanationItems } from "../../app/workspace/TerraformErrorExplanationPanel";

test("createTerraformErrorExplanationItems keeps duplicate next actions render-safe", () => {
  const items = createTerraformErrorExplanationItems({
    stage: "plan",
    category: "permission",
    severity: "high",
    rawMessage: "AccessDenied",
    summary: "권한이 부족합니다.",
    likelyCause: "현재 권한으로 실행할 수 없습니다.",
    nextActions: ["권한을 확인하세요.", "권한을 확인하세요."]
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ["likely-cause", "next-action-0", "next-action-1"]
  );
});
