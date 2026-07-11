export type LiveObservationAudienceConfig = Readonly<{
  observationId: string;
  collectorOrigin: string;
  capability: string;
}>;

export class LiveObservationAudienceBootstrapError extends Error {
  constructor() {
    super("Invalid Live Observation audience link");
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationAudienceBootstrapError"
    });
  }
}

type AudienceLocation = Readonly<{
  hash: string;
  pathname: string;
}>;

type AudienceHistory = Readonly<{
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}>;

const OBSERVATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{43}$/;
const FIELD_NAMES = new Set(["observationId", "collector", "capability"]);

export function consumeLiveObservationAudienceFragment(
  location: AudienceLocation,
  history: AudienceHistory
): LiveObservationAudienceConfig {
  const fragment = location.hash;
  history.replaceState(null, "", location.pathname);

  try {
    const params = new URLSearchParams(fragment.startsWith("#") ? fragment.slice(1) : "");

    for (const [key] of params) {
      if (!FIELD_NAMES.has(key)) throw invalidLink();
    }

    const observationId = exactlyOne(params, "observationId");
    const collector = exactlyOne(params, "collector");
    const capability = exactlyOne(params, "capability");

    if (!OBSERVATION_ID_PATTERN.test(observationId)) throw invalidLink();
    if (!CAPABILITY_PATTERN.test(capability)) throw invalidLink();

    const collectorUrl = new URL(collector);
    if (
      collectorUrl.protocol !== "https:" ||
      collectorUrl.username !== "" ||
      collectorUrl.password !== "" ||
      collectorUrl.pathname !== "/" ||
      collectorUrl.search !== "" ||
      collectorUrl.hash !== ""
    ) {
      throw invalidLink();
    }

    return Object.freeze({
      capability,
      collectorOrigin: collectorUrl.origin,
      observationId
    });
  } catch {
    throw invalidLink();
  }
}

function exactlyOne(params: URLSearchParams, key: string): string {
  const values = params.getAll(key);
  if (values.length !== 1 || values[0] === "") throw invalidLink();
  return values[0] as string;
}

function invalidLink(): LiveObservationAudienceBootstrapError {
  return new LiveObservationAudienceBootstrapError();
}
