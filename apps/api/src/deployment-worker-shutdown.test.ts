import { EventEmitter } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import { installDeploymentWorkerSignalHandlers } from "./deployment-worker-shutdown.js";

test("SIGTERM aborts the worker operation without exiting the process", () => {
  const signals = new EventEmitter();
  const controller = new AbortController();
  const cleanup = installDeploymentWorkerSignalHandlers(controller, signals);

  signals.emit("SIGTERM");

  assert.equal(controller.signal.aborted, true);
  assert.match(String(controller.signal.reason), /SIGTERM/);
  cleanup();
  assert.equal(signals.listenerCount("SIGTERM"), 0);
  assert.equal(signals.listenerCount("SIGINT"), 0);
});
