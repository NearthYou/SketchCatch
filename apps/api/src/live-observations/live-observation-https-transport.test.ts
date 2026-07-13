import assert from "node:assert/strict";
import { test } from "node:test";
import type { RequestOptions } from "node:https";
import type { TcpNetConnectOpts } from "node:net";
import { createLiveObservationHttpsTransport } from "./live-observation-https-transport.js";

type PinnedHttpsRequestOptions = RequestOptions &
  Pick<TcpNetConnectOpts, "autoSelectFamily" | "family">;

const manifest = {
  schemaVersion: 2 as const,
  provider: "aws" as const,
  provenance: {
    deploymentId: "11111111-2222-4333-8444-555555555555",
    terraformArtifactSha256: "a".repeat(64),
    awsConnectionId: "66666666-7777-4888-8999-000000000000",
    region: "ap-northeast-2",
    verifiedAt: "2026-07-13T00:00:00.000Z"
  },
  endpoints: {
    audienceBaseUrl: "https://console.example.com",
    trafficUrl: "https://api.example.com/traffic"
  },
  pressure: {
    metric: "requests_per_target_per_minute" as const,
    target: 60,
    windowSeconds: 60
  },
  adapter: {
    kind: "aws-live-observation" as const,
    version: 2 as const,
    payload: {
      trafficHostname: "api.example.com",
      loadBalancerDnsName:
        "demo-1234567890.ap-northeast-2.elb.amazonaws.com",
      loadBalancerArn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/demo/1234567890abcdef",
      targetGroupArn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/demo/1234567890abcdef",
      capacityTarget: {
        kind: "asg" as const,
        autoScalingGroupName: "demo-asg"
      }
    }
  }
};

test("HTTPS transport validates DNS, pins the validated address, and preserves TLS hostname", async () => {
  let requestOptions: PinnedHttpsRequestOptions | undefined;
  let responseDestroyed = false;
  let socketTimeoutCalled = false;
  const dnsQueries: Array<{ kind: string; hostname: string }> = [];
  const clock = createFakeClock();
  const transport = createLiveObservationHttpsTransport({
    ...clock.dependencies,
    resolveCname: async (hostname) => {
      dnsQueries.push({ kind: "cname", hostname });
      return ["demo-1234567890.ap-northeast-2.elb.amazonaws.com."];
    },
    resolve4: async (hostname) => {
      dnsQueries.push({ kind: "a", hostname });
      return ["3.34.1.10"];
    },
    resolve6: async (hostname) => {
      dnsQueries.push({ kind: "aaaa", hostname });
      return ["2600:1f14::10"];
    },
    request(options, onResponse) {
      requestOptions = options;
      const request = {
        destroy() {},
        end() {
          onResponse({
            statusCode: 204,
            destroy() {
              responseDestroyed = true;
            }
          });
        },
        on() {
          return request;
        },
        setTimeout(value: number) {
          socketTimeoutCalled = value > 0;
          return request;
        }
      };
      return request;
    }
  });

  assert.deepEqual(await transport.post(manifest), { status: 204 });
  assert.equal(requestOptions?.method, "POST");
  assert.equal(requestOptions?.hostname, "api.example.com");
  assert.equal(requestOptions?.servername, "api.example.com");
  assert.equal(requestOptions?.port, 443);
  assert.equal(requestOptions?.path, "/traffic");
  assert.equal(requestOptions?.agent, false);
  assert.equal(requestOptions?.family, 4);
  assert.equal(requestOptions?.autoSelectFamily, false);
  assert.equal((requestOptions?.headers as Record<string, string>)?.Host, "api.example.com");
  assert.equal(responseDestroyed, true);
  assert.equal(socketTimeoutCalled, false);
  assert.equal(clock.pendingCount(), 0);
  assert.deepEqual(dnsQueries, [
    { kind: "cname", hostname: "api.example.com" },
    {
      kind: "a",
      hostname: "demo-1234567890.ap-northeast-2.elb.amazonaws.com"
    },
    {
      kind: "aaaa",
      hostname: "demo-1234567890.ap-northeast-2.elb.amazonaws.com"
    }
  ]);

  const lookup = requestOptions?.lookup;
  assert.equal(typeof lookup, "function");
  await new Promise<void>((resolve, reject) => {
    lookup?.("ignored.example.com", {}, (error, address, family) => {
      if (error) return reject(error);
      assert.equal(address, "3.34.1.10");
      assert.equal(family, 4);
      resolve();
    });
  });
});

