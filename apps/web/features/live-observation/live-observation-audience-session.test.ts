import assert from "node:assert/strict";
import test from "node:test";

import { LiveObservationAudienceError } from "./live-observation-audience-client.js";
import {
  createLiveObservationAudienceSession,
  type LiveObservationAudienceViewState
} from "./live-observation-audience-session.js";

test("publishes the remaining cooldown after a rate-limited request", async () => {
  const states: LiveObservationAudienceViewState[] = [];
  let requestCount = 0;
  const session = createLiveObservationAudienceSession({
    createClient: () => ({
      async bootstrap() {},
      dispose() {},
      async request() {
        requestCount += 1;
        throw new LiveObservationAudienceError("rate_limited", 42);
      }
    }),
    onState: (state) => states.push(state)
  });

  session.activate("observation-1");
  await new Promise<void>((resolve) => setImmediate(resolve));
  await session.request();

  await session.request();
  assert.equal(requestCount, 1);
  assert.deepEqual(states.at(-1), {
    bootstrapReady: true,
    pageState: "rate_limited",
    retryAfterSeconds: 42,
    successCount: 0
  });
});
