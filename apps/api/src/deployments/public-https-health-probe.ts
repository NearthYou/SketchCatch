import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isPublicAddress } from "../network/public-address.js";

export type PublicHttpsHealthProbe = (
  url: string,
  abortSignal?: AbortSignal
) => Promise<boolean>;

type ResolvedAddress = {
  readonly address: string;
  readonly family: 4 | 6;
};

type PinnedHealthRequest = (input: {
  readonly url: URL;
  readonly address: string;
  readonly family: 4 | 6;
  readonly abortSignal?: AbortSignal | undefined;
}) => Promise<number>;

export function createPublicHttpsHealthProbe(options: {
  readonly resolve?: ((hostname: string) => Promise<readonly ResolvedAddress[]>) | undefined;
  readonly request?: PinnedHealthRequest | undefined;
} = {}): PublicHttpsHealthProbe {
  const resolve = options.resolve ?? resolvePublicCandidateAddresses;
  const request = options.request ?? requestPinnedHealthEndpoint;

  return async (value, abortSignal) => {
    const url = parseHealthUrl(value);
    if (!url || abortSignal?.aborted) return false;
    try {
      const addresses = await resolve(normalizeHostname(url.hostname));
      if (
        abortSignal?.aborted ||
        addresses.length === 0 ||
        addresses.some(({ address, family }) => !isPublicAddress(address, family))
      ) {
        return false;
      }
      const selected = addresses[0];
      if (!selected) return false;
      const status = await request({
        url,
        address: selected.address,
        family: selected.family,
        ...(abortSignal ? { abortSignal } : {})
      });
      return status >= 200 && status < 300;
    } catch {
      return false;
    }
  };
}

function parseHealthUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.port !== "" && url.port !== "443") ||
      !url.hostname
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function resolvePublicCandidateAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses)) return [];
  return addresses.flatMap(({ address, family }) =>
    family === 4 || family === 6 ? [{ address, family }] : []
  );
}

async function requestPinnedHealthEndpoint(input: {
  readonly url: URL;
  readonly address: string;
  readonly family: 4 | 6;
  readonly abortSignal?: AbortSignal | undefined;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    if (input.abortSignal?.aborted) {
      reject(new Error("Health probe aborted"));
      return;
    }
    let settled = false;
    const complete = (error: Error | null, statusCode = 0) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.abortSignal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(statusCode);
    };
    const pinnedLookup = ((_hostname, _options, callback) => {
      callback(null, input.address, input.family);
    }) as LookupFunction;
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: normalizeHostname(input.url.hostname),
        port: 443,
        path: input.url.pathname,
        method: "GET",
        headers: { host: input.url.host },
        lookup: pinnedLookup,
        ...(isIP(normalizeHostname(input.url.hostname)) === 0
          ? { servername: normalizeHostname(input.url.hostname) }
          : {})
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        response.destroy();
        complete(null, statusCode);
      }
    );
    const onAbort = () => request.destroy(new Error("Health probe aborted"));
    const timeout = setTimeout(
      () => request.destroy(new Error("Health probe timed out")),
      10_000
    );
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });
    request.once("error", (error) => complete(error));
    request.end();
  });
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}
