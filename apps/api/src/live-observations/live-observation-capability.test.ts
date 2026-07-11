import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  createLiveObservationCapability,
  type LiveObservationCapabilityClaims,
  type LiveObservationCapabilityKeyring
} from "./live-observation-capability.js";

const MAX_LIFETIME_MS = 15 * 60 * 1000;
const NOW_MS = Date.parse("2026-07-11T00:15:00.000Z");
const EVALUATED_AT = new Date(NOW_MS).toISOString();
const OBSERVATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_OBSERVATION_ID = "22222222-2222-4222-8222-222222222222";
const CURRENT_SECRET = Buffer.alloc(32, 0x11).toString("base64url");
const PREVIOUS_SECRET = Buffer.alloc(32, 0x22).toString("base64url");

test("issue uses the exact domain-separated HMAC-SHA256 credential format", () => {
  const claims = validClaims();
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });

  const issued = capability.issue(claims, EVALUATED_AT);
  const expectedMac = independentlySign(CURRENT_SECRET, claims);

  assert.deepEqual(issued, {
    credential: `current-key.${expectedMac}`,
    kid: "current-key"
  });
  assert.equal(expectedMac.length, 43);
  assert.equal(
    capability.verify(issued.credential, { ...claims, kid: issued.kid }, EVALUATED_AT),
    true
  );
});

test("credential verification binds the Store-supplied signed claims and kid", () => {
  const claims = validClaims();
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const issued = capability.issue(claims, EVALUATED_AT);

  const mismatches = [
    { ...claims, observationId: OTHER_OBSERVATION_ID, kid: issued.kid },
    { ...claims, tokenVersion: claims.tokenVersion + 1, kid: issued.kid },
    {
      ...claims,
      expiresAt: new Date(Date.parse(claims.expiresAt) - 1).toISOString(),
      kid: issued.kid
    },
    { ...claims, kid: "previous-key" }
  ];

  for (const expected of mismatches) {
    assert.equal(capability.verify(issued.credential, expected, EVALUATED_AT), false);
  }

  const replacement = issued.credential.endsWith("A") ? "B" : "A";
  const tampered = `${issued.credential.slice(0, -1)}${replacement}`;
  assert.equal(
    capability.verify(tampered, { ...claims, kid: issued.kid }, EVALUATED_AT),
    false
  );
});

test("createdAt enforces lifetime without being added to the fixed HMAC input", () => {
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const firstClaims = validClaims({
    createdAt: new Date(NOW_MS - 60_000).toISOString()
  });
  const secondClaims = validClaims({
    createdAt: new Date(NOW_MS - 30_000).toISOString()
  });

  assert.equal(
    capability.issue(firstClaims, EVALUATED_AT).credential,
    capability.issue(secondClaims, EVALUATED_AT).credential
  );
});

test("Store time ahead of the process clock drives issue, regenerate, and verify", () => {
  const storeNowMs = NOW_MS + 250;
  const evaluatedAt = new Date(storeNowMs).toISOString();
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const storedClaims = validClaims({
    createdAt: evaluatedAt,
    expiresAt: new Date(storeNowMs + MAX_LIFETIME_MS).toISOString()
  });
  const expected = {
    ...storedClaims,
    kid: capability.currentKid
  };
  const expectedCredential = `current-key.${independentlySign(CURRENT_SECRET, storedClaims)}`;
  const issued = capability.issue(storedClaims, evaluatedAt);

  assert.equal(capability.currentKid, "current-key");
  assert.deepEqual(issued, {
    credential: expectedCredential,
    kid: "current-key"
  });
  assert.deepEqual(capability.regenerate(expected, evaluatedAt), {
    credential: expectedCredential,
    kid: "current-key"
  });
  assert.equal(capability.verify(expectedCredential, expected, evaluatedAt), true);
  assert.equal(JSON.stringify(capability).includes(CURRENT_SECRET), false);
});

test("capability operations do not resample the constructor clock", () => {
  let processClockCalls = 0;
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => {
      processClockCalls += 1;
      return NOW_MS;
    }
  });
  const claims = validClaims();
  const expected = { ...claims, kid: capability.currentKid };
  const issued = capability.issue(claims, EVALUATED_AT);

  assert.deepEqual(capability.regenerate(expected, EVALUATED_AT), issued);
  assert.equal(capability.verify(issued.credential, expected, EVALUATED_AT), true);
  assert.equal(processClockCalls, 1);
});

