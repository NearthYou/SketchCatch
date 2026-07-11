import assert from "node:assert/strict";
import { test } from "node:test";
import { settleRequestsInBatches } from "./dashboard-overview-data";

test("dashboard project requests preserve order and limit concurrency", async () => {
  let activeCount = 0;
  let maximumActiveCount = 0;

  const results = await settleRequestsInBatches([1, 2, 3, 4, 5], 2, async (value) => {
    activeCount += 1;
    maximumActiveCount = Math.max(maximumActiveCount, activeCount);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeCount -= 1;

    if (value === 3) {
      throw new Error("request failed");
    }

    return value * 2;
  });

  assert.equal(maximumActiveCount, 2);
  assert.deepEqual(
    results.map((result) =>
      result.status === "fulfilled" ? result.value : result.reason instanceof Error
    ),
    [2, 4, true, 8, 10]
  );
});
