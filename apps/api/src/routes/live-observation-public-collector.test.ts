import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import {
  LiveObservationPublicCollectorError,
  type LiveObservationPublicCollector
} from "../live-observations/live-observation-public-collector.js";
import { registerLiveObservationPublicCollectorRoutes } from "./live-observation-public-collector.js";

test("does not expose a timed cooldown for Store safety caps", async () => {
  const audienceOrigin = "https://audience.example.com";
  const collector = {
    async authorize() {
      return {
        audienceOrigin,
        async receipt() {
          throw new LiveObservationPublicCollectorError("rate_limited");
        },
        async request() {
          throw new LiveObservationPublicCollectorError("rate_limited");
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
  assert.equal(response.headers["retry-after"], undefined);
  assert.equal(response.headers["access-control-expose-headers"], undefined);
  await app.close();
});

test("routes successful audience receipts without sending a traffic probe", async () => {
  const audienceOrigin = "https://audience.example.com";
  let requestCalls = 0;
  let receiptCalls = 0;
  const collector = {
    async authorize() {
      return {
        audienceOrigin,
        async receipt() {
          receiptCalls += 1;
          return { accepted: true, acceptedEventCount: 1 };
        },
        async request() {
          requestCalls += 1;
          return { accepted: true, acceptedEventCount: 1 };
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
  await registerLiveObservationPublicCollectorRoutes(app, { collector, enabled: true });

  const response = await app.inject({
    body: { eventId: "11111111-1111-4111-8111-111111111111" },
    headers: {
      authorization: "LiveObservation test",
      origin: audienceOrigin
    },
    method: "POST",
    url: "/live-observations/public/22222222-2222-4222-8222-222222222222/receipts"
  });

  assert.equal(response.statusCode, 202);
  assert.equal(receiptCalls, 1);
  assert.equal(requestCalls, 0);
  await app.close();
});
