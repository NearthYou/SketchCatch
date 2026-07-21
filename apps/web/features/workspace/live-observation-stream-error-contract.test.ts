import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const modalSource = readFileSync(
  fileURLToPath(new URL("./LiveObservationModal.tsx", import.meta.url)),
  "utf8"
);

test("Live Observation surfaces the failed request diagnostic while reconnecting", () => {
  assert.match(modalSource, /onError: \(failure\) =>/);
  assert.match(
    modalSource,
    /getApiErrorMessage\(\s*failure\.error,[\s\S]*?자동으로 다시 연결합니다\./
  );
  assert.match(modalSource, /failure\.source === "stream"/);
});