test("currentKid cannot be mutated before the Store persists it", () => {
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });

  assert.throws(() => {
    (capability as { currentKid: string }).currentKid = "mutated-key";
  }, TypeError);
  assert.equal(capability.currentKid, "current-key");
});

test("regenerate signs a Store-bound previous session during the overlap", () => {
  const stoppedIssuingAtMs = NOW_MS - 5 * 60 * 1000;
  const claims = validClaims({
    createdAt: new Date(stoppedIssuingAtMs).toISOString(),
    expiresAt: new Date(stoppedIssuingAtMs + MAX_LIFETIME_MS).toISOString()
  });
  const expected = { ...claims, kid: "previous-key" };
  const capability = createLiveObservationCapability({
    keyring: rotatingKeyring(new Date(stoppedIssuingAtMs).toISOString()),
    now: () => NOW_MS
  });

  assert.deepEqual(capability.regenerate(expected, EVALUATED_AT), {
    credential: `previous-key.${independentlySign(PREVIOUS_SECRET, claims)}`,
    kid: "previous-key"
  });
  assert.deepEqual(expected, { ...claims, kid: "previous-key" });
});

test("regenerate returns null for invalid or unavailable stored keys without mutating claims", () => {
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const unavailableExpected = { ...validClaims(), kid: "previous-key" };
  const unavailableSnapshot = { ...unavailableExpected };
  const expiredExpected = {
    ...validClaims({ expiresAt: new Date(NOW_MS).toISOString() }),
    kid: "current-key"
  };

  assert.equal(capability.regenerate(unavailableExpected, EVALUATED_AT), null);
  assert.deepEqual(unavailableExpected, unavailableSnapshot);
  assert.equal(capability.regenerate(expiredExpected, EVALUATED_AT), null);
});

test("issue accepts exactly 15 minutes of lifetime and rejects longer or inactive claims", () => {
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const createdAt = new Date(NOW_MS).toISOString();

  assert.doesNotThrow(() =>
    capability.issue(
      validClaims({
        createdAt,
        expiresAt: new Date(NOW_MS + MAX_LIFETIME_MS).toISOString()
      }),
      EVALUATED_AT
    )
  );

  const invalidClaims: LiveObservationCapabilityClaims[] = [
    validClaims({
      createdAt,
      expiresAt: new Date(NOW_MS + MAX_LIFETIME_MS + 1).toISOString()
    }),
    validClaims({ createdAt: new Date(NOW_MS + 1).toISOString() }),
    validClaims({ expiresAt: new Date(NOW_MS).toISOString() })
  ];

  for (const claims of invalidClaims) {
    assert.throws(
      () => capability.issue(claims, EVALUATED_AT),
      /invalid live observation capability/i
    );
  }
});

test("issue rejects non-canonical or unsafe claims with one generic error", () => {
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const invalidClaims: unknown[] = [
    validClaims({ observationId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }),
    validClaims({ observationId: ` ${OBSERVATION_ID}` }),
    validClaims({ observationId: `11111111-1111-4111-8111-11111111111\0` }),
    validClaims({ tokenVersion: 0 }),
    validClaims({ tokenVersion: Number.MAX_SAFE_INTEGER + 1 }),
    validClaims({ createdAt: "2026-07-11T00:14:00Z" }),
    validClaims({ expiresAt: "2026-07-11T00:16:00+00:00" }),
    { ...validClaims(), observationId: undefined }
  ];
  const messages = invalidClaims.map((claims) =>
    captureErrorMessage(() =>
      capability.issue(claims as LiveObservationCapabilityClaims, EVALUATED_AT)
    )
  );

  assert.equal(new Set(messages).size, 1);
  assert.match(messages[0] ?? "", /invalid live observation capability/i);
});

test("issue rejects missing or non-canonical evaluation timestamps generically", () => {
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const issueWithUnknownTime = capability.issue as unknown as (
    claims: LiveObservationCapabilityClaims,
    evaluatedAt?: unknown
  ) => unknown;

  for (const evaluatedAt of malformedEvaluationTimestamps()) {
    assert.throws(
      () => issueWithUnknownTime(validClaims(), evaluatedAt),
      /invalid live observation capability/i
    );
  }
});

