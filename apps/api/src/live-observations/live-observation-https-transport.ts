import { resolve4, resolve6, resolveCname } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import type { TcpNetConnectOpts } from "node:net";
import { isPublicAddress } from "../network/public-address.js";
import { requireLiveObservationTrafficTargetEvidence } from "./live-observation-manifest.js";

type TrafficResponse = {
  readonly statusCode?: number | undefined;
  destroy(error?: Error): void;
};

type TrafficRequest = {
  destroy(error: Error): void;
  end(): void;
  on(event: "error", handler: (error: Error) => void): TrafficRequest;
};

type TrafficRequester = (
  options: PinnedHttpsRequestOptions,
  onResponse: (response: TrafficResponse) => void
) => TrafficRequest;

type PinnedHttpsRequestOptions = RequestOptions &
  Pick<TcpNetConnectOpts, "autoSelectFamily" | "family">;

type DnsResolver = (hostname: string) => Promise<readonly string[]>;
type TimeoutScheduler = {
  readonly clearTimeout: (handle: unknown) => void;
  readonly now: () => number;
  readonly setTimeout: (handler: () => void, timeoutMs: number) => unknown;
};

type TrafficDeadline = TimeoutScheduler & {
  readonly expiresAt: number;
  expired: boolean;
};

const TRAFFIC_REQUEST_TIMEOUT_MS = 3_000;
const GENERIC_ERROR_MESSAGE = "Live Observation traffic request unavailable";

export function createLiveObservationHttpsTransport(options: {
  readonly clearTimeout?: ((handle: unknown) => void) | undefined;
  readonly now?: (() => number) | undefined;
  readonly request?: TrafficRequester;
  readonly resolve4?: DnsResolver;
  readonly resolve6?: DnsResolver;
  readonly resolveCname?: DnsResolver;
  readonly setTimeout?: ((handler: () => void, timeoutMs: number) => unknown) | undefined;
} = {}) {
  const request = options.request ?? (httpsRequest as unknown as TrafficRequester);
  const resolveIpv4 = options.resolve4 ?? resolve4;
  const resolveIpv6 = options.resolve6 ?? resolve6;
  const resolveTrafficCname = options.resolveCname ?? resolveCname;
  const scheduler: TimeoutScheduler = {
    clearTimeout:
      options.clearTimeout ??
      ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)),
    now: options.now ?? (() => performance.now()),
    setTimeout:
      options.setTimeout ??
      ((handler, timeoutMs) => globalThis.setTimeout(handler, timeoutMs))
  };

  return Object.freeze({
    async post(manifest: unknown): Promise<{ status: number }> {
      const deadline = createTrafficDeadline(scheduler);
      try {
        const evidence = requireLiveObservationTrafficTargetEvidence(manifest);
        const addresses = await runWithinDeadline(
          deadline,
          async () => {
            await assertVerifiedCname(
              evidence.trafficHostname,
              evidence.loadBalancerDnsName,
              resolveTrafficCname
            );
            assertDeadlineActive(deadline);
            const resolved = await resolvePublicAddresses(
              evidence.loadBalancerDnsName,
              resolveIpv4,
              resolveIpv6
            );
            assertDeadlineActive(deadline);
            return resolved;
          }
        );
        const selected = addresses[0];
        if (!selected) throw new Error(GENERIC_ERROR_MESSAGE);

        return await postPinnedHttpsRequest({
          address: selected.address,
          family: selected.family,
          deadline,
          request,
          trafficHostname: evidence.trafficHostname,
          trafficUrl: evidence.trafficUrl
        });
      } catch {
        throw new Error(GENERIC_ERROR_MESSAGE);
      }
    }
  });
}

function createTrafficDeadline(scheduler: TimeoutScheduler): TrafficDeadline {
  return {
    ...scheduler,
    expiresAt: scheduler.now() + TRAFFIC_REQUEST_TIMEOUT_MS,
    expired: false
  };
}

