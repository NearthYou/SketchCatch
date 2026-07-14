import assert from "node:assert/strict";
import { test } from "node:test";
import { LiveObservationAudienceError } from "./live-observation-audience-client";
import { createLiveObservationAudienceSession } from "./live-observation-audience-session";

test("a publicId change ignores the previous deferred bootstrap result", async () => {
  const firstBootstrap = deferred<void>();
  const secondBootstrap = deferred<void>();
  const states: Array<{ pageState: string }> = [];
  const session = createLiveObservationAudienceSession({
    createClient: (publicId) => ({
      bootstrap: () => (publicId === "first" ? firstBootstrap.promise : secondBootstrap.promise),
      dispose: () => undefined,
      request: async () => ({ accepted: true, acceptedEventCount: 1 })
    }),
    onState: (state) => states.push(state)
  });

  const cleanupFirst = session.activate("first");
  cleanupFirst();
  session.activate("second");
  secondBootstrap.resolve();
  await settle();
  firstBootstrap.reject(new LiveObservationAudienceError("unavailable"));
  await settle();

  assert.equal(states.at(-1)?.pageState, "ready");
});

test("a StrictMode-like cleanup and restart disposes only its client and ignores stale work", async () => {
  const firstBootstrap = deferred<void>();
  const secondBootstrap = deferred<void>();
  const disposed: number[] = [];
  const states: Array<{ pageState: string }> = [];
  let clientNumber = 0;
  const session = createLiveObservationAudienceSession({
    createClient: () => {
      const number = ++clientNumber;
      return {
        bootstrap: () => (number === 1 ? firstBootstrap.promise : secondBootstrap.promise),
        dispose: () => disposed.push(number),
        request: async () => ({ accepted: true, acceptedEventCount: 1 })
      };
    },
    onState: (state) => states.push(state)
  });

  const firstCleanup = session.activate("same-public-id");
  firstCleanup();
  session.activate("same-public-id");
  secondBootstrap.resolve();
  await settle();
  firstBootstrap.reject(new LiveObservationAudienceError("unavailable"));
  await settle();

  assert.deepEqual(disposed, [1]);
  assert.equal(states.at(-1)?.pageState, "ready");
});

test("a failed bootstrap can reconnect successfully with the same current client", async () => {
  const bootstraps = [deferred<void>(), deferred<void>()];
  const states: Array<{ bootstrapReady: boolean; pageState: string }> = [];
  let bootstrapCalls = 0;
  const session = createLiveObservationAudienceSession({
    createClient: () => ({
      bootstrap: () => bootstraps[bootstrapCalls++]!.promise,
      dispose: () => undefined,
      request: async () => ({ accepted: true, acceptedEventCount: 1 })
    }),
    onState: (state) => states.push(state)
  });

  session.activate("recoverable");
  bootstraps[0]!.reject(new LiveObservationAudienceError("unavailable"));
  await settle();
  assert.deepEqual(states.at(-1), {
    bootstrapReady: false,
    pageState: "error",
    successCount: 0
  });

  session.reconnect();
  bootstraps[1]!.resolve();
  await settle();

  assert.equal(bootstrapCalls, 2);
  assert.deepEqual(states.at(-1), {
    bootstrapReady: true,
    pageState: "ready",
    successCount: 0
  });
});

test("a rate-limited audience request remains ready for a user-driven retry", async () => {
  const requests = [
    deferred<Readonly<{ accepted: boolean; acceptedEventCount: number }>>(),
    deferred<Readonly<{ accepted: boolean; acceptedEventCount: number }>>()
  ];
  const states: Array<{
    bootstrapReady: boolean;
    pageState: string;
    successCount: number;
  }> = [];
  let requestCalls = 0;
  const session = createLiveObservationAudienceSession({
    createClient: () => ({
      bootstrap: async () => undefined,
      dispose: () => undefined,
      request: () => requests[requestCalls++]!.promise
    }),
    onState: (state) => states.push(state)
  });

  session.activate("rate-limited");
  await settle();
  session.request();
  requests[0]!.reject(new LiveObservationAudienceError("rate_limited"));
  await settle();

  assert.deepEqual(states.at(-1), {
    bootstrapReady: true,
    pageState: "rate_limited",
    successCount: 0
  });

  session.request();
  requests[1]!.resolve({ accepted: true, acceptedEventCount: 1 });
  await settle();

  assert.equal(requestCalls, 2);
  assert.deepEqual(states.at(-1), {
    bootstrapReady: true,
    pageState: "success",
    successCount: 1
  });
});

test("connect and request actions allow only one in-flight operation", async () => {
  const bootstrap = deferred<void>();
  const request = deferred<Readonly<{ accepted: boolean; acceptedEventCount: number }>>();
  let bootstrapCalls = 0;
  let requestCalls = 0;
  const session = createLiveObservationAudienceSession({
    createClient: () => ({
      bootstrap: () => {
        bootstrapCalls += 1;
        return bootstrap.promise;
      },
      dispose: () => undefined,
      request: () => {
        requestCalls += 1;
        return request.promise;
      }
    }),
    onState: () => undefined
  });

  session.activate("single-flight");
  session.reconnect();
  session.reconnect();
  assert.equal(bootstrapCalls, 1);
  bootstrap.resolve();
  await settle();

  void session.request();
  void session.request();
  assert.equal(requestCalls, 1);
  request.resolve({ accepted: true, acceptedEventCount: 1 });
  await settle();
});

test("a deferred request cannot overwrite a newly activated public session", async () => {
  const firstRequest = deferred<Readonly<{ accepted: boolean; acceptedEventCount: number }>>();
  const states: Array<{ pageState: string }> = [];
  const session = createLiveObservationAudienceSession({
    createClient: (publicId) => ({
      bootstrap: async () => undefined,
      dispose: () => undefined,
      request: () =>
        publicId === "first"
          ? firstRequest.promise
          : Promise.resolve({ accepted: true, acceptedEventCount: 1 })
    }),
    onState: (state) => states.push(state)
  });

  const cleanupFirst = session.activate("first");
  await settle();
  void session.request();
  cleanupFirst();
  session.activate("second");
  await settle();
  firstRequest.reject(new LiveObservationAudienceError("unavailable"));
  await settle();

  assert.equal(states.at(-1)?.pageState, "ready");
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