test("regenerate and verify return null or false for untrusted evaluation timestamps", () => {
  const claims = validClaims();
  const expected = { ...claims, kid: "current-key" };
  const credential = `current-key.${independentlySign(CURRENT_SECRET, claims)}`;
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const regenerateWithUnknownTime = capability.regenerate as unknown as (
    expected: LiveObservationCapabilityClaims & { kid: string },
    evaluatedAt?: unknown
  ) => unknown;
  const verifyWithUnknownTime = capability.verify as unknown as (
    credential: string,
    expected: LiveObservationCapabilityClaims & { kid: string },
    evaluatedAt?: unknown
  ) => unknown;

  for (const evaluatedAt of malformedEvaluationTimestamps()) {
    assert.equal(regenerateWithUnknownTime(expected, evaluatedAt), null);
    assert.equal(verifyWithUnknownTime(credential, expected, evaluatedAt), false);
  }
});

test("verify returns false rather than throwing for malformed claims", () => {
  const claims = validClaims();
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const issued = capability.issue(claims, EVALUATED_AT);
  const malformedExpectedValues: unknown[] = [
    null,
    {},
    { ...claims, kid: " current-key" },
    { ...claims, tokenVersion: Number.NaN, kid: "current-key" },
    { ...claims, createdAt: "not-a-date", kid: "current-key" },
    { ...claims, expiresAt: new Date(NOW_MS).toISOString(), kid: "current-key" }
  ];

  for (const expected of malformedExpectedValues) {
    assert.doesNotThrow(() =>
      capability.verify(
        issued.credential,
        expected as LiveObservationCapabilityClaims & { kid: string },
        EVALUATED_AT
      )
    );
    assert.equal(
      capability.verify(
        issued.credential,
        expected as LiveObservationCapabilityClaims & { kid: string },
        EVALUATED_AT
      ),
      false
    );
  }
});

test("verify rejects unknown, padded, whitespace, separated, and wrong-length credentials", () => {
  const claims = validClaims();
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const issued = capability.issue(claims, EVALUATED_AT);
  const mac = issued.credential.slice(issued.credential.indexOf(".") + 1);
  const malformedCredentials = [
    `unknown-key.${mac}`,
    `${issued.credential}=`,
    ` ${issued.credential}`,
    `${issued.credential} `,
    `${issued.credential}.extra`,
    `current.key.${mac}`,
    `current-key.${mac.slice(0, -1)}`,
    `current-key.${mac}A`,
    "current-key",
    ""
  ];

  for (const credential of malformedCredentials) {
    assert.equal(
      capability.verify(credential, { ...claims, kid: "current-key" }, EVALUATED_AT),
      false
    );
  }
});

test("verify rejects a regex-safe but non-canonical base64url MAC", () => {
  const claims = validClaims();
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => NOW_MS
  });
  const issued = capability.issue(claims, EVALUATED_AT);
  const [kid, mac] = issued.credential.split(".") as [string, string];
  const nonCanonicalMac = makeNonCanonicalBase64Url(mac);

  assert.equal(nonCanonicalMac.length, 43);
  assert.match(nonCanonicalMac, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(
    Buffer.from(nonCanonicalMac, "base64url"),
    Buffer.from(mac, "base64url")
  );
  assert.notEqual(Buffer.from(nonCanonicalMac, "base64url").toString("base64url"), nonCanonicalMac);
  assert.equal(
    capability.verify(`${kid}.${nonCanonicalMac}`, { ...claims, kid }, EVALUATED_AT),
    false
  );
});

test("verification enforces the credential expiry boundary", () => {
  let now = NOW_MS;
  const claims = validClaims({ expiresAt: new Date(NOW_MS + 1).toISOString() });
  const capability = createLiveObservationCapability({
    keyring: currentKeyring(),
    now: () => now
  });
  const issued = capability.issue(claims, new Date(now).toISOString());

  assert.equal(
    capability.verify(
      issued.credential,
      { ...claims, kid: issued.kid },
      new Date(now).toISOString()
    ),
    true
  );

  now = Date.parse(claims.expiresAt);
  assert.equal(
    capability.verify(
      issued.credential,
      { ...claims, kid: issued.kid },
      new Date(now).toISOString()
    ),
    false
  );
});

