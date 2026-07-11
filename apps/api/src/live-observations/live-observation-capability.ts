import { createHmac, timingSafeEqual } from "node:crypto";

export type LiveObservationCapabilityClaims = {
  observationId: string;
  tokenVersion: number;
  createdAt: string;
  expiresAt: string;
};

export type LiveObservationCapabilityKey = {
  kid: string;
  secret: string;
};

export type LiveObservationCapabilityKeyring = {
  current: LiveObservationCapabilityKey;
  previous?: LiveObservationCapabilityKey & { stoppedIssuingAt: string };
};

const MAX_LIFETIME_MS = 15 * 60 * 1000;
const SIGNING_DOMAIN = "sketchcatch:live-observation:v2";
const VALIDATION_ERROR_MESSAGE = "Invalid Live Observation capability configuration or claims";
const KID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const MAC_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type ParsedCapabilityKey = {
  kid: string;
  secret: Buffer;
};

type ParsedCapabilityKeyring = {
  current: ParsedCapabilityKey;
  previous?: ParsedCapabilityKey & {
    stoppedIssuingAt: string;
    stoppedIssuingAtMs: number;
  };
};

type ParsedCapabilityClaims = LiveObservationCapabilityClaims & {
  createdAtMs: number;
  expiresAtMs: number;
};

export function createLiveObservationCapability(options: {
  keyring: LiveObservationCapabilityKeyring;
  now?: () => number;
}): {
  readonly currentKid: string;
  issue(claims: LiveObservationCapabilityClaims, evaluatedAt: string): {
    credential: string;
    kid: string;
  };
  regenerate(
    expected: LiveObservationCapabilityClaims & { kid: string },
    evaluatedAt: string
  ): { credential: string; kid: string } | null;
  verify(
    credential: string,
    expected: LiveObservationCapabilityClaims & { kid: string },
    evaluatedAt: string
  ): boolean;
} {
  const now = options?.now ?? Date.now;
  let keyring: ParsedCapabilityKeyring;

  try {
    keyring = parseKeyring(options?.keyring, readNow(now));
  } catch {
    throw validationError();
  }

  return Object.freeze({
    get currentKid() {
      return keyring.current.kid;
    },
    issue(claims, evaluatedAt) {
      try {
        const evaluatedAtMs = parseCanonicalTimestamp(evaluatedAt);
        const parsedClaims = parseClaims(claims, evaluatedAtMs);
        return createCredential(keyring.current, parsedClaims);
      } catch {
        throw validationError();
      }
    },
    regenerate(expected, evaluatedAt) {
      try {
        const evaluatedAtMs = parseCanonicalTimestamp(evaluatedAt);
        const parsedExpected = parseClaims(expected, evaluatedAtMs);
        const expectedKid = parseKid(expected?.kid);
        const key = selectVerificationKey(
          keyring,
          expectedKid,
          evaluatedAtMs,
          parsedExpected.createdAtMs
        );

        if (!key) {
          return null;
        }

        return createCredential(key, parsedExpected);
      } catch {
        return null;
      }
    },
    verify(credential, expected, evaluatedAt) {
      try {
        const evaluatedAtMs = parseCanonicalTimestamp(evaluatedAt);
        const parsedExpected = parseClaims(expected, evaluatedAtMs);
        const expectedKid = parseKid(expected?.kid);
        const parsedCredential = parseCredential(credential);

        if (parsedCredential.kid !== expectedKid) {
          return false;
        }

        const key = selectVerificationKey(
          keyring,
          parsedCredential.kid,
          evaluatedAtMs,
          parsedExpected.createdAtMs
        );

        if (!key) {
          return false;
        }

        const suppliedMac = decodeCanonicalMac(parsedCredential.mac);

        if (!suppliedMac) {
          return false;
        }

        const expectedMac = sign(key.secret, parsedExpected);
        return timingSafeEqual(suppliedMac, expectedMac);
      } catch {
        return false;
      }
    }
  });
}

function parseKeyring(
  input: LiveObservationCapabilityKeyring,
  configuredAtMs: number
): ParsedCapabilityKeyring {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError();
  }

  const current = parseKey(input.current);

  if (input.previous === undefined) {
    return { current };
  }

  const previous = parseKey(input.previous);
  const stoppedIssuingAtMs = parseCanonicalTimestamp(input.previous.stoppedIssuingAt);

  if (stoppedIssuingAtMs > configuredAtMs) {
    throw validationError();
  }

  if (current.kid === previous.kid || timingSafeEqual(current.secret, previous.secret)) {
    throw validationError();
  }

  return {
    current,
    previous: {
      ...previous,
      stoppedIssuingAt: input.previous.stoppedIssuingAt,
      stoppedIssuingAtMs
    }
  };
}

