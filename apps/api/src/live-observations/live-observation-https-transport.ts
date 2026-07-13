import { resolve4, resolve6, resolveCname } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP, type TcpNetConnectOpts } from "node:net";
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

function isPublicAddress(address: string, family: 4 | 6): boolean {
  if (isIP(address) !== family) return false;
  return family === 4 ? isPublicIpv4(address) : isPublicIpv6(address);
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [first = 0, second = 0, third = 0] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && (third === 0 || third === 2)) return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = parseIpv6(address);
  if (value === null || !isInIpv6Range(value, 0x2000n << 112n, 3)) return false;
  if (address.includes(".")) return false;
  if (isInIpv6Range(value, parseIpv6("2001::") ?? 0n, 23)) return false;
  if (isInIpv6Range(value, parseIpv6("2001::") ?? 0n, 32)) return false;
  if (isInIpv6Range(value, parseIpv6("2001:2::") ?? 0n, 48)) return false;
  if (isInIpv6Range(value, parseIpv6("2001:10::") ?? 0n, 28)) return false;
  if (isInIpv6Range(value, parseIpv6("2001:20::") ?? 0n, 28)) return false;
  if (isInIpv6Range(value, parseIpv6("2001:db8::") ?? 0n, 32)) return false;
  if (isInIpv6Range(value, parseIpv6("2002::") ?? 0n, 16)) return false;
  if (isInIpv6Range(value, parseIpv6("3f00::") ?? 0n, 8)) return false;
  if (isInIpv6Range(value, parseIpv6("3ffe::") ?? 0n, 16)) return false;
  if (isInIpv6Range(value, parseIpv6("3fff::") ?? 0n, 20)) return false;
  return true;
}

function parseIpv6(address: string): bigint | null {
  const embeddedIpv4 = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(address)?.[1];
  let normalized = address;
  if (embeddedIpv4) {
    if (isIP(embeddedIpv4) !== 4) return null;
    const octets = embeddedIpv4.split(".").map(Number);
    normalized = `${address.slice(0, -embeddedIpv4.length)}${(
      ((octets[0] ?? 0) << 8) |
      (octets[1] ?? 0)
    ).toString(16)}:${(((octets[2] ?? 0) << 8) | (octets[3] ?? 0)).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0]?.split(":").filter(Boolean) ?? [];
  const right = halves[1]?.split(":").filter(Boolean) ?? [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }
  const groups = [...left, ...Array.from({ length: Math.max(0, missing) }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) {
    return null;
  }
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function isInIpv6Range(value: bigint, base: bigint, prefixLength: number): boolean {
  const shift = BigInt(128 - prefixLength);
  return value >> shift === base >> shift;
}

function normalizeDnsName(value: string): string {
  return value.toLowerCase().replace(/\.$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