test("rotation keeps current credentials valid while previous credentials stop at the cutoff", () => {
  const stoppedIssuingAtMs = NOW_MS - 14 * 60 * 1000;
  let now = NOW_MS;
  const keyring = rotatingKeyring(new Date(stoppedIssuingAtMs).toISOString());
  const previousClaims = validClaims({
    createdAt: new Date(stoppedIssuingAtMs).toISOString(),
    expiresAt: new Date(stoppedIssuingAtMs + MAX_LIFETIME_MS).toISOString()
  });
  const currentClaims = validClaims({
    createdAt: new Date(NOW_MS).toISOString(),
    expiresAt: new Date(NOW_MS + MAX_LIFETIME_MS).toISOString()
  });
  const previousCredential = `previous-key.${independentlySign(PREVIOUS_SECRET, previousClaims)}`;
  const capability = createLiveObservationCapability({ keyring, now: () => now });
  const currentIssued = capability.issue(currentClaims, new Date(now).toISOString());

  assert.equal(
    capability.verify(
      previousCredential,
      { ...previousClaims, kid: "previous-key" },
      new Date(now).toISOString()
    ),
    true
  );
  assert.deepEqual(
    capability.regenerate(
      { ...previousClaims, kid: "previous-key" },
      new Date(now).toISOString()
    ),
    {
      credential: previousCredential,
      kid: "previous-key"
    }
  );
  assert.equal(
    capability.verify(
      currentIssued.credential,
      { ...currentClaims, kid: currentIssued.kid },
      new Date(now).toISOString()
    ),
    true
  );

  now = stoppedIssuingAtMs + MAX_LIFETIME_MS;
  assert.equal(
    capability.verify(
      previousCredential,
      { ...previousClaims, kid: "previous-key" },
      new Date(now).toISOString()
    ),
    false
  );
  assert.equal(
    capability.regenerate(
      { ...previousClaims, kid: "previous-key" },
      new Date(now).toISOString()
    ),
    null
  );
  assert.equal(
    capability.verify(
      currentIssued.credential,
      { ...currentClaims, kid: currentIssued.kid },
      new Date(now).toISOString()
    ),
    true
  );

  now += 1;
  assert.equal(
    capability.verify(
      previousCredential,
      { ...previousClaims, kid: "previous-key" },
      new Date(now).toISOString()
    ),
    false
  );
  assert.equal(
    capability.issue(currentClaims, new Date(now).toISOString()).kid,
    "current-key"
  );
  assert.equal(
    capability.verify(
      currentIssued.credential,
      { ...currentClaims, kid: currentIssued.kid },
      new Date(now).toISOString()
    ),
    true
  );
});

test("previous credentials reject Store sessions created after issuance stopped", () => {
  const stoppedIssuingAtMs = NOW_MS - 5 * 60 * 1000;
  const claims = validClaims({
    createdAt: new Date(stoppedIssuingAtMs + 1).toISOString(),
    expiresAt: new Date(NOW_MS + 60_000).toISOString()
  });
  const expected = { ...claims, kid: "previous-key" };
  const credential = `previous-key.${independentlySign(PREVIOUS_SECRET, claims)}`;
  const capability = createLiveObservationCapability({
    keyring: rotatingKeyring(new Date(stoppedIssuingAtMs).toISOString()),
    now: () => NOW_MS
  });

  assert.equal(capability.verify(credential, expected, EVALUATED_AT), false);
  assert.equal(capability.regenerate(expected, EVALUATED_AT), null);
});

test("an elapsed previous window is safe to configure but never verifies", () => {
  const stoppedIssuingAtMs = NOW_MS - MAX_LIFETIME_MS;
  const claims = validClaims();
  const capability = createLiveObservationCapability({
    keyring: rotatingKeyring(new Date(stoppedIssuingAtMs).toISOString()),
    now: () => NOW_MS
  });
  const previousCredential = `previous-key.${independentlySign(PREVIOUS_SECRET, claims)}`;

  assert.equal(
    capability.verify(
      previousCredential,
      { ...claims, kid: "previous-key" },
      EVALUATED_AT
    ),
    false
  );
});

