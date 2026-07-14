import { buildApiUrl } from "../../lib/api-client";

type AudienceErrorKind = "expired" | "rate_limited" | "unavailable";

type AudienceRequestResult = Readonly<{
  accepted: boolean;
  acceptedEventCount: number;
}>;

type AudienceClientDependencies = Readonly<{
  createEventId?: (() => string) | undefined;
  fetch?: typeof globalThis.fetch | undefined;
}>;

export class LiveObservationAudienceError extends Error {
  constructor(readonly kind: AudienceErrorKind) {
    super("Live Observation audience request failed");
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationAudienceError"
    });
  }
}

export function createLiveObservationAudienceClient(
  publicId: string,
  dependencies: AudienceClientDependencies = {}
) {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  const createEventId = dependencies.createEventId ?? createUuid;
  const activeRequests = new Set<AbortController>();
  const basePath = `/live-observations/public/${encodeURIComponent(publicId)}`;
  let credential: string | null = null;
  let disposed = false;

  async function run(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
    if (disposed) throw audienceError("unavailable");
    const abortController = new AbortController();
    activeRequests.add(abortController);
    try {
      return await fetchRequest(input, {
        ...init,
        credentials: "omit",
        signal: abortController.signal
      });
    } catch (error) {
      if (error instanceof LiveObservationAudienceError) throw error;
      throw audienceError("unavailable");
    } finally {
      activeRequests.delete(abortController);
    }
  }

  return Object.freeze({
    async bootstrap(): Promise<void> {
      const response = await run(buildApiUrl(`${basePath}/bootstrap`), {
        headers: { Accept: "application/json" },
        method: "POST"
      });
      if (!response.ok) throw errorFromStatus(response.status);
      const body: unknown = await response.json();
      if (!isBootstrapResponse(body)) throw audienceError("unavailable");
      credential = body.credential;
    },

    dispose(): void {
      disposed = true;
      credential = null;
      for (const request of activeRequests) request.abort();
      activeRequests.clear();
    },

    async request(): Promise<AudienceRequestResult> {
      if (!credential || disposed) throw audienceError("unavailable");
      const response = await run(buildApiUrl(`${basePath}/requests`), {
        body: JSON.stringify({ eventId: createEventId() }),
        headers: {
          Accept: "application/json",
          Authorization: `LiveObservation ${credential}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      if (!response.ok) throw errorFromStatus(response.status);
      const body: unknown = await response.json();
      if (!isRequestResponse(body)) throw audienceError("unavailable");
      return Object.freeze(body);
    }
  });
}

function isBootstrapResponse(value: unknown): value is { credential: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "credential" in value &&
    typeof value.credential === "string" &&
    /^[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{43}$/.test(value.credential)
  );
}

function isRequestResponse(value: unknown): value is AudienceRequestResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "accepted" in value &&
    typeof value.accepted === "boolean" &&
    "acceptedEventCount" in value &&
    Number.isSafeInteger(value.acceptedEventCount) &&
    Number(value.acceptedEventCount) >= 0
  );
}

function errorFromStatus(status: number): LiveObservationAudienceError {
  if (status === 404 || status === 410) return audienceError("expired");
  if (status === 429) return audienceError("rate_limited");
  return audienceError("unavailable");
}

function audienceError(kind: AudienceErrorKind): LiveObservationAudienceError {
  return new LiveObservationAudienceError(kind);
}

function createUuid(): string {
  if (!globalThis.crypto?.randomUUID) throw audienceError("unavailable");
  return globalThis.crypto.randomUUID();
}