function parseKey(input: LiveObservationCapabilityKey): ParsedCapabilityKey {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError();
  }

  const kid = parseKid(input.kid);
  const secret = decodeCanonicalSecret(input.secret);

  return {
    kid,
    secret: Buffer.from(secret)
  };
}

function parseClaims(
  input: LiveObservationCapabilityClaims,
  currentTimeMs: number
): ParsedCapabilityClaims {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError();
  }

  const observationId = input.observationId;
  const tokenVersion = input.tokenVersion;
  const createdAt = input.createdAt;
  const expiresAt = input.expiresAt;

  if (typeof observationId !== "string" || !UUID_PATTERN.test(observationId)) {
    throw validationError();
  }

  if (!Number.isSafeInteger(tokenVersion) || tokenVersion <= 0) {
    throw validationError();
  }

  const createdAtMs = parseCanonicalTimestamp(createdAt);
  const expiresAtMs = parseCanonicalTimestamp(expiresAt);

  if (
    createdAtMs > currentTimeMs ||
    currentTimeMs >= expiresAtMs ||
    expiresAtMs - createdAtMs > MAX_LIFETIME_MS
  ) {
    throw validationError();
  }

  return {
    observationId,
    tokenVersion,
    createdAt,
    expiresAt,
    createdAtMs,
    expiresAtMs
  };
}

function parseKid(value: unknown): string {
  if (typeof value !== "string" || !KID_PATTERN.test(value)) {
    throw validationError();
  }

  return value;
}

function parseCanonicalTimestamp(value: unknown): number {
  if (typeof value !== "string") {
    throw validationError();
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw validationError();
  }

  return timestamp;
}

function decodeCanonicalSecret(value: unknown): Buffer {
  if (typeof value !== "string" || !MAC_PATTERN.test(value)) {
    throw validationError();
  }

  const decoded = Buffer.from(value, "base64url");

  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    throw validationError();
  }

  return decoded;
}

function parseCredential(credential: unknown): { kid: string; mac: string } {
  if (typeof credential !== "string") {
    throw validationError();
  }

  const match = /^([A-Za-z0-9_-]{1,32})\.([A-Za-z0-9_-]{43})$/.exec(credential);

  if (!match) {
    throw validationError();
  }

  return {
    kid: match[1] ?? "",
    mac: match[2] ?? ""
  };
}

function decodeCanonicalMac(value: string): Buffer | undefined {
  const decoded = Buffer.from(value, "base64url");

  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    return undefined;
  }

  return decoded;
}

function selectVerificationKey(
  keyring: ParsedCapabilityKeyring,
  kid: string,
  currentTimeMs: number,
  createdAtMs: number
): ParsedCapabilityKey | undefined {
  if (kid === keyring.current.kid) {
    return keyring.current;
  }

  if (
    keyring.previous &&
    kid === keyring.previous.kid &&
    createdAtMs <= keyring.previous.stoppedIssuingAtMs &&
    currentTimeMs < keyring.previous.stoppedIssuingAtMs + MAX_LIFETIME_MS
  ) {
    return keyring.previous;
  }

  return undefined;
}

function createCredential(
  key: ParsedCapabilityKey,
  claims: LiveObservationCapabilityClaims
): { credential: string; kid: string } {
  const mac = sign(key.secret, claims);

  return {
    credential: `${key.kid}.${mac.toString("base64url")}`,
    kid: key.kid
  };
}

function sign(secret: Buffer, claims: LiveObservationCapabilityClaims): Buffer {
  const signingInput = [
    SIGNING_DOMAIN,
    claims.observationId,
    String(claims.tokenVersion),
    claims.expiresAt
  ].join("\0");

  return createHmac("sha256", secret).update(signingInput, "utf8").digest();
}

function readNow(now: () => number): number {
  const value = now();

  if (!Number.isFinite(value)) {
    throw validationError();
  }

  return value;
}

function validationError(): Error {
  return new Error(VALIDATION_ERROR_MESSAGE);
}