test("keyring validation rejects future rotation timestamps and weak, partial, or duplicate keys", () => {
  const invalidKeyrings: unknown[] = [
    { current: { kid: "current-key", secret: Buffer.alloc(31).toString("base64url") } },
    { current: { kid: "current-key", secret: `${CURRENT_SECRET}=` } },
    { current: { kid: "bad kid", secret: CURRENT_SECRET } },
    { current: { kid: "a".repeat(33), secret: CURRENT_SECRET } },
    { current: { kid: "current-key" } },
    {
      current: { kid: "current-key", secret: CURRENT_SECRET },
      previous: { kid: "previous-key", secret: PREVIOUS_SECRET }
    },
    {
      current: { kid: "same-key", secret: CURRENT_SECRET },
      previous: {
        kid: "same-key",
        secret: PREVIOUS_SECRET,
        stoppedIssuingAt: new Date(NOW_MS - 1).toISOString()
      }
    },
    {
      current: { kid: "current-key", secret: CURRENT_SECRET },
      previous: {
        kid: "previous-key",
        secret: CURRENT_SECRET,
        stoppedIssuingAt: new Date(NOW_MS - 1).toISOString()
      }
    },
    rotatingKeyring(new Date(NOW_MS + 1).toISOString())
  ];
  const messages = invalidKeyrings.map((keyring) =>
    captureErrorMessage(() =>
      createLiveObservationCapability({
        keyring: keyring as LiveObservationCapabilityKeyring,
        now: () => NOW_MS
      })
    )
  );

  assert.equal(new Set(messages).size, 1);
  assert.match(messages[0] ?? "", /invalid live observation capability/i);
  for (const message of messages) {
    assert.equal(message.includes(CURRENT_SECRET), false);
    assert.equal(message.includes(PREVIOUS_SECRET), false);
  }
});

test("the capability isolates retained key material from mutable caller input", () => {
  const keyring = rotatingKeyring(new Date(NOW_MS - 1).toISOString());
  const capability = createLiveObservationCapability({
    keyring,
    now: () => NOW_MS
  });
  const claims = validClaims();

  keyring.current.kid = "mutated-key";
  keyring.current.secret = Buffer.alloc(32, 0x33).toString("base64url");
  if (keyring.previous) {
    keyring.previous.secret = Buffer.alloc(32, 0x44).toString("base64url");
    keyring.previous.stoppedIssuingAt = new Date(NOW_MS + 60_000).toISOString();
  }

  const issued = capability.issue(claims, EVALUATED_AT);

  assert.equal(issued.kid, "current-key");
  assert.equal(
    issued.credential,
    `current-key.${independentlySign(CURRENT_SECRET, claims)}`
  );
  assert.equal(
    capability.verify(
      issued.credential,
      { ...claims, kid: "current-key" },
      EVALUATED_AT
    ),
    true
  );
});

function currentKeyring(): LiveObservationCapabilityKeyring {
  return {
    current: {
      kid: "current-key",
      secret: CURRENT_SECRET
    }
  };
}

function rotatingKeyring(stoppedIssuingAt: string): LiveObservationCapabilityKeyring {
  return {
    ...currentKeyring(),
    previous: {
      kid: "previous-key",
      secret: PREVIOUS_SECRET,
      stoppedIssuingAt
    }
  };
}

function validClaims(
  overrides: Partial<LiveObservationCapabilityClaims> = {}
): LiveObservationCapabilityClaims {
  return {
    observationId: OBSERVATION_ID,
    tokenVersion: 1,
    createdAt: new Date(NOW_MS - 60_000).toISOString(),
    expiresAt: new Date(NOW_MS + 60_000).toISOString(),
    ...overrides
  };
}

function malformedEvaluationTimestamps(): unknown[] {
  return [
    undefined,
    null,
    NOW_MS,
    "2026-07-11T00:15:00Z",
    "2026-07-11T00:15:00.000+00:00",
    "2026-07-11 00:15:00.000Z",
    ` ${EVALUATED_AT}`,
    `${EVALUATED_AT} `
  ];
}

function independentlySign(
  secret: string,
  claims: LiveObservationCapabilityClaims
): string {
  const input = [
    "sketchcatch:live-observation:v2",
    claims.observationId,
    String(claims.tokenVersion),
    claims.expiresAt
  ].join("\0");

  return createHmac("sha256", Buffer.from(secret, "base64url"))
    .update(input, "utf8")
    .digest("base64url");
}

function makeNonCanonicalBase64Url(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const finalCharacter = value.at(-1);
  assert.notEqual(finalCharacter, undefined);
  const index = alphabet.indexOf(finalCharacter ?? "");
  assert.notEqual(index, -1);
  assert.equal(index % 4, 0);

  return `${value.slice(0, -1)}${alphabet[index + 1]}`;
}

function captureErrorMessage(callback: () => unknown): string {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }

  assert.fail("Expected callback to throw");
}
