import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveObservationAudienceClient,
  LiveObservationAudienceError
} from "./live-observation-audience-client.js";

test("exposes the server cooldown when an audience request is rate limited", async () => {
  const fetchResponses = [
    new Response(JSON.stringify({ credential: `current.${"a".repeat(43)}` }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    }),
    new Response(null, { headers: { "Retry-After": "42" }, status: 429 })
  ];
  const client = createLiveObservationAudienceClient("observation-1", {
    createEventId: () => "11111111-1111-4111-8111-111111111111",
    fetch: async () => fetchResponses.shift() ?? new Response(null, { status: 500 })
  });

  await client.bootstrap();

  await assert.rejects(client.request(), (error: unknown) => {
    assert.ok(error instanceof LiveObservationAudienceError);
    assert.equal(error.kind, "rate_limited");
    assert.equal(error.retryAfterSeconds, 42);
    return true;
  });
});
