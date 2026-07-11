import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  consumeLiveObservationAudienceFragment,
  LiveObservationAudienceBootstrapError
} from "./live-observation-audience-bootstrap.js";

const OBSERVATION_ID = "11111111-1111-4111-8111-111111111111";
const CAPABILITY = `current-key.${"a".repeat(43)}`;

test("audience bootstrap removes the fragment immediately and returns frozen memory config", () => {
  const calls: unknown[][] = [];
  const result = consumeLiveObservationAudienceFragment(
    {
      hash: `#observationId=${OBSERVATION_ID}&collector=${encodeURIComponent("https://app.example.com")}&capability=${CAPABILITY}`,
      pathname: "/live/"
    },
    {
      replaceState(...args: unknown[]) {
        calls.push(args);
      }
    }
  );

  assert.deepEqual(calls, [[null, "", "/live/"]]);
  assert.deepEqual(result, {
    capability: CAPABILITY,
    collectorOrigin: "https://app.example.com",
    observationId: OBSERVATION_ID
  });
  assert.equal(Object.isFrozen(result), true);
});

test("audience bootstrap clears malformed fragments before returning a generic error", () => {
  const invalidHashes = [
    "",
    `#collector=https%3A%2F%2Fapp.example.com&capability=${CAPABILITY}`,
    `#observationId=${OBSERVATION_ID}&collector=https%3A%2F%2Fapp.example.com&capability=${CAPABILITY}&capability=${CAPABILITY}`,
    `#observationId=${OBSERVATION_ID}&collector=http%3A%2F%2Fapp.example.com&capability=${CAPABILITY}`,
    `#observationId=${OBSERVATION_ID}&collector=https%3A%2F%2Fuser%40app.example.com&capability=${CAPABILITY}`,
    `#observationId=${OBSERVATION_ID}&collector=https%3A%2F%2Fapp.example.com%2Fapi&capability=${CAPABILITY}`,
    `#observationId=${OBSERVATION_ID}&collector=https%3A%2F%2Fapp.example.com&capability=invalid`,
    `#observationId=${OBSERVATION_ID}&collector=https%3A%2F%2Fapp.example.com&capability=${CAPABILITY}&extra=1`
  ];

  for (const hash of invalidHashes) {
    let replacements = 0;
    assert.throws(
      () =>
        consumeLiveObservationAudienceFragment(
          { hash, pathname: "/live/" },
          {
            replaceState() {
              replacements += 1;
            }
          }
        ),
      (error: unknown) => {
        assert.equal(error instanceof LiveObservationAudienceBootstrapError, true);
        assert.equal((error as Error).message, "Invalid Live Observation audience link");
        return true;
      }
    );
    assert.equal(replacements, 1, hash);
  }
});

test("audience bootstrap source has no storage or console side effects", async () => {
  const source = await readFile(
    new URL("./live-observation-audience-bootstrap.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
});