test("HTTPS pins IPv6 with a single-address lookup contract", async () => {
  let requestOptions: PinnedHttpsRequestOptions | undefined;
  const transport = createLiveObservationHttpsTransport({
    resolveCname: async () => [manifest.adapter.payload.loadBalancerDnsName],
    resolve4: async () => [],
    resolve6: async () => ["2600:1f14::10"],
    request(options, onResponse) {
      requestOptions = options;
      const request = {
        destroy() {},
        end() {
          onResponse({ statusCode: 204, destroy() {} });
        },
        on() {
          return request;
        }
      };
      return request;
    }
  });

  assert.deepEqual(await transport.post(manifest), { status: 204 });
  assert.equal(requestOptions?.family, 6);
  assert.equal(requestOptions?.autoSelectFamily, false);
  const lookup = requestOptions?.lookup;
  assert.equal(typeof lookup, "function");
  await new Promise<void>((resolve, reject) => {
    lookup?.("ignored.example.com", { all: false, family: 6 }, (error, address, family) => {
      if (error) return reject(error);
      assert.equal(address, "2600:1f14::10");
      assert.equal(family, 6);
      resolve();
    });
  });
});

test("HTTPS transport rejects CNAME drift before opening a request", async () => {
  let requested = false;
  const transport = createLiveObservationHttpsTransport({
    resolveCname: async () => ["attacker.example.com"],
    resolve4: async () => ["3.34.1.10"],
    resolve6: async () => [],
    request() {
      requested = true;
      throw new Error("must not request");
    }
  });

  await assert.rejects(() => transport.post(manifest), /traffic request unavailable/);
  assert.equal(requested, false);
});

test("HTTPS transport rejects empty, private, reserved, or mixed DNS answers", async () => {
  const cases = [
    { ipv4: [] as string[], ipv6: [] as string[] },
    { ipv4: ["127.0.0.1"], ipv6: [] as string[] },
    { ipv4: ["169.254.169.254"], ipv6: [] as string[] },
    { ipv4: ["10.0.0.1"], ipv6: [] as string[] },
    { ipv4: ["192.0.2.1"], ipv6: [] as string[] },
    { ipv4: [] as string[], ipv6: ["::1"] },
    { ipv4: [] as string[], ipv6: ["fe80::1"] },
    { ipv4: [] as string[], ipv6: ["fc00::1"] },
    { ipv4: [] as string[], ipv6: ["2001:1::1"] },
    { ipv4: [] as string[], ipv6: ["2001:db8::1"] },
    { ipv4: [] as string[], ipv6: ["2002::1"] },
    { ipv4: [] as string[], ipv6: ["3ffe::1"] },
    { ipv4: [] as string[], ipv6: ["3fff::1"] },
    { ipv4: [] as string[], ipv6: ["::ffff:10.0.0.1"] },
    { ipv4: [] as string[], ipv6: ["::ffff:3.34.1.10"] },
    { ipv4: [] as string[], ipv6: ["ff02::1"] },
    { ipv4: ["3.34.1.10", "10.0.0.1"], ipv6: ["2600:1f14::10"] }
  ];

  for (const answers of cases) {
    let requested = false;
    const transport = createLiveObservationHttpsTransport({
      resolveCname: async () => [manifest.adapter.payload.loadBalancerDnsName],
      resolve4: async () => answers.ipv4,
      resolve6: async () => answers.ipv6,
      request() {
        requested = true;
        throw new Error("must not request");
      }
    });

    await assert.rejects(() => transport.post(manifest), /traffic request unavailable/);
    assert.equal(requested, false);
  }
});

