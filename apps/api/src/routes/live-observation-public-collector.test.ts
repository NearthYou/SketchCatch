import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import {
  LiveObservationPublicCollectorError,
  type LiveObservationPublicCollector
} from "../live-observations/live-observation-public-collector.js";
import { registerLiveObservationPublicCollectorRoutes } from "./live-observation-public-collector.js";

test("returns the public request cooldown in Retry-After", async () => {
  const audienceOrigin = "https://audience.example.com";
  const collector = {
    async authorize() {
      return {
        audienceOrigin,
        async request() {
          throw new LiveObservationPublicCollectorError("rate_limited", 42);
        }
      };
    },
    async bootstrap() {
      return { audienceOrigin, credential: `current.${"a".repeat(43)}` };
    },
    async preflight() {
      return { audienceOrigin };
    }
  } as LiveObservationPublicCollector;
  const app = Fastify();
  await registerLiveObservationPublicCollectorRoutes(app, {
    collector,
    enabled: true
  });

  const response = await app.inject({
    body: { eventId: "11111111-1111-4111-8111-111111111111" },
    headers: {
      authorization: "LiveObservation test",
      origin: audienceOrigin
    },
    method: "POST",
    url: "/live-observations/public/22222222-2222-4222-8222-222222222222/requests"
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "42");
  assert.equal(response.headers["access-control-expose-headers"], "Retry-After");
  await app.close();
});
