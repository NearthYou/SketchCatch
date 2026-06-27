import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCostReviewItems,
  createRequestFlowItems
} from "../../app/workspace/DesignSimulationPanel";

test("createRequestFlowItems keeps duplicate resource pairs render-safe", () => {
  const items = createRequestFlowItems([
    {
      fromResourceId: "cloudfront-site",
      toResourceId: "s3-site",
      description: "첫 번째 요청 흐름"
    },
    {
      fromResourceId: "cloudfront-site",
      toResourceId: "s3-site",
      description: "두 번째 요청 흐름"
    }
  ]);

  assert.deepEqual(
    items.map((item) => item.id),
    ["cloudfront-site-s3-site-0", "cloudfront-site-s3-site-1"]
  );
});

test("createCostReviewItems keeps duplicate messages render-safe", () => {
  const items = createCostReviewItems({
    costPressure: ["비용 확인 필요", "비용 확인 필요"],
    recommendations: ["검토 필요", "검토 필요"]
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ["cost-0", "cost-1", "recommendation-0", "recommendation-1"]
  );
});
