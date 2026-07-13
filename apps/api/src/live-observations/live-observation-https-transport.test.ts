import assert from "node:assert/strict";
import { test } from "node:test";
import type { RequestOptions } from "node:https";
import { createLiveObservationHttpsTransport } from "./live-observation-https-transport.js";

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
  let requestOptions: RequestOptions | undefined;
  let timeoutMs = 0;
  let responseResumed = false;
  const dnsQueries: Array<{ kind: string; hostname: string }> = [];
  const transport = createLiveObservationHttpsTransport({
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
            resume() {
              responseResumed = true;
            }
          });
        },
        on() {
          return request;
        },
        setTimeout(value: number) {
          timeoutMs = value;
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
  assert.equal((requestOptions?.headers as Record<string, string>)?.Host, "api.example.com");
  assert.equal(timeoutMs, 3_000);
  assert.equal(responseResumed, true);
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
    { ipv4: [] as string[], ipv6: ["2001:db8::1"] },
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

test("HTTPS transport converts request errors and timeouts to one generic error", async () => {
  for (const mode of ["error", "timeout"] as const) {
    const transport = createLiveObservationHttpsTransport({
      resolveCname: async () => [manifest.adapter.payload.loadBalancerDnsName],
      resolve4: async () => ["3.34.1.10"],
      resolve6: async () => [],
      request(_options, _onResponse) {
        let errorHandler: (error: Error) => void = () => undefined;
        let timeoutHandler: () => void = () => undefined;
        const request = {
          destroy(error: Error) {
            errorHandler(error);
          },
          end() {
            if (mode === "error") errorHandler(new Error("secret upstream error"));
            else timeoutHandler();
          },
          on(_event: "error", handler: (error: Error) => void) {
            errorHandler = handler;
            return request;
          },
          setTimeout(_value: number, handler: () => void) {
            timeoutHandler = handler;
            return request;
          }
        };
        return request;
      }
    });

    await assert.rejects(
      () => transport.post(manifest),
      (error: Error) => error.message === "Live Observation traffic request unavailable"
    );
  }
});