function runWithinDeadline<T>(
  deadline: TrafficDeadline,
  operation: () => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const remainingMs = getRemainingDeadlineMs(deadline);
    if (remainingMs <= 0 || deadline.expired) {
      deadline.expired = true;
      reject(new Error(GENERIC_ERROR_MESSAGE));
      return;
    }

    let settled = false;
    const timer = deadline.setTimeout(() => {
      if (settled) return;
      settled = true;
      deadline.expired = true;
      deadline.clearTimeout(timer);
      reject(new Error(GENERIC_ERROR_MESSAGE));
    }, remainingMs);
    const settle = (handler: () => void) => {
      if (settled) return;
      settled = true;
      deadline.clearTimeout(timer);
      handler();
    };

    try {
      operation().then(
        (value) => {
          try {
            assertDeadlineActive(deadline);
            settle(() => resolve(value));
          } catch (error) {
            settle(() => reject(error));
          }
        },
        (error) => settle(() => reject(error))
      );
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

function assertDeadlineActive(deadline: TrafficDeadline): void {
  if (deadline.expired || getRemainingDeadlineMs(deadline) <= 0) {
    deadline.expired = true;
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
}

function getRemainingDeadlineMs(deadline: TrafficDeadline): number {
  return Math.max(0, deadline.expiresAt - deadline.now());
}

async function assertVerifiedCname(
  trafficHostname: string,
  loadBalancerDnsName: string,
  resolver: DnsResolver
): Promise<void> {
  const expected = normalizeDnsName(loadBalancerDnsName);
  const answers = await resolver(trafficHostname);
  if (
    answers.length === 0 ||
    answers.some((answer) => normalizeDnsName(answer) !== expected)
  ) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
}

async function resolvePublicAddresses(
  hostname: string,
  resolveIpv4: DnsResolver,
  resolveIpv6: DnsResolver
): Promise<ReadonlyArray<{ address: string; family: 4 | 6 }>> {
  const [ipv4, ipv6] = await Promise.all([
    resolveOptional(hostname, resolveIpv4),
    resolveOptional(hostname, resolveIpv6)
  ]);
  const addresses = [
    ...ipv4.map((address) => ({ address, family: 4 as const })),
    ...ipv6.map((address) => ({ address, family: 6 as const }))
  ];

  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => !isPublicAddress(address, family))
  ) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
  return addresses;
}

async function resolveOptional(hostname: string, resolver: DnsResolver): Promise<readonly string[]> {
  try {
    return await resolver(hostname);
  } catch (error) {
    const code = isRecord(error) && typeof error["code"] === "string" ? error["code"] : null;
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    throw error;
  }
}

function postPinnedHttpsRequest(input: {
  readonly address: string;
  readonly deadline: TrafficDeadline;
  readonly family: 4 | 6;
  readonly request: TrafficRequester;
  readonly trafficHostname: string;
  readonly trafficUrl: string;
}): Promise<{ status: number }> {
  const url = new URL(input.trafficUrl);
  return new Promise((resolve, reject) => {
    const remainingMs = getRemainingDeadlineMs(input.deadline);
    if (remainingMs <= 0 || input.deadline.expired) {
      input.deadline.expired = true;
      reject(new Error(GENERIC_ERROR_MESSAGE));
      return;
    }

    let request: TrafficRequest | undefined;
    let settled = false;
    let timer: unknown;
    const clearTimer = () => {
      if (timer === undefined) return;
      input.deadline.clearTimeout(timer);
      timer = undefined;
    };
    const settleError = (destroyRequest: boolean) => {
      if (settled) return;
      settled = true;
      clearTimer();
      if (destroyRequest && request) {
        try {
          request.destroy(new Error(GENERIC_ERROR_MESSAGE));
        } catch {
          // The request is already settling with a generic error.
        }
      }
      reject(new Error(GENERIC_ERROR_MESSAGE));
    };

    try {
      request = input.request(
        {
          agent: false,
          autoSelectFamily: false,
          family: input.family,
          headers: { Host: input.trafficHostname },
          hostname: input.trafficHostname,
          lookup: (_hostname, _options, callback) => {
            callback(null, input.address, input.family);
          },
          method: "POST",
          path: url.pathname,
          port: 443,
          protocol: "https:",
          servername: input.trafficHostname
        },
        (response) => {
          const status = response.statusCode;
          if (settled) {
            response.destroy();
            return;
          }
          settled = true;
          let destroyFailed = false;
          try {
            response.destroy();
          } catch {
            destroyFailed = true;
          }
          clearTimer();
          if (destroyFailed || !Number.isInteger(status)) {
            reject(new Error(GENERIC_ERROR_MESSAGE));
            return;
          }
          resolve({ status: status as number });
        }
      );
      request.on("error", () => settleError(false));
      if (settled) return;
      timer = input.deadline.setTimeout(() => settleError(true), remainingMs);
      request.end();
    } catch {
      settleError(true);
    }
  });
}

function normalizeDnsName(value: string): string {
  return value.toLowerCase().replace(/\.$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
