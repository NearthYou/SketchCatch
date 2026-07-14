import assert from "node:assert/strict";
import { test } from "node:test";
import { createAvailabilityRequestCoordinator } from "./signup-availability";

test("availability coordinator aborts the previous request and ignores its late result", async () => {
  const coordinator = createAvailabilityRequestCoordinator();
  let firstSignal: AbortSignal | null = null;
  let finishFirst!: (value: string) => void;
  const first = coordinator.run(
    (signal) =>
      new Promise<string>((resolve) => {
        firstSignal = signal;
        finishFirst = resolve;
      })
  );
  const second = coordinator.run(async () => "latest");

  finishFirst("stale");
  assert.equal((firstSignal as AbortSignal | null)?.aborted, true);
  assert.equal(await first, null);
  assert.equal(await second, "latest");
});
