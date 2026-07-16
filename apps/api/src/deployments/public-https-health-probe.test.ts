import assert from "node:assert/strict";
import test from "node:test";
import { createPublicHttpsHealthProbe } from "./public-https-health-probe.js";

test("health probe refuses credentials and non-public DNS before opening a connection", async () => {
  let requestCalls = 0;
  const privateProbe = createPublicHttpsHealthProbe({
    async resolve() {
      return [{ address: "169.254.169.254", family: 4 }];
    },
    async request() {
      requestCalls += 1;
      return 204;
    }
  });

  assert.equal(await privateProbe("https://example.com/health"), false);
  assert.equal(await privateProbe("https://user:password@example.com/health"), false);
  assert.equal(requestCalls, 0);
});

test("health probe pins a public address and accepts only a 2xx response", async () => {
  const requests: Array<{ hostname: string; address: string; family: 4 | 6 }> = [];
  const probe = createPublicHttpsHealthProbe({
    async resolve() {
      return [{ address: "93.184.216.34", family: 4 }];
    },
    async request(input) {
      requests.push({
        hostname: input.url.hostname,
        address: input.address,
        family: input.family
      });
      return requests.length === 1 ? 204 : 302;
    }
  });

  assert.equal(await probe("https://example.com/health"), true);
  assert.equal(await probe("https://example.com/health"), false);
  assert.deepEqual(requests[0], {
    hostname: "example.com",
    address: "93.184.216.34",
    family: 4
  });
});

test("health probe does not connect when its deadline expires during DNS resolution", async () => {
  const controller = new AbortController();
  let requestCalls = 0;
  const probe = createPublicHttpsHealthProbe({
    async resolve() {
      controller.abort();
      return [{ address: "93.184.216.34", family: 4 }];
    },
    async request() {
      requestCalls += 1;
      return 204;
    }
  });

  assert.equal(await probe("https://example.com/health", controller.signal), false);
  assert.equal(requestCalls, 0);
});