test("one wall-clock deadline rejects deferred CNAME and A/AAAA DNS by 3000ms", async () => {
  for (const phase of ["cname", "address"] as const) {
    const clock = createFakeClock();
    const deferred = createDeferred<readonly string[]>();
    let addressQueries = 0;
    let requested = false;
    const transport = createLiveObservationHttpsTransport({
      ...clock.dependencies,
      resolveCname: async () =>
        phase === "cname"
          ? deferred.promise
          : [manifest.adapter.payload.loadBalancerDnsName],
      resolve4: async () => {
        addressQueries += 1;
        return phase === "address" ? deferred.promise : ["3.34.1.10"];
      },
      resolve6: async () => [],
      request() {
        requested = true;
        throw new Error("must not request");
      }
    });
    let errorAtDeadline: Error | undefined;
    const pending = transport.post(manifest).catch((error: Error) => {
      errorAtDeadline = error;
      throw error;
    });

    clock.advance(2_999);
    await flushMicrotasks();
    assert.equal(errorAtDeadline, undefined);
    clock.advance(1);
    await flushMicrotasks();
    const deadlineError = errorAtDeadline as Error | undefined;
    deferred.resolve(
      phase === "cname"
        ? [manifest.adapter.payload.loadBalancerDnsName]
        : ["3.34.1.10"]
    );
    await pending.catch(() => undefined);

    assert.equal(deadlineError?.message, "Live Observation traffic request unavailable");
    assert.equal(requested, false);
    assert.equal(addressQueries, phase === "cname" ? 0 : 1);
    assert.equal(clock.pendingCount(), 0);
  }
});

test("HTTPS uses only the remaining deadline and destroys a stalled request exactly once", async () => {
  const clock = createFakeClock();
  let destroyCalls = 0;
  let errorHandler: (error: Error) => void = () => undefined;
  const requestStarted = createDeferred<void>();
  const transport = createLiveObservationHttpsTransport({
    ...clock.dependencies,
    resolveCname: async () => {
      clock.advance(1_200);
      return [manifest.adapter.payload.loadBalancerDnsName];
    },
    resolve4: async () => ["3.34.1.10"],
    resolve6: async () => [],
    request() {
      const request = {
        destroy(error: Error) {
          destroyCalls += 1;
          errorHandler(error);
          errorHandler(error);
        },
        end() {
          requestStarted.resolve();
        },
        on(_event: "error", handler: (error: Error) => void) {
          errorHandler = handler;
          return request;
        },
        setTimeout() {
          return request;
        }
      };
      return request;
    }
  });
  let transportError: Error | undefined;
  const pending = transport.post(manifest).catch((error: Error) => {
    transportError = error;
    throw error;
  });
  await requestStarted.promise;

  clock.advance(1_799);
  await flushMicrotasks();
  assert.equal(destroyCalls, 0);
  clock.advance(1);
  await flushMicrotasks();
  const deadlineError = transportError;
  if (!deadlineError) errorHandler(new Error("test cleanup"));
  await pending.catch(() => undefined);

  assert.equal(deadlineError?.message, "Live Observation traffic request unavailable");
  assert.equal(destroyCalls, 1);
  assert.equal(clock.pendingCount(), 0);
});

test("HTTPS destroys a streaming response at headers without draining its body", async () => {
  const clock = createFakeClock();
  let responseDestroyCalls = 0;
  let responseResumeCalls = 0;
  let requestDestroyCalls = 0;
  const transport = createLiveObservationHttpsTransport({
    ...clock.dependencies,
    resolveCname: async () => [manifest.adapter.payload.loadBalancerDnsName],
    resolve4: async () => ["3.34.1.10"],
    resolve6: async () => ["2600:1f14::10"],
    request(_options, onResponse) {
      const request = {
        destroy() {
          requestDestroyCalls += 1;
        },
        end() {
          const response = {
            statusCode: 204,
            destroy() {
              responseDestroyCalls += 1;
            },
            resume() {
              responseResumeCalls += 1;
            }
          };
          onResponse(response);
        },
        on() {
          return request;
        },
        setTimeout() {
          return request;
        }
      };
      return request;
    }
  });

  assert.deepEqual(await transport.post(manifest), { status: 204 });
  assert.equal(responseDestroyCalls, 1);
  assert.equal(responseResumeCalls, 0);
  assert.equal(requestDestroyCalls, 0);
  assert.equal(clock.pendingCount(), 0);
  clock.advance(10_000);
  assert.equal(requestDestroyCalls, 0);
});

function createDeferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function createFakeClock() {
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; handler: () => void }>();
  return {
    dependencies: {
      clearTimeout(handle: unknown) {
        if (typeof handle === "number") timers.delete(handle);
      },
      now: () => nowMs,
      setTimeout(handler: () => void, timeoutMs: number) {
        const id = nextId++;
        timers.set(id, { at: nowMs + timeoutMs, handler });
        return id;
      }
    },
    advance(durationMs: number) {
      const target = nowMs + durationMs;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        nowMs = due[1].at;
        timers.delete(due[0]);
        due[1].handler();
      }
      nowMs = target;
    },
    pendingCount: () => timers.size
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
