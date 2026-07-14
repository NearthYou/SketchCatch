import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  createLiveObservationAudienceClient,
  LiveObservationAudienceError
} from "./live-observation-audience-client.js";

const PUBLIC_ID = "11111111-1111-4111-8111-111111111111";
const CREDENTIAL = `current-key.${"a".repeat(43)}`;

test("audience client keeps bootstrap capability private and calls only the safe request API", async () => {
  const calls: Array<{ input: string; init?: RequestInit | undefined }> = [];
  const client = createLiveObservationAudienceClient(PUBLIC_ID, {
    createEventId: () => "22222222-2222-4222-8222-222222222222",
    fetch: async (input, init) => {
      calls.push({ input: String(input), init });
      if (calls.length === 1) {
        return Response.json({ credential: CREDENTIAL });
      }
      return Response.json({ accepted: true, acceptedEventCount: 1 }, { status: 202 });
    }
  });

  assert.deepEqual(Object.keys(client).sort(), ["bootstrap", "dispose", "request"]);
  await client.bootstrap();
  assert.deepEqual(await client.request(), { accepted: true, acceptedEventCount: 1 });

  assert.equal(calls[0]?.input, `/api/live-observations/public/${PUBLIC_ID}/bootstrap`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[1]?.input, `/api/live-observations/public/${PUBLIC_ID}/requests`);
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(
    new Headers(calls[1]?.init?.headers).get("authorization"),
    `LiveObservation ${CREDENTIAL}`
  );
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    eventId: "22222222-2222-4222-8222-222222222222"
  });
  assert.ok(calls.every((call) => !call.input.includes("traffic")));
});

test("audience client maps terminal and rate-limit responses without reading public error bodies", async () => {
  for (const [status, kind] of [
    [410, "expired"],
    [429, "rate_limited"],
    [503, "unavailable"]
  ] as const) {
    let callCount = 0;
    const client = createLiveObservationAudienceClient(PUBLIC_ID, {
      fetch: async () => {
        callCount += 1;
        return callCount === 1
          ? Response.json({ credential: CREDENTIAL })
          : new Response("collector secret must not be consumed", { status });
      }
    });
    await client.bootstrap();
    await assert.rejects(client.request(), (error: unknown) => {
      assert.equal(error instanceof LiveObservationAudienceError, true);
      assert.equal((error as LiveObservationAudienceError).kind, kind);
      assert.doesNotMatch((error as Error).message, /collector secret/);
      return true;
    });
  }
});

test("audience client aborts in-flight work and erases its credential on dispose", async () => {
  let requestSignal: AbortSignal | undefined;
  let callCount = 0;
  const client = createLiveObservationAudienceClient(PUBLIC_ID, {
    fetch: async (_input, init) => {
      callCount += 1;
      if (callCount === 1) return Response.json({ credential: CREDENTIAL });
      requestSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>(() => undefined);
    }
  });
  await client.bootstrap();
  void client.request();
  await Promise.resolve();

  client.dispose();
  assert.equal(requestSignal?.aborted, true);
  await assert.rejects(client.request(), (error: unknown) => {
    assert.equal((error as LiveObservationAudienceError).kind, "unavailable");
    return true;
  });
});

test("audience client source does not use browser storage, logs, target URLs, or query capabilities", async () => {
  const source = await readFile(
    new URL("./live-observation-audience-client.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|trafficUrl|searchParams/);
});
